/**
 * Slack報告文・xlsxセルの表記揺れをパース前に吸収する純関数。
 * 全角数字・全角コロン・全角スラッシュ・全角スペースを半角へ寄せる。
 *
 * 入口で `String(input ?? "")` に正規化し、xlsxライブラリが number/Date で返す
 * 非文字列セルでもクラッシュ(`text.replace is not a function`)しないよう防御する。
 * 文字列入力に対する挙動は不変。
 */
export function normalizeText(input: unknown): string {
  const text = String(input ?? "");
  return text
    .replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/：/g, ":")
    .replace(/／/g, "/")
    .replace(/　/g, " ")
    .replace(/～/g, "~");
}

/**
 * 時刻文字列を "HH:MM"(時・分ともゼロ埋め)へ正規化する純関数。
 * 全角除去済み(normalizeText 済み)を前提とし、":" 区切り2要素のときだけ整形する。
 * 例: "9:00"->"09:00" / "10:00"->"10:00" / "0:00"->"00:00" / "9:5"->"09:05"。
 * 2要素でない入力(空文字・"休"など)はそのまま返す。
 */
export function normalizeTime(s: string): string {
  const parts = s.split(":");
  if (parts.length !== 2) return s;
  const [hour, minute] = parts;
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}
