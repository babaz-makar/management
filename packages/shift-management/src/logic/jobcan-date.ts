/**
 * 締め日ベースの月/日を対象年月(header)基準でISO日付(YYYY-MM-DD)へ補完する純関数。
 * 行の月が対象月より大きい場合は前年のシフトと判定する
 * (例: 対象1月のシートに現れる「12/20」→前年12/20)。
 */
export function completeJobcanDate(
  month: number,
  day: number,
  headerYear: number,
  headerMonth: number,
): string {
  const year = headerYear - (month > headerMonth ? 1 : 0);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}
