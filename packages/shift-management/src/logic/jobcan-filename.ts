import { normalizeText } from "./normalize";

/**
 * スタッフコード書式。大文字英字1文字+数字ちょうど4桁（jobcan-sheet.ts / staff-directory.ts と同一規約）。
 * ジョブカン由来コードは常に大文字始まりのため小文字は書式外扱い（自動で大文字化しない）。
 * ファイル名括弧内の文字列がこの書式に合致する場合のみ staffCodeInName に載せる。
 * 合致しない（小文字・桁数違い等）/括弧が無い場合は undefined として不採用にし、
 * 誤った別人ひも付けを誘発しない（突合＝別人ひも付けの最終判断は上位の責務）。
 */
const STAFF_CODE_RE = /^[A-Z]\d{4}$/;

/**
 * staffCode「様」書式(大小英字1文字+数字4桁)。大文字/小文字を問わずコード形状に合致するか。
 * STAFF_CODE_RE(大文字のみ許可)に合致しないのにこの形状には合致する = 小文字混入等の
 * 「壊れた staffCode」。手動改名の異常兆候なので undefined で握りつぶさず取り違え検知に回す。
 * A1(桁不足)・1234(英字なし)・Z99999(桁超過)等は形状に非該当=正当な省略として扱う。
 *
 * 前提: 実 jobcan のファイル名は括弧内が大文字 staffCode 1個のみ。この形状(小文字英字1+数字4桁)
 * に該当し大文字版に非該当なものは取り違え兆候として throw する。よって運用者が "(v2024)" 等の
 * 付随的な小文字英字1+数字4桁トークンを付けると、それらも取り違え兆候として隔離される
 * (=可用性トレードオフ。取り違えによるデータ汚染を避ける安全優先の判断)。
 */
const STAFF_CODE_SHAPE_RE = /^[A-Za-z]\d{4}$/;

/**
 * ファイル名中の対象年月。"2026年08月度" / "2026年8月度" の双方を許容。
 * normalizeText 後に評価するので全角数字・全角空白も半角へ寄った状態で判定する。
 * g フラグで全候補を走査し、相異なる年月が複数あれば fail-loud で弾く
 * （前置の別年月に黙って化けるのを防ぐ）。
 */
const YEAR_MONTH_RE = /(\d{4})\s*年\s*(\d{1,2})\s*月/g;

/** 半角/全角どちらの括弧にも囲まれた中身を全て拾う(g フラグで走査) */
const PAREN_RE = /[（(]([^）)]*)[）)]/g;

/**
 * ジョブカン出力ファイル名から対象年月とスタッフコードを取り出す純関数。
 *
 * 例: "馬場優蔵(A0187) 2026年08月度.xlsx" → { year: 2026, month: 8, staffCodeInName: "A0187" }
 *
 * - 年月は "YYYY年M月"（ゼロ埋め・非ゼロ埋め両対応）。全角括弧（）・全角空白も許容。
 * - 括弧内トークンを3分類: 大文字 staffCode は採用、staffCode様だが書式外(小文字混入等)は
 *   取り違え兆候として throw、staffCode様ですらない(会社名・桁数違い)/括弧なしは undefined。
 * - 年月が取れない、または月が 1-12 の範囲外なら throw（fail-loud、既定値を推測しない）。
 */
export function parseJobcanFileName(fileName: string): {
  year: number;
  month: number;
  staffCodeInName?: string;
} {
  const normalized = normalizeText(fileName);

  // 全ての "YYYY年M月" を走査。相異なる年月が混在すれば曖昧なので fail-loud。
  const seen = new Map<string, { year: number; month: number }>();
  for (const m of normalized.matchAll(YEAR_MONTH_RE)) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    seen.set(`${year}-${month}`, { year, month });
  }
  if (seen.size === 0) {
    throw new Error(
      "ファイル名から対象年月を特定できません(YYYY年M月 が見つからない。推測して既定値は入れない)",
    );
  }
  if (seen.size > 1) {
    const candidates = [...seen.values()]
      .map((c) => `${c.year}年${c.month}月`)
      .join(", ");
    throw new Error(
      `ファイル名に相異なる年月が複数あり対象年月を確定できません(候補: ${candidates})。取り違え防止のため取込を中止します`,
    );
  }
  const { year, month } = [...seen.values()][0];
  if (month < 1 || month > 12) {
    throw new Error(
      `ファイル名の月が範囲外です(${month})。対象年月を確定できないため取込を中止します`,
    );
  }

  return { year, month, staffCodeInName: extractStaffCodeInName(normalized) };
}

/**
 * 正規化済みファイル名から括弧内 staffCode を取り出す。括弧内トークンを3分類する:
 *  1. 正規の大文字 staffCode(STAFF_CODE_RE) → 採用(最初の1件)。
 *  2. staffCode様だが大文字書式に合わない(小文字混入等) → 取り違え兆候として throw。
 *  3. staffCode様ですらない(会社名・部門・桁数違い等) → 正当な省略として無視。
 * 3を先に除外(どちらの正規表現にも非該当)するので、2の判定に到達した時点で「壊れたコード」確定。
 * "田中(株)(A0187)" のように前段の括弧があっても取りこぼさない: 正規コードは採用しつつ
 * continue で走査を継続し、"田中(株)(b0999)" のように小文字混入トークンへ到達した時点で
 * 即 throw する(壊れたコードを見つけた瞬間に取込を止め、後続の括弧は評価しない)。
 */
function extractStaffCodeInName(normalized: string): string | undefined {
  let staffCodeInName: string | undefined;
  for (const m of normalized.matchAll(PAREN_RE)) {
    const candidate = m[1].trim();
    if (STAFF_CODE_RE.test(candidate)) {
      if (staffCodeInName === undefined) staffCodeInName = candidate;
      continue; // 走査は続行(後段に壊れたコードが無いか最後まで確認する)
    }
    // 既知の穴: 全角英字/ゼロ幅/制御文字混入コードは normalizeText 未通過のため throw を回避しうる(既存 defense-in-depth の穴・本変更の回帰ではない。ハードニング=全角半角化+制御文字除去はバックログ)。
    if (STAFF_CODE_SHAPE_RE.test(candidate)) {
      throw new Error(
        `ファイル名の括弧内(${candidate})が staffCode 書式(大文字1文字+数字4桁)に合致しません。` +
          "手動改名等でコードが壊れたファイル取り違えの兆候のため、取込を中止します",
      );
    }
  }
  return staffCodeInName;
}
