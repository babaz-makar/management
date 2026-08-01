import { describe, expect, it } from "vitest";
import {
  planCalendarUpsert,
  type ExistingEvent,
} from "../logic/calendar-plan";
import type { ShiftChange } from "../types";

/** 実サンプル相当の modify 変更（6/30 16-22 → 12-18） */
const MODIFY: ShiftChange = {
  id: "1750900000.000200:0",
  kind: "modify",
  slackUserId: "U012ABCDEF",
  before: { date: "2026-06-30", startTime: "16:00", endTime: "22:00" },
  after: { date: "2026-06-30", startTime: "12:00", endTime: "18:00" },
  reason: "定例等があるため",
  sourceMessageTs: "1750900000.000200",
  channelId: "C0SHIFTCH",
};

const evt = (o: Partial<ExistingEvent> & { id: string }): ExistingEvent => ({
  date: "2026-06-30",
  startTime: "16:00",
  endTime: "22:00",
  ...o,
});

describe("planCalendarUpsert: 作成内容", () => {
  it("変更後シフトを shiftId 付きで作成する", () => {
    const plan = planCalendarUpsert(MODIFY, []);
    expect(plan.create).toEqual({
      shiftId: "U012ABCDEF:2026-06-30",
      managedBy: "shift-management",
      date: "2026-06-30",
      startTime: "12:00",
      endTime: "18:00",
      summary: "SHO-SANシフト",
      description: "定例等があるため",
    });
  });
});

describe("planCalendarUpsert: 削除候補の安全判定", () => {
  it("shiftId が一致しても変更前の時間帯と違う予定は消さない（同定は時間のみ）", () => {
    const existing = [
      // 当ツールが作った同日の別シフト（9:00-15:00）。before は 16:00-22:00
      evt({
        id: "otherShift",
        shiftId: "U012ABCDEF:2026-06-30",
        startTime: "09:00",
        endTime: "15:00",
      }),
    ];
    const plan = planCalendarUpsert(MODIFY, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.warnings[0]).toContain("見つかりません");
  });

  it("時間が一致すればタイトル無関係に同一シフトとみなす", () => {
    // ExistingEvent はタイトルを持たない = 判定に使えない、を型で担保
    const existing = [evt({ id: "手動で作った別名の予定" })];
    const plan = planCalendarUpsert(MODIFY, existing);
    expect(plan.deleteEventIds).toEqual(["手動で作った別名の予定"]);
  });

  it("shiftId 一致の既存イベントがあればそれを削除する（同時間帯の他予定は残す）", () => {
    const existing = [
      evt({ id: "managed1", shiftId: "U012ABCDEF:2026-06-30" }),
      // 紛らわしい同時間帯の別予定があっても shiftId 側だけ消す
      evt({ id: "other", startTime: "16:00", endTime: "22:00" }),
    ];
    const plan = planCalendarUpsert(MODIFY, existing);
    expect(plan.deleteEventIds).toEqual(["managed1"]);
    expect(plan.warnings).toEqual([]);
  });

  it("shiftId 無し・変更前の時間帯に1件だけ一致すれば削除する", () => {
    const existing = [evt({ id: "e1" })]; // 6/30 16:00-22:00
    const plan = planCalendarUpsert(MODIFY, existing);
    expect(plan.deleteEventIds).toEqual(["e1"]);
    expect(plan.warnings).toEqual([]);
  });

  it("一致0件なら削除せず、手動削除を促す警告を出す", () => {
    const existing = [evt({ id: "x", startTime: "09:00", endTime: "15:00" })];
    const plan = planCalendarUpsert(MODIFY, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).not.toBeNull(); // 新予定は作る
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain("見つかりません");
  });

  it("一致複数件なら削除を見送り、件数入りの警告を出す", () => {
    const existing = [evt({ id: "a" }), evt({ id: "b" })];
    const plan = planCalendarUpsert(MODIFY, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).not.toBeNull();
    expect(plan.warnings[0]).toContain("2件");
  });

  it("shiftId 一致が複数あれば当ツール管理分として全て掃除する", () => {
    const existing = [
      evt({ id: "dup1", shiftId: "U012ABCDEF:2026-06-30" }),
      evt({ id: "dup2", shiftId: "U012ABCDEF:2026-06-30" }),
    ];
    const plan = planCalendarUpsert(MODIFY, existing);
    expect(plan.deleteEventIds).toEqual(["dup1", "dup2"]);
    expect(plan.warnings).toEqual([]);
  });
});

describe("planCalendarUpsert: kind 別のふるまい", () => {
  it("add は削除を探さず作成のみ", () => {
    const add: ShiftChange = {
      ...MODIFY,
      kind: "add",
      before: undefined,
    };
    // before と同時間帯の予定があっても消さない
    const plan = planCalendarUpsert(add, [evt({ id: "keep" })]);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).not.toBeNull();
    expect(plan.warnings).toEqual([]);
  });

  it("cancel は一致予定を削除し、作成しない", () => {
    const cancel: ShiftChange = {
      ...MODIFY,
      kind: "cancel",
      after: undefined,
    };
    const plan = planCalendarUpsert(cancel, [evt({ id: "e1" })]);
    expect(plan.deleteEventIds).toEqual(["e1"]);
    expect(plan.create).toBeNull();
    expect(plan.warnings).toEqual([]);
  });

  it("cancel で対象が無ければ「すでに取消済み」として警告なし（冪等）", () => {
    const cancel: ShiftChange = {
      ...MODIFY,
      kind: "cancel",
      after: undefined,
    };
    const plan = planCalendarUpsert(cancel, []);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).toBeNull();
    expect(plan.warnings).toEqual([]);
  });
});

describe("planCalendarUpsert: 冪等性（重複防止）", () => {
  it("modify: 変更後と同じ shiftId+時間帯のイベントが既にあれば何もしない", () => {
    const existing = [
      evt({
        id: "already",
        shiftId: "U012ABCDEF:2026-06-30",
        startTime: "12:00",
        endTime: "18:00",
      }),
    ];
    const plan = planCalendarUpsert(MODIFY, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).toBeNull();
    expect(plan.warnings).toEqual([]);
  });

  it("変更後の予定が既にあっても、変更前の予定が残っていれば削除する", () => {
    // 前回の実行が「作成だけ成功」した状態。ここで消さないと元の予定が残り続ける
    const existing = [
      evt({
        id: "newAlreadyCreated",
        shiftId: "U012ABCDEF:2026-06-30",
        startTime: "12:00",
        endTime: "18:00",
      }),
      evt({ id: "oldLeftOver" }), // 6/30 16:00-22:00
    ];
    const plan = planCalendarUpsert(MODIFY, existing);
    expect(plan.deleteEventIds).toEqual(["oldLeftOver"]);
    expect(plan.create).toBeNull(); // 二重作成はしない
    expect(plan.warnings).toEqual([]);
  });

  it("add: 同じ shiftId+時間帯のイベントが既にあればスキップ", () => {
    const add: ShiftChange = {
      ...MODIFY,
      kind: "add",
      before: undefined,
    };
    const existing = [
      evt({
        id: "already",
        shiftId: "U012ABCDEF:2026-06-30",
        startTime: "12:00",
        endTime: "18:00",
      }),
    ];
    const plan = planCalendarUpsert(add, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.create).toBeNull();
    expect(plan.warnings).toEqual([]);
  });

  it("modify: shiftId は一致するが時間帯が違えば通常通り置き換える", () => {
    const existing = [
      evt({
        id: "old",
        shiftId: "U012ABCDEF:2026-06-30",
        startTime: "16:00",
        endTime: "22:00",
      }),
    ];
    const plan = planCalendarUpsert(MODIFY, existing);
    expect(plan.deleteEventIds).toEqual(["old"]);
    expect(plan.create).not.toBeNull();
    expect(plan.warnings).toEqual([]);
  });
});

describe("planCalendarUpsert: 理由なし", () => {
  it("reason が無ければ description は undefined", () => {
    const noReason: ShiftChange = { ...MODIFY, reason: undefined };
    const plan = planCalendarUpsert(noReason, []);
    expect(plan.create?.description).toBeUndefined();
  });
});
