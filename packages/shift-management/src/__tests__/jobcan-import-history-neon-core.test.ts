import { describe, expect, it } from "vitest";
import {
  buildImportHistoryRecord,
  ensureImportHistoryTable,
  neonGetImportHistorySummary,
  neonInsertImportHistory,
  neonListRecentImportHistory,
  summarizeWarnings,
  type ImportHistoryRecord,
} from "../server/jobcan-import-history-neon-core";
import type { SqlTag } from "../server/staff-directory-neon-core";
import type { JobcanImportResult } from "../server/jobcan-import";
import type { JobcanStaffWarning } from "../server/jobcan-reconcile-all";

type SqlRows = Record<string, unknown>[];

interface RecordedCall {
  text: string;
  values: unknown[];
}

/**
 * タグ付きテンプレート互換の fake SQL。呼び出しを記録し、text で分岐する resolver が
 * あればその戻り値、無ければ空配列を返す。実 DB 接続なしで SQL 文言・引数・
 * 行マッピング・LIMIT 付与を検証する(既存 staff-directory-neon-core.test と同型)。
 */
function createFakeSql(resolver?: (text: string, values: unknown[]) => SqlRows): {
  sql: SqlTag;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(resolver ? resolver(text, values) : ([] as SqlRows));
  };
  return { sql: sql as SqlTag, calls };
}

/** テスト用の JobcanStaffWarning を組む(email を必ず載せて PII 落としを検証できるようにする)。 */
function warning(
  reason: JobcanStaffWarning["reason"],
  email: string | null,
): JobcanStaffWarning {
  return {
    staffCode: "A0187",
    email,
    sourceMonth: "2026-08",
    reason,
    message: "dummy",
  };
}

/** テスト用の JobcanImportResult を最小構成で組む。 */
function makeResult(overrides?: {
  warnings?: JobcanStaffWarning[];
  reconcileError?: string;
  summary?: Partial<JobcanImportResult["summary"]>;
}): JobcanImportResult {
  const summary = {
    dryRun: true,
    totalFiles: 3,
    importedFiles: 2,
    erroredFiles: 1,
    totalEntries: 40,
    staffMonthCount: 2,
    totalCreates: 30,
    totalDeletes: 4,
    warningCount: overrides?.warnings?.length ?? 0,
    ...overrides?.summary,
  };
  return {
    fileErrors: [],
    reconcile: { reconciled: [], warnings: overrides?.warnings ?? [] },
    reconcileError: overrides?.reconcileError,
    summary,
  };
}

describe("summarizeWarnings: reason で集計し email を捨てる(PIIガード)", () => {
  it("reason ごとの件数を数える", () => {
    const warnings = [
      warning("email_not_registered", "a@example.com"),
      warning("email_not_registered", "b@example.com"),
      warning("google_not_linked", "c@example.com"),
    ];
    expect(summarizeWarnings(warnings)).toEqual({
      email_not_registered: 2,
      google_not_linked: 1,
    });
  });

  it("空配列なら空オブジェクト(0件の reason は載せない)", () => {
    expect(summarizeWarnings([])).toEqual({});
  });

  it("戻り値に email や staffName など自由文字列が一切含まれない", () => {
    const warnings = [warning("email_not_registered", "secret@example.com")];
    const breakdown = summarizeWarnings(warnings);
    expect(JSON.stringify(breakdown)).not.toContain("secret@example.com");
    // キーは既知 reason のみ、値は数値
    for (const [key, value] of Object.entries(breakdown)) {
      expect(typeof value).toBe("number");
      expect(key).toMatch(/^[a-z_]+$/);
    }
  });

  it("未知の reason(型を破った値)は allowlist 外として捨てる", () => {
    const rogue = warning(
      "totally_unknown_reason" as JobcanStaffWarning["reason"],
      "x@example.com",
    );
    expect(summarizeWarnings([rogue])).toEqual({});
  });
});

describe("buildImportHistoryRecord: summary+warnings→書込DTO(PIIを落とす唯一の地点)", () => {
  it("summary の各値と dryRun/フラグを DTO に写す", () => {
    const result = makeResult({
      warnings: [warning("email_not_registered", "a@example.com")],
    });
    const record = buildImportHistoryRecord(result, 5, false);
    expect(record).toEqual<ImportHistoryRecord>({
      dryRun: false,
      totalFiles: 3,
      importedFiles: 2,
      erroredFiles: 1,
      totalEntries: 40,
      staffMonthCount: 2,
      totalCreates: 30,
      totalDeletes: 4,
      warningCount: 1,
      conversionErrorCount: 5,
      reconcileError: false,
      warningBreakdown: { email_not_registered: 1 },
    });
  });

  it("reconcileError がセットされていれば reconcileError:true", () => {
    const record = buildImportHistoryRecord(
      makeResult({ reconcileError: "boom" }),
      0,
      true,
    );
    expect(record.reconcileError).toBe(true);
    expect(record.dryRun).toBe(true);
  });

  it("PIIガード: DTO に email フィールドが無く、生 email 文字列も含まれない", () => {
    const result = makeResult({
      warnings: [warning("email_not_registered", "leak@example.com")],
    });
    const record = buildImportHistoryRecord(result, 0, false);
    expect("email" in record).toBe(false);
    expect(JSON.stringify(record)).not.toContain("leak@example.com");
  });

  it("負・NaN の conversionErrorCount は 0 に丸める(非負int)", () => {
    expect(buildImportHistoryRecord(makeResult(), -3, false).conversionErrorCount).toBe(0);
    expect(buildImportHistoryRecord(makeResult(), NaN, false).conversionErrorCount).toBe(0);
  });

  it("すべての int フィールドが非負整数になる", () => {
    const record = buildImportHistoryRecord(
      makeResult({ summary: { totalDeletes: -9, totalCreates: 2.9 } }),
      -1,
      false,
    );
    const intFields = [
      record.totalFiles,
      record.importedFiles,
      record.erroredFiles,
      record.totalEntries,
      record.staffMonthCount,
      record.totalCreates,
      record.totalDeletes,
      record.warningCount,
      record.conversionErrorCount,
    ];
    for (const v of intFields) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("ensureImportHistoryTable", () => {
  it("CREATE TABLE IF NOT EXISTS と executed_at インデックスを冪等に発行する", async () => {
    const { sql, calls } = createFakeSql();
    await ensureImportHistoryTable(sql);
    const joined = calls.map((c) => c.text).join(" ");
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS jobcan_import_history");
    expect(joined).toContain("CREATE INDEX IF NOT EXISTS idx_jobcan_import_history_executed_at");
    expect(joined).toContain("executed_at DESC");
    for (const c of calls) expect(c.values).toEqual([]);
  });
});

describe("neonInsertImportHistory: 1行INSERT(パラメータ化)", () => {
  const record: ImportHistoryRecord = {
    dryRun: false,
    totalFiles: 3,
    importedFiles: 2,
    erroredFiles: 1,
    totalEntries: 40,
    staffMonthCount: 2,
    totalCreates: 30,
    totalDeletes: 4,
    warningCount: 1,
    conversionErrorCount: 5,
    reconcileError: false,
    warningBreakdown: { email_not_registered: 1 },
  };

  it("INSERT INTO jobcan_import_history を発行し全カラムをパラメータ化する", async () => {
    const { sql, calls } = createFakeSql();
    await neonInsertImportHistory(sql, record);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("INSERT INTO jobcan_import_history");
    // warning_breakdown は JSON 文字列で渡し ::jsonb でキャストする
    expect(calls[0].text).toContain("::jsonb");
    // 生 SQL に数値・真偽が直接埋め込まれず、値配列で渡ること
    expect(calls[0].values).toContain(3);
    expect(calls[0].values).toContain(false);
    expect(calls[0].values).toContain(JSON.stringify({ email_not_registered: 1 }));
  });

  it("L-1: 書込側でも warningBreakdown を allowlist 濾過する(将来callerのPIIキーをJSONBに載せない)", async () => {
    const { sql, calls } = createFakeSql();
    // 別 caller が PII キー(email)や未知キー・不正値を混ぜてきた最悪ケース。
    const dirty: ImportHistoryRecord = {
      ...record,
      warningBreakdown: {
        email_not_registered: 2,
        "leaked@example.com": 1,
        totally_unknown: 9,
        directory_error: -5,
      } as Record<string, number>,
    };
    await neonInsertImportHistory(sql, dirty);
    const jsonParam = calls[0].values.find(
      (v) => typeof v === "string" && v.startsWith("{"),
    ) as string;
    const parsed = JSON.parse(jsonParam);
    // 既知 reason だけ残り、値は非負int。PIIキー・未知キーは載らない。
    expect(parsed).toEqual({ email_not_registered: 2, directory_error: 0 });
    expect(jsonParam).not.toContain("leaked@example.com");
    expect(jsonParam).not.toContain("totally_unknown");
  });
});

describe("neonListRecentImportHistory: 上限必須の履歴取得", () => {
  const rawRow = {
    id: 7,
    executed_at: new Date("2026-08-01T09:30:00.000Z"),
    dry_run: false,
    total_files: 3,
    imported_files: 2,
    errored_files: 1,
    total_entries: 40,
    staff_month_count: 2,
    total_creates: 30,
    total_deletes: 4,
    warning_count: 1,
    conversion_error_count: 5,
    reconcile_error: false,
    warning_breakdown: { email_not_registered: 1 },
  };

  it("ORDER BY executed_at DESC LIMIT を付け、snake_case→camelCase に写像する", async () => {
    const { sql, calls } = createFakeSql(() => [rawRow]);
    const rows = await neonListRecentImportHistory(sql, 10);
    expect(calls[0].text).toContain("FROM jobcan_import_history");
    expect(calls[0].text).toContain("ORDER BY executed_at DESC");
    expect(calls[0].text).toContain("LIMIT");
    expect(rows[0]).toEqual({
      id: 7,
      executedAt: "2026-08-01T09:30:00.000Z",
      dryRun: false,
      totalFiles: 3,
      importedFiles: 2,
      erroredFiles: 1,
      totalEntries: 40,
      staffMonthCount: 2,
      totalCreates: 30,
      totalDeletes: 4,
      warningCount: 1,
      conversionErrorCount: 5,
      reconcileError: false,
      warningBreakdown: { email_not_registered: 1 },
    });
  });

  it("巨大 limit は上限にクランプされる(無制限クエリを作らない)", async () => {
    const { sql, calls } = createFakeSql(() => []);
    await neonListRecentImportHistory(sql, 100000);
    const limitParam = calls[0].values[calls[0].values.length - 1];
    expect(typeof limitParam).toBe("number");
    expect(limitParam as number).toBeLessThanOrEqual(100);
  });

  it("0 や負の limit は最低 1 に矯正される", async () => {
    const { sql, calls } = createFakeSql(() => []);
    await neonListRecentImportHistory(sql, 0);
    expect(calls[0].values[calls[0].values.length - 1]).toBeGreaterThanOrEqual(1);
  });

  it("executed_at が文字列でもそのまま、想定外型は空文字に落とす", async () => {
    const strRow = { ...rawRow, executed_at: "2026-08-01T00:00:00.000Z" };
    const oddRow = { ...rawRow, executed_at: 12345 };
    const { sql } = createFakeSql(() => [strRow, oddRow]);
    const rows = await neonListRecentImportHistory(sql, 5);
    expect(rows[0].executedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(rows[1].executedAt).toBe("");
  });

  it("warning_breakdown の未知キー・非オブジェクトは除去/空に落とす(汚染値を流さない)", async () => {
    const dirty = {
      ...rawRow,
      warning_breakdown: { email_not_registered: "2", leaked_email: "x@e.com" },
    };
    const nullBreak = { ...rawRow, warning_breakdown: null };
    const { sql } = createFakeSql(() => [dirty, nullBreak]);
    const rows = await neonListRecentImportHistory(sql, 5);
    expect(rows[0].warningBreakdown).toEqual({ email_not_registered: 2 });
    expect(rows[1].warningBreakdown).toEqual({});
  });
});

describe("neonGetImportHistorySummary: latestImport(overall) と unregistered(本反映) のソース分離(M-1)", () => {
  // 直近の取込は「dry-run(部分ファイル)」で未登録0、直近の本反映は別で未登録3。
  const latestOverallDryRun = {
    id: 20,
    executed_at: new Date("2026-08-10T02:00:00.000Z"),
    dry_run: true,
    total_files: 1,
    imported_files: 1,
    errored_files: 0,
    total_entries: 5,
    staff_month_count: 1,
    total_creates: 3,
    total_deletes: 0,
    warning_count: 0,
    conversion_error_count: 0,
    reconcile_error: false,
    warning_breakdown: {},
  };
  const latestRealWithUnregistered = {
    id: 9,
    executed_at: new Date("2026-08-01T09:30:00.000Z"),
    dry_run: false,
    total_files: 3,
    imported_files: 2,
    errored_files: 1,
    total_entries: 40,
    staff_month_count: 2,
    total_creates: 30,
    total_deletes: 4,
    warning_count: 3,
    conversion_error_count: 0,
    reconcile_error: false,
    warning_breakdown: { email_not_registered: 3 },
  };

  /** COUNT→件数 / dry_run=false かつ非COUNT→本反映最新 / それ以外→overall最新。 */
  function resolver(text: string): SqlRows {
    if (text.includes("COUNT(")) return [{ count: 5 }];
    if (text.includes("dry_run = false")) return [latestRealWithUnregistered];
    return [latestOverallDryRun];
  }

  it("latestImport は overall 最新(dry-run 含む)、unregisteredCount は最新の本反映から出す", async () => {
    const { sql, calls } = createFakeSql(resolver);
    const summary = await neonGetImportHistorySummary(
      sql,
      "2026-08-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    );
    // 直近に何をしたか(表示用)は dry-run の取込
    expect(summary.latestImport?.id).toBe(20);
    expect(summary.latestImport?.dryRun).toBe(true);
    // 未登録バナーの元データは「最新の本反映」由来なので、dry-run に消されない
    expect(summary.unregisteredCount).toBe(3);
    expect(summary.monthlyRealCount).toBe(5);
    // 本反映最新クエリは dry_run = false かつ LIMIT 1(非COUNT)
    const realCall = calls.find(
      (c) => c.text.includes("dry_run = false") && !c.text.includes("COUNT("),
    );
    expect(realCall?.text).toContain("LIMIT");
    // 当月件数クエリは月境界をパラメータ化する
    const countCall = calls.find((c) => c.text.includes("COUNT("));
    expect(countCall?.values).toContain("2026-08-01T00:00:00.000Z");
    expect(countCall?.values).toContain("2026-09-01T00:00:00.000Z");
  });

  it("本反映が1件も無ければ unregisteredCount=0(overall最新があっても本反映由来のみ見る)", async () => {
    const { sql } = createFakeSql((text) => {
      if (text.includes("COUNT(")) return [{ count: 0 }];
      if (text.includes("dry_run = false")) return []; // 本反映は存在しない
      return [latestOverallDryRun]; // overall 最新は dry-run で存在
    });
    const summary = await neonGetImportHistorySummary(
      sql,
      "2026-08-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    );
    expect(summary.latestImport?.id).toBe(20);
    expect(summary.unregisteredCount).toBe(0);
    expect(summary.monthlyRealCount).toBe(0);
  });

  it("履歴が全く無ければ latestImport=null, 件数0, 未登録0", async () => {
    const { sql } = createFakeSql((text) =>
      text.includes("COUNT(") ? [{ count: 0 }] : [],
    );
    const summary = await neonGetImportHistorySummary(
      sql,
      "2026-08-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    );
    expect(summary.latestImport).toBeNull();
    expect(summary.monthlyRealCount).toBe(0);
    expect(summary.unregisteredCount).toBe(0);
  });
});
