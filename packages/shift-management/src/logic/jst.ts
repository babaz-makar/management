/**
 * JST（Asia/Tokyo, UTC+9・DSTなし）基準の日付・時刻ユーティリティ。
 *
 * 実行環境のタイムゾーンに依存しないよう、UTCへ +9時間したうえで
 * `getUTC*` を読む方式で統一する（Vercel等のUTC環境でも同じ結果になる）。
 */

/** JSTのオフセット（ミリ秒） */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 任意の時点を「JSTの壁時計」として読むための Date（getUTC* で読む前提） */
function asJstClock(instant: Date): Date {
  return new Date(instant.getTime() + JST_OFFSET_MS);
}

/** JSTの "YYYY-MM-DD" */
export function jstDate(instant: Date): string {
  const d = asJstClock(instant);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** JSTの "HH:MM" */
export function jstTime(instant: Date): string {
  const d = asJstClock(instant);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** JSTの「年」と「月(1-12)」。年跨ぎ判定に使う */
export function jstYearMonth(instant: Date): { year: number; month: number } {
  const d = asJstClock(instant);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * Google Calendar の ISO 8601 dateTime（例 "2026-06-30T16:00:00+09:00"）を
 * JSTの日付・時刻へ正規化する。
 */
export function parseIsoToJst(iso: string): { date: string; time: string } {
  const instant = new Date(iso);
  return { date: jstDate(instant), time: jstTime(instant) };
}
