/**
 * Slack報告文の表記揺れをパース前に吸収する純関数。
 * 全角数字・全角コロン・全角スラッシュ・全角スペースを半角へ寄せる。
 */
export function normalizeText(text: string): string {
  return text
    .replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/：/g, ":")
    .replace(/／/g, "/")
    .replace(/　/g, " ");
}
