import { NextRequest, NextResponse } from "next/server";
import {
  ACTION_ADD_MEMBER,
  ACTION_DISMISS,
  ACTION_OPEN_MEMBERS,
  MEMBERS_CALLBACK_ID,
  formatConnectNotice,
  formatMemberAdded,
  parseActionValue,
  parseMembersSubmission,
  postMessage,
  requestCalendarConnect,
  respondWebhook,
  verifySlackRequest,
} from "@management/shift-management";
import { getRemindStore, remindEnv } from "@/lib/remind-config";
import { openMembersModal } from "@/lib/remind-ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ボタン押下（block_actions）と Modal 送信（view_submission）を受ける。
 *
 * Slackは3秒以内の応答を要求するので、DB書き込みだけ済ませて即返す。
 * 結果の表示は response_url でメッセージを差し替える形にしている。
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyOrSkip(req, rawBody)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payloadRaw = new URLSearchParams(rawBody).get("payload");
  if (!payloadRaw) return NextResponse.json({});

  const payload = JSON.parse(payloadRaw);

  try {
    if (payload.type === "block_actions") return await handleAction(payload);
    if (payload.type === "view_submission") return await handleSubmission(payload);
  } catch (err) {
    console.error("[shift-remind] interaction error:", err);
    if (payload.type === "view_submission") {
      return NextResponse.json({
        response_action: "errors",
        errors: {
          members: err instanceof Error ? err.message : "保存に失敗しました",
        },
      });
    }
  }

  return NextResponse.json({});
}

// ---------------------------------------------------------------------------
// ボタン
// ---------------------------------------------------------------------------

async function handleAction(payload: {
  actions?: { action_id: string; value?: string }[];
  trigger_id?: string;
  response_url?: string;
  channel?: { id?: string };
  user?: { id?: string };
}) {
  const action = payload.actions?.[0];
  if (!action) return NextResponse.json({});

  if (action.action_id === ACTION_OPEN_MEMBERS) {
    const channelId = action.value ?? payload.channel?.id ?? "";
    if (channelId && payload.trigger_id) {
      await openMembersModal(channelId, payload.trigger_id);
    }
    return NextResponse.json({});
  }

  if (action.action_id === ACTION_ADD_MEMBER) {
    const parsed = parseActionValue(action.value);
    if (!parsed) return NextResponse.json({});

    const store = getRemindStore();
    await store.addChannelMembers(parsed.channelId, [parsed.slackUserId]);

    // 未連携なら連携リンクを**本人へDM**で送る。チャンネルには結果だけ出す
    const connected = await store.hasGoogleToken(parsed.slackUserId);
    const connect =
      connected || !remindEnv.appUrl
        ? { dmSent: [], dmFailed: [] }
        : await requestCalendarConnect(
            remindEnv.botToken,
            [parsed.slackUserId],
            remindEnv.appUrl,
          );

    // ボタン付きメッセージを結果に差し替える（押したあとにボタンが残らないように）
    if (payload.response_url) {
      await respondWebhook(payload.response_url, {
        replace_original: true,
        text: formatMemberAdded(
          [parsed.slackUserId],
          connect.dmSent,
          connect.dmFailed,
        ),
      });
    }
    return NextResponse.json({});
  }

  if (action.action_id === ACTION_DISMISS) {
    const parsed = parseActionValue(action.value);
    if (payload.response_url) {
      await respondWebhook(payload.response_url, {
        replace_original: true,
        text: parsed
          ? `<@${parsed.slackUserId}> は対象に追加しませんでした。あとから追加するときは \`/shift-remind setup\` で選べます。`
          : "対象に追加しませんでした。",
      });
    }
    return NextResponse.json({});
  }

  return NextResponse.json({});
}

// ---------------------------------------------------------------------------
// Modal 送信
// ---------------------------------------------------------------------------

async function handleSubmission(payload: {
  view?: { callback_id?: string; private_metadata?: string; state?: unknown };
  user?: { id?: string };
}) {
  if (payload.view?.callback_id !== MEMBERS_CALLBACK_ID) {
    return NextResponse.json({});
  }

  const parsed = parseMembersSubmission(payload.view as never);
  if (!parsed) {
    return NextResponse.json({
      response_action: "errors",
      errors: { members: "対象チャンネルを特定できませんでした。もう一度お試しください" },
    });
  }

  const store = getRemindStore();
  await store.init();
  // Modalから保存されたチャンネルは通知先としても有効にする
  // （Botを招待済みなら既に登録されているが、手動運用でも成立するようにしておく）
  await store.addNotificationTarget(parsed.channelId);
  await store.setChannelMembers(parsed.channelId, parsed.slackUserIds);

  await announceResult(parsed.channelId, parsed.slackUserIds);

  return NextResponse.json({});
}

/**
 * 保存結果をチャンネルに投稿する。
 * 未連携メンバーへの連携リンクは**本人へのDM**で送り、チャンネルには結果だけ出す
 * （リンクを公開すると他人のリンクを開いて別人として紐づく事故が起きる）。
 */
async function announceResult(
  channelId: string,
  slackUserIds: string[],
): Promise<void> {
  if (slackUserIds.length === 0) {
    await postMessage(
      remindEnv.botToken,
      channelId,
      ":mute: 対象メンバーを全員外しました。このチャンネルへのシフトリマインドは止まります。",
    );
    return;
  }

  const store = getRemindStore();
  const members = await store.listChannelMembers(channelId);
  const unconnected = members.filter((m) => !m.connected).map((m) => m.slackUserId);

  const connect = remindEnv.appUrl
    ? await requestCalendarConnect(remindEnv.botToken, unconnected, remindEnv.appUrl)
    : { dmSent: [], dmFailed: [] };

  const lines = [
    `:white_check_mark: シフトリマインドの対象メンバーを ${slackUserIds.length}人 に設定しました。`,
    slackUserIds.map((id) => `<@${id}>`).join(" "),
  ];

  const notice = formatConnectNotice(connect.dmSent, connect.dmFailed);
  if (notice) lines.push("", notice);

  await postMessage(remindEnv.botToken, channelId, lines.join("\n"));
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
