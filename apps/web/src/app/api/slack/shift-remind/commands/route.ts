import { NextRequest, NextResponse } from "next/server";
import {
  buildChannelsView,
  buildSetupView,
  openView,
  resolveTargetDate,
  respondEphemeral,
  runRemind,
  verifySlackRequest,
  SHIFT_TITLE_KEYWORD,
  type RemindSettings,
  type RemindTiming,
} from "@management/shift-management";
import { getRemindStore, remindEnv, resolveChannelIds } from "@/lib/remind-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * `/shift-remind` スラッシュコマンド。
 *
 *   setup     … メンバー設定 Modal を開く
 *   channels  … 通知先チャンネル設定 Modal を開く
 *   list      … 現在の設定を表示
 *   test      … 送信せずに通知文をプレビュー（dryRun）
 *   help      … 使い方
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
  const triggerId = form.get("trigger_id") ?? "";
  const responseUrl = form.get("response_url") ?? "";

  try {
    switch (sub) {
      case "setup":
        return await handleSetup(triggerId);
      case "channels":
        return await handleChannels(triggerId);
      case "list":
        return await handleList();
      case "test":
        return await handleTest(args[1], responseUrl);
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

async function handleSetup(triggerId: string) {
  const result = await openView(remindEnv.botToken, triggerId, buildSetupView());
  if (!result.ok) return ephemeral(`Modalを開けませんでした: ${result.error}`);
  return new NextResponse(null, { status: 200 });
}

async function handleChannels(triggerId: string) {
  const store = getRemindStore();
  const targets = await store.listNotificationTargets();
  const result = await openView(
    remindEnv.botToken,
    triggerId,
    buildChannelsView(targets.map((t) => t.targetId)),
  );
  if (!result.ok) return ephemeral(`Modalを開けませんでした: ${result.error}`);
  return new NextResponse(null, { status: 200 });
}

async function handleList() {
  const store = getRemindStore();
  const [settings, targets] = await Promise.all([
    store.listSettings(),
    store.listNotificationTargets(),
  ]);

  const lines = ["*シフトリマインドの設定*", "", "*通知先チャンネル*"];
  lines.push(
    targets.length > 0
      ? targets.map((t) => `• <#${t.targetId}>`).join("\n")
      : `• 未設定（環境変数のフォールバック: ${remindEnv.fallbackChannelIds.join(", ") || "なし"}）`,
  );

  lines.push("", "*メンバー*");
  lines.push(
    settings.length > 0
      ? settings.map(formatSettingLine).join("\n")
      : "• Google Calendar 連携済みのメンバーがいません",
  );

  return ephemeral(lines.join("\n"));
}

function formatSettingLine(s: RemindSettings): string {
  const state = !s.connected
    ? ":no_entry: Google未連携"
    : s.calendarStatus === "revoked"
      ? ":warning: 連携切れ（再連携が必要）"
      : s.remindEnabled
        ? ":white_check_mark: 有効"
        : ":mute: 無効"; // 本人の希望で止めている状態
  const calendar = s.calendarId === "primary" ? "" : ` / カレンダー: ${s.calendarId}`;
  const name = s.displayName ? ` (${s.displayName})` : "";
  return `• <@${s.slackUserId}>${name} ${state}${calendar}`;
}

/**
 * dryRun でプレビューする。
 *
 * カレンダー取得に3秒以上かかるとSlackがタイムアウト表示を出すため、
 * 結果は response_url 経由の遅延応答で返す（遅延応答なら必ず届く）。
 */
async function handleTest(when: string | undefined, responseUrl: string) {
  const timing: RemindTiming = when === "morning" || when === "today" ? "morning" : "prev_night";
  const store = getRemindStore();
  const channelIds = await resolveChannelIds(store);
  const date = resolveTargetDate(timing, new Date());

  const result = await runRemind({
    store,
    botToken: remindEnv.botToken,
    timing,
    date,
    channelIds,
    adminChannelId: remindEnv.adminChannelId,
    changeChannelLabel: remindEnv.changeChannelLabel,
    dryRun: true,
  });

  const header =
    `*プレビュー（送信しません）* timing=${timing} / 対象日=${date}\n` +
    `連携メンバー ${result.memberCount}人 / 該当シフト ${result.shiftCount}件 / ` +
    `通知先 ${channelIds.length}チャンネル`;

  const body = result.message ?? "（対象日にシフトのあるメンバーがいないため、通知は送られません）";
  const notes = [...result.warnings, ...result.errors].map((w) => `• ${w}`).join("\n");

  const text = [header, "", body, notes ? `\n---\n${notes}` : ""].join("\n");

  if (responseUrl) {
    await respondEphemeral(responseUrl, text);
    return new NextResponse(null, { status: 200 });
  }
  return ephemeral(text);
}

function helpText(): string {
  return [
    "*シフトリマインドの使い方*",
    "`/shift-remind setup` … メンバーごとの有効/無効・対象カレンダーを設定",
    "`/shift-remind channels` … 通知先チャンネルを設定（Botの招待を忘れずに）",
    "`/shift-remind list` … 現在の設定を表示",
    "`/shift-remind test` … 明日分の通知文をプレビュー（送信しません）",
    "`/shift-remind test today` … 当日分の通知文をプレビュー",
    "",
    `通知は前日21:00（翌日分）と当日08:00（当日分）に自動送信されます。カレンダーのタイトルに「${SHIFT_TITLE_KEYWORD}」を含む予定が対象です。`,
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
