/**
 * Slack ディレクトリ補助。email から slack_user_id を引く薄いラッパ。
 *
 * 追加依存ゼロ(fetch は global)。テスト容易性のため
 *   - HTTP を行う薄い実体 `lookupSlackUserIdByEmail`(fetch 注入可)
 *   - レスポンス解釈の純関数 `interpretSlackLookupResponse`
 * に分離する。純関数側を単体テストする。
 *
 * fail-loud 方針:
 *   - 「見つからない」(ok=false & error=users_not_found)= null を返す
 *   - 「呼び出し自体の失敗」(HTTP非2xx / 認証エラー / ratelimit / 壊れたレスポンス)= throw
 * 秘密情報(botToken)はエラーメッセージに載せない。
 */

/** テストで差し替え可能な最小 fetch 型(global fetch と構造的に互換)。 */
export type SlackFetch = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** 「見つからない」として null 扱いにする Slack エラーコード。それ以外の ok=false は throw。 */
const NOT_FOUND_ERROR = "users_not_found";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Slack users.lookupByEmail のレスポンス(パース済み JSON)を解釈する純関数。
 * - ok=true & user.id あり → その id
 * - ok=false & error=users_not_found → null(見つからない)
 * - それ以外(認証エラー / ratelimit / ok=true だが user.id 無し / 壊れた形)→ throw
 */
export function interpretSlackLookupResponse(data: unknown): string | null {
  if (!isRecord(data)) {
    throw new Error("Slack users.lookupByEmail: unexpected response shape");
  }
  if (data.ok === true) {
    const user = data.user;
    const id = isRecord(user) ? user.id : undefined;
    if (typeof id === "string" && id.length > 0) return id;
    throw new Error("Slack users.lookupByEmail: ok=true but user.id missing");
  }
  const error = typeof data.error === "string" ? data.error : "unknown_error";
  if (error === NOT_FOUND_ERROR) return null;
  throw new Error(`Slack users.lookupByEmail failed: ${error}`);
}

/**
 * email から slack_user_id を引く。見つからなければ null、呼び出し失敗は throw。
 * @param fetchImpl テスト用に注入。既定は global fetch(実ネットワーク)。
 */
export async function lookupSlackUserIdByEmail(
  email: string,
  botToken: string,
  fetchImpl: SlackFetch = fetch,
): Promise<string | null> {
  const url = `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  if (!res.ok) {
    // botToken はメッセージに載せない。
    throw new Error(`Slack users.lookupByEmail HTTP ${res.status}`);
  }
  const data = await res.json();
  return interpretSlackLookupResponse(data);
}
