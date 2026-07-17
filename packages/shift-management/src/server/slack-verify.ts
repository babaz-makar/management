import { createHmac, timingSafeEqual } from "crypto";

/**
 * Slack Events API のリクエスト署名を検証する。
 * 不正なリクエスト（なりすまし）を弾くためのセキュリティチェック。
 */
export function verifySlackRequest(
  signingSecret: string,
  headers: { "x-slack-signature"?: string; "x-slack-request-timestamp"?: string },
  rawBody: string,
): boolean {
  const signature = headers["x-slack-signature"];
  const timestamp = headers["x-slack-request-timestamp"];
  if (!signature || !timestamp) return false;

  const fiveMinutes = 60 * 5;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > fiveMinutes) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(baseString).digest("hex")}`;

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
