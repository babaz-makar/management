import { NextRequest, NextResponse } from "next/server";
import {
  resolveTargetDate,
  runRemind,
  nowJstLabel,
  type RemindTiming,
} from "@management/shift-management";
import { getRemindStore, remindEnv } from "@/lib/remind-config";

// googleapis を使うので Edge ではなく Node ランタイムで動かす
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// メンバーが増えると Calendar API の呼び出しが増えるため上限を伸ばす（Hobbyは60秒まで）
export const maxDuration = 60;

/**
 * シフトリマインドの cron エンドポイント。
 *
 * Vercel Cron から呼ばれる。**schedule はUTC固定**でタイムゾーン指定機能が無いため、
 * vercel.json の値とJSTでの意図の対応をここに残す（JSONにコメントは書けない）。
 * 日本にDSTは無いので JST = UTC+9 は年間固定。
 *
 *   timing=prev_night … vercel.json "0 12 * * *" = JST 21:00 → 翌日分を通知
 *   timing=morning    … vercel.json "0 23 * * *" = JST 08:00 → 当日分を通知
 *                       （UTCでは前日23:00に発火する。デプロイ後に必ずログで確認する）
 *
 * 手動確認用のクエリ:
 *   ?date=2026-08-02  対象日を固定する
 *   ?dryRun=1         送信もログ記録もせず、組み立てたメッセージだけ返す
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!remindEnv.cronSecret) {
    // 設定漏れの切り分け用。CRON_SECRET が無い＝そもそも自動送信が動かない状態でしか
    // 返らないので、値は一切出さず「設定されているか」だけを返す
    return NextResponse.json(
      {
        error: "CRON_SECRET が未設定です",
        configured: {
          CRON_SECRET: false,
          SLACK_REMIND_BOT_TOKEN: Boolean(remindEnv.botToken),
          SLACK_REMIND_SIGNING_SECRET: Boolean(remindEnv.signingSecret),
          DATABASE_URL: Boolean(remindEnv.databaseUrl),
          APP_URL: Boolean(remindEnv.appUrl),
        },
        // 変数名のtypo（全角・余分な空白等）を切り分けるため、名前だけ晒す
        cronVarNames: Object.keys(process.env).filter((k) => /CRON/i.test(k)),
        hint: "Vercelの環境変数に値が入っているか（空文字でないか）を確認し、再デプロイしてください",
      },
      { status: 500 },
    );
  }
  if (auth !== `Bearer ${remindEnv.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const timingParam = req.nextUrl.searchParams.get("timing");
  if (timingParam !== "prev_night" && timingParam !== "morning") {
    return NextResponse.json(
      { error: "timing は prev_night か morning を指定してください" },
      { status: 400 },
    );
  }
  const timing: RemindTiming = timingParam;

  // 実行環境はUTC。対象日は必ずJST基準で算出する（JST 8時台/23時台で1日ズレるのを防ぐ）
  const dateOverride = req.nextUrl.searchParams.get("date");
  const date = dateOverride ?? resolveTargetDate(timing, new Date());
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  if (!remindEnv.botToken) {
    return NextResponse.json(
      { error: "SLACK_REMIND_BOT_TOKEN が未設定です" },
      { status: 500 },
    );
  }

  try {
    const result = await runRemind({
      store: getRemindStore(),
      botToken: remindEnv.botToken,
      timing,
      date,
      adminChannelId: remindEnv.adminChannelId,
      changeChannelLabel: remindEnv.changeChannelLabel,
      appUrl: remindEnv.appUrl,
      dryRun,
    });

    // 発火時刻がJSTで意図どおりか（0 23 * * * が翌朝8時か）をログで追えるようにする
    console.log(
      `[shift-remind] ${nowJstLabel()} timing=${timing} date=${date} ` +
        `channels=${result.channels.length} ` +
        `sent=${result.channels.filter((c) => c.sent).length} ` +
        result.channels
          .map(
            (c) =>
              `[${c.channelId} members=${c.memberCount} shifts=${c.shiftCount} ` +
              `notified=${c.notifiedCount} skipped=${c.skippedReason ?? "-"}]`,
          )
          .join(" "),
    );

    return NextResponse.json({ ok: true, executedAt: nowJstLabel(), ...result });
  } catch (err) {
    console.error("[shift-remind] cron error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
