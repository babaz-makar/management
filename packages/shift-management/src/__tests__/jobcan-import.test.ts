import { describe, expect, it } from "vitest";
import {
  runJobcanImport,
  formatJobcanImportSummary,
  type JobcanImportDeps,
  type JobcanImportFile,
  type JobcanImportOptions,
} from "../server/jobcan-import";
import type { StaffDirectory, StaffDirectoryEntry } from "../server/staff-directory";
import type { TokenResolution } from "../server/jobcan-token-resolver";
import type { JobcanReconcileResult, JobcanDayResult } from "../server/jobcan-pipeline";
import type { NewEventSpec } from "../logic/calendar-plan";
import type { ShiftEntry } from "../types";

// ---- テストデータ組み立て ------------------------------------------------

interface DayInput {
  day: number;
  start: string;
  end: string;
}

/**
 * parseJobcanSheet が読める最小の行列を作る。
 * row0=タイトル / row3=identity(name,_,staffCode,_,affiliation) / row8="日付"ヘッダ / row9..=データ。
 */
function makeRows(staffCode: string, name: string, days: DayInput[]): string[][] {
  const rows: string[][] = [
    ["2026年8月度"],
    [],
    [],
    [name, "", staffCode, "", "ホール"],
    [],
    [],
    [],
    [],
    ["日付", "", "", "", "", "出勤", "退勤"],
  ];
  for (const d of days) {
    const r = ["", "", "", "", "", "", ""];
    r[0] = `8/${d.day}`;
    r[5] = d.start;
    r[6] = d.end;
    rows.push(r);
  }
  return rows;
}

const ONE_DAY: DayInput[] = [{ day: 1, start: "09:00", end: "18:00" }];

function file(fileName: string, staffCode: string, days: DayInput[] = ONE_DAY): JobcanImportFile {
  return { fileName, rows: makeRows(staffCode, "試 太郎", days), sheetName: "sheet1" };
}

// ---- fake deps ------------------------------------------------------------

function fakeDirectory(map: Record<string, string>): StaffDirectory {
  return {
    async get(staffCode) {
      return map[staffCode] ?? null;
    },
    async set() {},
    async list(): Promise<StaffDirectoryEntry[]> {
      return Object.entries(map).map(([staffCode, email]) => ({ staffCode, email }));
    },
    async delete() {},
  };
}

interface ReconcileCall {
  staffCode: string;
  refreshToken: string;
  calendarId: string;
  options: JobcanImportOptions;
  dates: string[];
}

function newEvent(date: string): NewEventSpec {
  return {
    shiftId: `x:${date}`,
    managedBy: "jobcan-sync",
    date,
    startTime: "09:00",
    endTime: "18:00",
    summary: "シフト 09:00-18:00",
  };
}

/** reconcile 呼び出しを記録する fake。createsPerCall 個の create plan を返す。 */
function fakeReconcile(calls: ReconcileCall[], createsPerCall = 0) {
  return async (
    entries: ShiftEntry[],
    refreshToken: string,
    calendarId: string,
    options: JobcanImportOptions,
  ): Promise<JobcanReconcileResult> => {
    const staffCode = entries[0].staffCode;
    calls.push({
      staffCode,
      refreshToken,
      calendarId,
      options,
      dates: entries.map((e) => e.shift.date),
    });
    const days: JobcanDayResult[] =
      createsPerCall > 0
        ? [
            {
              date: entries[0].shift.date,
              plan: {
                creates: Array.from({ length: createsPerCall }, () =>
                  newEvent(entries[0].shift.date),
                ),
                deleteEventIds: [],
                warnings: [],
              },
              executed: null,
            },
          ]
        : [];
    return {
      staffCode,
      calendarId,
      sourceMonth: entries[0].sourceMonth,
      dryRun: options.dryRun,
      days,
    };
  };
}

function makeDeps(opts: {
  directory: Record<string, string>;
  resolve: (email: string) => Promise<TokenResolution>;
  calls: ReconcileCall[];
  createsPerCall?: number;
}): JobcanImportDeps {
  return {
    staffDirectory: fakeDirectory(opts.directory),
    resolveToken: opts.resolve,
    reconcile: fakeReconcile(opts.calls, opts.createsPerCall ?? 0),
  };
}

const DRY: JobcanImportOptions = { dryRun: true };

const okResolve =
  (tokens: Record<string, string>) =>
  async (email: string): Promise<TokenResolution> => ({
    ok: true,
    refreshToken: tokens[email] ?? "rt-default",
    calendarId: email,
  });

// ---- tests ----------------------------------------------------------------

describe("runJobcanImport: 複数ファイルを集約して reconcileJobcanForAllStaff に渡す", () => {
  it("2ファイル(A0187,B0002)の全 entries が集約され、各人が自分の token/calendar で突合される", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com", B0002: "b@example.com" },
      resolve: okResolve({ "a@example.com": "rt-A", "b@example.com": "rt-B" }),
      calls,
    });
    const files = [
      file("馬場(A0187) 2026年08月度.xlsx", "A0187", [{ day: 1, start: "09:00", end: "18:00" }]),
      file("佐藤(B0002) 2026年08月度.xlsx", "B0002", [{ day: 2, start: "10:00", end: "19:00" }]),
    ];

    const result = await runJobcanImport(files, deps, DRY);

    expect(result.fileErrors).toEqual([]);
    expect(result.reconcile.reconciled.map((r) => r.staffCode).sort()).toEqual([
      "A0187",
      "B0002",
    ]);
    expect(calls).toHaveLength(2);
    const a = calls.find((c) => c.staffCode === "A0187")!;
    const b = calls.find((c) => c.staffCode === "B0002")!;
    expect(a.calendarId).toBe("a@example.com");
    expect(a.refreshToken).toBe("rt-A");
    expect(b.calendarId).toBe("b@example.com");
    expect(b.refreshToken).toBe("rt-B");
    expect(result.summary.totalEntries).toBe(2);
    expect(result.summary.staffCount).toBe(2);
    expect(result.summary.importedFiles).toBe(2);
  });
});

describe("runJobcanImport: 一ファイルの失敗を他ファイル/他人に波及させない(最重要)", () => {
  it("論点4: ファイル名 staffCode とシート内 staffCode 不一致は隔離、他ファイルは継続して reconcile される", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com", B0002: "b@example.com" },
      resolve: okResolve({ "a@example.com": "rt-A", "b@example.com": "rt-B" }),
      calls,
    });
    const files = [
      // ファイル名は B9999 だがシート内 staffCode は A0187 → 取り違えの兆候
      file("誤爆(B9999) 2026年08月度.xlsx", "A0187"),
      file("佐藤(B0002) 2026年08月度.xlsx", "B0002"),
    ];

    const result = await runJobcanImport(files, deps, DRY);

    // 不一致ファイルは fileError に隔離
    expect(result.fileErrors).toHaveLength(1);
    expect(result.fileErrors[0]).toMatchObject({
      fileName: "誤爆(B9999) 2026年08月度.xlsx",
      reason: "staff_code_mismatch",
    });
    // A0187 の entries は集約に載らない(取り違えファイルなので中止)
    expect(result.reconcile.reconciled.map((r) => r.staffCode)).toEqual(["B0002"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].staffCode).toBe("B0002");
    // 取り違えファイルの誤コードで他人カレンダーを触っていない
    expect(calls.some((c) => c.staffCode === "A0187")).toBe(false);
  });

  it("ファイル名パース失敗(年月なし)のファイルだけ隔離、他は継続", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com" },
      resolve: okResolve({ "a@example.com": "rt-A" }),
      calls,
    });
    const files = [
      { fileName: "こわれ.xlsx", rows: makeRows("A0187", "試 太郎", ONE_DAY) },
      file("馬場(A0187) 2026年08月度.xlsx", "A0187"),
    ];

    const result = await runJobcanImport(files, deps, DRY);

    expect(result.fileErrors).toHaveLength(1);
    expect(result.fileErrors[0]).toMatchObject({
      fileName: "こわれ.xlsx",
      reason: "filename_parse_error",
    });
    expect(result.reconcile.reconciled.map((r) => r.staffCode)).toEqual(["A0187"]);
  });

  it("シートパース失敗(staffCode 書式外)のファイルだけ隔離、他は継続", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com" },
      resolve: okResolve({ "a@example.com": "rt-A" }),
      calls,
    });
    // rows[3][2] を書式外にして parseJobcanSheet を throw させる
    const broken = makeRows("XX", "試 太郎", ONE_DAY);
    const files = [
      { fileName: "壊れ(A0187) 2026年08月度.xlsx", rows: broken },
      file("馬場(A0187) 2026年08月度.xlsx", "A0187"),
    ];

    const result = await runJobcanImport(files, deps, DRY);

    expect(result.fileErrors).toHaveLength(1);
    expect(result.fileErrors[0]).toMatchObject({
      fileName: "壊れ(A0187) 2026年08月度.xlsx",
      reason: "sheet_parse_error",
    });
    expect(result.reconcile.reconciled.map((r) => r.staffCode)).toEqual(["A0187"]);
  });
});

describe("runJobcanImport: entries 空(シフト0)ファイルの扱い", () => {
  it("シフト0件のファイルは fileError ではなく 0件成功(集約に載るが entries 0)", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com" },
      resolve: okResolve({ "a@example.com": "rt-A" }),
      calls,
    });
    const files = [file("馬場(A0187) 2026年08月度.xlsx", "A0187", [])];

    const result = await runJobcanImport(files, deps, DRY);

    expect(result.fileErrors).toEqual([]);
    expect(result.summary.importedFiles).toBe(1);
    expect(result.summary.totalEntries).toBe(0);
    // entries が空なので reconcile は 1件も呼ばれない(reconcileJobcanForAllStaff の仕様)
    expect(calls).toHaveLength(0);
    expect(result.reconcile.reconciled).toEqual([]);
  });
});

describe("runJobcanImport: dryRun と集計", () => {
  it("dryRun 指定が reconcile に伝わる", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com" },
      resolve: okResolve({ "a@example.com": "rt-A" }),
      calls,
    });
    await runJobcanImport([file("馬場(A0187) 2026年08月度.xlsx", "A0187")], deps, {
      dryRun: true,
    });
    expect(calls[0].options.dryRun).toBe(true);
  });

  it("dryRun:false も伝わり、totalCreates が plan から集計される", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com" },
      resolve: okResolve({ "a@example.com": "rt-A" }),
      calls,
      createsPerCall: 2,
    });
    const result = await runJobcanImport(
      [file("馬場(A0187) 2026年08月度.xlsx", "A0187")],
      deps,
      { dryRun: false },
    );
    expect(calls[0].options.dryRun).toBe(false);
    expect(result.summary.totalCreates).toBe(2);
    expect(result.summary.totalDeletes).toBe(0);
  });
});

describe("runJobcanImport: 失敗は握りつぶさず構造化して返す", () => {
  it("fileErrors と per-staff warning が両方構造化されて残る", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com" }, // B0002 は未登録
      resolve: okResolve({ "a@example.com": "rt-A" }),
      calls,
    });
    const files = [
      file("馬場(A0187) 2026年08月度.xlsx", "A0187"), // 正常 A0187
      file("佐藤(B0002) 2026年08月度.xlsx", "B0002"), // reconcile 側 warning(未登録)
      { fileName: "no-month.xlsx", rows: makeRows("A0187", "試 太郎", ONE_DAY) }, // fileError
    ];

    const result = await runJobcanImport(files, deps, DRY);

    expect(result.fileErrors).toHaveLength(1);
    expect(result.fileErrors[0].reason).toBe("filename_parse_error");
    expect(result.reconcile.warnings).toHaveLength(1);
    expect(result.reconcile.warnings[0]).toMatchObject({
      staffCode: "B0002",
      reason: "email_not_registered",
    });
    expect(result.summary.erroredFiles).toBe(1);
  });
});

describe("formatJobcanImportSummary: 人間可読・秘密非包含", () => {
  it("fileErrors と warning を文言化し、refreshToken を含めない", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com", B0002: "b@example.com" },
      resolve: async (email) =>
        email === "a@example.com"
          ? { ok: true, refreshToken: "SECRET-TOKEN-XYZ", calendarId: email }
          : { ok: false, reason: "google_not_linked", email },
      calls,
    });
    const files = [
      file("馬場(A0187) 2026年08月度.xlsx", "A0187"),
      file("佐藤(B0002) 2026年08月度.xlsx", "B0002"),
      { fileName: "no-month.xlsx", rows: makeRows("A0187", "試 太郎", ONE_DAY) },
    ];

    const result = await runJobcanImport(files, deps, DRY);
    const text = formatJobcanImportSummary(result);

    // ファイルエラーの文言
    expect(text).toContain("no-month.xlsx");
    // per-staff warning の文言(未連携)。email は運用上載せてよい
    expect(text).toContain("b@example.com");
    // 秘密情報は絶対に載らない
    expect(text).not.toContain("SECRET-TOKEN-XYZ");
  });
});
