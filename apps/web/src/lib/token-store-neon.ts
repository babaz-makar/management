import { neon } from "@neondatabase/serverless";
import type { TokenStore } from "@management/shift-management";

export class NeonTokenStore implements TokenStore {
  private sql: ReturnType<typeof neon>;
  private initialized = false;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  private async ensureTable() {
    if (this.initialized) return;
    await this.sql`
      CREATE TABLE IF NOT EXISTS tokens (
        slack_user_id TEXT PRIMARY KEY,
        refresh_token TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    this.initialized = true;
  }

  async get(slackUserId: string): Promise<string | null> {
    await this.ensureTable();
    const rows = await this.sql`
      SELECT refresh_token FROM tokens WHERE slack_user_id = ${slackUserId}
    ` as Record<string, string>[];
    return rows.length > 0 ? rows[0].refresh_token : null;
  }

  async set(slackUserId: string, refreshToken: string): Promise<void> {
    await this.ensureTable();
    await this.sql`
      INSERT INTO tokens (slack_user_id, refresh_token, updated_at)
      VALUES (${slackUserId}, ${refreshToken}, NOW())
      ON CONFLICT (slack_user_id)
      DO UPDATE SET refresh_token = ${refreshToken}, updated_at = NOW()
    `;
  }

  async delete(slackUserId: string): Promise<void> {
    await this.ensureTable();
    await this.sql`
      DELETE FROM tokens WHERE slack_user_id = ${slackUserId}
    `;
  }
}
