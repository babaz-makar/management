/**
 * 取込履歴の型(依存ゼロのリーフ)。
 *
 * client 安全な純関数(logic/jobcan-home-state)と、server の Neon コア
 * (server/jobcan-import-history-neon-core)の双方が共有する型をここに集約する。
 * ★重要: このファイルは他モジュールを一切 import しない。これにより、ui.ts バレルから
 * home-state 経由でこの型を辿っても server グラフ(googleapis/crypto/neon)へ再汚染しない
 * (ui-barrel-safety の再汚染ガードを通す)。
 *
 * すべて PII なし(email・氏名・ファイル名・自由文字列を含まない)。
 */

/**
 * 書込 DTO(PII なし)。int フィールドはすべて非負整数、reconcileError は真偽、
 * warningBreakdown は理由別カウント(キー=既知 reason、値=非負int)。
 */
export interface ImportHistoryRecord {
  dryRun: boolean;
  totalFiles: number;
  importedFiles: number;
  erroredFiles: number;
  totalEntries: number;
  staffMonthCount: number;
  totalCreates: number;
  totalDeletes: number;
  warningCount: number;
  conversionErrorCount: number;
  reconcileError: boolean;
  /** 理由別カウントのみ(例 {"email_not_registered":3})。 */
  warningBreakdown: Record<string, number>;
}

/** 読取行(PII なし)。書込 DTO に id・executedAt を足したもの。 */
export interface ImportHistoryRow extends ImportHistoryRecord {
  id: number;
  /** ISO8601 文字列に正規化した実行時刻。 */
  executedAt: string;
}

/** ホーム画面向けの集計。最新取込1件+当月の本反映件数+最新取込の未登録数。 */
export interface ImportHistorySummary {
  /** 最新の取込1件(dry-run/本反映いずれも含む overall)。無ければ null。 */
  latestImport: ImportHistoryRow | null;
  /** 当月の本反映(dry_run=false)件数。 */
  monthlyRealCount: number;
  /** 最新取込の email_not_registered 件数(未登録の人数)。 */
  unregisteredCount: number;
}
