import { describe, expect, it } from "vitest";
import {
  runJobcanReconcile,
  type JobcanCalendarPort,
} from "../server/jobcan-pipeline";
import type { ExistingEvent } from "../logic/calendar-plan";
import type { JobcanDayContext, JobcanDayPlan } from "../logic/jobcan-plan";
import type { ShiftEntry } from "../types";

const STAFF = "A0187";
const MONTH = "2026-08";

function entry(
  d: string,
  start = "09:00",
  end = "18:00",
  code: string = STAFF,
  month: string = MONTH,
): ShiftEntry {
  return {
    jobcanShiftId: `${code}:${d}`,
    staffCode: code,
    staffName: "試 太郎",
    sourceMonth: month,
    shift: { date: d, startTime: start, endTime: end },
  };
}

function selfEvt(id: string, date: string, start: string, end: string): ExistingEvent {
  return {
    id,
    shiftId: `${STAFF}:${date}`,
    managedBy: "jobcan-sync",
    date,
    startTime: start,
    endTime: end,
  };
}

function foreignEvt(id: string, date: string, start: string, end: string): ExistingEvent {
  return { id, date, startTime: start, endTime: end };
}

interface Recorder {
  port: JobcanCalendarPort;
  listCalls: { startDate: string; endDate: string }[];
  execCalls: { ctx: JobcanDayContext; plan: JobcanDayPlan }[];
}

/** listEventsForRange は range に関わらず渡した existing 全件を返す(スコープ分割は本体責務) */
function makeFakePort(existing: ExistingEvent[]): Recorder {
  const listCalls: { startDate: string; endDate: string }[] = [];
  const execCalls: { ctx: JobcanDayContext; plan: JobcanDayPlan }[] = [];
  const port: JobcanCalendarPort = {
    async listEventsForRange(_rt, _cid, startDate, endDate) {
      listCalls.push({ startDate, endDate });
      return existing;
    },
    async executeDayPlan(_rt, _cid, ctx, plan) {
      execCalls.push({ ctx, plan });
      return {
        deletedCount: plan.deleteEventIds.length,
        createdEventIds: plan.creates.map((_, i) => `new-${ctx.date}-${i}`),
        skippedMismatch: 0,
        skippedGone: 0,
      };
    },
  };
  return { port, listCalls, execCalls };
}

const OPT = { dryRun: false };

describe("runJobcanReconcile: guard2 部分取込でマス削除しない(最重要回帰)", () => {
  it("entriesが8/1,8/2のみなら8/3の自タグexistingがあっても8/3にplanを呼ばない", async () => {
    const existing = [selfEvt("aug3-self", "2026-08-03", "09:00", "18:00")];
    const { port, execCalls } = makeFakePort(existing);
    const entries = [entry("2026-08-01"), entry("2026-08-02")];

    const result = await runJobcanReconcile(entries, "rt", "cal", OPT, port);

    const execDates = execCalls.map((c) => c.ctx.date).sort();
    expect(execDates).toEqual(["2026-08-01", "2026-08-02"]); // 8/3 は絶対に来ない
    // aug3-self はどの delete 計画にも入らない
    const allDeletes = execCalls.flatMap((c) => c.plan.deleteEventIds);
    expect(allDeletes).not.toContain("aug3-self");
    expect(result.days.map((d) => d.date).sort()).toEqual([
      "2026-08-01",
      "2026-08-02",
    ]);
  });
});

describe("runJobcanReconcile: レンジ算出", () => {
  it("取込レンジは entries の min..max(締め日スピルオーバ 7/21〜8/20 を全カバー)", async () => {
    const { port, listCalls } = makeFakePort([]);
    const entries = [entry("2026-08-20"), entry("2026-07-21")];

    await runJobcanReconcile(entries, "rt", "cal", OPT, port);

    expect(listCalls).toEqual([
      { startDate: "2026-07-21", endDate: "2026-08-20" },
    ]);
  });
});

describe("runJobcanReconcile: 当日スコープ", () => {
  it("planに渡る既存は当日分のみ。他日の自タグは巻き込まない", async () => {
    const existing = [
      selfEvt("old1", "2026-08-01", "08:00", "12:00"), // 8/1 旧slot
      selfEvt("keep2", "2026-08-02", "09:00", "18:00"), // 8/2 別日
    ];
    const { port, execCalls } = makeFakePort(existing);
    const entries = [entry("2026-08-01", "09:00", "12:00")]; // 8/1 のみ、slot変更

    await runJobcanReconcile(entries, "rt", "cal", OPT, port);

    expect(execCalls).toHaveLength(1);
    expect(execCalls[0].ctx.date).toBe("2026-08-01");
    expect(execCalls[0].plan.deleteEventIds).toEqual(["old1"]); // 8/1 の旧だけ
    expect(execCalls[0].plan.creates).toHaveLength(1);
    // keep2(8/2)はどこでも触られない
    const allDeletes = execCalls.flatMap((c) => c.plan.deleteEventIds);
    expect(allDeletes).not.toContain("keep2");
  });
});

describe("runJobcanReconcile: dryRun", () => {
  it("dryRun=true なら executeDayPlan を呼ばず executed は全て null", async () => {
    const { port, execCalls } = makeFakePort([]);
    const entries = [entry("2026-08-01"), entry("2026-08-02")];

    const result = await runJobcanReconcile(entries, "rt", "cal", { dryRun: true }, port);

    expect(execCalls).toHaveLength(0); // 呼ばれない
    expect(result.dryRun).toBe(true);
    expect(result.days.every((d) => d.executed === null)).toBe(true);
    expect(result.days.every((d) => d.plan !== undefined)).toBe(true);
  });
});

describe("runJobcanReconcile: per-day error は他日継続", () => {
  it("ある日で executeDayPlan が throw しても他日は処理し error を収集する", async () => {
    const port: JobcanCalendarPort = {
      async listEventsForRange() {
        return [];
      },
      async executeDayPlan(_rt, _cid, ctx, plan) {
        if (ctx.date === "2026-08-01") throw new Error("boom 8/1");
        return {
          deletedCount: plan.deleteEventIds.length,
          createdEventIds: [],
          skippedMismatch: 0,
          skippedGone: 0,
        };
      },
    };
    const entries = [entry("2026-08-01"), entry("2026-08-02")];

    const result = await runJobcanReconcile(entries, "rt", "cal", OPT, port);

    const day1 = result.days.find((d) => d.date === "2026-08-01")!;
    const day2 = result.days.find((d) => d.date === "2026-08-02")!;
    expect(day1.error).toContain("boom");
    expect(day1.executed).toBeNull();
    expect(day2.error).toBeUndefined();
    expect(day2.executed).not.toBeNull();
  });
});

describe("runJobcanReconcile: reconcileRemovals", () => {
  it("既定(false)では entries に無い日の空日削除をしない", async () => {
    const existing = [selfEvt("gap", "2026-08-02", "09:00", "18:00")];
    const { port, execCalls } = makeFakePort(existing);
    const entries = [entry("2026-08-01"), entry("2026-08-03")]; // 8/2 は欠番

    await runJobcanReconcile(entries, "rt", "cal", OPT, port);

    expect(execCalls.map((c) => c.ctx.date)).not.toContain("2026-08-02");
  });

  it("true なら レンジ内・自タグ有りの欠番日だけ空日削除する", async () => {
    const existing = [selfEvt("gap", "2026-08-02", "09:00", "18:00")];
    const { port, execCalls } = makeFakePort(existing);
    const entries = [entry("2026-08-01"), entry("2026-08-03")]; // range 8/1..8/3、8/2 欠番

    await runJobcanReconcile(
      entries,
      "rt",
      "cal",
      { dryRun: false, reconcileRemovals: true },
      port,
    );

    const gapCall = execCalls.find((c) => c.ctx.date === "2026-08-02");
    expect(gapCall).toBeDefined();
    expect(gapCall!.plan.deleteEventIds).toEqual(["gap"]); // 空日削除
    expect(gapCall!.plan.creates).toHaveLength(0);
  });

  it("true でもレンジ外の自タグは絶対に触らない", async () => {
    const existing = [selfEvt("outside", "2026-08-05", "09:00", "18:00")];
    const { port, execCalls } = makeFakePort(existing);
    const entries = [entry("2026-08-01"), entry("2026-08-03")]; // range 8/1..8/3

    await runJobcanReconcile(
      entries,
      "rt",
      "cal",
      { dryRun: false, reconcileRemovals: true },
      port,
    );

    expect(execCalls.map((c) => c.ctx.date)).not.toContain("2026-08-05");
  });

  it("true でも自タグ無し(管理外のみ)の欠番日は触らない", async () => {
    const existing = [foreignEvt("manual", "2026-08-02", "09:00", "18:00")];
    const { port, execCalls } = makeFakePort(existing);
    const entries = [entry("2026-08-01"), entry("2026-08-03")];

    await runJobcanReconcile(
      entries,
      "rt",
      "cal",
      { dryRun: false, reconcileRemovals: true },
      port,
    );

    expect(execCalls.map((c) => c.ctx.date)).not.toContain("2026-08-02");
  });
});

describe("runJobcanReconcile: fail-loud", () => {
  it("複数 staffCode が混在すれば throw", async () => {
    const { port } = makeFakePort([]);
    const entries = [
      entry("2026-08-01", "09:00", "18:00", "A0187"),
      entry("2026-08-02", "09:00", "18:00", "B0002"),
    ];
    await expect(
      runJobcanReconcile(entries, "rt", "cal", OPT, port),
    ).rejects.toThrow();
  });

  it("複数 sourceMonth が混在すれば throw", async () => {
    const { port } = makeFakePort([]);
    const entries = [
      entry("2026-08-01", "09:00", "18:00", "A0187", "2026-08"),
      entry("2026-09-01", "09:00", "18:00", "A0187", "2026-09"),
    ];
    await expect(
      runJobcanReconcile(entries, "rt", "cal", OPT, port),
    ).rejects.toThrow();
  });
});

describe("runJobcanReconcile: 空entries", () => {
  it("空なら no-op で fetch すらしない(マス削除の起点を作らない)", async () => {
    const { port, listCalls, execCalls } = makeFakePort([
      selfEvt("x", "2026-08-01", "09:00", "18:00"),
    ]);

    const result = await runJobcanReconcile([], "rt", "cal", OPT, port);

    expect(listCalls).toHaveLength(0); // fetch しない
    expect(execCalls).toHaveLength(0);
    expect(result.days).toEqual([]);
  });
});
