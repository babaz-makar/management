import { NextRequest, NextResponse } from "next/server";
import {
  runJobcanImport,
  formatJobcanImportSummary,
  resolveRefreshTokenByEmail,
  lookupSlackUserIdByEmail,
  listEventsForRange,
  executeJobcanDayPlan,
  runJobcanReconcile,
  sanitizeFileName,
  resolveDryRun,
  verifyImportAuth,
  validateUploadLimits,
  missingImportEnvVars,
  type JobcanImportFile,
  type JobcanImportDeps,
  type JobcanImportResult,
  type JobcanCalendarPort,
} from "@management/shift-management";
import { NeonStaffDirectory } from "@/lib/staff-directory-neon";
import { NeonTokenStore } from "@/lib/token-store-neon";
import { xlsxToRows } from "@/lib/jobcan-xlsx";

// exceljs / neon は Node ランタイムに依存(Edge では動かない)。
export const runtime = "nodejs";

/** xlsx バイナリ変換に失敗したファイル(バッチ隔離のため runJobcanImport には渡さない)。 */
interface ConversionError {
  fileName: string;
  message: string;
}

/** 実インフラで runJobcanImport の deps を組む(Neon 名簿 + Slack/Token 解決 + Google カレンダー)。 */
function buildDeps(databaseUrl: string, botToken: string): JobcanImportDeps {
  const staffDirectory = new NeonStaffDirectory(databaseUrl);
  const tokenStore = new NeonTokenStore(databaseUrl);
  const port: JobcanCalendarPort = {
    listEventsForRange,
    executeDayPlan: executeJobcanDayPlan,
  };
  return {
    staffDirectory,
    resolveToken: (email) =>
      resolveRefreshTokenByEmail(email, {
        lookupSlackUserId: (e) => lookupSlackUserIdByEmail(e, botToken),
        tokenStore,
      }),
    reconcile: (entries, refreshToken, calendarId, options) =>
      runJobcanReconcile(entries, refreshToken, calendarId, options, port),
  };
}

/** multipart/form-data の全 File 値を集める(フィールド名は問わない)。 */
function collectFiles(formData: FormData): File[] {
  const files: File[] = [];
  for (const value of formData.values()) {
    if (value instanceof File) files.push(value);
  }
  return files;
}

/** apply フラグ(クエリ or フォーム)を厳密 boolean にする。既定 false(=dry-run)。 */
function readApplyFlag(req: NextRequest, formData: FormData): boolean {
  const fromQuery = req.nextUrl.searchParams.get("apply") === "true";
  const fromForm = formData.get("apply") === "true";
  return fromQuery || fromForm;
}

/**
 * 各 File を xlsx→rows 変換し JobcanImportFile 化する。
 * 1ファイルの変換失敗は他へ波及させず ConversionError に隔離する(バッチ隔離を殻側でも維持)。
 */
async function convertFiles(files: File[]): Promise<{
  importFiles: JobcanImportFile[];
  conversionErrors: ConversionError[];
}> {
  const importFiles: JobcanImportFile[] = [];
  const conversionErrors: ConversionError[] = [];
  for (const file of files) {
    const fileName = sanitizeFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const { rows, sheetName } = await xlsxToRows(buffer);
      importFiles.push({ fileName, rows, sheetName });
    } catch {
      // 生 err.message(パスやライブラリ内部情報を含みうる)は載せない。
      conversionErrors.push({ fileName, message: "xlsx の読み込みに失敗しました" });
    }
  }
  return { importFiles, conversionErrors };
}

/** Slack 通知が必要か(エラー・警告があるときだけ)。 */
function hasIssues(result: JobcanImportResult, conversionErrors: ConversionError[]): boolean {
  return (
    conversionErrors.length > 0 ||
    result.fileErrors.length > 0 ||
    result.reconcile.warnings.length > 0 ||
    result.reconcileError !== undefined
  );
}

/** 人間可読サマリに変換エラー節を足す(秘密は含めない)。 */
function buildMessage(result: JobcanImportResult, conversionErrors: ConversionError[]): string {
  const base = formatJobcanImportSummary(result);
  if (conversionErrors.length === 0) return base;
  const lines = [base, "", `■ 変換エラー (${conversionErrors.length}件)`];
  for (const e of conversionErrors) lines.push(`- ${e.fileName}: ${e.message}`);
  return lines.join("\n");
}

/** Slack へ best-effort 通知(既存 notifyError と同じ bot token 経路)。失敗しても取込結果は返す。 */
async function notifySlack(botToken: string, channel: string, text: string): Promise<void> {
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text }),
    });
  } catch {
    // 通知失敗は取込結果を握りつぶさない(ベストエフォート)。
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // CRITICAL-1: 認証を全経路の最前段に置く(dry-run でも必須)。
  // env 検証・formData パースより前。秘密値はレスポンスに一切出さない。
  const auth = verifyImportAuth(
    req.headers.get("authorization"),
    process.env.JOBCAN_IMPORT_SECRET,
  );
  if (!auth.ok) {
    // secret_not_configured はサーバー設定不備(500)、unauthorized は 401。
    // いずれも一般化した文言のみで秘密は出さない。
    return auth.reason === "secret_not_configured"
      ? NextResponse.json({ error: "server misconfigured" }, { status: 500 })
      : NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const missing = missingImportEnvVars(process.env);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "server misconfigured", missing },
      { status: 500 },
    );
  }

  const databaseUrl = process.env.DATABASE_URL as string;
  const botToken = process.env.SLACK_BOT_TOKEN as string;
  const notifyChannel =
    process.env.SLACK_JOBCAN_CHANNEL_ID ?? process.env.SLACK_WATCH_CHANNEL_ID ?? "";

  try {
    const formData = await req.formData();
    const files = collectFiles(formData);
    if (files.length === 0) {
      return NextResponse.json({ error: "no files uploaded" }, { status: 400 });
    }

    // HIGH-1: arrayBuffer 展開の前に file.size だけで上限チェック(メモリ枯渇DoS防止)。
    const limitCheck = validateUploadLimits(files);
    if (!limitCheck.ok) {
      return NextResponse.json(
        { error: "payload too large", reason: limitCheck.reason },
        { status: 413 },
      );
    }

    const dryRun = resolveDryRun(
      { apply: readApplyFlag(req, formData) },
      { JOBCAN_APPLY_ENABLED: process.env.JOBCAN_APPLY_ENABLED },
    );
    const { importFiles, conversionErrors } = await convertFiles(files);

    const deps = buildDeps(databaseUrl, botToken);
    const result = await runJobcanImport(importFiles, deps, {
      dryRun,
      reconcileRemovals: false,
    });

    const message = buildMessage(result, conversionErrors);
    if (notifyChannel && hasIssues(result, conversionErrors)) {
      await notifySlack(botToken, notifyChannel, message);
    }

    // PII 露出の前提(staff/route.ts・import-ui/route.ts と同一トーン):
    // このレスポンスは Vercel Deployment Protection 下の管理画面向け。
    // warnings は jobcan-reconcile-all の warning(staff email を含む)を素通しする。
    // fileErrors / conversionErrors / message も staff 名やファイル名など個人特定に
    // つながりうる情報を含みうる。保護(infra 層)が主ゲートである前提で許容する。
    // この保護前提が外れる変更(公開エンドポイント化・認証方式変更等)の際は、
    // ここで返す PII をマスク/除去するか再検討すること。
    return NextResponse.json({
      dryRun,
      summary: result.summary,
      fileErrors: result.fileErrors,
      warnings: result.reconcile.warnings,
      reconcileError: result.reconcileError ?? null,
      conversionErrors,
      message,
    });
  } catch {
    // 生 err(接続文字列・トークン等の秘密を含みうる)はレスポンス・ログに出さない。
    return NextResponse.json({ error: "import failed" }, { status: 500 });
  }
}
