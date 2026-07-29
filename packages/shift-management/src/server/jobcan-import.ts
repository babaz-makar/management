/**
 * 複数の xlsx(各1人1ヶ月ぶん)を「行列化済み」で受け取り、ファイルごとに
 * パース＋staffCode 突合し、通ったファイルの entries を全集約して
 * reconcileJobcanForAllStaff に一括で渡す純粋オーケストレーション(packages 側)。
 *
 * xlsx→行列化(exceljs)は呼び出し側(2-7b/apps-web)の責務。ここは rows: string[][] を
 * 受け取ることで packages の追加依存ゼロを維持する(テスト可能な頭脳だけ)。
 *
 * 事故直結の要点:
 *   - 1ファイルの失敗(ファイル名パース/シートパース/staffCode 突合)を他ファイル・
 *     他人に波及させない。失敗したファイルだけ fileErrors に隔離し、残りは継続する。
 *   - 論点4: ファイル名由来 staffCode とシート内 staffCode が両方あって不一致なら、
 *     ファイル取り違え(別人カレンダー書込事故)の兆候としてそのファイルは取込中止。
 *   - 握りつぶし禁止: 失敗は必ず fileErrors か reconcile 側 warning に構造化して残す。
 */
import { parseJobcanFileName } from "../logic/jobcan-filename";
import { parseJobcanSheet } from "../parsers/jobcan-sheet";
import type { ShiftEntry } from "../types";
import type { StaffDirectory } from "./staff-directory";
import type { TokenResolution } from "./jobcan-token-resolver";
import type { JobcanReconcileResult } from "./jobcan-pipeline";
import {
  reconcileJobcanForAllStaff,
  type JobcanReconcileAllDeps,
  type JobcanReconcileAllResult,
} from "./jobcan-reconcile-all";

/** 1ファイル(=1人1ヶ月ぶん)の入力。rows は xlsx を行×列で文字列化したもの。 */
export interface JobcanImportFile {
  /** 例 "馬場優蔵(A0187) 2026年08月度.xlsx" */
  fileName: string;
  /** xlsx を行×列で文字列化済み(2-7b で変換)。空セル="" */
  rows: string[][];
  /** staffName フォールバック用(任意)。 */
  sheetName?: string;
}

/** reconcile へ束ねて渡す実行オプション(dryRun 等)。 */
export interface JobcanImportOptions {
  /** true なら plan までで実行しない。 */
  dryRun: boolean;
  /** entries に無い欠番日の空日削除まで行うか(既定 false=安全側)。 */
  reconcileRemovals?: boolean;
}

/** パース/突合で弾いたファイル(握りつぶさず構造化して残す)。 */
export interface JobcanImportFileError {
  fileName: string;
  /**
   * 機械可読カテゴリ。unexpected_error は collectEntries の二重防御 try/catch が
   * 拾った想定外例外(そのファイルだけ隔離し他ファイルは継続)。
   */
  reason:
    | "filename_parse_error"
    | "sheet_parse_error"
    | "staff_code_mismatch"
    | "unexpected_error";
  /** 人間可読メッセージ(秘密情報は含めない)。 */
  message: string;
}

/** dry-run 計画の可視化用サマリ(2-7b/UI が使う)。 */
export interface JobcanImportSummary {
  dryRun: boolean;
  totalFiles: number;
  /** パース/突合を通ったファイル数(空シフトの0件成功も含む)。 */
  importedFiles: number;
  erroredFiles: number;
  /** 集約された総 entries 数。 */
  totalEntries: number;
  /**
   * reconcile 対象になった「人×月バケツ」数。集約キーが staffCode::sourceMonth の
   * ため、同一人物でも月ごとに 1 件と数える(1人2ヶ月 → 2)。人数ではない点に注意。
   */
  staffMonthCount: number;
  /** 全 plan 合計の作成予定数。 */
  totalCreates: number;
  /** 全 plan 合計の削除予定数。 */
  totalDeletes: number;
  /** per-staff warning 件数。 */
  warningCount: number;
}

export interface JobcanImportResult {
  /** パース/突合で弾いたファイル。 */
  fileErrors: JobcanImportFileError[];
  /** reconcileJobcanForAllStaff の結果(per-staff warning 含む)。 */
  reconcile: JobcanReconcileAllResult;
  /**
   * 二重防御: reconcile-all は per-staff で例外隔離済み(通常は throw しない)だが、
   * 万一 reconcile-all 自体が throw した場合の可読メッセージ(秘密情報は含めない)。
   * 正常時は undefined。set されていても fileErrors は保全されている。
   */
  reconcileError?: string;
  /** 集計。 */
  summary: JobcanImportSummary;
}

/**
 * runJobcanImport の依存。reconcile は options(dryRun 等)まで受け取り、
 * runJobcanImport が束ねて渡す(reconcileJobcanForAllStaff の deps.reconcile は
 * 3引数なので、ここで options を bind した closure に変換する)。
 */
export interface JobcanImportDeps {
  staffDirectory: StaffDirectory;
  resolveToken: (email: string) => Promise<TokenResolution>;
  reconcile: (
    entries: ShiftEntry[],
    refreshToken: string,
    calendarId: string,
    options: JobcanImportOptions,
  ) => Promise<JobcanReconcileResult>;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * ファイル名由来 staffCode とシート内 staffCode の不一致を検出する(論点4)。
 * 両方が存在して初めて突合できる。ファイル名にコードが無い/entries が空の場合は
 * 突合材料が無いので不一致判定はしない(=中止しない)。不一致なら理由文言を返す。
 */
function staffCodeMismatch(
  staffCodeInName: string | undefined,
  entries: ShiftEntry[],
): string | null {
  if (!staffCodeInName) return null;
  if (entries.length === 0) return null;
  const sheetCode = entries[0].staffCode;
  if (staffCodeInName === sheetCode) return null;
  return (
    `ファイル名の staffCode(${staffCodeInName})とシート内 staffCode(${sheetCode})が一致しません。` +
    "ファイル取り違え(別人カレンダーへの書込事故)の兆候のため、このファイルの取込を中止しました。"
  );
}

type ImportedFile =
  | { ok: true; entries: ShiftEntry[] }
  | { ok: false; error: JobcanImportFileError };

/** 1ファイルをパース＋突合する。段階ごとに失敗を隔離して分類する。 */
function importOneFile(f: JobcanImportFile): ImportedFile {
  let parsedName: { year: number; month: number; staffCodeInName?: string };
  try {
    parsedName = parseJobcanFileName(f.fileName);
  } catch (err: unknown) {
    return {
      ok: false,
      error: { fileName: f.fileName, reason: "filename_parse_error", message: getErrorMessage(err) },
    };
  }

  let entries: ShiftEntry[];
  try {
    entries = parseJobcanSheet({
      rows: f.rows,
      sheetName: f.sheetName,
      targetMonth: { year: parsedName.year, month: parsedName.month },
    });
  } catch (err: unknown) {
    return {
      ok: false,
      error: { fileName: f.fileName, reason: "sheet_parse_error", message: getErrorMessage(err) },
    };
  }

  const mismatch = staffCodeMismatch(parsedName.staffCodeInName, entries);
  if (mismatch !== null) {
    return {
      ok: false,
      error: { fileName: f.fileName, reason: "staff_code_mismatch", message: mismatch },
    };
  }
  return { ok: true, entries };
}

/** 想定外例外で隔離するファイルの文言(秘密を含みうる生 message は載せない)。 */
const UNEXPECTED_FILE_MESSAGE =
  "予期しないエラーによりこのファイルの取込を中止しました(他ファイルの処理は継続しました)";

/**
 * reconcile-all 全体が万一 throw した場合の固定文言。上流 err.message には
 * DB/API 依存で接続文字列等の秘密が載りうるため、生メッセージは逐語転写しない
 * (M-3 の per-staff warning と対称の秘密非包含方針)。詳細はサーバーログ側に残る。
 */
const RECONCILE_ALL_ERROR_MESSAGE =
  "取込処理全体でエラーが発生しました(詳細はサーバーログを確認してください)";

/** 壊れたファイルオブジェクトでも fileName 取得で全損しないよう安全に読む。 */
function safeFileName(f: JobcanImportFile): string {
  try {
    return typeof f.fileName === "string" ? f.fileName : "(不明なファイル)";
  } catch {
    return "(不明なファイル)";
  }
}

/**
 * 全ファイルを走査し、通ったファイルの entries を集約する。失敗は隔離する。
 *
 * 全損防止(M-1):
 *   - entries の連結は spread-push(`push(...arr)`)を使わずループ push にする。
 *     巨大 entries(実測12万超)で `push(...arr)` は RangeError を投げ、1ファイルが
 *     全バッチを道連れに reject するため、その原因そのものを除去する。
 *   - さらにファイル処理を try/catch で隔離し、万一 throw してもそのファイルだけ
 *     unexpected_error に隔離して他ファイルの処理を継続する(波及ゼロを二重に担保)。
 */
function collectEntries(files: JobcanImportFile[]): {
  entries: ShiftEntry[];
  fileErrors: JobcanImportFileError[];
  importedFiles: number;
} {
  const entries: ShiftEntry[] = [];
  const fileErrors: JobcanImportFileError[] = [];
  let importedFiles = 0;
  for (const f of files) {
    try {
      const result = importOneFile(f);
      if (result.ok) {
        for (const e of result.entries) entries.push(e); // spread-push は使わない(RangeError回避)
        importedFiles += 1;
      } else {
        fileErrors.push(result.error);
      }
    } catch {
      fileErrors.push({
        fileName: safeFileName(f),
        reason: "unexpected_error",
        message: UNEXPECTED_FILE_MESSAGE,
      });
    }
  }
  return { entries, fileErrors, importedFiles };
}

/** reconcile 結果の plan から作成/削除の総数を数える。 */
function countPlan(reconcile: JobcanReconcileAllResult): {
  totalCreates: number;
  totalDeletes: number;
} {
  let totalCreates = 0;
  let totalDeletes = 0;
  for (const r of reconcile.reconciled) {
    for (const d of r.days) {
      totalCreates += d.plan.creates.length;
      totalDeletes += d.plan.deleteEventIds.length;
    }
  }
  return { totalCreates, totalDeletes };
}

/** collectEntries の結果と reconcile 結果から集計サマリを組む純関数。 */
function buildSummary(
  files: JobcanImportFile[],
  fileErrors: JobcanImportFileError[],
  importedFiles: number,
  entries: ShiftEntry[],
  reconcile: JobcanReconcileAllResult,
  dryRun: boolean,
): JobcanImportSummary {
  const { totalCreates, totalDeletes } = countPlan(reconcile);
  return {
    dryRun,
    totalFiles: files.length,
    importedFiles,
    erroredFiles: fileErrors.length,
    totalEntries: entries.length,
    staffMonthCount: reconcile.reconciled.length,
    totalCreates,
    totalDeletes,
    warningCount: reconcile.warnings.length,
  };
}

/**
 * 複数ファイルをパース＋突合し、集約 entries を reconcileJobcanForAllStaff に渡す。
 * 失敗ファイルは fileErrors に、解決失敗スタッフは reconcile.warnings に隔離する。
 *
 * 二重防御方針: reconcile-all は per-staff で例外隔離済み(全体 reject しない設計)。
 * それでも万一 reconcile-all 自体が throw した場合は、再 throw せず、集約済み fileErrors を
 * 保全したまま reconcileError に失敗を構造化して返す(=全損させない/握りつぶさない)。
 */
export async function runJobcanImport(
  files: JobcanImportFile[],
  deps: JobcanImportDeps,
  options: JobcanImportOptions,
): Promise<JobcanImportResult> {
  const { entries, fileErrors, importedFiles } = collectEntries(files);

  const reconcileDeps: JobcanReconcileAllDeps = {
    staffDirectory: deps.staffDirectory,
    resolveToken: deps.resolveToken,
    reconcile: (e, refreshToken, calendarId) =>
      deps.reconcile(e, refreshToken, calendarId, options),
  };

  try {
    const reconcile = await reconcileJobcanForAllStaff(entries, reconcileDeps);
    return {
      fileErrors,
      reconcile,
      summary: buildSummary(files, fileErrors, importedFiles, entries, reconcile, options.dryRun),
    };
  } catch {
    // 上流 err の生メッセージ(秘密を含みうる)は転写せず、固定文言だけを載せる。
    const reconcile: JobcanReconcileAllResult = { reconciled: [], warnings: [] };
    return {
      fileErrors,
      reconcile,
      reconcileError: RECONCILE_ALL_ERROR_MESSAGE,
      summary: buildSummary(files, fileErrors, importedFiles, entries, reconcile, options.dryRun),
    };
  }
}

/** サマリ1行目(件数の要約)。 */
function summaryHeadline(s: JobcanImportSummary): string {
  const mode = s.dryRun ? "dry-run(反映なし)" : "本反映";
  return (
    `【ジョブカン取込結果 / ${mode}】\n` +
    `対象ファイル ${s.totalFiles}件 / 取込 ${s.importedFiles}件 / エラー ${s.erroredFiles}件\n` +
    `対象(人×月) ${s.staffMonthCount}件 / 総シフト ${s.totalEntries}件 / ` +
    `作成予定 ${s.totalCreates}件 / 削除予定 ${s.totalDeletes}件`
  );
}

/**
 * fileErrors と per-staff warning を人間可読の日本語に整形する純関数(Slack 通知用)。
 * 秘密情報(refreshToken 等)は載せない。email は運用者特定のため載せてよい
 * (warning.message は describeStaffSkipReason 由来で token を含まない)。
 */
export function formatJobcanImportSummary(result: JobcanImportResult): string {
  const lines: string[] = [summaryHeadline(result.summary)];

  if (result.fileErrors.length > 0) {
    lines.push("", `■ ファイルエラー (${result.fileErrors.length}件)`);
    for (const e of result.fileErrors) {
      lines.push(`- ${e.fileName}: ${e.message}`);
    }
  }

  if (result.reconcile.warnings.length > 0) {
    lines.push("", `■ スタッフ警告 (${result.reconcile.warnings.length}件)`);
    for (const w of result.reconcile.warnings) {
      lines.push(`- ${w.message}`);
    }
  }

  if (result.reconcileError !== undefined) {
    lines.push("", "■ 突合処理エラー(全体)", `- ${result.reconcileError}`);
  }

  if (
    result.fileErrors.length === 0 &&
    result.reconcile.warnings.length === 0 &&
    result.reconcileError === undefined
  ) {
    lines.push("", "エラー・警告はありません。");
  }

  return lines.join("\n");
}
