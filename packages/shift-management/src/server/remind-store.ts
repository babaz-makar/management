import type { RemindMember, RemindTiming, ShiftEntry } from "../remind/types";

/** メンバーごとのリマインド設定。refresh_token は持たない（既存 tokens テーブルを参照する） */
export interface RemindSettings {
  slackUserId: string;
  displayName?: string;
  remindEnabled: boolean;
  calendarId: string;
  calendarStatus: "ok" | "revoked";
  /** Google Calendar 連携済みか（tokens テーブルに行があるか）。一覧表示用 */
  connected?: boolean;
}

/** 通知先（Slackチャンネル） */
export interface NotificationTarget {
  targetId: string;
  label?: string;
  enabled: boolean;
}

/**
 * リマインド機能の永続化層。
 *
 * refresh token は**保存しない**。既存のシフト変更ツールが持っている tokens テーブルを
 * 参照するだけ（二重管理すると片方だけ失効して原因不明の不具合になる）。
 */
export interface RemindStore {
  /** テーブル作成・列追加。冪等に何度呼んでもよい */
  init(): Promise<void>;

  /**
   * 通知対象メンバー（Google連携済み ∧ remind_enabled ∧ calendar_status='ok'）。
   * 設定行が無いメンバーは「有効・primary」の既定値で対象に含める。
   */
  listRemindMembers(): Promise<RemindMember[]>;

  /** 設定一覧（設定UI・/shift-remind list 用） */
  listSettings(): Promise<RemindSettings[]>;

  /** 設定の upsert。渡されなかった項目は既存値（または既定値）を保つ */
  saveSettings(
    settings: { slackUserId: string } & Partial<Omit<RemindSettings, "slackUserId">>,
  ): Promise<void>;

  /** トークン失効の記録（401/403を受けたとき） */
  markCalendarStatus(slackUserId: string, status: "ok" | "revoked"): Promise<void>;

  /** 有効な通知先チャンネル */
  listNotificationTargets(): Promise<NotificationTarget[]>;

  /** 通知先を渡された集合に置き換える */
  setNotificationTargets(targets: { targetId: string; label?: string }[]): Promise<void>;

  /**
   * 送信枠を予約する。UNIQUE (slack_user_id, event_uid, timing) により、
   * cron が二重起動しても2回目は0件になる（アプリ側のフラグ判定に頼らない）。
   * @returns 今回新しく予約できた（= まだ送っていない）シフトだけ
   */
  claimSends(shifts: ShiftEntry[], timing: RemindTiming): Promise<ShiftEntry[]>;

  /** 送信成功を確定する */
  markSent(shifts: ShiftEntry[], timing: RemindTiming): Promise<void>;

  /** 送信失敗時に予約を解放する（次回の実行で再送できるようにする） */
  releaseClaims(shifts: ShiftEntry[], timing: RemindTiming): Promise<void>;

  /** そのSlackユーザーがGoogle連携済みか（設定UIの警告表示に使う） */
  hasGoogleToken(slackUserId: string): Promise<boolean>;
}
