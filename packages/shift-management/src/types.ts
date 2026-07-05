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

// ---------------------------------------------------------------------------
// Slack変更報告 → Googleカレンダー反映（DESIGN.md）の型
// ---------------------------------------------------------------------------

/** シフト1コマの日時 */
export interface ShiftTime {
  /** "2026-06-30" (年補完済みISO) */
  date: string;
  /** "16:00" */
  startTime: string;
  /** "22:00" */
  endTime: string;
}

/** Slack報告1行分のシフト変更依頼 */
export interface ShiftChange {
  /** slackMessageTs + 行番号（冪等性キー） */
  id: string;
  /** 現テンプレはmodifyのみ。将来拡張 */
  kind: "modify" | "add" | "cancel";
  slackUserId: string;
  before?: ShiftTime;
  after?: ShiftTime;
  reason?: string;
  /** スレッド返信・重複排除に使用 */
  sourceMessageTs: string;
  channelId: string;
}

/** スタッフごとのGoogle OAuthトークン */
export interface StaffToken {
  /** OAuth同意時に取得（照合キー） */
  googleEmail: string;
  /** 暗号化して保存 */
  refreshToken: string;
  consentedAt: string;
}
