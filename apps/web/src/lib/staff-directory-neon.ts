import { neon } from "@neondatabase/serverless";
import {
  assertEmail,
  assertStaffCode,
  type StaffDirectory,
  type StaffDirectoryEntry,
} from "@management/shift-management";

/**
 * Neon(Postgres)永続の StaffDirectory 実装。NeonTokenStore を忠実にミラー。
 * 検証はパッケージ側の共通ヘルパ(assertStaffCode / assertEmail)を使い、
 * JsonFile 実装と同一ルールに揃える(Neon 側だけ検証が抜ける事故を防ぐ)。
 */
export class NeonStaffDirectory implements StaffDirectory {
  private sql: ReturnType<typeof neon>;
  private initialized = false;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  private async ensureTable() {
    if (this.initialized) return;
    await this.sql`
      CREATE TABLE IF NOT EXISTS staff_directory (
        staff_code TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    this.initialized = true;
  }

  async get(staffCode: string): Promise<string | null> {
    const key = assertStaffCode(staffCode);
    await this.ensureTable();
    const rows = (await this.sql`
      SELECT email FROM staff_directory WHERE staff_code = ${key}
    `) as Record<string, string>[];
    return rows.length > 0 ? rows[0].email : null;
  }

  async set(staffCode: string, email: string): Promise<void> {
    const key = assertStaffCode(staffCode);
    const value = assertEmail(email);
    await this.ensureTable();
    await this.sql`
      INSERT INTO staff_directory (staff_code, email, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (staff_code)
      DO UPDATE SET email = ${value}, updated_at = NOW()
    `;
  }

  async list(): Promise<StaffDirectoryEntry[]> {
    await this.ensureTable();
    const rows = (await this.sql`
      SELECT staff_code, email FROM staff_directory ORDER BY staff_code
    `) as Record<string, string>[];
    return rows.map((row) => ({
      staffCode: row.staff_code,
      email: row.email,
    }));
  }

  async delete(staffCode: string): Promise<void> {
    const key = assertStaffCode(staffCode);
    await this.ensureTable();
    await this.sql`
      DELETE FROM staff_directory WHERE staff_code = ${key}
    `;
  }
}
