import { completeJobcanDate } from "../logic/jobcan-date";
import { normalizeText, normalizeTime } from "../logic/normalize";
import type { ShiftEntry } from "../types";

/** parseJobcanSheet への入力。xlsx を行×列で文字列化して渡す */
export interface JobcanSheetInput {
  /** xlsxを行×列で文字列化。空セル="", 時刻は "H:MM"/"HH:MM" */
  rows: string[][];
  /** identity(氏名)のフォールバック */
  sheetName?: string;
  /** 省略時 rows から "YYYY年M月" を読む */
  targetMonth?: { year: number; month: number };
}

/** 抽出したスタッフ同定情報 */
interface Identity {
  staffCode: string;
  staffName: string;
  affiliation?: string;
}

/** シートの列位置(0始まり) */
const COL = { date: 0, shiftStart: 5, shiftEnd: 6 } as const;

/** identity 抽出の走査範囲(先頭N行) */
const IDENTITY_SCAN_ROWS = 12;
/** データ開始行のフォールバック位置 */
const DATA_START_FALLBACK = 9;

const MONTH_HEADER_RE = /(\d{4})年\s*(\d{1,2})月/;
const STAFF_CODE_RE = /^[A-Za-z]\d+$/;
const DATE_CELL_RE = /^\s*(\d{1,2})\/(\d{1,2})/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** 対象年月を決定する。targetMonth 優先、無ければ header から読む。取れなければ throw */
function resolveTargetMonth(
  input: JobcanSheetInput,
): { year: number; month: number } {
  if (input.targetMonth) return input.targetMonth;
  for (const row of input.rows.slice(0, IDENTITY_SCAN_ROWS)) {
    for (const cell of row) {
      const m = normalizeText(cell ?? "").match(MONTH_HEADER_RE);
      if (m) return { year: Number(m[1]), month: Number(m[2]) };
    }
  }
  throw new Error("対象年月を特定できません(header に YYYY年M月 が無く targetMonth も未指定)");
}

/** 先頭N行から staffCode 様のセルを探す */
function findStaffCode(rows: string[][]): string | undefined {
  for (const row of rows.slice(0, IDENTITY_SCAN_ROWS)) {
    for (const cell of row) {
      const value = (cell ?? "").trim();
      if (STAFF_CODE_RE.test(value)) return value;
    }
  }
  return undefined;
}

/** スタッフ同定情報を抽出する。staffCode が取れなければ throw */
function resolveIdentity(input: JobcanSheetInput): Identity {
  const idRow = input.rows[3] ?? [];
  const nameCell = (idRow[0] ?? "").trim();
  const codeCell = (idRow[2] ?? "").trim();
  const affiliationCell = (idRow[4] ?? "").trim();

  const staffCode = STAFF_CODE_RE.test(codeCell)
    ? codeCell
    : findStaffCode(input.rows);
  if (!staffCode) {
    throw new Error("staffCode を特定できません(コード様セルが見つからない)");
  }

  const staffName = nameCell || (input.sheetName ?? "").trim();
  const affiliation = affiliationCell || undefined;
  return { staffCode, staffName, affiliation };
}

/** データ開始行(0始まり)を返す。col0 に "日付" を含む行の次行、無ければ固定値 */
function findDataStartRow(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if (normalizeText(rows[i]?.[COL.date] ?? "").includes("日付")) {
      return i + 1;
    }
  }
  return DATA_START_FALLBACK;
}

/** 採用可能な時刻(HH:MM かつ 00:00 でない)か */
function isWorkingTime(time: string): boolean {
  return TIME_RE.test(time) && time !== "00:00";
}

/** 1データ行を ShiftEntry へ変換する。対象外(非日付・シフト無し)なら null */
function rowToEntry(
  row: string[],
  identity: Identity,
  target: { year: number; month: number },
): ShiftEntry | null {
  const dateCell = normalizeText(row[COL.date] ?? "");
  const match = dateCell.match(DATE_CELL_RE);
  if (!match) return null;

  const startTime = normalizeTime(normalizeText(row[COL.shiftStart] ?? ""));
  const endTime = normalizeTime(normalizeText(row[COL.shiftEnd] ?? ""));
  if (!isWorkingTime(startTime) || !isWorkingTime(endTime)) return null;

  const date = completeJobcanDate(
    Number(match[1]),
    Number(match[2]),
    target.year,
    target.month,
  );
  const sourceMonth = `${target.year}-${String(target.month).padStart(2, "0")}`;
  return {
    jobcanShiftId: `${identity.staffCode}:${date}`,
    staffCode: identity.staffCode,
    staffName: identity.staffName,
    affiliation: identity.affiliation,
    sourceMonth,
    shift: { date, startTime, endTime },
  };
}

/**
 * ジョブカンの確定シフト(1スタッフ1シート)を ShiftEntry[] にパースする純関数。
 *
 * - 対象年月は targetMonth 優先、無ければ header の "YYYY年M月" から読む
 * - identity(氏名/コード/所属)は4行目から抽出。コードが規定位置に無ければ先頭12行を走査
 * - データは "日付" ヘッダの次行から(無ければ index9 以降)
 * - 出勤/退勤(列5/6)が両方 HH:MM かつ 00:00 でない行だけを採用する
 *   (休日区分は見ない。片方のみ 00:00 は除外。終了<開始の深夜跨ぎは同日verbatim)
 * - シート出現順を保持して返す
 */
export function parseJobcanSheet(input: JobcanSheetInput): ShiftEntry[] {
  const target = resolveTargetMonth(input);
  const identity = resolveIdentity(input);
  const startRow = findDataStartRow(input.rows);

  const entries: ShiftEntry[] = [];
  for (const row of input.rows.slice(startRow)) {
    const entry = rowToEntry(row ?? [], identity, target);
    if (entry) entries.push(entry);
  }
  return entries;
}
