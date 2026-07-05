/**
 * 年なしの「月/日」を報告日時基準でISO日付（YYYY-MM-DD）へ補完する純関数。
 * 報告月より2ヶ月以上前の月は翌年のシフトと判定する（例: 12月に「1/5」→翌年1/5）。
 */
export function completeDate(
  month: number,
  day: number,
  baseDate: Date,
): string {
  const baseMonth = baseDate.getMonth() + 1;
  const year =
    baseDate.getFullYear() + (baseMonth - month >= 2 ? 1 : 0);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}
