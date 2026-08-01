import { NextRequest, NextResponse } from "next/server";
import {
  buildBotJoinedBlocks,
  buildUserJoinedBlocks,
  filterHumanUsers,
  getBotUserId,
  listConversationMembers,
  postMessage,
  verifySlackRequest,
} from "@management/shift-management";
import { getRemindStore, remindEnv } from "@/lib/remind-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * シフトリマインドの Slack Events 受信。
 *
 * 対象メンバーは「Botをチャンネルに招待したとき」に決める設計なので、
 * 参加/退出イベントがこの機能の入口になる。
 *
 *   Bot が招待された   → 通知先として登録し、参加者を初期値にした選択UIを投稿
 *   Bot が外された     → 通知先を解除（登録メンバーは残すので再招待で復活）
 *   人が参加した       → 「対象に追加しますか？」をボタン付きで投稿
 *   人が退出した       → 対象から外す（見えないチャンネルでメンションされないように）
 */

/** Slackの再送で二重処理しないための簡易メモリキャッシュ */
const processed = new Set<string>();
let cachedBotUserId: string | null = null;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyOrSkip(req, rawBody)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }
  if (body.type !== "event_callback") {
    return NextResponse.json({ ok: true });
  }

  const eventId: string = body.event_id ?? "";
  if (eventId) {
    if (processed.has(eventId)) return NextResponse.json({ ok: true });
    processed.add(eventId);
    if (processed.size > 1000) {
      [...processed].slice(0, 500).forEach((id) => processed.delete(id));
    }
  }

  try {
    // Vercelのサーバーレスでは fire-and-forget にすると関数が止められるので必ず await する
    await handleEvent(body.event);
  } catch (err) {
    console.error("[shift-remind] event error:", err);
  }

  return NextResponse.json({ ok: true });
}

async function handleEvent(event: {
  type?: string;
  user?: string;
  channel?: string;
}): Promise<void> {
  if (!event?.type || !event.channel || !event.user) return;
  if (event.type !== "member_joined_channel" && event.type !== "member_left_channel") {
    return;
  }

  const botUserId = await resolveBotUserId();
  const isBot = botUserId !== null && event.user === botUserId;

  if (event.type === "member_joined_channel") {
    if (isBot) await onBotJoined(event.channel);
    else await onUserJoined(event.channel, event.user);
    return;
  }

  if (isBot) await onBotLeft(event.channel);
  else await onUserLeft(event.channel, event.user);
}

/** Bot が招待された → 通知先に登録し、参加者を初期値にした選択UIを出す */
async function onBotJoined(channelId: string): Promise<void> {
  const store = getRemindStore();
  await store.addNotificationTarget(channelId);

  // すでに登録済みメンバーがいれば（再招待）そちらを尊重し、無ければ参加者を提案する
  const existing = await store.listChannelMembers(channelId);
  const suggested =
    existing.length > 0
      ? existing.map((m) => m.slackUserId)
      : await filterHumanUsers(
          remindEnv.botToken,
          await listConversationMembers(remindEnv.botToken, channelId),
        );

  await postMessage(
    remindEnv.botToken,
    channelId,
    "シフトリマインドの対象メンバーを選んでください",
    buildBotJoinedBlocks(channelId, suggested),
  );
}

/** Bot が外された → 通知先を解除。登録メンバーは残す（再招待で選び直しにならないように） */
async function onBotLeft(channelId: string): Promise<void> {
  await getRemindStore().disableNotificationTarget(channelId);
}

/** 人が参加した → 対象に追加するかボタンで聞く */
async function onUserJoined(channelId: string, slackUserId: string): Promise<void> {
  const store = getRemindStore();

  // 通知先として登録されていないチャンネルには何も出さない
  const targets = await store.listNotificationTargets();
  if (!targets.some((t) => t.channelId === channelId)) return;

  const members = await store.listChannelMembers(channelId);
  if (members.some((m) => m.slackUserId === slackUserId)) return; // すでに対象

  await postMessage(
    remindEnv.botToken,
    channelId,
    `<@${slackUserId}> さんをシフトリマインドの対象に追加しますか？`,
    buildUserJoinedBlocks(channelId, slackUserId),
  );
}

/** 人が退出した → 対象から外す（見えないチャンネルでメンションされ続けないように） */
async function onUserLeft(channelId: string, slackUserId: string): Promise<void> {
  const store = getRemindStore();
  const members = await store.listChannelMembers(channelId);
  if (!members.some((m) => m.slackUserId === slackUserId)) return;

  await store.removeChannelMembers(channelId, [slackUserId]);
  await postMessage(
    remindEnv.botToken,
    channelId,
    `<@${slackUserId}> さんが退出したため、シフトリマインドの対象から外しました。`,
  );
}

async function resolveBotUserId(): Promise<string | null> {
  if (cachedBotUserId) return cachedBotUserId;
  if (!remindEnv.botToken) return null;
  cachedBotUserId = await getBotUserId(remindEnv.botToken);
  return cachedBotUserId;
}

function verifyOrSkip(req: NextRequest, rawBody: string): boolean {
  if (!remindEnv.signingSecret || process.env.SKIP_SLACK_VERIFY) return true;
  return verifySlackRequest(
    remindEnv.signingSecret,
    {
      "x-slack-signature": req.headers.get("x-slack-signature") ?? undefined,
      "x-slack-request-timestamp":
        req.headers.get("x-slack-request-timestamp") ?? undefined,
    },
    rawBody,
  );
}
