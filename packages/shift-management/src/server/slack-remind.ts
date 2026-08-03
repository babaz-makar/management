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
 * @param blocks Block Kit のブロック（ボタン付きメッセージ用）。text はフォールバック表示に使われる
 */
export async function postMessage(
  botToken: string,
  channel: string,
  text: string,
  blocks?: unknown[],
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, unknown> = {
    channel,
    text,
    // メンションを本文に含めるので、リンク展開でメッセージが伸びるのを抑える
    unfurl_links: false,
    unfurl_media: false,
  };
  if (blocks) payload.blocks = blocks;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await slackApi(botToken, "chat.postMessage", payload);
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
  await respondWebhook(responseUrl, { response_type: "ephemeral", text });
}

/**
 * response_url へ任意のペイロードを送る。
 * `{ replace_original: true }` を付けるとボタン付きメッセージを差し替えられる。
 */
export async function respondWebhook(
  responseUrl: string,
  body: Record<string, unknown>,
): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
}

/**
 * ユーザーとのDMチャンネルを開き、そのチャンネルIDを返す（`im:write` が必要）。
 *
 * chat.postMessage に生のユーザーIDを渡しても多くの場合は届くが、
 * conversations.open を通した方がワークスペース設定による差が出にくい。
 * 失敗したらユーザーIDをそのまま返して postMessage 側に任せる。
 */
export async function openDirectMessage(
  botToken: string,
  slackUserId: string,
): Promise<string> {
  const result = await slackApi(botToken, "conversations.open", {
    users: slackUserId,
  });
  const channel = (result.channel as { id?: string } | undefined)?.id;
  return result.ok && channel ? channel : slackUserId;
}

/** Bot自身のユーザーID。member_joined_channel が「Bot自身の参加」かの判定に使う */
export async function getBotUserId(botToken: string): Promise<string | null> {
  const result = await slackApi(botToken, "auth.test", {});
  return result.ok ? ((result.user_id as string) ?? null) : null;
}

/** チャンネルの参加者ID一覧（ページングを畳む） */
export async function listConversationMembers(
  botToken: string,
  channelId: string,
): Promise<string[]> {
  const members: string[] = [];
  let cursor: string | undefined;

  // 想定は多くて数百人。無限ループを避けるため上限を切る
  for (let page = 0; page < 10; page++) {
    const result = await slackApi(botToken, "conversations.members", {
      channel: channelId,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    if (!result.ok) break;

    members.push(...((result.members as string[]) ?? []));
    cursor = (result.response_metadata as { next_cursor?: string } | undefined)?.next_cursor;
    if (!cursor) break;
  }

  return members;
}

/**
 * Bot・削除済みユーザーを除いた「人間」のIDだけ返す。
 *
 * users.info をメンバー分呼ぶとレート制限に当たりやすいので、users.list を
 * 1〜数回で読み切ってから突き合わせる。
 */
export async function filterHumanUsers(
  botToken: string,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const excluded = new Set<string>();
  let cursor: string | undefined;
  let fetched = false;

  for (let page = 0; page < 10; page++) {
    const result = await slackApi(botToken, "users.list", {
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    if (!result.ok) break;
    fetched = true;

    for (const u of (result.members as { id: string; is_bot?: boolean; deleted?: boolean }[]) ?? []) {
      if (u.is_bot || u.deleted || u.id === "USLACKBOT") excluded.add(u.id);
    }
    cursor = (result.response_metadata as { next_cursor?: string } | undefined)?.next_cursor;
    if (!cursor) break;
  }

  // users.list が取れなかった場合（スコープ不足など）は絞り込まずそのまま返す。
  // Modal の初期値なので、人が見て外せばよい
  if (!fetched) return userIds;

  return userIds.filter((id) => !excluded.has(id));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
