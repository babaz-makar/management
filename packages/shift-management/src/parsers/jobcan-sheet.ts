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

/** データ開始行のフォールバック位置 */
const DATA_START_FALLBACK = 9;

/** タイトルセル rows[0][0] 内の最初の "YYYY年M月" を対象年月として読む */
const MONTH_HEADER_RE = /(\d{4})年\s*(\d{1,2})月/;
/**
 * スタッフコード書式。英字1文字+数字ちょうど4桁(社長確認で確定)。
 * 部署/チーム/等級コード(例 "A1","X99")や桁数の異なる想定外コードを弾き、
 * 誤同定・別人ひも付けを防ぐ。想定外桁は書式外として取込中止(throw)。
 */
const STAFF_CODE_RE = /^[A-Za-z]\d{4}$/;
/** 日付セル。日の直後に境界(非数字 or 行末)を要求し "8/123"→"8/12" の桁こぼれを防ぐ */
const DATE_CELL_RE = /^\s*(\d{1,2})\/(\d{1,2})(?=\D|$)/;
const TIME_CELL_RE = /^(\d{2}):(\d{2})$/;

/**
 * 対象年月を固定位置から決定論的に決める。
 * 1. targetMonth があれば最優先(apps/web はファイル名から渡す本筋)。
 * 2. 無ければ先頭セル rows[0][0](タイトルセル)からのみ、最初の "YYYY年M月" を採用。
 * 3. 先頭セルに年月が無ければ throw。他のセル・他の行は一切見ない。
 *
 * 候補を「走査で拾う」設計をやめ固定セル方式にしたのは、拾う候補が無ければ
 * 別セルの年月による silent hijack も起きないため(ムーディ再現の抜け道を根絶)。
 */
function resolveTargetMonth(
  input: JobcanSheetInput,
): { year: number; month: number } {
  if (input.targetMonth) return input.targetMonth;

  const titleCell = normalizeText(input.rows[0]?.[0] ?? "");
  const m = titleCell.match(MONTH_HEADER_RE);
  if (!m) {
    throw new Error(
      "対象年月を先頭セル(rows[0][0])から特定できません(targetMonth も未指定)",
    );
  }
  return { year: Number(m[1]), month: Number(m[2]) };
}

/**
 * スタッフ同定情報を抽出する。
 *
 * staffCode は唯一の安定キーで、誤ると別人の予定になる最悪事故に直結するため、
 * 規定位置(4行目 col2)からのみ取得し、書式外/空なら fail-loud で throw(取込中止)。
 * 他行からの推測フォールバックは行わない(別人コードの黙採用を防ぐ)。
 * staffName は表示用でキーではないため、空なら sheetName フォールバックを許容する。
 */
function resolveIdentity(input: JobcanSheetInput): Identity {
  const idRow = input.rows[3] ?? [];
  const nameCell = (idRow[0] ?? "").trim();
  const codeCell = (idRow[2] ?? "").trim();
  const affiliationCell = (idRow[4] ?? "").trim();

  if (!STAFF_CODE_RE.test(codeCell)) {
    throw new Error(
      "staffCode を特定できません(規定位置 4行目col2 が空/書式外。推測フォールバックはしない)",
    );
  }
  const staffName = nameCell || (input.sheetName ?? "").trim();
  const affiliation = affiliationCell || undefined;
  return { staffCode: codeCell, staffName, affiliation };
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

/**
 * 採用可能な時刻か。HH:MM 書式かつ hour 0-23/minute 0-59 の範囲内、かつ 00:00 でないこと。
 * 書式チェックだけだと "24:00"/"25:70"/"23:60"/"09:99" 等が通り不正時刻でカレンダーを汚すため、
 * 範囲検証まで行う(範囲外は「シフト時刻でない」として不採用。throw はしない)。
 */
function isWorkingTime(time: string): boolean {
  const m = time.match(TIME_CELL_RE);
  if (!m) return false;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return false;
  return time !== "00:00";
}

/** 年月日がその暦上に実在するか(うるう年考慮)。非実在は繰り上げを防ぐため false */
function isRealDate(year: number, month: number, day: number): boolean {
  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  );
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

  // 月1-12・日1-31の範囲外は日付行として扱わない(不正ISO "2026-18-45" の黙生成を防ぐ)。
  // 取込は多数行のバッチなので、1セルの異常で全体を落とさず該当行スキップで頑健に弾く。
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const startTime = normalizeTime(normalizeText(row[COL.shiftStart] ?? ""));
  const endTime = normalizeTime(normalizeText(row[COL.shiftEnd] ?? ""));
  if (!isWorkingTime(startTime) || !isWorkingTime(endTime)) return null;

  const date = completeJobcanDate(month, day, target.year, target.month);
  // 年補完後に実在日を逆照合。"2/30"→"2026-02-30" のような非実在日を下流の
  // new Date() が "3/2" 等へ黙って繰り上げるのを防ぐため、非実在日は行スキップ。
  const [isoYear, isoMonth, isoDay] = date.split("-").map(Number);
  if (!isRealDate(isoYear, isoMonth, isoDay)) return null;

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
 * - 対象年月は targetMonth 優先、無ければ先頭セル rows[0][0] の最初の "YYYY年M月"(無ければ throw)
 * - identity(氏名/コード/所属)は4行目から抽出。staffCode は規定位置(col2)固定で
 *   書式外/空なら throw(推測フォールバックせず取込中止=別人ひも付け防止)
 * - データは "日付" ヘッダの次行から(無ければ index9 以降)
 * - 出勤/退勤(列5/6)が両方 HH:MM(時0-23/分0-59)かつ 00:00 でない行だけを採用する
 *   (休日区分は見ない。片方のみ 00:00 は除外。終了<開始の深夜跨ぎは同日verbatim)
 * - 日付は月1-12/日1-31 かつ年補完後に実在日であることを検証(非実在日は行スキップ)
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
