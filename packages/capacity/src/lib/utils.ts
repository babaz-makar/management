// 元HTML版の Utils 群をそのまま移植（純粋関数）。
import type { AllData, MonthData, MemberData } from "../types";

/** 文字列/数値を float に。数値化できなければ null */
export const sf = (v: unknown): number | null => {
  const f = parseFloat(v as string);
  return isNaN(f) ? null : f;
};

/** 充足率(%)。上限100でクリップ */
export const pct = (a: number | null | undefined, r: number | null | undefined): number =>
  r ? Math.min(Math.round(((a || 0) / r) * 100), 100) : 0;

/** 小数 d 桁に丸め */
export const rnd = (v: number, d = 1): number => Math.round(v * 10 ** d) / 10 ** d;

/** ヒートマップのセル色（充足率別） */
export function heatColor(rate: number): { bg: string; txt: string } {
  if (rate >= 100) return { bg: "rgba(240,80,110,.20)", txt: "#e23e63" };
  if (rate >= 90) return { bg: "rgba(16,185,129,.20)", txt: "#0e9f6e" };
  if (rate >= 70) return { bg: "rgba(16,185,129,.12)", txt: "#10b981" };
  if (rate >= 50) return { bg: "rgba(245,158,11,.22)", txt: "#d97f0b" };
  return { bg: "rgba(240,80,110,.14)", txt: "#e23e63" };
}

/** バーの色（充足率別） */
export function barCol(rate: number): string {
  if (rate > 100) return "#f0506e";
  if (rate >= 90) return "#10b981";
  if (rate >= 60) return "#f59e0b";
  return "#f0506e";
}

/** 差分の符号に応じた CSS クラス名 */
export function diffCls(d: number): "red" | "amber" | "muted" {
  return d > 0 ? "red" : d < 0 ? "amber" : "muted";
}

/** 全メンバーに存在する月キーの集合 */
export function allMonthKeys(allData: AllData): string[] {
  const s = new Set<string>();
  Object.values(allData).forEach((md) => Object.keys(md).forEach((k) => s.add(k)));
  return Array.from(s);
}

/** 全メンバー・全月に登場する項目名の集合 */
export function allItemNames(allData: AllData): string[] {
  const s = new Set<string>();
  Object.values(allData).forEach((md) =>
    Object.values(md).forEach((d) => (d.items || []).forEach((it) => s.add(it.name)))
  );
  return Array.from(s);
}

/** そのメンバーの最新月エントリ [monthKey, data] */
export function latestEntry(allData: AllData, name: string): [string | null, MonthData | null] {
  const d: MemberData | undefined = allData[name];
  if (!d) return [null, null];
  const keys = Object.keys(d);
  const k = keys[keys.length - 1];
  return [k, d[k]];
}

/** 担当社数合計（スタンダード/アドバンス/ライト） */
export function clientCount(d: MonthData): number {
  const c = d.clients || {};
  return (c["スタンダード"] || 0) + (c["アドバンス"] || 0) + (c["ライト"] || 0);
}

/** 指定項目の実績時間 */
export function itemHours(d: MonthData | null | undefined, name: string): number {
  return (d?.items || []).find((x) => x.name === name)?.actual || 0;
}

/** __latest__ を実際の月キーに解決 */
export function resolveMonth(allData: AllData, sel: string): string {
  const months = allMonthKeys(allData);
  return sel === "__latest__" ? months[months.length - 1] : sel;
}

/** メンバー/月を選んで項目を合算（ギャップ分析用） */
export function aggItems(
  allData: AllData,
  memberSel: string,
  monthSel: string
): Record<string, { actual: number; rec: number }> {
  const members = memberSel === "__all__" ? Object.keys(allData) : [memberSel];
  const tm = resolveMonth(allData, monthSel);
  const map: Record<string, { actual: number; rec: number }> = {};
  members.forEach((m) => {
    const d = allData[m]?.[tm];
    if (!d) return;
    (d.items || []).forEach((it) => {
      if (!map[it.name]) map[it.name] = { actual: 0, rec: 0 };
      map[it.name].actual += it.actual || 0;
      map[it.name].rec += it.rec || 0;
    });
  });
  return map;
}
