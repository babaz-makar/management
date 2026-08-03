import { SHIFT_EVENT_SUMMARY } from "../logic/calendar-plan";

/**
 * シフト予定かどうかをタイトルで判定する純関数。
 *
 * キーワードはシフト変更ツールが作成時に使う SHIFT_EVENT_SUMMARY と同じ定数を参照する。
 * （タイトルを1箇所で管理し、「作る側」と「読む側」がズレないようにする）
 */
export const SHIFT_TITLE_KEYWORD = SHIFT_EVENT_SUMMARY;

/**
 * 比較前の正規化。実運用では以下が必ず揺れるため、両辺に同じ正規化をかける。
 *   - 全角/半角（NFKC で寄せる）
 *   - 半角/全角スペースの有無
 *   - ハイフンの種類（- ‐ ‑ – — ー −）
 *   - 大文字/小文字（SHO-SAN / sho-san）
 */
export function normalizeTitle(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/[‐‑‒–—―ー−－­]/g, "-")
    .toUpperCase();
}

/** タイトルにシフトキーワードを含むか */
export function isShiftTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return normalizeTitle(title).includes(normalizeTitle(SHIFT_TITLE_KEYWORD));
}
