/**
 * シフトリマインド専用 Slack Bot のAPIラッパー。
 *
 * 既存のシフト変更ツールとは別アプリ・別トークンで動かす（表示名を分ける／
 * スコープを最小化する／障害の切り分けを楽にする）。そのため環境変数も
 * SLACK_REMIND_BOT_TOKEN と分けて渡す前提で、トークンは引数で受け取る。
 */

const SLACK_API = "https://slack.com/api";

export interface SlackApiResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export async function slackApi(
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<SlackApiResult> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as SlackApiResult;
}

/**
 * チャンネルへ投稿する。失敗時は1回だけリトライしてから諦める。
 * @returns 送信できたら true
 */
export async function postMessage(
  botToken: string,
  channel: string,
  text: string,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await slackApi(botToken, "chat.postMessage", {
        channel,
        text,
        // メンションを本文に含めるので、リンク展開でメッセージが伸びるのを抑える
        unfurl_links: false,
        unfurl_media: false,
      });
      if (result.ok) return { ok: true };
      // channel_not_found / not_in_channel などはリトライしても直らない
      if (result.error && !RETRYABLE_ERRORS.has(result.error)) {
        return { ok: false, error: result.error };
      }
      if (attempt === 0) await sleep(1000);
      else return { ok: false, error: result.error };
    } catch (err) {
      if (attempt === 0) await sleep(1000);
      else return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { ok: false, error: "unknown" };
}

const RETRYABLE_ERRORS = new Set([
  "ratelimited",
  "service_unavailable",
  "internal_error",
  "fatal_error",
  "request_timeout",
]);

/** Modal を開く */
export async function openView(
  botToken: string,
  triggerId: string,
  view: unknown,
): Promise<SlackApiResult> {
  return slackApi(botToken, "views.open", { trigger_id: triggerId, view });
}

/** スラッシュコマンドの response_url へ遅延応答する（3秒制限を超える処理用） */
export async function respondEphemeral(
  responseUrl: string,
  text: string,
): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ response_type: "ephemeral", text }),
  });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
