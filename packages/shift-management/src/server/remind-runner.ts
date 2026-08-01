import { formatRemindMessage, formatWarningMessage } from "../remind/format-message";
import type { RemindTiming, ShiftEntry } from "../remind/types";
import { getShiftsForMembers } from "./remind-calendar";
import { postMessage } from "./slack-remind";
import type { RemindStore } from "./remind-store";

export interface RunRemindOptions {
  store: RemindStore;
  /** SLACK_REMIND_BOT_TOKEN */
  botToken: string;
  timing: RemindTiming;
  /** 対象日 "YYYY-MM-DD"（JST）。cron ルートで resolveTargetDate から算出して渡す */
  date: string;
  /** 通知先チャンネルID */
  channelIds: string[];
  /** 警告・エラーを流す管理チャンネル。未設定なら console のみ */
  adminChannelId?: string;
  /** 「変更がある場合は〜まで」に出す表記（例 "<#C0123ABCD>"） */
  changeChannelLabel?: string;
  /** true なら送信も送信ログの記録も行わず、組み立てたメッセージだけ返す */
  dryRun?: boolean;
}

export interface RunRemindResult {
  timing: RemindTiming;
  date: string;
  memberCount: number;
  shiftCount: number;
  /** 実際に通知文へ載せた件数（送信済みを除いた分） */
  notifiedCount: number;
  sentChannels: string[];
  failedChannels: string[];
  /** 通知をスキップした理由。送信した場合は undefined */
  skippedReason?: string;
  warnings: string[];
  errors: string[];
  /** 組み立てたメッセージ（dryRun の確認用） */
  message: string | null;
}

/**
 * リマインド1回分の実行本体。
 *
 * 1. 通知対象メンバーを取得
 * 2. 各メンバーのカレンダーを並列取得（1人の失敗で全体を止めない）
 * 3. 送信済みログと照合して未送信分だけ予約
 * 4. Slackへ投稿
 * 5. 成功なら確定、失敗なら予約を解放して次回に回す
 */
export async function runRemind(opts: RunRemindOptions): Promise<RunRemindResult> {
  const { store, timing, date } = opts;
  const warnings: string[] = [];
  const errors: string[] = [];

  await store.init();

  const members = await store.listRemindMembers();
  const results = await getShiftsForMembers(members, date);

  const allShifts: ShiftEntry[] = [];
  for (const r of results) {
    allShifts.push(...r.shifts);
    warnings.push(...r.warnings);

    if (r.revoked) {
      await store.markCalendarStatus(r.slackUserId, "revoked");
      warnings.push(
        `<@${r.slackUserId}> の Google Calendar 連携が切れています。再連携をお願いしてください（以降のリマインドは停止します）`,
      );
    } else if (r.error) {
      errors.push(`<@${r.slackUserId}> のカレンダー取得に失敗: ${r.error}`);
    }
  }

  const base: RunRemindResult = {
    timing,
    date,
    memberCount: members.length,
    shiftCount: allShifts.length,
    notifiedCount: 0,
    sentChannels: [],
    failedChannels: [],
    warnings,
    errors,
    message: null,
  };

  if (opts.dryRun) {
    return {
      ...base,
      notifiedCount: allShifts.length,
      message: formatRemindMessage({
        timing,
        date,
        shifts: allShifts,
        changeChannelLabel: opts.changeChannelLabel,
      }),
      skippedReason: "dryRun",
    };
  }

  if (allShifts.length === 0) {
    // 「本日シフトなし」を毎日流すと通知が形骸化するため、対象0人なら黙る
    await reportToAdmin(opts, warnings, errors, date);
    return { ...base, skippedReason: "対象日にシフトのあるメンバーがいません" };
  }

  const claimed = await store.claimSends(allShifts, timing);
  if (claimed.length === 0) {
    await reportToAdmin(opts, warnings, errors, date);
    return { ...base, skippedReason: "すべて送信済み（二重送信を防止しました）" };
  }

  const message = formatRemindMessage({
    timing,
    date,
    shifts: claimed,
    changeChannelLabel: opts.changeChannelLabel,
  });

  if (!message || opts.channelIds.length === 0) {
    await store.releaseClaims(claimed, timing);
    errors.push("通知先チャンネルが設定されていません（/shift-remind channels で設定してください）");
    await reportToAdmin(opts, warnings, errors, date);
    return { ...base, notifiedCount: claimed.length, skippedReason: "通知先未設定" };
  }

  const sentChannels: string[] = [];
  const failedChannels: string[] = [];
  for (const channel of opts.channelIds) {
    const sent = await postMessage(opts.botToken, channel, message);
    if (sent.ok) sentChannels.push(channel);
    else {
      failedChannels.push(channel);
      errors.push(`チャンネル ${channel} への送信に失敗: ${sent.error}`);
    }
  }

  // 1つでも送れたら「送信済み」とする。全滅したときだけ予約を解放して次回に再送させる
  if (sentChannels.length > 0) {
    await store.markSent(claimed, timing);
  } else {
    await store.releaseClaims(claimed, timing);
  }

  await reportToAdmin(opts, warnings, errors, date);

  return {
    ...base,
    notifiedCount: claimed.length,
    sentChannels,
    failedChannels,
    message,
    skippedReason: sentChannels.length === 0 ? "全チャンネルへの送信に失敗" : undefined,
  };
}

async function reportToAdmin(
  opts: RunRemindOptions,
  warnings: string[],
  errors: string[],
  date: string,
): Promise<void> {
  const lines: string[] = [];
  const warn = formatWarningMessage(date, warnings);
  if (warn) lines.push(warn);
  if (errors.length > 0) {
    lines.push([":rotating_light: シフトリマインドでエラー", ...errors.map((e) => `• ${e}`)].join("\n"));
  }
  if (lines.length === 0) return;

  const text = lines.join("\n\n");
  if (!opts.adminChannelId) {
    console.warn("[shift-remind]", text);
    return;
  }
  await postMessage(opts.botToken, opts.adminChannelId, text);
}
