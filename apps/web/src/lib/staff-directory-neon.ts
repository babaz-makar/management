import { neon } from "@neondatabase/serverless";
import {
  ensureStaffDirectoryTable,
  neonDeleteEntry,
  neonGetEmail,
  neonListEntries,
  neonSetEmail,
  type SqlTag,
  type StaffDirectory,
  type StaffDirectoryEntry,
} from "@management/shift-management";

/**
 * Neon(Postgres)永続の StaffDirectory 実装。
 *
 * SQL 文言・行マッピング・検証呼び出しは packages 側の純粋関数
 * (staff-directory-neon-core)に集約し、このクラスはそれを呼ぶだけの薄いラッパ。
 * 検証は JsonFile 実装と同一の assertStaffCode / assertEmail を共有し、
 * Neon 側だけ検証が抜ける事故を防ぐ(縫い目は SqlTag の注入でテスト可能)。
 */
export class NeonStaffDirectory implements StaffDirectory {
  private sql: SqlTag;
  private initialized = false;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl) as unknown as SqlTag;
  }

  private async ensure(): Promise<void> {
    if (this.initialized) return;
    await ensureStaffDirectoryTable(this.sql);
    this.initialized = true;
  }

  async get(staffCode: string): Promise<string | null> {
    await this.ensure();
    return neonGetEmail(this.sql, staffCode);
  }

  async set(staffCode: string, email: string): Promise<void> {
    await this.ensure();
    await neonSetEmail(this.sql, staffCode, email);
  }

  async list(): Promise<StaffDirectoryEntry[]> {
    await this.ensure();
    return neonListEntries(this.sql);
  }

  async delete(staffCode: string): Promise<void> {
    await this.ensure();
    await neonDeleteEntry(this.sql, staffCode);
  }
}
