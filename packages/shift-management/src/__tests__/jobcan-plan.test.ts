import { describe, expect, it } from "vitest";
import { planJobcanEntryUpsert } from "../logic/jobcan-plan";
import type { ExistingEvent } from "../logic/calendar-plan";
import type { ShiftEntry } from "../types";

/** 反映対象の確定シフト1コマ(A0187 / 2026-08-01 09:00-18:00) */
const ENTRY: ShiftEntry = {
  jobcanShiftId: "A0187:2026-08-01",
  staffCode: "A0187",
  staffName: "試 太郎",
  affiliation: "TEST DIV",
  sourceMonth: "2026-08",
  shift: { date: "2026-08-01", startTime: "09:00", endTime: "18:00" },
};

const evt = (o: Partial<ExistingEvent> & { id: string }): ExistingEvent => ({
  date: "2026-08-01",
  startTime: "09:00",
  endTime: "18:00",
  ...o,
});

describe("planJobcanEntryUpsert: ルール3(一致する自タグ無し→create)", () => {
  it("既存が空なら jobcan-sync タグ付きで作成する", () => {
    const plan = planJobcanEntryUpsert(ENTRY, []);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).toEqual({
      shiftId: "A0187:2026-08-01",
      managedBy: "jobcan-sync",
      date: "2026-08-01",
      startTime: "09:00",
      endTime: "18:00",
      summary: "シフト 09:00-18:00",
    });
    expect(plan.warnings).toEqual([]);
  });
});

describe("planJobcanEntryUpsert: ルール1(冪等skip)", () => {
  it("自タグ+shiftId一致+時刻一致なら create/delete なし", () => {
    const existing = [
      evt({
        id: "self1",
        shiftId: "A0187:2026-08-01",
        managedBy: "jobcan-sync",
        startTime: "09:00",
        endTime: "18:00",
      }),
    ];
    const plan = planJobcanEntryUpsert(ENTRY, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).toBeNull();
    expect(plan.warnings).toEqual([]);
  });

  it("同じ entry を2回計画しても2回目は skip(冪等)", () => {
    // 1回目: create された想定のイベントを existing に積む
    const first = planJobcanEntryUpsert(ENTRY, []);
    expect(first.create).not.toBeNull();
    const nowExisting = [
      evt({
        id: "created",
        shiftId: first.create!.shiftId,
        managedBy: first.create!.managedBy,
        startTime: first.create!.startTime,
        endTime: first.create!.endTime,
      }),
    ];
    // 2回目: 同一内容が既にあるので skip
    const second = planJobcanEntryUpsert(ENTRY, nowExisting);
    expect(second.deleteEventIds).toEqual([]);
    expect(second.create).toBeNull();
    expect(second.warnings).toEqual([]);
  });
});

describe("planJobcanEntryUpsert: ルール2(自タグ時刻違い→delete+create)", () => {
  it("自タグ shiftId 一致だが時刻が違えば旧を消して新を作る", () => {
    const existing = [
      evt({
        id: "old",
        shiftId: "A0187:2026-08-01",
        managedBy: "jobcan-sync",
        startTime: "10:00",
        endTime: "19:00",
      }),
    ];
    const plan = planJobcanEntryUpsert(ENTRY, existing);
    expect(plan.deleteEventIds).toEqual(["old"]);
    expect(plan.create).not.toBeNull();
    expect(plan.create?.startTime).toBe("09:00");
    expect(plan.warnings).toEqual([]);
  });
});

describe("planJobcanEntryUpsert: ルール4(管理外は絶対 delete しない)", () => {
  it("無タグ(managedBy未設定)の同時刻帯予定は消さず create + warning", () => {
    const existing = [evt({ id: "manual" })]; // managedBy 無し, 同スロット
    const plan = planJobcanEntryUpsert(ENTRY, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).not.toBeNull();
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain("管理外");
  });

  it("他ツール(shift-management)の同時刻帯予定も消さず warning", () => {
    const existing = [
      evt({ id: "other", managedBy: "shift-management" }),
    ];
    const plan = planJobcanEntryUpsert(ENTRY, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).not.toBeNull();
    expect(plan.warnings).toHaveLength(1);
  });

  it("当ツールの shiftId を持つが managedBy が別(shift-management)なら delete せず作成+warning", () => {
    // shiftId は一致しても自タグ(jobcan-sync)でなければ掃除対象にしない
    const existing = [
      evt({
        id: "notmine",
        shiftId: "A0187:2026-08-01",
        managedBy: "shift-management",
      }),
    ];
    const plan = planJobcanEntryUpsert(ENTRY, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).not.toBeNull();
    expect(plan.warnings).toHaveLength(1);
  });

  it("管理外予定が別時刻帯なら warning は出ない(create のみ)", () => {
    const existing = [
      evt({ id: "manual", startTime: "20:00", endTime: "23:00" }),
    ];
    const plan = planJobcanEntryUpsert(ENTRY, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).not.toBeNull();
    expect(plan.warnings).toEqual([]);
  });
});

describe("planJobcanEntryUpsert: ルール2+ルール4 複合", () => {
  it("自タグ時刻違いを delete しつつ同スロットの管理外予定には warning を立てる", () => {
    const existing = [
      // 自タグ・shiftId一致・時刻違い → delete 対象
      evt({
        id: "self-old",
        shiftId: "A0187:2026-08-01",
        managedBy: "jobcan-sync",
        startTime: "10:00",
        endTime: "19:00",
      }),
      // 管理外・新スロット(09:00-18:00)と同一 → delete せず warning
      evt({ id: "manual", startTime: "09:00", endTime: "18:00" }),
    ];
    const plan = planJobcanEntryUpsert(ENTRY, existing);
    expect(plan.deleteEventIds).toEqual(["self-old"]);
    expect(plan.create).not.toBeNull();
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain("管理外");
  });
});

describe("planJobcanEntryUpsert: 時刻正規化(呼び出し側のゼロ埋めに依存しない)", () => {
  it("非ゼロ埋め(9:00)でも正しく比較し辞書順の誤判定をしない", () => {
    const entry: ShiftEntry = {
      ...ENTRY,
      shift: { date: "2026-08-01", startTime: "9:00", endTime: "18:00" },
    };
    const plan = planJobcanEntryUpsert(entry, []);
    // "9:00" < "18:00" の辞書比較なら異常扱いされてしまうが、正規化で正常作成される
    expect(plan.create).not.toBeNull();
    expect(plan.create?.startTime).toBe("09:00");
    expect(plan.create?.endTime).toBe("18:00");
    expect(plan.warnings).toEqual([]);
  });

  it("非ゼロ埋めの既存自タグと一致すれば冪等 skip する", () => {
    const entry: ShiftEntry = {
      ...ENTRY,
      shift: { date: "2026-08-01", startTime: "9:00", endTime: "18:00" },
    };
    const existing = [
      evt({
        id: "self",
        shiftId: "A0187:2026-08-01",
        managedBy: "jobcan-sync",
        startTime: "09:00",
        endTime: "18:00",
      }),
    ];
    const plan = planJobcanEntryUpsert(entry, existing);
    expect(plan.create).toBeNull();
    expect(plan.deleteEventIds).toEqual([]);
  });
});

describe("planJobcanEntryUpsert: ルール5(終了<=開始はデータ異常として loud)", () => {
  it("終了が開始より前ならイベントを作らず warning を積む", () => {
    const nightCross: ShiftEntry = {
      ...ENTRY,
      shift: { date: "2026-08-07", startTime: "22:00", endTime: "05:00" },
    };
    const plan = planJobcanEntryUpsert(nightCross, []);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).toBeNull();
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain("22:00");
    expect(plan.warnings[0]).toContain("05:00");
  });

  it("0分シフト(終了==開始, 9:00-9:00)も異常として生成せず warning", () => {
    const zeroDur: ShiftEntry = {
      ...ENTRY,
      shift: { date: "2026-08-01", startTime: "09:00", endTime: "09:00" },
    };
    const plan = planJobcanEntryUpsert(zeroDur, []);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).toBeNull();
    expect(plan.warnings).toHaveLength(1);
  });

  it("異常entryでも既存の同shiftId自タグイベントは delete せず放置+warning", () => {
    const zeroDur: ShiftEntry = {
      ...ENTRY,
      shift: { date: "2026-08-01", startTime: "09:00", endTime: "09:00" },
    };
    const existing = [
      evt({
        id: "self-old",
        shiftId: "A0187:2026-08-01",
        managedBy: "jobcan-sync",
        startTime: "10:00",
        endTime: "19:00",
      }),
    ];
    const plan = planJobcanEntryUpsert(zeroDur, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).toBeNull();
    expect(plan.warnings).toHaveLength(1);
  });
});
