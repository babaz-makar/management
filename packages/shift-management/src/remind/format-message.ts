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
