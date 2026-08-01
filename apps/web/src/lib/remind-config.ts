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
  /** DBに通知先が未登録のときのフォールバック（カンマ区切り） */
  get fallbackChannelIds() {
    return (process.env.SLACK_REMIND_CHANNEL_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
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

/** 通知先チャンネル。DBの notification_targets を優先し、無ければ環境変数を使う */
export async function resolveChannelIds(s: RemindStore): Promise<string[]> {
  const targets = await s.listNotificationTargets();
  if (targets.length > 0) return targets.map((t) => t.targetId);
  return remindEnv.fallbackChannelIds;
}
