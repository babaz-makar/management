/**
 * ジョブカン取込履歴(追記専用ログ)のスキーマ層・集計層(packages 側の純関数)。
 *
 * packages は Neon 非依存を死守するため、SQL 実行は SqlTag(タグ付きテンプレート互換の
 * 縫い目)を注入して行い、文言・行マッピング・LIMIT 付与・DTO 組み立てをここに集約する。
 * apps/web の NeonImportHistoryStore はこれらを呼ぶだけの薄いラッパにする。
 *
 * ★PIIガード(最重要): 履歴には email・氏名・ファイル名・自由文字列を一切 persist しない。
 *   - warningBreakdown は「理由別カウントのみ」。キーは既知 reason の allowlist、値は非負int。
 *   - buildImportHistoryRecord が「PII を落とす唯一の地点」。ここで summary の数値と
 *     warning.reason だけを読み、email/氏名/ファイル名には一切触れない。
 */
import type { SqlTag } from "./staff-directory-neon-core";
import type { JobcanImportResult } from "./jobcan-import";
import type {
  JobcanStaffSkipReason,
  JobcanStaffWarning,
} from "./jobcan-reconcile-all";
import type {
  ImportHistoryRecord,
  ImportHistoryRow,
  ImportHistorySummary,
} from "../logic/jobcan-import-history-types";

// 型は依存ゼロのリーフ(logic/jobcan-import-history-types)へ集約。既存 import 互換のため再輸出する。
export type {
  ImportHistoryRecord,
  ImportHistoryRow,
  ImportHistorySummary,
} from "../logic/jobcan-import-history-types";

/**
 * warningBreakdown のキーに許す既知 reason の allowlist。
 * JobcanStaffSkipReason と一致させ、未知の文字列を DB へ書かせない
 * (型が破れた場合の防御。email 等の自由文字列混入を構造的に封じる)。
 */
const KNOWN_SKIP_REASONS: readonly JobcanStaffSkipReason[] = [
  "not_allowlisted",
  "email_not_registered",
  "directory_error",
  "slack_not_found",
  "google_not_linked",
  "resolve_error",
  "reconcile_error",
];
const KNOWN_SKIP_REASON_SET = new Set<string>(KNOWN_SKIP_REASONS);

/** 取得履歴の上限(無制限クエリを作らないための天井)。 */
const MAX_HISTORY_LIMIT = 100;

/** 負・NaN・非整数を非負整数へ矯正する(DTO の int 不変条件を守る)。 */
function nonNegInt(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const floored = Math.floor(value);
  return floored > 0 ? floored : 0;
}

/**
 * warning を reason で数え、email を捨てる(PIIガード)。
 * 未知 reason(型が破れた値)は allowlist 外として捨て、DB へ自由文字列を書かせない。
 * 0件の reason はキーを作らない(breakdown を最小に保つ)。
 */
export function summarizeWarnings(
  warnings: readonly JobcanStaffWarning[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const w of warnings) {
    const reason = w.reason;
    if (!KNOWN_SKIP_REASON_SET.has(reason)) continue; // 未知 reason は捨てる
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
}

/**
 * 取込結果から書込 DTO を組む「PII を落とす唯一の地点」。
 * summary の数値と warning.reason のみを読み、email・氏名・ファイル名には一切触れない。
 */
export function buildImportHistoryRecord(
  result: JobcanImportResult,
  conversionErrorCount: number,
  dryRun: boolean,
): ImportHistoryRecord {
  const s = result.summary;
  return {
    dryRun,
    totalFiles: nonNegInt(s.totalFiles),
    importedFiles: nonNegInt(s.importedFiles),
    erroredFiles: nonNegInt(s.erroredFiles),
    totalEntries: nonNegInt(s.totalEntries),
    staffMonthCount: nonNegInt(s.staffMonthCount),
    totalCreates: nonNegInt(s.totalCreates),
    totalDeletes: nonNegInt(s.totalDeletes),
    warningCount: nonNegInt(s.warningCount),
    conversionErrorCount: nonNegInt(conversionErrorCount),
    reconcileError: result.reconcileError !== undefined,
    warningBreakdown: summarizeWarnings(result.reconcile.warnings),
  };
}

/** jobcan_import_history テーブルと executed_at 降順インデックスを冪等に作成する。 */
export async function ensureImportHistoryTable(sql: SqlTag): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS jobcan_import_history (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dry_run BOOLEAN NOT NULL,
      total_files INT NOT NULL,
      imported_files INT NOT NULL,
      errored_files INT NOT NULL,
      total_entries INT NOT NULL,
      staff_month_count INT NOT NULL,
      total_creates INT NOT NULL,
      total_deletes INT NOT NULL,
      warning_count INT NOT NULL,
      conversion_error_count INT NOT NULL,
      reconcile_error BOOLEAN NOT NULL,
      warning_breakdown JSONB NOT NULL DEFAULT '{}'
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_jobcan_import_history_executed_at
    ON jobcan_import_history (executed_at DESC)
  `;
}

/** 履歴を1行 INSERT する(全カラムをパラメータ化。executed_at は DB 既定の NOW())。 */
export async function neonInsertImportHistory(
  sql: SqlTag,
  record: ImportHistoryRecord,
): Promise<void> {
  // warning_breakdown は JSON 文字列で渡し ::jsonb でキャストする(値はカウントのみ)。
  const breakdownJson = JSON.stringify(record.warningBreakdown ?? {});
  await sql`
    INSERT INTO jobcan_import_history (
      dry_run, total_files, imported_files, errored_files, total_entries,
      staff_month_count, total_creates, total_deletes, warning_count,
      conversion_error_count, reconcile_error, warning_breakdown
    ) VALUES (
      ${record.dryRun},
      ${nonNegInt(record.totalFiles)},
      ${nonNegInt(record.importedFiles)},
      ${nonNegInt(record.erroredFiles)},
      ${nonNegInt(record.totalEntries)},
      ${nonNegInt(record.staffMonthCount)},
      ${nonNegInt(record.totalCreates)},
      ${nonNegInt(record.totalDeletes)},
      ${nonNegInt(record.warningCount)},
      ${nonNegInt(record.conversionErrorCount)},
      ${record.reconcileError},
      ${breakdownJson}::jsonb
    )
  `;
}

/** executed_at(Date or string)を ISO 文字列へ正規化する。 */
function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

/** warning_breakdown(JSONB)を「キー=既知reason・値=非負int」だけに絞る(汚染値を下流に流さない)。 */
function sanitizeBreakdown(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!KNOWN_SKIP_REASON_SET.has(key)) continue;
    out[key] = nonNegInt(Number(raw));
  }
  return out;
}

/** neon の1行(snake_case)を ImportHistoryRow(camelCase・PIIなし)へ写像する。 */
function mapRow(row: Record<string, unknown>): ImportHistoryRow {
  return {
    id: nonNegInt(Number(row.id)),
    executedAt: toIso(row.executed_at),
    dryRun: row.dry_run === true,
    totalFiles: nonNegInt(Number(row.total_files)),
    importedFiles: nonNegInt(Number(row.imported_files)),
    erroredFiles: nonNegInt(Number(row.errored_files)),
    totalEntries: nonNegInt(Number(row.total_entries)),
    staffMonthCount: nonNegInt(Number(row.staff_month_count)),
    totalCreates: nonNegInt(Number(row.total_creates)),
    totalDeletes: nonNegInt(Number(row.total_deletes)),
    warningCount: nonNegInt(Number(row.warning_count)),
    conversionErrorCount: nonNegInt(Number(row.conversion_error_count)),
    reconcileError: row.reconcile_error === true,
    warningBreakdown: sanitizeBreakdown(row.warning_breakdown),
  };
}

/** limit を [1, MAX_HISTORY_LIMIT] にクランプする(無制限クエリ防止)。 */
function clampLimit(limit: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return 1;
  const floored = Math.floor(limit);
  if (floored < 1) return 1;
  return floored > MAX_HISTORY_LIMIT ? MAX_HISTORY_LIMIT : floored;
}

/** 直近の履歴を executed_at 降順で取得する(LIMIT 必須・上限クランプ)。 */
export async function neonListRecentImportHistory(
  sql: SqlTag,
  limit: number,
): Promise<ImportHistoryRow[]> {
  const safeLimit = clampLimit(limit);
  const rows = (await sql`
    SELECT
      id, executed_at, dry_run, total_files, imported_files, errored_files,
      total_entries, staff_month_count, total_creates, total_deletes,
      warning_count, conversion_error_count, reconcile_error, warning_breakdown
    FROM jobcan_import_history
    ORDER BY executed_at DESC
    LIMIT ${safeLimit}
  `) as Record<string, unknown>[];
  return rows.map(mapRow);
}

/**
 * ホーム集計を返す。
 * 1) 最新取込1件(overall・LIMIT 1) 2) 当月の本反映件数(dry_run=false・月境界) を発行し、
 * 未登録数は最新取込の warningBreakdown.email_not_registered から導く(追加クエリ不要)。
 */
export async function neonGetImportHistorySummary(
  sql: SqlTag,
  monthStartIso: string,
  monthEndIso: string,
): Promise<ImportHistorySummary> {
  const latestRows = (await sql`
    SELECT
      id, executed_at, dry_run, total_files, imported_files, errored_files,
      total_entries, staff_month_count, total_creates, total_deletes,
      warning_count, conversion_error_count, reconcile_error, warning_breakdown
    FROM jobcan_import_history
    ORDER BY executed_at DESC
    LIMIT 1
  `) as Record<string, unknown>[];
  const latestImport = latestRows.length > 0 ? mapRow(latestRows[0]) : null;

  const countRows = (await sql`
    SELECT COUNT(*) AS count
    FROM jobcan_import_history
    WHERE dry_run = false
      AND executed_at >= ${monthStartIso}
      AND executed_at < ${monthEndIso}
  `) as Record<string, unknown>[];
  const monthlyRealCount =
    countRows.length > 0 ? nonNegInt(Number(countRows[0].count)) : 0;

  const unregisteredCount = latestImport
    ? nonNegInt(latestImport.warningBreakdown.email_not_registered ?? 0)
    : 0;

  return { latestImport, monthlyRealCount, unregisteredCount };
}
