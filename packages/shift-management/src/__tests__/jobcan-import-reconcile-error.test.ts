/**
 * 二重防御の検証: runJobcanImport は reconcileJobcanForAllStaff が万一 throw しても
 * 再 throw せず、集約済み fileErrors を保全したまま reconcileError に構造化して返す。
 *
 * per-staff 例外隔離を全レイヤ(名簿 get / resolveToken / reconcile 本体)に入れたため、
 * reconcile-all は実運用でほぼ throw しない。そこで本ファイルは reconcile-all をモックして
 * 「本物の throw」を注入し、runJobcanImport 側の try/catch(二重防御)だけを検証する。
 * モジュールモックは全テストに波及するため、通常経路を使う jobcan-import.test.ts とは分離する。
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../server/jobcan-reconcile-all", () => ({
  reconcileJobcanForAllStaff: vi.fn(async () => {
    throw new Error("reconcile-all backend down");
  }),
}));

import {
  runJobcanImport,
  formatJobcanImportSummary,
  type JobcanImportDeps,
  type JobcanImportFile,
  type JobcanImportOptions,
} from "../server/jobcan-import";
import type { StaffDirectory, StaffDirectoryEntry } from "../server/staff-directory";
import type { TokenResolution } from "../server/jobcan-token-resolver";
import type { JobcanReconcileResult } from "../server/jobcan-pipeline";
import type { ShiftEntry } from "../types";

const DRY: JobcanImportOptions = { dryRun: true };

/** parseJobcanSheet が読める最小の行列(1日ぶん)。 */
function makeRows(staffCode: string, name: string): string[][] {
  return [
    ["2026年8月度"],
    [],
    [],
    [name, "", staffCode, "", "ホール"],
    [],
    [],
    [],
    [],
    ["日付", "", "", "", "", "出勤", "退勤"],
    ["1", "", "", "", "", "09:00", "18:00"],
  ];
}

function file(fileName: string, staffCode: string): JobcanImportFile {
  return { fileName, rows: makeRows(staffCode, "試 太郎"), sheetName: "sheet1" };
}

function fakeDeps(): JobcanImportDeps {
  const directory: StaffDirectory = {
    async get() {
      return "a@example.com";
    },
    async set() {},
    async list(): Promise<StaffDirectoryEntry[]> {
      return [];
    },
    async delete() {},
  };
  return {
    staffDirectory: directory,
    resolveToken: async (email): Promise<TokenResolution> => ({
      ok: true,
      refreshToken: "rt-A",
      calendarId: email,
    }),
    reconcile: async (entries): Promise<JobcanReconcileResult> => {
      const e = entries as ShiftEntry[];
      return {
        staffCode: e[0].staffCode,
        calendarId: "a@example.com",
        sourceMonth: e[0].sourceMonth,
        dryRun: true,
        days: [],
      };
    },
  };
}

describe("runJobcanImport: reconcile-all が万一 throw しても fileErrors を保全(二重防御)", () => {
  it("reconcile-all が throw しても全損せず fileErrors を保全し reconcileError を載せる", async () => {
    const files = [
      { fileName: "no-month.xlsx", rows: makeRows("A0187", "試 太郎") }, // fileError
      file("馬場(A0187) 2026年08月度.xlsx", "A0187"), // entries あり → reconcile-all へ(throw)
    ];

    const result = await runJobcanImport(files, fakeDeps(), DRY);

    // fileErrors は握りつぶさず保全されている。
    expect(result.fileErrors).toHaveLength(1);
    expect(result.fileErrors[0].reason).toBe("filename_parse_error");
    // reconcile 失敗も結果に載る(全損しない)。
    expect(result.reconcileError).toBeDefined();
    expect(result.reconcile.reconciled).toEqual([]);
    expect(result.summary.staffCount).toBe(0);
  });

  it("reconcileError は formatJobcanImportSummary で可視化される", async () => {
    const result = await runJobcanImport(
      [file("馬場(A0187) 2026年08月度.xlsx", "A0187")],
      fakeDeps(),
      DRY,
    );
    const text = formatJobcanImportSummary(result);
    expect(text).toContain("突合");
  });
});
