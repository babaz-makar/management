import { jstDate } from "../logic/jst";
import type { RemindTiming } from "./types";

/**
 * 通知タイミングから「どの日のシフトを通知するか」をJST基準で決める純関数。
 *
 *   prev_night（JST 21:00 に発火）→ 翌日分
 *   morning   （JST 08:00 に発火）→ 当日分
 *
 * Vercel の実行環境はUTCなので、ここで実行環境のローカル時刻に依存すると
 * JST 23時台や 8時台（= UTCでは前日）で1日ズレる。必ず jstDate() を通す。
 */
export function resolveTargetDate(timing: RemindTiming, now: Date): string {
  const todayJst = jstDate(now);
  return timing === "prev_night" ? addDays(todayJst, 1) : todayJst;
}

/** "YYYY-MM-DD" に日数を足す。UTCの正午起点で計算しDSTもTZも介在させない */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** "2026-08-02" → "8/2(日)"。通知文の見出しに使う */
export function formatDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return `${m}/${d}(${WEEKDAYS_JA[base.getUTCDay()]})`;
}

/** 対象日のJST 00:00 / 翌日00:00 を ISO 8601（+09:00表記）で返す。Calendar API の timeMin/timeMax 用 */
export function jstDayRange(date: string): { timeMin: string; timeMax: string } {
  return {
    timeMin: `${date}T00:00:00+09:00`,
    // 終了は翌日00:00未満。23:59:59 にすると 23:59〜 開始の予定を落とすため翌日00:00を上限にする
    timeMax: `${addDays(date, 1)}T00:00:00+09:00`,
  };
}
