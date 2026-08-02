import { neon } from "@neondatabase/serverless";
import {
  ensureImportHistoryTable,
  neonGetImportHistorySummary,
  neonInsertImportHistory,
  neonListRecentImportHistory,
  type ImportHistoryRecord,
  type ImportHistoryRow,
  type ImportHistorySummary,
  type SqlTag,
} from "@management/shift-management";

/**
 * Neon(Postgres)永続の取込履歴ストア(追記専用ログ)。
 *
 * SQL 文言・行マッピング・LIMIT 付与・PII ガードは packages 側の純関数
 * (jobcan-import-history-neon-core)に集約し、このクラスはそれを呼ぶだけの薄いラッパ。
 * NeonStaffDirectory / NeonTokenStore と同型(initialized メモ化の ensure)。
 */
export class NeonImportHistoryStore {
  private sql: SqlTag;
  private initialized = false;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl) as unknown as SqlTag;
  }

  private async ensure(): Promise<void> {
    if (this.initialized) return;
    await ensureImportHistoryTable(this.sql);
    this.initialized = true;
  }

  /** 取込1回ぶんの監査行を追記する(PII は record 側で既に落ちている)。 */
  async insert(record: ImportHistoryRecord): Promise<void> {
    await this.ensure();
    await neonInsertImportHistory(this.sql, record);
  }

  /** 直近の履歴を新しい順に取得する(上限は core 側でクランプ)。 */
  async listRecent(limit: number): Promise<ImportHistoryRow[]> {
    await this.ensure();
    return neonListRecentImportHistory(this.sql, limit);
  }

  /** ホーム画面向け集計を取得する。 */
  async getSummary(
    monthStartIso: string,
    monthEndIso: string,
  ): Promise<ImportHistorySummary> {
    await this.ensure();
    return neonGetImportHistorySummary(this.sql, monthStartIso, monthEndIso);
  }
}
