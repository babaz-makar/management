/**
 * email → refreshToken の解決(Slack橋渡し)。
 *
 * 2段のうち②を担う: email →(Slack lookup)→ slack_user_id →(既存 TokenStore)→ refreshToken。
 * 新しいトークンストアは作らず、既存 slack_user_id キーの TokenStore をそのまま使う。
 * calendarId は本人の email。
 *
 * fail-loud 方針:
 *   - 不正 email は throw(assertEmail 再利用、推測しない)。
 *   - 見つからない系(Slack未在籍 / Google未連携)は握りつぶさず、失敗理由を構造化して返す。
 * 秘密情報(refreshToken)は失敗結果・文言に載せない。
 */
import { assertEmail } from "./staff-directory";
import type { TokenStore } from "./token-store";

/** 解決失敗の理由(Step2-7 の Slack 通知 warning に流す下地)。 */
export type TokenResolutionFailureReason = "slack_not_found" | "google_not_linked";

export interface TokenResolutionSuccess {
  ok: true;
  refreshToken: string;
  /** 本人カレンダー = email。 */
  calendarId: string;
}

export interface TokenResolutionFailure {
  ok: false;
  reason: TokenResolutionFailureReason;
  email: string;
}

export type TokenResolution = TokenResolutionSuccess | TokenResolutionFailure;

/** テストで fake を差し込めるよう DI する依存。 */
export interface TokenResolverDeps {
  /** email → slack_user_id(見つからなければ null、呼び出し失敗は throw)。 */
  lookupSlackUserId: (email: string) => Promise<string | null>;
  /** slack_user_id → refreshToken(既存ストアをそのまま利用)。 */
  tokenStore: TokenStore;
}

/**
 * email から refreshToken / calendarId を解決する。
 * 成功/失敗を型で表現し、失敗は理由付きで返す(null 握りつぶし禁止)。
 */
export async function resolveRefreshTokenByEmail(
  email: string,
  deps: TokenResolverDeps,
): Promise<TokenResolution> {
  // 検証が先。不正 email では Slack 問い合わせもしない。
  const validEmail = assertEmail(email);

  const slackUserId = await deps.lookupSlackUserId(validEmail);
  if (slackUserId === null) {
    return { ok: false, reason: "slack_not_found", email: validEmail };
  }

  const refreshToken = await deps.tokenStore.get(slackUserId);
  if (refreshToken === null) {
    return { ok: false, reason: "google_not_linked", email: validEmail };
  }

  return { ok: true, refreshToken, calendarId: validEmail };
}

/**
 * 失敗理由を人間可読の日本語文言にする(Step2-7 の Slack 通知用)。
 * refreshToken 等の秘密情報は載せない(email のみ)。
 */
export function describeResolutionFailure(failure: TokenResolutionFailure): string {
  switch (failure.reason) {
    case "slack_not_found":
      return `${failure.email} は Slack ワークスペースに見つかりません(未在籍の可能性)`;
    case "google_not_linked":
      return `${failure.email} は Google カレンダー未連携です`;
  }
}
