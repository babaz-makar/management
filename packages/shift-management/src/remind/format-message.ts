import { formatDateLabel } from "./target-date";
import type { RemindTiming, ShiftEntry } from "./types";

export interface FormatRemindOptions {
  timing: RemindTiming;
  /** "YYYY-MM-DD"（JST） */
  date: string;
  /** 通知対象のシフト。順序は問わない（この関数が開始時刻順に並べ替える） */
  shifts: ShiftEntry[];
  /**
   * 「変更がある場合は〜まで」の案内に出すチャンネル。
   * 例 "#シフト変更" や "<#C0123ABCD>"。未指定なら案内行を出さない。
   */
  changeChannelLabel?: string;
}

/**
 * Slackへ投稿する通知文を組み立てる純関数。
 *
 * 対象が0人のときは null を返す（呼び出し側で投稿をスキップする）。
 * 「本日シフトなし」を毎日流すと通知が形骸化するため、既定では黙る方針。
 */
export function formatRemindMessage(opts: FormatRemindOptions): string | null {
  if (opts.shifts.length === 0) return null;

  const icon = opts.timing === "prev_night" ? ":calendar:" : ":sunny:";
  const when = opts.timing === "prev_night" ? "明日" : "本日";
  const lines = [`${icon} ${when} ${formatDateLabel(opts.date)} のシフト`, ""];

  for (const s of sortByStart(opts.shifts)) {
    lines.push(`<@${s.slackUserId}> ${formatRange(s)}`);
  }

  if (opts.changeChannelLabel) {
    lines.push("", `変更がある場合は ${opts.changeChannelLabel} まで`);
  }

  return lines.join("\n");
}

/** 日跨ぎシフトは終了時刻に「翌」を付けて 22:00 - 翌6:00 と表示する */
export function formatRange(s: ShiftEntry): string {
  const end = s.crossesMidnight ? `翌${stripLeadingZero(s.endTime)}` : s.endTime;
  return `${s.startTime} - ${end}`;
}

function stripLeadingZero(time: string): string {
  return time.replace(/^0/, "");
}

function sortByStart(shifts: ShiftEntry[]): ShiftEntry[] {
  return [...shifts].sort(
    (a, b) => a.startTime.localeCompare(b.startTime)
      || a.slackUserId.localeCompare(b.slackUserId),
  );
}

/**
 * Google Calendar 未連携の本人へ送るDMの本文。
 *
 * **チャンネルに公開投稿しない。** 連携URLは末尾の slack_user_id で
 * 「誰のカレンダーとして保存するか」が決まるため、公開すると他人のリンクを
 * 開いてしまい、Googleアカウントが別人のSlack IDに紐づく事故が起きる。
 * その間違いはエラーにならず、シフトがずれて通知されるまで気づけない。
 *
 * 連携リンクは既存のシフト変更ツールの OAuth 開始URLをそのまま使う
 * （トークンの保存先が同じなので、どちらから連携しても両方の機能が動く）。
 */
export function formatConnectDm(slackUserId: string, appUrl: string): string {
  return [
    ":wave: シフトリマインドの対象に登録されています。",
    "Googleカレンダーを連携すると、シフトの前日夜と当日朝にSlackで通知が届きます。",
    "",
    `:link: ${connectUrl(appUrl, slackUserId)}`,
    "",
    "_このリンクはあなた専用です。他の人には共有しないでください。_",
  ].join("\n");
}

/**
 * DM送信の結果をチャンネルに知らせる文（リンクは載せない）。
 * 送る相手がいなければ null。
 */
export function formatConnectNotice(
  dmSent: string[],
  dmFailed: string[],
): string | null {
  if (dmSent.length === 0 && dmFailed.length === 0) return null;

  const lines: string[] = [];
  if (dmSent.length > 0) {
    lines.push(
      `:incoming_envelope: カレンダー未連携の ${dmSent.map((id) => `<@${id}>`).join(" ")} にDMで連携リンクを送りました。`,
    );
  }
  if (dmFailed.length > 0) {
    lines.push(
      `:warning: ${dmFailed.map((id) => `<@${id}>`).join(" ")} へのDM送信に失敗しました（Botの \`im:write\` スコープを確認してください）。`,
    );
  }
  return lines.join("\n");
}

/** 対象メンバーに追加したときの確認文。連携リンクはDMで別送するのでここには載せない */
export function formatMemberAdded(
  slackUserIds: string[],
  dmSent: string[],
  dmFailed: string[],
): string {
  const added = slackUserIds.map((id) => `<@${id}>`).join(" ");
  const lines = [`:white_check_mark: ${added} をシフトリマインドの対象に追加しました。`];

  const notice = formatConnectNotice(dmSent, dmFailed);
  if (notice) lines.push("", notice);

  return lines.join("\n");
}

/** OAuth 開始URL（親元ツールのルート） */
export function connectUrl(appUrl: string, slackUserId: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/auth/google?slack_user_id=${slackUserId}`;
}

/** 管理チャンネルへ流す警告のまとめ。警告が無ければ null */
export function formatWarningMessage(
  date: string,
  warnings: string[],
): string | null {
  if (warnings.length === 0) return null;
  return [
    `:warning: シフトリマインド（${formatDateLabel(date)}）で注意が必要です`,
    ...warnings.map((w) => `• ${w}`),
  ].join("\n");
}
