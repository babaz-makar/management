/** 曜日ラベル（月曜はじまり） */
export const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;

/** Date → "YYYY-MM-DD"（ローカルタイムゾーン基準） */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** その日を含む週の月曜日を返す */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=日
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

/** 月曜はじまりの1週間分の Date を返す */
export function getWeekDates(base: Date): Date[] {
  const monday = startOfWeek(base);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "7/6" のような月/日表示 */
export function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** "2026年7月6日〜7月12日" のような週範囲表示 */
export function formatWeekRange(dates: Date[]): string {
  const first = dates[0];
  const last = dates[dates.length - 1];
  return `${first.getFullYear()}年${formatMonthDay(first).replace("/", "月")}日〜${formatMonthDay(last).replace("/", "月")}日`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

/** 土日かどうか（列の色分け用） */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}
