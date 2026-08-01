/**
 * 取込 UI / 名簿 UI(2-8b)向け: HTTP ステータス → 日本語文言の翻訳純関数。
 *
 * apps/web の staff-client.ts / import-client.ts がそれぞれ抱えていた
 * 「非 2xx を人間語へ翻訳する」ロジックを 1 箇所へ集約する。apps/web には
 * テストランナーが無いため、この純関数を packages 側でテスト可能にして退行を防ぐ。
 *
 * 方針:
 *   - fetch / crypto / googleapis 非依存(依存ゼロの葉ファイル)。client 安全バレル
 *     (src/ui.ts)経由で公開する。
 *   - serverMessage(サーバーが返した秘密を含まない明示文言)があれば最優先。
 *   - 既知ステータスは固定文言。想定外は fallback → 汎用文言に落ち、空文字/例外を返さない。
 *   - 呼び出し側固有の特例(名簿の 409 conflict・Slack の 502 確認不可・取込の
 *     env 未設定 等)は各 client に温存する。ここは汎用ステータス翻訳のみ。
 */

const PERMISSION = "権限がありません(管理画面から操作してください)。";
const NOT_FOUND = "対象が見つかりませんでした。";
const TOO_LARGE = "データが大きすぎます。内容を減らして再試行してください。";
const SERVER_ERROR =
  "サーバーエラーが発生しました。時間をおいて再試行してください。";
const BAD_REQUEST = "リクエストが不正です。入力内容を確認してください。";
const GENERIC = "エラーが発生しました。時間をおいて再試行してください。";

/**
 * 非 2xx を人間語へ翻訳する。
 * serverMessage が非空ならそれを優先し、無ければ HTTP ステータスで翻訳する。
 * 400 未満(想定外)は fallback → 汎用文言へ落とす。
 */
export function describeHttpError(
  status: number,
  serverMessage?: string,
  fallback?: string,
): string {
  if (typeof serverMessage === "string" && serverMessage.length > 0) {
    return serverMessage;
  }
  if (status === 401 || status === 403) return PERMISSION;
  if (status === 404) return NOT_FOUND;
  if (status === 413) return TOO_LARGE;
  if (status >= 500) return SERVER_ERROR;
  if (status >= 400) return BAD_REQUEST;
  return fallback ?? GENERIC;
}
