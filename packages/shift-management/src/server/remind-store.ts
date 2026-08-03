import type {
  ChannelMember,
  RemindMember,
  RemindTiming,
  ShiftEntry,
} from "../remind/types";

/** メンバーごとの個人設定。チャンネルへの登録とは別で、本人都合の停止・カレンダー指定に使う */
export interface RemindSettings {
  slackUserId: string;
  displayName?: string;
  remindEnabled: boolean;
  calendarId: string;
  calendarStatus: "ok" | "revoked";
}

/** 通知先チャンネル。Botを招待した時点で登録され、Botを外すと解除される */
export interface NotificationTarget {
  channelId: string;
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

  // -------------------------------------------------------------------------
  // 通知先チャンネル
  // -------------------------------------------------------------------------

  /** 有効な通知先チャンネル */
  listNotificationTargets(): Promise<NotificationTarget[]>;

  /** 通知先として登録（Bot招待時）。すでにあれば有効に戻す */
  addNotificationTarget(channelId: string, label?: string): Promise<void>;

  /** 通知先を解除（Bot退出時）。登録メンバーは残すので、再招待すれば復活する */
  disableNotificationTarget(channelId: string): Promise<void>;

  // -------------------------------------------------------------------------
  // チャンネルごとの対象メンバー
  // -------------------------------------------------------------------------

  /** そのチャンネルの対象メンバー全員（未連携・停止中も含む。設定UI・警告用） */
  listChannelMembers(channelId: string): Promise<ChannelMember[]>;

  /** そのチャンネルで実際にカレンダーを読むメンバー（連携済み ∧ 有効 ∧ status=ok） */
  listChannelRemindMembers(channelId: string): Promise<RemindMember[]>;

  /** 対象メンバーを渡された集合に置き換える（Modalの保存） */
  setChannelMembers(channelId: string, slackUserIds: string[]): Promise<void>;

  /** 対象メンバーを追加する（あとから参加した人のワンクリック追加） */
  addChannelMembers(channelId: string, slackUserIds: string[]): Promise<void>;

  /** 対象メンバーを外す */
  removeChannelMembers(channelId: string, slackUserIds: string[]): Promise<void>;

  // -------------------------------------------------------------------------
  // メンバー個人設定
  // -------------------------------------------------------------------------

  /** 設定の upsert。渡されなかった項目は既存値（または既定値）を保つ */
  saveSettings(
    settings: { slackUserId: string } & Partial<Omit<RemindSettings, "slackUserId">>,
  ): Promise<void>;

  /** トークン失効の記録（401/403を受けたとき） */
  markCalendarStatus(slackUserId: string, status: "ok" | "revoked"): Promise<void>;

  /** そのSlackユーザーがGoogle連携済みか */
  hasGoogleToken(slackUserId: string): Promise<boolean>;

  // -------------------------------------------------------------------------
  // 送信ログ（二重送信防止 & 監査）
  // -------------------------------------------------------------------------

  /**
   * 送信枠を予約する。UNIQUE (channel_id, slack_user_id, event_uid, timing) により、
   * cron が二重起動しても2回目は0件になる（アプリ側のフラグ判定に頼らない）。
   * @returns 今回新しく予約できた（= まだ送っていない）シフトだけ
   */
  claimSends(
    channelId: string,
    shifts: ShiftEntry[],
    timing: RemindTiming,
  ): Promise<ShiftEntry[]>;

  /** 送信成功を確定する */
  markSent(
    channelId: string,
    shifts: ShiftEntry[],
    timing: RemindTiming,
  ): Promise<void>;

  /** 送信失敗時に予約を解放する（次回の実行で再送できるようにする） */
  releaseClaims(
    channelId: string,
    shifts: ShiftEntry[],
    timing: RemindTiming,
  ): Promise<void>;
}
