/**
 * 2-7b(本番 /api 取込ルート)の殻から使う、exceljs 非依存の純ロジック群。
 * packages の追加依存ゼロを保ったまま、apps/web 側の危険な縫い目(ファイル名・
 * dry-run ゲート・xlsx セル読み)をテスト可能な純関数として切り出す。
 *
 * ムーディ申し送り①: Slack サマリへの偽行注入/ファイル名偽装を sanitizeFileName で封じる。
 * M-4 フェイルオープン封じ: resolveDryRun は二重ゲートが揃った時だけ本反映、
 *   それ以外(undefined/未知値/型破り)は必ず dry-run 側へ倒す。
 */

import { timingSafeEqual } from "crypto";

/** 除去後に空になったファイル名のフォールバック(fileError.message にも載る前提)。 */
const FALLBACK_FILE_NAME = "(不明なファイル)";

/** ファイル名の最大長(サマリ肥大・偽装の抑止)。 */
const MAX_FILE_NAME_LENGTH = 120;

/**
 * 制御文字(C0: 改行/タブ/NUL 等 \u0000-\u001F, DEL \u007F, C1 \u0080-\u009F)を除去する。
 * 改行(\r\n)除去により Slack サマリへの偽行注入を封じる。
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * ファイル名を無害化する。改行・制御文字を除去し、トリムし、長さを制限する。
 * 除去後に空になったら固定のフォールバック名を返す(空文字を後段へ流さない)。
 */
export function sanitizeFileName(name: string): string {
  const raw = typeof name === "string" ? name : "";
  const stripped = raw.replace(CONTROL_CHARS, "").trim();
  if (stripped.length === 0) return FALLBACK_FILE_NAME;
  return stripped.length > MAX_FILE_NAME_LENGTH
    ? stripped.slice(0, MAX_FILE_NAME_LENGTH)
    : stripped;
}

/** JOBCAN_APPLY_ENABLED が「明示的に有効」と見なす値(厳密一致のみ)。 */
const APPLY_ENABLED_VALUES = new Set(["true", "1"]);

/**
 * dry-run にするかを決める(既定 dry-run 厳守・M-4 フェイルオープン封じ)。
 *
 * 本反映(false)になるのは **二重ゲートが両方成立** した時だけ:
 *   1. 環境変数 JOBCAN_APPLY_ENABLED が明示的な有効値("true"/"1")
 *   2. 呼び出しの apply が厳密に boolean の true
 * どちらか欠ける/未知値/型が違う場合は必ず dry-run(true)を返す。書込側へ倒れる経路を作らない。
 */
export function resolveDryRun(
  input: { apply?: boolean },
  env: { JOBCAN_APPLY_ENABLED?: string },
): boolean {
  const envEnabled =
    typeof env.JOBCAN_APPLY_ENABLED === "string" &&
    APPLY_ENABLED_VALUES.has(env.JOBCAN_APPLY_ENABLED);
  const applyRequested = input.apply === true; // 厳密 true 以外は全て false 扱い
  const shouldApply = envEnabled && applyRequested;
  return !shouldApply;
}

/**
 * 取込ルートの共有シークレット認証の結果(CRITICAL-1)。
 * reason は列挙。秘密(expectedSecret/token)は戻り値・例外に一切載せない。
 */
export type ImportAuthResult =
  | { ok: true }
  | { ok: false; reason: "secret_not_configured" | "unauthorized" };

/** Authorization ヘッダの想定プレフィックス。 */
const BEARER_PREFIX = "Bearer ";

/**
 * 取込ルートを共有シークレット(Bearer)で認証する(CRITICAL-1 匿名POST封じ)。
 *
 * - expectedSecret が未設定(undefined/空文字) → secret_not_configured(**fail-closed**。
 *   シークレット未設定のサーバーは全拒否。書込側へ倒れる穴を作らない)。
 * - authHeader が "Bearer <token>" 形式で token が expectedSecret と一致 → ok。
 *   比較は Node 組込 crypto の timingSafeEqual(定数時間比較)。バイト長が違うと
 *   timingSafeEqual が throw するため、先にバッファ長を見て不一致なら unauthorized。
 * - それ以外(ヘッダ欠落・"Bearer " 無し・不一致) → unauthorized。
 *
 * dry-run でも呼び出し側で必ず最前段に置くこと(認証は全経路必須)。
 */
export function verifyImportAuth(
  authHeader: string | null,
  expectedSecret: string | undefined,
): ImportAuthResult {
  if (typeof expectedSecret !== "string" || expectedSecret.length === 0) {
    return { ok: false, reason: "secret_not_configured" };
  }
  if (typeof authHeader !== "string" || !authHeader.startsWith(BEARER_PREFIX)) {
    return { ok: false, reason: "unauthorized" };
  }
  const token = authHeader.slice(BEARER_PREFIX.length);
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expectedSecret);
  // バイト長不一致は timingSafeEqual が throw する。長さの有無だけは早期リターンで
  // 弾く(長さはタイミング以前に判る情報なので秘密漏洩にはならない)。
  if (tokenBuf.length !== expectedBuf.length) {
    return { ok: false, reason: "unauthorized" };
  }
  return timingSafeEqual(tokenBuf, expectedBuf)
    ? { ok: true }
    : { ok: false, reason: "unauthorized" };
}

/** アップロード上限(HIGH-1 未認証DoS対策)。閾値は呼び出し側で差し替え可能。 */
export interface UploadLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

/** 既定のアップロード上限:50ファイル / 1ファイル5MB / 合計20MB。 */
export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  maxFiles: 50,
  maxFileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
};

/** validateUploadLimits の結果。超過理由を列挙で返す。 */
export type UploadLimitResult =
  | { ok: true }
  | {
      ok: false;
      reason: "too_many_files" | "file_too_large" | "total_too_large";
    };

/** size を安全な非負数へ正規化する(負・NaN・非数値は0扱い)。 */
function safeSize(value: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * アップロードの ①ファイル数 ②1ファイルサイズ ③合計サイズ を検証する(HIGH-1)。
 * arrayBuffer 展開の**前**に file.size だけで弾き、全ファイルをメモリ展開させない。
 * 境界値ちょうどは許可し、超過のみ false(理由付き)を返す。
 */
export function validateUploadLimits(
  files: readonly { size: number }[],
  limits: UploadLimits = DEFAULT_UPLOAD_LIMITS,
): UploadLimitResult {
  if (files.length > limits.maxFiles) {
    return { ok: false, reason: "too_many_files" };
  }
  let total = 0;
  for (const file of files) {
    const size = safeSize(file.size);
    if (size > limits.maxFileBytes) {
      return { ok: false, reason: "file_too_large" };
    }
    total += size;
  }
  if (total > limits.maxTotalBytes) {
    return { ok: false, reason: "total_too_large" };
  }
  return { ok: true };
}

/** 取込ルートで必須の env 名(値=秘密は扱わない)。 */
export const REQUIRED_IMPORT_ENV_VARS = [
  "DATABASE_URL",
  "SLACK_BOT_TOKEN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
] as const;

/**
 * 必須 env のうち欠落(未設定・空文字)しているものの**名前だけ**を返す純関数。
 * 値(接続文字列・トークン等の秘密)は受け取っても返さない。
 */
export function missingImportEnvVars(
  env: Record<string, string | undefined>,
): string[] {
  return REQUIRED_IMPORT_ENV_VARS.filter((name) => {
    const v = env[name];
    return typeof v !== "string" || v.length === 0;
  });
}

/** readValue() が返した生の値を文字列へ落とす(null/undefined→"", Date→ISO, その他→String)。 */
function coerceValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * xlsx セルを防御的に文字列化する(exceljs 非依存の縫い目)。
 *
 * readText() を先に試し、文字列を返せばそれを採用する。throw した場合や非文字列を
 * 返した場合は readValue() にフォールバックする。マージセルで exceljs の cell.text が
 * null 参照で throw する既知問題を、この一点で吸収する(価値実証スパイクで確認済み)。
 * readValue() 自身が throw する最悪ケースでも空文字に落とし、全損させない。
 *
 * apps/web 側は coerceCellText(() => cell.text, () => cell.value) のように
 * exceljs のセルアクセサを渡すだけにする。
 */
export function coerceCellText(
  readText: () => string,
  readValue: () => unknown,
): string {
  try {
    const text = readText();
    if (typeof text === "string") return text;
  } catch {
    // fall through to value
  }
  try {
    return coerceValue(readValue());
  } catch {
    return "";
  }
}
