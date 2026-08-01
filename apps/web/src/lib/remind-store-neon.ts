import { neon } from "@neondatabase/serverless";
import type {
  ChannelMember,
  NotificationTarget,
  RemindMember,
  RemindSettings,
  RemindStore,
  RemindTiming,
  ShiftEntry,
} from "@management/shift-management";

/**
 * シフトリマインドの永続化層（Neon / Postgres）。
 *
 * refresh token は既存の tokens テーブル（シフト変更ツールが管理）を **参照するだけ**。
 * ここでは保存しない — 二重管理すると片方だけ失効して原因不明の不具合になる。
 *
 * 複数行を扱うクエリは jsonb_to_recordset を使い、パラメータを1個の JSON 文字列に
 * まとめている。ドライバの配列シリアライズ差異に依存せず、件数が増えても
 * 往復1回で済ませるため（Vercelのfunctionタイムアウト対策）。
 */
export class NeonRemindStore implements RemindStore {
  private sql: ReturnType<typeof neon>;
  private initialized = false;

  constructor(
    databaseUrl: string,
    /** 個別設定が無いメンバーに使うカレンダーID。親元ツールの GOOGLE_CALENDAR_ID に合わせる */
    private defaultCalendarId: string = "primary",
  ) {
    this.sql = neon(databaseUrl);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const sql = this.sql;

    // tokens は既存ツールのテーブル。まだ無い環境（初回デプロイ）でも動くようにしておく
    await sql`
      CREATE TABLE IF NOT EXISTS tokens (
        slack_user_id TEXT PRIMARY KEY,
        refresh_token TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // メンバーの個人設定。tokens に列を足さないのは refresh_token NOT NULL のため
    // （未連携のメンバーの設定を先に保存できるようにする）
    await sql`
      CREATE TABLE IF NOT EXISTS remind_settings (
        slack_user_id   TEXT PRIMARY KEY,
        display_name    TEXT,
        remind_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
        calendar_id     TEXT NOT NULL DEFAULT 'primary',
        calendar_status TEXT NOT NULL DEFAULT 'ok',
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    // 通知先チャンネル。Botを招待した時点で登録し、外したら enabled=false にする
    await sql`
      CREATE TABLE IF NOT EXISTS notification_targets (
        channel_id TEXT PRIMARY KEY,
        label      TEXT,
        enabled    BOOLEAN NOT NULL DEFAULT TRUE
      )
    `;

    // チャンネルごとの対象メンバー。誰を通知するかはチャンネル単位で明示的に決める
    await sql`
      CREATE TABLE IF NOT EXISTS channel_members (
        channel_id    TEXT NOT NULL,
        slack_user_id TEXT NOT NULL,
        added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (channel_id, slack_user_id)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id            BIGSERIAL PRIMARY KEY,
        channel_id    TEXT NOT NULL DEFAULT '',
        slack_user_id TEXT NOT NULL,
        event_uid     TEXT NOT NULL,
        timing        TEXT NOT NULL CHECK (timing IN ('prev_night','morning')),
        shift_start   TIMESTAMPTZ NOT NULL,
        shift_end     TIMESTAMPTZ NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    // 同じ人が複数チャンネルに登録されていれば、チャンネルごとに1通ずつ送る。
    // 二重送信防止はこの UNIQUE インデックスで担保する（テーブル制約ではなく
    // 名前付きインデックスにしているのは、旧定義からの移行を冪等にするため）
    await sql`
      ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS channel_id TEXT NOT NULL DEFAULT ''
    `;
    await sql`
      ALTER TABLE notification_logs
        DROP CONSTRAINT IF EXISTS notification_logs_slack_user_id_event_uid_timing_key
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS notification_logs_uniq
        ON notification_logs (channel_id, slack_user_id, event_uid, timing)
    `;

    this.initialized = true;
  }

  // -------------------------------------------------------------------------
  // 通知先チャンネル
  // -------------------------------------------------------------------------

  async listNotificationTargets(): Promise<NotificationTarget[]> {
    await this.init();
    const rows = (await this.sql`
      SELECT channel_id, label, enabled FROM notification_targets
      WHERE enabled = TRUE
      ORDER BY channel_id
    `) as Record<string, unknown>[];

    return rows.map((r) => ({
      channelId: r.channel_id as string,
      label: (r.label as string | null) ?? undefined,
      enabled: Boolean(r.enabled),
    }));
  }

  async addNotificationTarget(channelId: string, label?: string): Promise<void> {
    await this.init();
    await this.sql`
      INSERT INTO notification_targets (channel_id, label, enabled)
      VALUES (${channelId}, ${label ?? null}, TRUE)
      ON CONFLICT (channel_id) DO UPDATE SET
        enabled = TRUE,
        label = COALESCE(${label ?? null}::text, notification_targets.label)
    `;
  }

  async disableNotificationTarget(channelId: string): Promise<void> {
    await this.init();
    // 登録メンバー（channel_members）は消さない。再招待したときに選び直しにならないよう残す
    await this.sql`
      UPDATE notification_targets SET enabled = FALSE WHERE channel_id = ${channelId}
    `;
  }

  // -------------------------------------------------------------------------
  // チャンネルごとの対象メンバー
  // -------------------------------------------------------------------------

  async listChannelMembers(channelId: string): Promise<ChannelMember[]> {
    await this.init();
    const rows = (await this.sql`
      SELECT cm.slack_user_id,
             (t.slack_user_id IS NOT NULL)                       AS connected,
             COALESCE(s.remind_enabled, TRUE)                    AS remind_enabled,
             COALESCE(s.calendar_status, 'ok')                    AS calendar_status,
             COALESCE(s.calendar_id, ${this.defaultCalendarId})   AS calendar_id,
             s.display_name
      FROM channel_members cm
      LEFT JOIN tokens t          ON t.slack_user_id = cm.slack_user_id
      LEFT JOIN remind_settings s ON s.slack_user_id = cm.slack_user_id
      WHERE cm.channel_id = ${channelId}
      ORDER BY cm.added_at, cm.slack_user_id
    `) as Record<string, unknown>[];

    return rows.map((r) => ({
      channelId,
      slackUserId: r.slack_user_id as string,
      connected: Boolean(r.connected),
      remindEnabled: Boolean(r.remind_enabled),
      calendarStatus: r.calendar_status === "revoked" ? "revoked" : "ok",
      calendarId: (r.calendar_id as string) || this.defaultCalendarId,
      displayName: (r.display_name as string | null) ?? undefined,
    }));
  }

  async listChannelRemindMembers(channelId: string): Promise<RemindMember[]> {
    await this.init();
    const rows = (await this.sql`
      SELECT cm.slack_user_id,
             t.refresh_token,
             COALESCE(s.calendar_id, ${this.defaultCalendarId}) AS calendar_id,
             s.display_name
      FROM channel_members cm
      JOIN tokens t               ON t.slack_user_id = cm.slack_user_id
      LEFT JOIN remind_settings s ON s.slack_user_id = cm.slack_user_id
      WHERE cm.channel_id = ${channelId}
        AND COALESCE(s.remind_enabled, TRUE) = TRUE
        AND COALESCE(s.calendar_status, 'ok') = 'ok'
      ORDER BY cm.slack_user_id
    `) as Record<string, string | null>[];

    return rows.map((r) => ({
      slackUserId: r.slack_user_id as string,
      refreshToken: r.refresh_token as string,
      calendarId: (r.calendar_id as string) || this.defaultCalendarId,
      displayName: r.display_name ?? undefined,
    }));
  }

  async setChannelMembers(channelId: string, slackUserIds: string[]): Promise<void> {
    await this.init();
    const json = JSON.stringify(slackUserIds.map((id) => ({ slack_user_id: id })));

    // 先に追加 → あとで対象外を削除。順序を逆にすると一瞬「対象0人」の状態ができる
    if (slackUserIds.length > 0) {
      await this.sql`
        INSERT INTO channel_members (channel_id, slack_user_id)
        SELECT ${channelId}, x.slack_user_id
        FROM jsonb_to_recordset(${json}::jsonb) AS x(slack_user_id text)
        ON CONFLICT (channel_id, slack_user_id) DO NOTHING
      `;
    }

    await this.sql`
      DELETE FROM channel_members
      WHERE channel_id = ${channelId}
        AND slack_user_id NOT IN (
          SELECT x.slack_user_id FROM jsonb_to_recordset(${json}::jsonb) AS x(slack_user_id text)
        )
    `;
  }

  async addChannelMembers(channelId: string, slackUserIds: string[]): Promise<void> {
    await this.init();
    if (slackUserIds.length === 0) return;
    const json = JSON.stringify(slackUserIds.map((id) => ({ slack_user_id: id })));

    await this.sql`
      INSERT INTO channel_members (channel_id, slack_user_id)
      SELECT ${channelId}, x.slack_user_id
      FROM jsonb_to_recordset(${json}::jsonb) AS x(slack_user_id text)
      ON CONFLICT (channel_id, slack_user_id) DO NOTHING
    `;
  }

  async removeChannelMembers(
    channelId: string,
    slackUserIds: string[],
  ): Promise<void> {
    await this.init();
    if (slackUserIds.length === 0) return;
    const json = JSON.stringify(slackUserIds.map((id) => ({ slack_user_id: id })));

    await this.sql`
      DELETE FROM channel_members cm
      USING jsonb_to_recordset(${json}::jsonb) AS x(slack_user_id text)
      WHERE cm.channel_id = ${channelId} AND cm.slack_user_id = x.slack_user_id
    `;
  }

  // -------------------------------------------------------------------------
  // メンバー個人設定
  // -------------------------------------------------------------------------

  async saveSettings(
    settings: { slackUserId: string } & Partial<Omit<RemindSettings, "slackUserId">>,
  ): Promise<void> {
    await this.init();
    const displayName = settings.displayName ?? null;
    const remindEnabled = settings.remindEnabled ?? null;
    const calendarId = settings.calendarId ?? null;
    const calendarStatus = settings.calendarStatus ?? null;

    // 未指定（null）の項目は既存値を保つ。::型 を明示しないと Postgres が
    // パラメータの型を決められずエラーになる
    await this.sql`
      INSERT INTO remind_settings
        (slack_user_id, display_name, remind_enabled, calendar_id, calendar_status, updated_at)
      VALUES (
        ${settings.slackUserId},
        ${displayName}::text,
        COALESCE(${remindEnabled}::boolean, TRUE),
        COALESCE(${calendarId}::text, ${this.defaultCalendarId}),
        COALESCE(${calendarStatus}::text, 'ok'),
        now()
      )
      ON CONFLICT (slack_user_id) DO UPDATE SET
        display_name    = COALESCE(${displayName}::text, remind_settings.display_name),
        remind_enabled  = COALESCE(${remindEnabled}::boolean, remind_settings.remind_enabled),
        calendar_id     = COALESCE(${calendarId}::text, remind_settings.calendar_id),
        calendar_status = COALESCE(${calendarStatus}::text, remind_settings.calendar_status),
        updated_at      = now()
    `;
  }

  async markCalendarStatus(
    slackUserId: string,
    status: "ok" | "revoked",
  ): Promise<void> {
    await this.init();
    await this.sql`
      INSERT INTO remind_settings (slack_user_id, calendar_status, calendar_id, updated_at)
      VALUES (${slackUserId}, ${status}, ${this.defaultCalendarId}, now())
      ON CONFLICT (slack_user_id) DO UPDATE SET
        calendar_status = ${status},
        updated_at = now()
    `;
  }

  async hasGoogleToken(slackUserId: string): Promise<boolean> {
    await this.init();
    const rows = (await this.sql`
      SELECT 1 FROM tokens WHERE slack_user_id = ${slackUserId}
    `) as unknown[];
    return rows.length > 0;
  }

  // -------------------------------------------------------------------------
  // 送信ログ
  // -------------------------------------------------------------------------

  async claimSends(
    channelId: string,
    shifts: ShiftEntry[],
    timing: RemindTiming,
  ): Promise<ShiftEntry[]> {
    await this.init();
    if (shifts.length === 0) return [];

    const json = JSON.stringify(
      shifts.map((s) => ({
        slack_user_id: s.slackUserId,
        event_uid: s.eventUid,
        shift_start: s.startIso,
        shift_end: s.endIso,
      })),
    );

    const rows = (await this.sql`
      INSERT INTO notification_logs
        (channel_id, slack_user_id, event_uid, timing, shift_start, shift_end, status)
      SELECT ${channelId}, x.slack_user_id, x.event_uid, ${timing},
             x.shift_start, x.shift_end, 'pending'
      FROM jsonb_to_recordset(${json}::jsonb)
        AS x(slack_user_id text, event_uid text, shift_start timestamptz, shift_end timestamptz)
      ON CONFLICT (channel_id, slack_user_id, event_uid, timing) DO NOTHING
      RETURNING slack_user_id, event_uid
    `) as Record<string, string>[];

    const claimed = new Set(rows.map((r) => `${r.slack_user_id} ${r.event_uid}`));
    return shifts.filter((s) => claimed.has(`${s.slackUserId} ${s.eventUid}`));
  }

  async markSent(
    channelId: string,
    shifts: ShiftEntry[],
    timing: RemindTiming,
  ): Promise<void> {
    await this.init();
    if (shifts.length === 0) return;

    await this.sql`
      UPDATE notification_logs l
      SET status = 'sent', sent_at = now()
      FROM jsonb_to_recordset(${keysJson(shifts)}::jsonb)
        AS x(slack_user_id text, event_uid text)
      WHERE l.channel_id = ${channelId}
        AND l.slack_user_id = x.slack_user_id
        AND l.event_uid = x.event_uid
        AND l.timing = ${timing}
    `;
  }

  async releaseClaims(
    channelId: string,
    shifts: ShiftEntry[],
    timing: RemindTiming,
  ): Promise<void> {
    await this.init();
    if (shifts.length === 0) return;

    // 送信できなかった予約だけ消す。既に 'sent' の行は触らない
    await this.sql`
      DELETE FROM notification_logs l
      USING jsonb_to_recordset(${keysJson(shifts)}::jsonb)
        AS x(slack_user_id text, event_uid text)
      WHERE l.channel_id = ${channelId}
        AND l.slack_user_id = x.slack_user_id
        AND l.event_uid = x.event_uid
        AND l.timing = ${timing}
        AND l.status = 'pending'
    `;
  }
}

function keysJson(shifts: ShiftEntry[]): string {
  return JSON.stringify(
    shifts.map((s) => ({ slack_user_id: s.slackUserId, event_uid: s.eventUid })),
  );
}
