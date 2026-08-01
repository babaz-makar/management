/**
 * シフトリマインド機能の型定義。
 *
 * シフト変更ツール（Slack投稿 → カレンダー反映）の逆方向で、
 * カレンダーに入っているシフトを読んで Slack へ事前通知する。
 */

/** 通知タイミング。前日21時（翌日分）と当日8時（当日分）の2種類 */
export type RemindTiming = "prev_night" | "morning";

/** リマインド対象メンバー1人分。refresh_token は既存 tokens テーブルの値をそのまま渡す */
export interface RemindMember {
  slackUserId: string;
  refreshToken: string;
  /** 既定 "primary"。別カレンダーにシフトを入れている人のために保持 */
  calendarId: string;
  /** Slackメンションの代わりに表示する名前（未設定ならメンションのみ） */
  displayName?: string;
}

/** カレンダーから読み取ったシフト1件（すべてJST基準） */
export interface ShiftEntry {
  slackUserId: string;
  /** Google Calendar のイベントid。繰り返し予定は実体ごとに別idになるので冪等キーに使える */
  eventUid: string;
  /** "YYYY-MM-DD"（JSTでの開始日） */
  date: string;
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
  /** 予定の開始・終了時刻（ログ保存用のISO文字列） */
  startIso: string;
  endIso: string;
  /** 日跨ぎシフト（終了が翌日）かどうか。表示に "翌" を付けるために持つ */
  crossesMidnight: boolean;
}

/** 1メンバー分のカレンダー読み取り結果 */
export interface MemberShiftResult {
  slackUserId: string;
  shifts: ShiftEntry[];
  /** 終日予定を検出した等の注意。管理チャンネルへ通知する */
  warnings: string[];
  /** トークン失効（401/403）。呼び出し側で calendar_status='revoked' にする */
  revoked: boolean;
  /** 取得そのものが失敗した場合のメッセージ（他メンバーの送信は止めない） */
  error?: string;
}
