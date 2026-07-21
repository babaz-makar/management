import { NextRequest, NextResponse } from "next/server";
import {
  verifySlackRequest,
  runPipeline,
  formatResultMessage,
} from "@management/shift-management";
import { getTokenStore } from "@/lib/token-store";

const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? "";
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? "primary";
const WATCH_CHANNEL = process.env.SLACK_WATCH_CHANNEL_ID ?? "";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SLACK_ADMIN_EMAIL ?? "";

const processed = new Set<string>();
let cachedAdminSlackId: string | null = null;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (SIGNING_SECRET && !process.env.SKIP_SLACK_VERIFY) {
    const valid = verifySlackRequest(
      SIGNING_SECRET,
      {
        "x-slack-signature": req.headers.get("x-slack-signature") ?? undefined,
        "x-slack-request-timestamp":
          req.headers.get("x-slack-request-timestamp") ?? undefined,
      },
      rawBody,
    );
    if (!valid) {
      console.warn("[shift-management] signature verification failed");
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  const body = JSON.parse(rawBody);

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type !== "event_callback") {
    return NextResponse.json({ ok: true });
  }

  const event = body.event;
  if (!event || event.type !== "message" || event.subtype) {
    return NextResponse.json({ ok: true });
  }

  if (event.bot_id || event.app_id) {
    return NextResponse.json({ ok: true });
  }

  if (WATCH_CHANNEL && event.channel !== WATCH_CHANNEL) {
    return NextResponse.json({ ok: true });
  }

  if (processed.has(event.ts)) {
    return NextResponse.json({ ok: true });
  }
  processed.add(event.ts);
  if (processed.size > 1000) {
    const arr = [...processed];
    arr.slice(0, 500).forEach((ts) => processed.delete(ts));
  }

  console.log("[shift-management] raw text:", JSON.stringify(event.text));

  try {
    await processEvent(event);
  } catch (err) {
    console.error("[shift-management] pipeline error:", err);
    await notifyError(event, err);
  }

  return NextResponse.json({ ok: true });
}

async function processEvent(event: {
  text: string;
  user: string;
  channel: string;
  ts: string;
}) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const tokenStore = getTokenStore();

  const refreshToken = await tokenStore.get(event.user);
  if (!refreshToken) {
    if (botToken) {
      const registerUrl = `${APP_URL}/api/auth/google?slack_user_id=${event.user}`;
      await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: event.channel,
          thread_ts: event.ts,
          text: `Google Calendar が未連携です。以下のリンクから連携してください:\n${registerUrl}`,
        }),
      });
    }
    return;
  }

  // DEBUG: Slack返信で生テキストとパース結果を確認（本番安定後に削除）
  const { parseShiftReport: debugParse } = await import("@management/shift-management");
  const debugChanges = debugParse({
    text: event.text,
    slackUserId: event.user,
    channelId: event.channel,
    messageTs: event.ts,
  });
  const debugInfo = [
    `[DEBUG] raw: ${JSON.stringify(event.text)}`,
    `[DEBUG] changes(${debugChanges.length}): ${debugChanges.map(c => c.kind).join(", ")}`,
  ].join("\n");

  const results = await runPipeline(
    {
      text: event.text,
      slackUserId: event.user,
      channelId: event.channel,
      messageTs: event.ts,
    },
    refreshToken,
    CALENDAR_ID,
  );

  if (results.length === 0) return;

  const hasWarnings = results.some((r) => r.plan.warnings.length > 0);
  const replyText = hasWarnings
    ? formatResultMessage(results) + "\n\n" + debugInfo
    : "変更完了\n\n" + debugInfo;

  if (botToken) {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: event.channel,
        thread_ts: event.ts,
        text: replyText,
      }),
    });
  }
}

async function lookupAdminSlackId(): Promise<string | null> {
  if (cachedAdminSlackId) return cachedAdminSlackId;
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken || !ADMIN_EMAIL) return null;

  try {
    const res = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(ADMIN_EMAIL)}`,
      { headers: { Authorization: `Bearer ${botToken}` } },
    );
    const data = await res.json();
    if (data.ok && data.user?.id) {
      cachedAdminSlackId = data.user.id;
      return cachedAdminSlackId;
    }
  } catch {
    // lookup 失敗時はメンションなしで通知
  }
  return null;
}

async function notifyError(
  event: { channel: string; ts: string },
  err: unknown,
) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return;

  const adminId = await lookupAdminSlackId();
  const mention = adminId ? `<@${adminId}> ` : "";
  const message = err instanceof Error ? err.message : String(err);

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: event.channel,
      thread_ts: event.ts,
      text: `${mention}:warning: シフト反映でエラーが発生しました:\n${message}`,
    }),
  });
}
