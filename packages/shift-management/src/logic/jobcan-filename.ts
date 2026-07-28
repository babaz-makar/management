import { normalizeText } from "./normalize";

/**
 * スタッフコード書式。英字1文字+数字ちょうど4桁（jobcan-sheet.ts と同一規約）。
 * ファイル名括弧内の文字列がこの書式に合致する場合のみ staffCodeInName に載せる。
 * 合致しない/括弧が無い場合は undefined（突合＝別人ひも付けの最終判断は上位の責務）。
 */
const STAFF_CODE_RE = /^[A-Za-z]\d{4}$/;

/**
 * ファイル名中の対象年月。"2026年08月度" / "2026年8月度" の双方を許容。
 * normalizeText 後に評価するので全角数字・全角空白も半角へ寄った状態で判定する。
 */
const YEAR_MONTH_RE = /(\d{4})\s*年\s*(\d{1,2})\s*月/;

/** 半角/全角どちらの括弧にも囲まれた中身を全て拾う(g フラグで走査) */
const PAREN_RE = /[（(]([^）)]*)[）)]/g;

/**
 * ジョブカン出力ファイル名から対象年月とスタッフコードを取り出す純関数。
 *
 * 例: "馬場優蔵(A0187) 2026年08月度.xlsx" → { year: 2026, month: 8, staffCodeInName: "A0187" }
 *
 * - 年月は "YYYY年M月"（ゼロ埋め・非ゼロ埋め両対応）。全角括弧（）・全角空白も許容。
 * - 括弧内文字列は STAFF_CODE_RE に合致する時だけ staffCodeInName に載せる。
 *   合致しない/括弧なしなら staffCodeInName は undefined（ここでは throw しない）。
 * - 年月が取れない、または月が 1-12 の範囲外なら throw（fail-loud、既定値を推測しない）。
 */
export function parseJobcanFileName(fileName: string): {
  year: number;
  month: number;
  staffCodeInName?: string;
} {
  const normalized = normalizeText(fileName);

  const ym = normalized.match(YEAR_MONTH_RE);
  if (!ym) {
    throw new Error(
      "ファイル名から対象年月を特定できません(YYYY年M月 が見つからない。推測して既定値は入れない)",
    );
  }
  const year = Number(ym[1]);
  const month = Number(ym[2]);
  if (month < 1 || month > 12) {
    throw new Error(
      `ファイル名の月が範囲外です(${month})。対象年月を確定できないため取込を中止します`,
    );
  }

  // 全ての括弧を走査し、STAFF_CODE_RE に合致する最初の中身を採る。
  // "田中(株)(A0187)" のように前段に会社名等の括弧があっても取りこぼさない。
  let staffCodeInName: string | undefined;
  for (const m of normalized.matchAll(PAREN_RE)) {
    const candidate = m[1].trim();
    if (STAFF_CODE_RE.test(candidate)) {
      staffCodeInName = candidate;
      break;
    }
  }

  return { year, month, staffCodeInName };
}
