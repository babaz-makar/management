/**
 * 2-7b(本番 /api 取込ルート)の殻から使う、exceljs 非依存の純ロジック群。
 * packages の追加依存ゼロを保ったまま、apps/web 側の危険な縫い目(ファイル名・
 * dry-run ゲート・xlsx セル読み)をテスト可能な純関数として切り出す。
 *
 * ムーディ申し送り①: Slack サマリへの偽行注入/ファイル名偽装を sanitizeFileName で封じる。
 * M-4 フェイルオープン封じ: resolveDryRun は二重ゲートが揃った時だけ本反映、
 *   それ以外(undefined/未知値/型破り)は必ず dry-run 側へ倒す。
 */

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
