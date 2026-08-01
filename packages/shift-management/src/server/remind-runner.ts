import {
  formatConnectRequest,
  formatRemindMessage,
  formatWarningMessage,
} from "../remind/format-message";
import type { RemindMember, RemindTiming, ShiftEntry } from "../remind/types";
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
  /** 対象チャンネルを絞る（プレビュー用）。省略時は登録済みの通知先すべて */
  channelIds?: string[];
  /** 警告・エラーを流す管理チャンネル。未設定なら console のみ */
  adminChannelId?: string;
  /** 「変更がある場合は〜まで」に出す表記（例 "<#C0123ABCD>"） */
  changeChannelLabel?: string;
  /** カレンダー連携リンクの生成に使う本番URL。未設定なら連携依頼を送らない */
  appUrl?: string;
  /** true なら送信も送信ログの記録も行わず、組み立てたメッセージだけ返す */
  dryRun?: boolean;
}

/** チャンネル1つ分の実行結果 */
export interface ChannelRunResult {
  channelId: string;
  /** 登録済みの対象メンバー数（未連携・停止中を含む） */
  memberCount: number;
  /** 実際にカレンダーを読めたメンバー数 */
  activeCount: number;
  shiftCount: number;
  /** 通知文に載せた件数（送信済みを除いた分） */
  notifiedCount: number;
  sent: boolean;
  skippedReason?: string;
  message: string | null;
  /** Google未連携のメンバー */
  unconnected: string[];
  /** 連携依頼を投稿したか */
  connectRequestSent: boolean;
}

export interface RunRemindResult {
  timing: RemindTiming;
  date: string;
  channels: ChannelRunResult[];
  warnings: string[];
  errors: string[];
}

/**
 * リマインド1回分の実行本体。
 *
 * 1. 登録済みの通知先チャンネルを列挙
 * 2. 全チャンネルの対象メンバーを重複排除してカレンダーを並列取得
 *    （同じ人が複数チャンネルに登録されていてもAPI呼び出しは1回）
 * 3. チャンネルごとに送信済みログと照合して未送信分だけ予約
 * 4. Slackへ投稿。成功なら確定、失敗なら予約を解放して次回に回す
 * 5. 未連携メンバーがいれば（前日夜のみ）カレンダー連携をお願いする
 */
export async function runRemind(opts: RunRemindOptions): Promise<RunRemindResult> {
  const { store, timing, date } = opts;
  const warnings: string[] = [];
  const errors: string[] = [];

  await store.init();

  const channelIds =
    opts.channelIds ??
    (await store.listNotificationTargets()).map((t) => t.channelId);

  if (channelIds.length === 0) {
    errors.push(
      "通知先チャンネルがありません。Bot をチャンネルに招待すると自動で登録されます。",
    );
    await reportToAdmin(opts, warnings, errors, date);
    return { timing, date, channels: [], warnings, errors };
  }

  // --- チャンネルごとのメンバーを集め、カレンダー取得は人単位で1回だけにする ---
  const perChannel = await Promise.all(
    channelIds.map(async (channelId) => ({
      channelId,
      all: await store.listChannelMembers(channelId),
      active: await store.listChannelRemindMembers(channelId),
    })),
  );

  const uniqueMembers = new Map<string, RemindMember>();
  for (const c of perChannel) {
    for (const m of c.active) {
      if (!uniqueMembers.has(m.slackUserId)) uniqueMembers.set(m.slackUserId, m);
    }
  }

  const results = await getShiftsForMembers([...uniqueMembers.values()], date);

  const shiftsByUser = new Map<string, ShiftEntry[]>();
  for (const r of results) {
    shiftsByUser.set(r.slackUserId, r.shifts);
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

  // --- チャンネルごとに投稿 ---
  const channels: ChannelRunResult[] = [];
  for (const c of perChannel) {
    channels.push(
      await runForChannel(opts, c.channelId, c.all, c.active, shiftsByUser, errors),
    );
  }

  await reportToAdmin(opts, warnings, errors, date);

  return { timing, date, channels, warnings, errors };
}

async function runForChannel(
  opts: RunRemindOptions,
  channelId: string,
  allMembers: { slackUserId: string; connected: boolean }[],
  activeMembers: RemindMember[],
  shiftsByUser: Map<string, ShiftEntry[]>,
  errors: string[],
): Promise<ChannelRunResult> {
  const { store, timing, date } = opts;

  const unconnected = allMembers.filter((m) => !m.connected).map((m) => m.slackUserId);
  const shifts = activeMembers.flatMap((m) => shiftsByUser.get(m.slackUserId) ?? []);

  const base: ChannelRunResult = {
    channelId,
    memberCount: allMembers.length,
    activeCount: activeMembers.length,
    shiftCount: shifts.length,
    notifiedCount: 0,
    sent: false,
    message: null,
    unconnected,
    connectRequestSent: false,
  };

  if (opts.dryRun) {
    return {
      ...base,
      notifiedCount: shifts.length,
      message: formatRemindMessage({
        timing,
        date,
        shifts,
        changeChannelLabel: opts.changeChannelLabel,
      }),
      skippedReason: "dryRun",
    };
  }

  // 未連携メンバーへの連携依頼。1日2回だと煩いので前日夜だけ出す
  const connectRequestSent = await requestConnect(opts, channelId, unconnected);

  if (allMembers.length === 0) {
    return {
      ...base,
      connectRequestSent,
      skippedReason: "対象メンバーが未設定（/shift-remind setup で選んでください）",
    };
  }

  if (shifts.length === 0) {
    // 「本日シフトなし」を毎日流すと通知が形骸化するため、対象0人なら黙る
    return { ...base, connectRequestSent, skippedReason: "対象日にシフトのあるメンバーがいません" };
  }

  const claimed = await store.claimSends(channelId, shifts, timing);
  if (claimed.length === 0) {
    return {
      ...base,
      connectRequestSent,
      skippedReason: "すべて送信済み（二重送信を防止しました）",
    };
  }

  const message = formatRemindMessage({
    timing,
    date,
    shifts: claimed,
    changeChannelLabel: opts.changeChannelLabel,
  });
  if (!message) {
    await store.releaseClaims(channelId, claimed, timing);
    return { ...base, connectRequestSent, skippedReason: "通知文が空でした" };
  }

  const sent = await postMessage(opts.botToken, channelId, message);
  if (sent.ok) {
    await store.markSent(channelId, claimed, timing);
  } else {
    // 送れなかった予約は解放し、次回の実行で再送させる
    await store.releaseClaims(channelId, claimed, timing);
    errors.push(`<#${channelId}> への送信に失敗: ${sent.error}`);
  }

  return {
    ...base,
    notifiedCount: claimed.length,
    sent: sent.ok,
    message,
    connectRequestSent,
    skippedReason: sent.ok ? undefined : "送信に失敗",
  };
}

/** 未連携メンバーにカレンダー連携をお願いする（前日夜のみ） */
async function requestConnect(
  opts: RunRemindOptions,
  channelId: string,
  unconnected: string[],
): Promise<boolean> {
  if (opts.timing !== "prev_night") return false;
  if (!opts.appUrl || unconnected.length === 0) return false;

  const text = formatConnectRequest(unconnected, opts.appUrl);
  if (!text) return false;

  const result = await postMessage(opts.botToken, channelId, text);
  return result.ok;
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
