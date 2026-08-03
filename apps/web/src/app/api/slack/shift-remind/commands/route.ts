import { NextRequest, NextResponse } from "next/server";
import {
  SHIFT_TITLE_KEYWORD,
  formatMemberAdded,
  requestCalendarConnect,
  resolveTargetDate,
  respondEphemeral,
  runRemind,
  verifySlackRequest,
  type ChannelMember,
  type RemindTiming,
} from "@management/shift-management";
import { getRemindStore, remindEnv } from "@/lib/remind-config";
import { openMembersModal } from "@/lib/remind-ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * `/shift-remind` スラッシュコマンド。**実行したチャンネルに対して**効く。
 *
 *   setup        … 対象メンバーを選ぶ Modal を開く（初期値は登録済み or チャンネル参加者）
 *   add @user…   … 対象メンバーを追加（Modalを開かずに素早く追加する用）
 *   remove @user…… 対象メンバーを外す
 *   list         … このチャンネルの対象メンバーと連携状況を表示
 *   test         … このチャンネル分の通知文をプレビュー（送信しない）
 *   help         … 使い方
 *
 * 署名検証は **リマインド専用アプリの** Signing Secret を使う
 * （既存のシフト変更ツールとは別アプリなので値が違う）。
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyOrSkip(req, rawBody)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const args = (form.get("text") ?? "").trim().split(/\s+/).filter(Boolean);
  const sub = (args[0] ?? "help").toLowerCase();
  const channelId = form.get("channel_id") ?? "";
  const triggerId = form.get("trigger_id") ?? "";
  const responseUrl = form.get("response_url") ?? "";

  if (!channelId) return ephemeral("チャンネル内で実行してください。");

  try {
    switch (sub) {
      case "setup":
      case "members":
        return await handleSetup(channelId, triggerId);
      case "add":
        return await handleAdd(channelId, args.slice(1));
      case "remove":
        return await handleRemove(channelId, args.slice(1));
      case "list":
        return await handleList(channelId);
      case "test":
        return await handleTest(channelId, args[1], responseUrl);
      default:
        return ephemeral(helpText());
    }
  } catch (err) {
    console.error("[shift-remind] command error:", err);
    return ephemeral(
      `:warning: エラーが発生しました: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function handleSetup(channelId: string, triggerId: string) {
  if (!triggerId) return ephemeral("Modalを開けませんでした（trigger_idがありません）");
  const result = await openMembersModal(channelId, triggerId);
  if (!result.ok) return ephemeral(`Modalを開けませんでした: ${result.error}`);
  return new NextResponse(null, { status: 200 });
}

async function handleAdd(channelId: string, rest: string[]) {
  const userIds = parseMentions(rest);
  if (userIds.length === 0) {
    return ephemeral("追加するメンバーをメンションで指定してください（例: `/shift-remind add @山田`）");
  }

  const store = getRemindStore();
  await store.addNotificationTarget(channelId);
  await store.addChannelMembers(channelId, userIds);

  const members = await store.listChannelMembers(channelId);
  const unconnected = members
    .filter((m) => userIds.includes(m.slackUserId) && !m.connected)
    .map((m) => m.slackUserId);

  // 連携リンクは本人へDMで送る（チャンネルやコマンド応答には出さない）
  const connect = remindEnv.appUrl
    ? await requestCalendarConnect(remindEnv.botToken, unconnected, remindEnv.appUrl)
    : { dmSent: [], dmFailed: [] };

  return ephemeral(formatMemberAdded(userIds, connect.dmSent, connect.dmFailed));
}

async function handleRemove(channelId: string, rest: string[]) {
  const userIds = parseMentions(rest);
  if (userIds.length === 0) {
    return ephemeral("外すメンバーをメンションで指定してください（例: `/shift-remind remove @山田`）");
  }

  await getRemindStore().removeChannelMembers(channelId, userIds);
  return ephemeral(
    `${userIds.map((id) => `<@${id}>`).join(" ")} をシフトリマインドの対象から外しました。`,
  );
}

async function handleList(channelId: string) {
  const store = getRemindStore();
  const [members, targets] = await Promise.all([
    store.listChannelMembers(channelId),
    store.listNotificationTargets(),
  ]);

  const registered = targets.some((t) => t.channelId === channelId);
  const lines = [
    `*<#${channelId}> のシフトリマインド*`,
    registered
      ? ":white_check_mark: 通知先として有効"
      : ":no_entry: 通知先が無効（Botを招待し直すか `/shift-remind setup` で保存してください）",
    "",
    "*対象メンバー*",
  ];

  lines.push(
    members.length > 0
      ? members.map(formatMemberLine).join("\n")
      : "• 未設定 — `/shift-remind setup` で選んでください",
  );

  return ephemeral(lines.join("\n"));
}

function formatMemberLine(m: ChannelMember): string {
  const state = !m.connected
    ? ":no_entry: カレンダー未連携"
    : m.calendarStatus === "revoked"
      ? ":warning: 連携切れ（再連携が必要）"
      : m.remindEnabled
        ? ":white_check_mark: 有効"
        : ":mute: 本人設定で停止中";
  const calendar = m.calendarId === "primary" ? "" : ` / カレンダー: ${m.calendarId}`;
  const name = m.displayName ? ` (${m.displayName})` : "";
  return `• <@${m.slackUserId}>${name} ${state}${calendar}`;
}

/**
 * dryRun でプレビューする。
 *
 * カレンダー取得に3秒以上かかるとSlackがタイムアウト表示を出すため、
 * 結果は response_url 経由の遅延応答で返す（遅延応答なら必ず届く）。
 */
async function handleTest(
  channelId: string,
  when: string | undefined,
  responseUrl: string,
) {
  const timing: RemindTiming =
    when === "morning" || when === "today" ? "morning" : "prev_night";
  const store = getRemindStore();
  const date = resolveTargetDate(timing, new Date());

  const result = await runRemind({
    store,
    botToken: remindEnv.botToken,
    timing,
    date,
    channelIds: [channelId],
    changeChannelLabel: remindEnv.changeChannelLabel,
    appUrl: remindEnv.appUrl,
    dryRun: true,
  });

  const ch = result.channels[0];
  const header =
    `*プレビュー（送信しません）* timing=${timing} / 対象日=${date}\n` +
    `登録メンバー ${ch?.memberCount ?? 0}人（うち連携済み ${ch?.activeCount ?? 0}人） / ` +
    `該当シフト ${ch?.shiftCount ?? 0}件`;

  const body =
    ch?.message ?? "（対象日にシフトのあるメンバーがいないため、通知は送られません）";
  const notes = [
    ...(ch?.unconnected.length
      ? [`未連携: ${ch.unconnected.map((id) => `<@${id}>`).join(" ")}`]
      : []),
    ...result.warnings,
    ...result.errors,
  ]
    .map((w) => `• ${w}`)
    .join("\n");

  const text = [header, "", body, notes ? `\n---\n${notes}` : ""].join("\n");

  if (responseUrl) {
    await respondEphemeral(responseUrl, text);
    return new NextResponse(null, { status: 200 });
  }
  return ephemeral(text);
}

/** `<@U0123ABCD|name>` 形式のメンションからユーザーIDを取り出す */
function parseMentions(tokens: string[]): string[] {
  const ids = new Set<string>();
  for (const t of tokens) {
    const m = t.match(/^<@([A-Z0-9]+)(\|[^>]*)?>$/);
    if (m) ids.add(m[1]);
    else if (/^[UW][A-Z0-9]{4,}$/.test(t)) ids.add(t); // 生のIDでも受け付ける
  }
  return [...ids];
}

function helpText(): string {
  return [
    "*シフトリマインドの使い方*（実行したチャンネルに対して効きます）",
    "`/shift-remind setup` … 対象メンバーを選ぶ",
    "`/shift-remind add @山田 @佐藤` … 対象メンバーを追加",
    "`/shift-remind remove @山田` … 対象メンバーを外す",
    "`/shift-remind list` … 対象メンバーと連携状況を表示",
    "`/shift-remind test` … 明日分の通知文をプレビュー（送信しません）",
    "`/shift-remind test today` … 当日分の通知文をプレビュー",
    "",
    "Bot をチャンネルに招待すると、そのチャンネルが通知先として登録され、対象メンバーを選ぶ案内が出ます。",
    `通知は前日21:00（翌日分）と当日08:00（当日分）。カレンダーのタイトルに「${SHIFT_TITLE_KEYWORD}」を含む予定が対象です。`,
  ].join("\n");
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

function ephemeral(text: string) {
  return NextResponse.json({ response_type: "ephemeral", text });
}
