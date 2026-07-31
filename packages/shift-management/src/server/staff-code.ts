/**
 * 取込 UI / 名簿 UI(2-8b)向け: staffCode の形式判定(純関数)。
 *
 * staffCode = 大文字英字 1 + 数字 4 桁(例 A0187)。apps/web の即時バリデーションが
 * 依存する。fetch / crypto / googleapis 非依存の葉ファイルとして client 安全バレル
 * (src/ui.ts)経由で公開し、packages 側でテスト可能にする。
 */

/** staffCode の形式(大文字英字1 + 数字4桁)。 */
export const STAFF_CODE_PATTERN = /^[A-Z]\d{4}$/;

/** staffCode が所定の形式に一致するか。 */
export function isValidStaffCode(code: string): boolean {
  return STAFF_CODE_PATTERN.test(code);
}
