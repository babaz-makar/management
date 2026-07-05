/** スタッフ1人分の情報 */
export type StaffMember = {
  id: string;
  name: string;
  /** 役割・職種など任意のメモ（例: ホール / キッチン） */
  role?: string;
};

/** シフト区分（早番・遅番など）。休みのように時間を持たない区分もある */
export type ShiftType = {
  id: string;
  /** 表示名（例: 早番） */
  label: string;
  /** グリッドのセルに表示する短縮名（例: 早） */
  shortLabel: string;
  /** セルの背景色 */
  color: string;
  /** 文字色 */
  textColor: string;
  /** "HH:MM" 形式。休みなど時間を持たない区分は undefined */
  startTime?: string;
  endTime?: string;
};

/**
 * シフトの割り当て表。
 * キーは `${staffId}:${dateKey}`（dateKey は YYYY-MM-DD）、値は ShiftType の id。
 */
export type Assignments = Record<string, string>;

/** ツール全体の状態（localStorage にこの形で保存される） */
export type ScheduleState = {
  staff: StaffMember[];
  shiftTypes: ShiftType[];
  assignments: Assignments;
};

/** assignments のキーを組み立てる */
export function assignmentKey(staffId: string, dateKey: string): string {
  return `${staffId}:${dateKey}`;
}
