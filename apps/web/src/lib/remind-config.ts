import type { RemindStore } from "@management/shift-management";
import { NeonRemindStore } from "./remind-store-neon";

/**
 * シフトリマインド機能の環境変数まとめ。
 *
 * Slack のトークン・署名シークレットは既存のシフト変更ツールと **共有しない**。
 * 専用アプリを別に作るため、変数名を SLACK_REMIND_* で分けている。
 */
export const remindEnv = {
  get botToken() {
    return process.env.SLACK_REMIND_BOT_TOKEN ?? "";
  },
  get signingSecret() {
    return process.env.SLACK_REMIND_SIGNING_SECRET ?? "";
  },
  /** 管理用チャンネル（警告・エラーの通知先） */
  get adminChannelId() {
    return process.env.SLACK_REMIND_ADMIN_CHANNEL_ID || undefined;
  },
  /**
   * 「変更がある場合は〜まで」に出す表記。
   * チャンネルIDを入れると <#C0123ABCD> に整形してリンクになる。
   */
  get changeChannelLabel() {
    const raw = process.env.SLACK_REMIND_CHANGE_CHANNEL;
    if (!raw) return undefined;
    return /^C[A-Z0-9]+$/.test(raw) ? `<#${raw}>` : raw;
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  /**
   * カレンダー連携リンクの生成に使う本番URL（既存ツールと共用）。
   * 未設定なら未連携メンバーへの連携依頼は送らない。
   */
  get appUrl() {
    return process.env.APP_URL || undefined;
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  get calendarId() {
    return process.env.GOOGLE_CALENDAR_ID ?? "primary";
  },
};

let store: RemindStore | null = null;

/**
 * RemindStore を返す。
 *
 * 二重送信防止をDBのUNIQUE制約で担保する設計なので、JSONファイルへの
 * フォールバックは用意しない。DATABASE_URL が無ければ明確に失敗させる。
 */
export function getRemindStore(): RemindStore {
  if (store) return store;
  if (!remindEnv.databaseUrl) {
    throw new Error(
      "DATABASE_URL が未設定です。シフトリマインドは送信ログのUNIQUE制約で二重送信を防ぐためDBが必須です。",
    );
  }
  store = new NeonRemindStore(remindEnv.databaseUrl, remindEnv.calendarId);
  return store;
}
