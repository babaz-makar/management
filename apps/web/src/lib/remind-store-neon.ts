import { neon } from "@neondatabase/serverless";
import type {
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

    // メンバー設定。tokens に列を足さないのは refresh_token NOT NULL のため
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

    await sql`
      CREATE TABLE IF NOT EXISTS notification_targets (
        target_id TEXT PRIMARY KEY,
        label     TEXT,
        enabled   BOOLEAN NOT NULL DEFAULT TRUE
      )
    `;

    // UNIQUE (slack_user_id, event_uid, timing) が二重送信防止の要。
    // cron が二重起動しても2回目の予約が弾かれる
    await sql`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id            BIGSERIAL PRIMARY KEY,
        slack_user_id TEXT NOT NULL,
        event_uid     TEXT NOT NULL,
        timing        TEXT NOT NULL CHECK (timing IN ('prev_night','morning')),
        shift_start   TIMESTAMPTZ NOT NULL,
        shift_end     TIMESTAMPTZ NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (slack_user_id, event_uid, timing)
      )
    `;

    this.initialized = true;
  }

  async listRemindMembers(): Promise<RemindMember[]> {
    await this.init();
    const rows = (await this.sql`
      SELECT t.slack_user_id,
             t.refresh_token,
             COALESCE(s.calendar_id, ${this.defaultCalendarId}) AS calendar_id,
             s.display_name
      FROM tokens t
      LEFT JOIN remind_settings s ON s.slack_user_id = t.slack_user_id
      WHERE COALESCE(s.remind_enabled, TRUE) = TRUE
        AND COALESCE(s.calendar_status, 'ok') = 'ok'
      ORDER BY t.slack_user_id
    `) as Record<string, string | null>[];

    return rows.map((r) => ({
      slackUserId: r.slack_user_id as string,
      refreshToken: r.refresh_token as string,
      calendarId: (r.calendar_id as string) || this.defaultCalendarId,
      displayName: r.display_name ?? undefined,
    }));
  }

  async listSettings(): Promise<RemindSettings[]> {
    await this.init();
    // 設定行が無い連携済みメンバーも「既定で有効」として一覧に出す
    const rows = (await this.sql`
      SELECT COALESCE(s.slack_user_id, t.slack_user_id) AS slack_user_id,
             s.display_name,
             COALESCE(s.remind_enabled, TRUE)   AS remind_enabled,
             COALESCE(s.calendar_id, ${this.defaultCalendarId}) AS calendar_id,
             COALESCE(s.calendar_status, 'ok')  AS calendar_status,
             (t.slack_user_id IS NOT NULL)      AS connected
      FROM remind_settings s
      FULL OUTER JOIN tokens t ON s.slack_user_id = t.slack_user_id
      ORDER BY 1
    `) as Record<string, unknown>[];

    return rows.map((r) => ({
      slackUserId: r.slack_user_id as string,
      displayName: (r.display_name as string | null) ?? undefined,
      remindEnabled: Boolean(r.remind_enabled),
      calendarId: (r.calendar_id as string) || this.defaultCalendarId,
      calendarStatus: r.calendar_status === "revoked" ? "revoked" : "ok",
      connected: Boolean(r.connected),
    }));
  }

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

  async listNotificationTargets(): Promise<NotificationTarget[]> {
    await this.init();
    const rows = (await this.sql`
      SELECT target_id, label, enabled FROM notification_targets
      WHERE enabled = TRUE
      ORDER BY target_id
    `) as Record<string, unknown>[];

    return rows.map((r) => ({
      targetId: r.target_id as string,
      label: (r.label as string | null) ?? undefined,
      enabled: Boolean(r.enabled),
    }));
  }

  async setNotificationTargets(
    targets: { targetId: string; label?: string }[],
  ): Promise<void> {
    await this.init();
    const json = JSON.stringify(
      targets.map((t) => ({ target_id: t.targetId, label: t.label ?? null })),
    );

    // 先に有効化 → あとで対象外を無効化。逆順にすると一瞬「通知先ゼロ」の状態ができる
    if (targets.length > 0) {
      await this.sql`
        INSERT INTO notification_targets (target_id, label, enabled)
        SELECT x.target_id, x.label, TRUE
        FROM jsonb_to_recordset(${json}::jsonb) AS x(target_id text, label text)
        ON CONFLICT (target_id) DO UPDATE SET
          enabled = TRUE,
          label = COALESCE(EXCLUDED.label, notification_targets.label)
      `;
    }

    await this.sql`
      UPDATE notification_targets SET enabled = FALSE
      WHERE enabled = TRUE
        AND target_id NOT IN (
          SELECT x.target_id FROM jsonb_to_recordset(${json}::jsonb) AS x(target_id text)
        )
    `;
  }

  async claimSends(
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
        (slack_user_id, event_uid, timing, shift_start, shift_end, status)
      SELECT x.slack_user_id, x.event_uid, ${timing}, x.shift_start, x.shift_end, 'pending'
      FROM jsonb_to_recordset(${json}::jsonb)
        AS x(slack_user_id text, event_uid text, shift_start timestamptz, shift_end timestamptz)
      ON CONFLICT (slack_user_id, event_uid, timing) DO NOTHING
      RETURNING slack_user_id, event_uid
    `) as Record<string, string>[];

    const claimed = new Set(rows.map((r) => `${r.slack_user_id} ${r.event_uid}`));
    return shifts.filter((s) => claimed.has(`${s.slackUserId} ${s.eventUid}`));
  }

  async markSent(shifts: ShiftEntry[], timing: RemindTiming): Promise<void> {
    await this.init();
    if (shifts.length === 0) return;
    const json = keysJson(shifts);

    await this.sql`
      UPDATE notification_logs l
      SET status = 'sent', sent_at = now()
      FROM jsonb_to_recordset(${json}::jsonb) AS x(slack_user_id text, event_uid text)
      WHERE l.slack_user_id = x.slack_user_id
        AND l.event_uid = x.event_uid
        AND l.timing = ${timing}
    `;
  }

  async releaseClaims(shifts: ShiftEntry[], timing: RemindTiming): Promise<void> {
    await this.init();
    if (shifts.length === 0) return;
    const json = keysJson(shifts);

    // 送信できなかった予約だけ消す。既に 'sent' の行は触らない
    await this.sql`
      DELETE FROM notification_logs l
      USING jsonb_to_recordset(${json}::jsonb) AS x(slack_user_id text, event_uid text)
      WHERE l.slack_user_id = x.slack_user_id
        AND l.event_uid = x.event_uid
        AND l.timing = ${timing}
        AND l.status = 'pending'
    `;
  }

  async hasGoogleToken(slackUserId: string): Promise<boolean> {
    await this.init();
    const rows = (await this.sql`
      SELECT 1 FROM tokens WHERE slack_user_id = ${slackUserId}
    `) as unknown[];
    return rows.length > 0;
  }
}

function keysJson(shifts: ShiftEntry[]): string {
  return JSON.stringify(
    shifts.map((s) => ({ slack_user_id: s.slackUserId, event_uid: s.eventUid })),
  );
}
