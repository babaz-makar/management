import { NextRequest, NextResponse } from "next/server";
import {
  CHANNELS_CALLBACK_ID,
  SETUP_CALLBACK_ID,
  parseChannelsSubmission,
  parseSetupSubmission,
  postMessage,
  verifySlackRequest,
} from "@management/shift-management";
import { getRemindStore, remindEnv } from "@/lib/remind-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `/shift-remind` の Modal 送信（view_submission）を受ける。
 *
 * Slackは3秒以内の応答を要求するので、DB書き込みだけ済ませて即返す。
 * 確認メッセージは本人へのDMで非同期に伝える（失敗しても Modal は閉じる）。
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyOrSkip(req, rawBody)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payloadRaw = new URLSearchParams(rawBody).get("payload");
  if (!payloadRaw) return NextResponse.json({});

  const payload = JSON.parse(payloadRaw);
  if (payload.type !== "view_submission") return NextResponse.json({});

  const callbackId = payload.view?.callback_id;
  const state = payload.view?.state ?? {};
  const actorId: string | undefined = payload.user?.id;

  try {
    if (callbackId === SETUP_CALLBACK_ID) {
      return await saveSetup(state, actorId);
    }
    if (callbackId === CHANNELS_CALLBACK_ID) {
      return await saveChannels(state, actorId);
    }
  } catch (err) {
    console.error("[shift-remind] view_submission error:", err);
    return NextResponse.json({
      response_action: "errors",
      errors: {
        // 先頭の input ブロックにエラーを出す（Modalを閉じずに再入力させる）
        [callbackId === CHANNELS_CALLBACK_ID ? "channels" : "member"]:
          err instanceof Error ? err.message : "保存に失敗しました",
      },
    });
  }

  return NextResponse.json({});
}

async function saveSetup(state: unknown, actorId?: string) {
  const parsed = parseSetupSubmission(state as never);
  if (!parsed) {
    return NextResponse.json({
      response_action: "errors",
      errors: { member: "メンバーを選択してください" },
    });
  }

  const store = getRemindStore();
  await store.init();
  await store.saveSettings({
    slackUserId: parsed.slackUserId,
    remindEnabled: parsed.remindEnabled,
    calendarId: parsed.calendarId,
    displayName: parsed.displayName,
    // 手動で保存し直したときは連携切れフラグを解除する（再連携後の復帰手段）
    calendarStatus: "ok",
  });

  const connected = await store.hasGoogleToken(parsed.slackUserId);
  const status = parsed.remindEnabled ? "有効" : "無効";
  const warn = connected
    ? ""
    : "\n:warning: このメンバーはまだ Google Calendar を連携していません。シフト変更チャンネルへの投稿で表示される連携リンクから登録してもらってください。";

  await notify(
    actorId,
    `<@${parsed.slackUserId}> のシフトリマインドを *${status}* にしました（カレンダー: ${parsed.calendarId}）${warn}`,
  );

  return NextResponse.json({});
}

async function saveChannels(state: unknown, actorId?: string) {
  const channels = parseChannelsSubmission(state as never);
  const store = getRemindStore();
  await store.init();
  await store.setNotificationTargets(channels.map((c) => ({ targetId: c })));

  await notify(
    actorId,
    channels.length > 0
      ? `通知先を更新しました: ${channels.map((c) => `<#${c}>`).join(" ")}\nBotが未参加のチャンネルには投稿できないので、招待を忘れずに。`
      : "通知先をすべて解除しました。この状態ではリマインドは送信されません。",
  );

  return NextResponse.json({});
}

/** 操作した本人へDMで結果を伝える。失敗しても処理は止めない */
async function notify(actorId: string | undefined, text: string): Promise<void> {
  if (!actorId || !remindEnv.botToken) return;
  const result = await postMessage(remindEnv.botToken, actorId, text);
  if (!result.ok) {
    console.warn("[shift-remind] 確認DMの送信に失敗:", result.error);
  }
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
