import { describe, expect, it } from "vitest";
import {
  reconcileJobcanForAllStaff,
  describeStaffSkipReason,
  type JobcanReconcileAllDeps,
} from "../server/jobcan-reconcile-all";
import type { StaffDirectory, StaffDirectoryEntry } from "../server/staff-directory";
import type { TokenResolution } from "../server/jobcan-token-resolver";
import type { JobcanReconcileResult } from "../server/jobcan-pipeline";
import type { ShiftEntry } from "../types";

const MONTH = "2026-08";

function entry(staffCode: string, date: string): ShiftEntry {
  return {
    jobcanShiftId: `${staffCode}:${date}`,
    staffCode,
    staffName: "試 太郎",
    sourceMonth: MONTH,
    shift: { date, startTime: "09:00", endTime: "18:00" },
  };
}

/** staffCode -> email の fake(get だけ使う) */
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
  dates: string[];
}

/** reconcile 呼び出しを記録する fake。呼ばれた分だけ結果を返す */
function fakeReconcile(calls: ReconcileCall[]) {
  return async (
    entries: ShiftEntry[],
    refreshToken: string,
    calendarId: string,
  ): Promise<JobcanReconcileResult> => {
    const staffCode = entries[0].staffCode;
    calls.push({
      staffCode,
      refreshToken,
      calendarId,
      dates: entries.map((e) => e.shift.date),
    });
    return {
      staffCode,
      calendarId,
      sourceMonth: MONTH,
      dryRun: false,
      days: [],
    };
  };
}

function makeDeps(opts: {
  directory: Record<string, string>;
  resolve: (email: string) => Promise<TokenResolution>;
  calls: ReconcileCall[];
}): JobcanReconcileAllDeps {
  return {
    staffDirectory: fakeDirectory(opts.directory),
    resolveToken: opts.resolve,
    reconcile: fakeReconcile(opts.calls),
  };
}

describe("reconcileJobcanForAllStaff: 解決できた人だけ突合、できない人は warning", () => {
  it("解決成功した人は reconcile 実行、自分の email/token で呼ばれる", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com" },
      resolve: async (email) => ({ ok: true, refreshToken: "rt-A", calendarId: email }),
      calls,
    });
    const entries = [entry("A0187", "2026-08-01"), entry("A0187", "2026-08-02")];

    const result = await reconcileJobcanForAllStaff(entries, deps);

    expect(result.reconciled).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      staffCode: "A0187",
      refreshToken: "rt-A",
      calendarId: "a@example.com",
    });
  });

  it("StaffDirectory 未登録は email_not_registered で warning、reconcile しない", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: {},
      resolve: async () => {
        throw new Error("resolve should not be called");
      },
      calls,
    });
    const result = await reconcileJobcanForAllStaff([entry("A0187", "2026-08-01")], deps);

    expect(calls).toHaveLength(0);
    expect(result.reconciled).toHaveLength(0);
    expect(result.warnings).toEqual([
      expect.objectContaining({ staffCode: "A0187", reason: "email_not_registered" }),
    ]);
  });

  it("Slack未在籍は slack_not_found で warning、reconcile しない", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com" },
      resolve: async (email) => ({ ok: false, reason: "slack_not_found", email }),
      calls,
    });
    const result = await reconcileJobcanForAllStaff([entry("A0187", "2026-08-01")], deps);

    expect(calls).toHaveLength(0);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        staffCode: "A0187",
        email: "a@example.com",
        reason: "slack_not_found",
      }),
    ]);
  });

  it("Google未連携は google_not_linked で warning、reconcile しない", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com" },
      resolve: async (email) => ({ ok: false, reason: "google_not_linked", email }),
      calls,
    });
    const result = await reconcileJobcanForAllStaff([entry("A0187", "2026-08-01")], deps);

    expect(calls).toHaveLength(0);
    expect(result.warnings[0].reason).toBe("google_not_linked");
  });
});

describe("reconcileJobcanForAllStaff: 一人の失敗を他人に波及させない(最重要ガード)", () => {
  it("B が未連携でも A は自分の calendar/token で突合され、B の失敗は warning に隔離", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com", B0002: "b@example.com" },
      resolve: async (email) =>
        email === "a@example.com"
          ? { ok: true, refreshToken: "rt-A", calendarId: email }
          : { ok: false, reason: "google_not_linked", email },
      calls,
    });
    const entries = [
      entry("A0187", "2026-08-01"),
      entry("B0002", "2026-08-01"),
      entry("A0187", "2026-08-02"),
    ];

    const result = await reconcileJobcanForAllStaff(entries, deps);

    // reconcile は A の1回だけ。B の calendar/token では絶対に呼ばれない。
    expect(calls).toHaveLength(1);
    expect(calls[0].staffCode).toBe("A0187");
    expect(calls[0].calendarId).toBe("a@example.com");
    expect(calls[0].refreshToken).toBe("rt-A");
    // A の entries だけ(B の日を混ぜない)
    expect(calls[0].dates.sort()).toEqual(["2026-08-01", "2026-08-02"]);
    // どの reconcile 呼び出しも B の calendar を触っていない
    expect(calls.some((c) => c.calendarId === "b@example.com")).toBe(false);
    expect(calls.some((c) => c.refreshToken === "rt-A" && c.staffCode === "B0002")).toBe(
      false,
    );
    // B は warning に隔離
    expect(result.reconciled.map((r) => r.staffCode)).toEqual(["A0187"]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ staffCode: "B0002", reason: "google_not_linked" }),
    ]);
  });

  it("reconcile 本体が throw(=カレンダーI/O障害)しても他人は処理され、その人だけ reconcile_error に隔離", async () => {
    const calls: ReconcileCall[] = [];
    const deps: JobcanReconcileAllDeps = {
      staffDirectory: fakeDirectory({ A0187: "a@example.com", B0002: "b@example.com" }),
      resolveToken: async (email) => ({
        ok: true,
        refreshToken: email === "a@example.com" ? "rt-A" : "rt-B",
        calendarId: email,
      }),
      // A の reconcile だけ throw、B は正常に記録する。
      reconcile: async (entries, refreshToken, calendarId) => {
        const staffCode = entries[0].staffCode;
        if (staffCode === "A0187") throw new Error("calendar api down");
        calls.push({
          staffCode,
          refreshToken,
          calendarId,
          dates: entries.map((e) => e.shift.date),
        });
        return { staffCode, calendarId, sourceMonth: MONTH, dryRun: false, days: [] };
      },
    };
    const entries = [entry("A0187", "2026-08-01"), entry("B0002", "2026-08-01")];

    const result = await reconcileJobcanForAllStaff(entries, deps);

    // A が throw しても B は最後まで処理される(全体 reject しない)。
    expect(result.reconciled.map((r) => r.staffCode)).toEqual(["B0002"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].staffCode).toBe("B0002");
    // A だけ reconcile_error の warning に隔離。
    const aWarn = result.warnings.find((w) => w.staffCode === "A0187");
    expect(aWarn).toBeDefined();
    expect(aWarn!.reason).toBe("reconcile_error");
    // 秘密情報(token)は warning 文言に載らない。
    expect(aWarn!.message).not.toContain("rt-A");
  });

  it("staffDirectory.get が throw(=DB障害)しても他人は処理され、その人だけ directory_error に隔離", async () => {
    const calls: ReconcileCall[] = [];
    // B の名簿引き当てだけ throw、A は正常に email を返す。
    const throwingDirectory: StaffDirectory = {
      async get(staffCode) {
        if (staffCode === "B0002") throw new Error("db connection reset");
        return staffCode === "A0187" ? "a@example.com" : null;
      },
      async set() {},
      async list(): Promise<StaffDirectoryEntry[]> {
        return [];
      },
      async delete() {},
    };
    const deps: JobcanReconcileAllDeps = {
      staffDirectory: throwingDirectory,
      resolveToken: async (email) => ({ ok: true, refreshToken: "rt-A", calendarId: email }),
      reconcile: fakeReconcile(calls),
    };
    const entries = [entry("A0187", "2026-08-01"), entry("B0002", "2026-08-01")];

    const result = await reconcileJobcanForAllStaff(entries, deps);

    // B が throw しても A は最後まで処理される(全体 reject しない)。
    expect(result.reconciled.map((r) => r.staffCode)).toEqual(["A0187"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].staffCode).toBe("A0187");
    // B だけ directory_error の warning に隔離(email 未登録=null とは別扱い)。
    const bWarn = result.warnings.find((w) => w.staffCode === "B0002");
    expect(bWarn).toBeDefined();
    expect(bWarn!.reason).toBe("directory_error");
  });

  it("directory_error の warning は staffCode を含み token を含まない", async () => {
    const throwingDirectory: StaffDirectory = {
      async get() {
        throw new Error("db down");
      },
      async set() {},
      async list(): Promise<StaffDirectoryEntry[]> {
        return [];
      },
      async delete() {},
    };
    const deps: JobcanReconcileAllDeps = {
      staffDirectory: throwingDirectory,
      resolveToken: async (email) => ({ ok: true, refreshToken: "rt-secret", calendarId: email }),
      reconcile: fakeReconcile([]),
    };

    const result = await reconcileJobcanForAllStaff([entry("A0187", "2026-08-01")], deps);

    const aWarn = result.warnings.find((w) => w.staffCode === "A0187");
    expect(aWarn).toBeDefined();
    expect(aWarn!.reason).toBe("directory_error");
    expect(aWarn!.message).toContain("A0187");
    expect(aWarn!.message).not.toContain("rt-secret");
  });

  it("resolveToken が throw(=Slack API障害)しても他人を巻き込まず、その人だけ warning 化", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com", B0002: "b@example.com" },
      resolve: async (email) => {
        if (email === "b@example.com") throw new Error("slack api down");
        return { ok: true, refreshToken: "rt-A", calendarId: email };
      },
      calls,
    });
    const entries = [entry("A0187", "2026-08-01"), entry("B0002", "2026-08-01")];

    const result = await reconcileJobcanForAllStaff(entries, deps);

    expect(result.reconciled.map((r) => r.staffCode)).toEqual(["A0187"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].staffCode).toBe("A0187");
    const bWarn = result.warnings.find((w) => w.staffCode === "B0002");
    expect(bWarn).toBeDefined();
    expect(bWarn!.reason).toBe("resolve_error");
  });
});

describe("reconcileJobcanForAllStaff: 空入力", () => {
  it("空 entries は reconcile も resolve もせず空結果", async () => {
    const calls: ReconcileCall[] = [];
    const deps = makeDeps({
      directory: { A0187: "a@example.com" },
      resolve: async () => {
        throw new Error("should not resolve");
      },
      calls,
    });
    const result = await reconcileJobcanForAllStaff([], deps);
    expect(result.reconciled).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("describeStaffSkipReason: reason→日本語(2-7用)", () => {
  it("email_not_registered", () => {
    const m = describeStaffSkipReason("email_not_registered", { staffCode: "A0187", email: null });
    expect(m).toContain("A0187");
  });
  it("slack_not_found は email を含む", () => {
    const m = describeStaffSkipReason("slack_not_found", {
      staffCode: "A0187",
      email: "a@example.com",
    });
    expect(m).toContain("a@example.com");
  });
  it("resolve_error", () => {
    const m = describeStaffSkipReason("resolve_error", { staffCode: "B0002", email: "b@example.com" });
    expect(m).toContain("B0002");
  });
  it("directory_error は staffCode を含み token を含まない", () => {
    const m = describeStaffSkipReason("directory_error", {
      staffCode: "B0002",
      email: null,
    });
    expect(m).toContain("B0002");
    expect(m).not.toContain("rt-");
  });
  it("reconcile_error は staffCode を含み token を含まない", () => {
    const m = describeStaffSkipReason("reconcile_error", {
      staffCode: "A0187",
      email: "a@example.com",
    });
    expect(m).toContain("A0187");
    expect(m).not.toContain("rt-");
  });
});
