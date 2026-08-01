import { describe, expect, it } from "vitest";
import {
  planJobcanDayUpsert,
  groupEntriesByDate,
  type JobcanDayContext,
} from "../logic/jobcan-plan";
import type { ExistingEvent } from "../logic/calendar-plan";
import type { ShiftEntry } from "../types";

const STAFF = "A0187";
const DATE = "2026-08-01";
const DAY_KEY = "A0187:2026-08-01";
const CTX: JobcanDayContext = { staffCode: STAFF, date: DATE };

function entry(
  start: string,
  end: string,
  d: string = DATE,
  code: string = STAFF,
): ShiftEntry {
  return {
    jobcanShiftId: `${code}:${d}`,
    staffCode: code,
    staffName: "試 太郎",
    sourceMonth: "2026-08",
    shift: { date: d, startTime: start, endTime: end },
  };
}

/** 自タグ(jobcan-sync)の既存イベント */
function selfEvt(
  id: string,
  start: string,
  end: string,
  shiftId: string = DAY_KEY,
): ExistingEvent {
  return { id, shiftId, managedBy: "jobcan-sync", date: DATE, startTime: start, endTime: end };
}

/** 管理外/手動の既存イベント(managedBy 省略 or 別値) */
function foreignEvt(
  id: string,
  start: string,
  end: string,
  managedBy?: string,
): ExistingEvent {
  return { id, managedBy, date: DATE, startTime: start, endTime: end };
}

describe("planJobcanDayUpsert: #1 巻き添え削除なし(必須回帰)", () => {
  it("午前だけ時刻変更なら旧午前をdelete+新午前create、午後は触らない", () => {
    // Arrange
    const entries = [entry("09:00", "12:00"), entry("13:00", "18:00")];
    const existing = [
      selfEvt("am-old", "08:00", "12:00"),
      selfEvt("pm", "13:00", "18:00"),
    ];
    // Act
    const plan = planJobcanDayUpsert(CTX, entries, existing);
    // Assert
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].startTime).toBe("09:00");
    expect(plan.creates[0].endTime).toBe("12:00");
    expect(plan.deleteEventIds).toEqual(["am-old"]);
    expect(plan.deleteEventIds).not.toContain("pm"); // 午後は巻き添えにしない
    expect(plan.warnings).toEqual([]);
  });
});

describe("planJobcanDayUpsert: create の中身", () => {
  it("jobcan-sync タグ・dayKey・正規化時刻の NewEventSpec を作る", () => {
    const plan = planJobcanDayUpsert(CTX, [entry("09:00", "18:00")], []);
    expect(plan.creates).toEqual([
      {
        shiftId: "A0187:2026-08-01",
        managedBy: "jobcan-sync",
        date: "2026-08-01",
        startTime: "09:00",
        endTime: "18:00",
        summary: "シフト 09:00-18:00",
      },
    ]);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });
});

describe("planJobcanDayUpsert: #2 コマ消失の掃除", () => {
  it("3コマ中1コマが消えたら消えた分だけdelete、残りはskip", () => {
    const entries = [entry("09:00", "12:00"), entry("13:00", "18:00")];
    const existing = [
      selfEvt("s1", "09:00", "12:00"),
      selfEvt("s2", "13:00", "18:00"),
      selfEvt("s3", "19:00", "22:00"), // これが消えたコマ
    ];
    const plan = planJobcanDayUpsert(CTX, entries, existing);
    expect(plan.deleteEventIds).toEqual(["s3"]);
    expect(plan.creates).toHaveLength(0); // 2コマとも一致=skip
  });
});

describe("planJobcanDayUpsert: #3 元データ同時刻の重複を畳む", () => {
  it("同一slotが2コマあれば1つに畳んでwarning", () => {
    const entries = [entry("09:00", "18:00"), entry("09:00", "18:00")];
    const plan = planJobcanDayUpsert(CTX, entries, []);
    expect(plan.creates).toHaveLength(1);
    expect(plan.warnings.some((w) => w.includes("重複"))).toBe(true);
  });
});

describe("planJobcanDayUpsert: #4 既存自タグの残骸掃除", () => {
  it("既存自タグが同slotで2件あれば1件残し他をdelete", () => {
    const entries = [entry("09:00", "18:00")];
    const existing = [
      selfEvt("dup1", "09:00", "18:00"),
      selfEvt("dup2", "09:00", "18:00"),
    ];
    const plan = planJobcanDayUpsert(CTX, entries, existing);
    expect(plan.deleteEventIds).toEqual(["dup2"]); // dup1 を残す
    expect(plan.creates).toHaveLength(0); // 一致するので作成しない
  });
});

describe("planJobcanDayUpsert: #5 管理外は消さず警告のみ", () => {
  it("希望slotと同時刻の管理外予定はcreateするがforeignは消さず+warning", () => {
    const entries = [entry("09:00", "18:00")];
    const existing = [foreignEvt("manual", "09:00", "18:00")]; // managedBy 無し
    const plan = planJobcanDayUpsert(CTX, entries, existing);
    expect(plan.creates).toHaveLength(1);
    expect(plan.deleteEventIds).toEqual([]); // 管理外は絶対消さない
    expect(plan.warnings.some((w) => w.includes("管理外"))).toBe(true);
  });

  it("shift-management タグの予定も管理外扱いで消さない", () => {
    const entries = [entry("09:00", "18:00")];
    const existing = [foreignEvt("other", "09:00", "18:00", "shift-management")];
    const plan = planJobcanDayUpsert(CTX, entries, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.warnings.some((w) => w.includes("管理外"))).toBe(true);
  });
});

describe("planJobcanDayUpsert: #6 偽装タグ(shiftId不一致)は削除しない(必須回帰)", () => {
  it("jobcan-syncだが別staffのshiftIdなら自タグ扱いせず削除せず+warning", () => {
    const entries = [entry("09:00", "18:00")];
    const existing = [selfEvt("spoof", "09:00", "18:00", "B0001:2026-08-01")];
    const plan = planJobcanDayUpsert(CTX, entries, existing);
    expect(plan.deleteEventIds).toEqual([]); // 偽装タグは絶対消さない
    expect(plan.creates).toHaveLength(1); // 一致自タグ無し扱い=create
    expect(plan.warnings.some((w) => w.includes("shiftId"))).toBe(true);
  });

  it("jobcan-syncだが別dateのshiftIdでも自タグ扱いせず削除しない", () => {
    const entries = [entry("09:00", "18:00")];
    const existing = [selfEvt("spoof", "09:00", "18:00", "A0187:2026-08-02")];
    const plan = planJobcanDayUpsert(CTX, entries, existing);
    expect(plan.deleteEventIds).toEqual([]);
  });
});

describe("planJobcanDayUpsert: #7 異常データ時は当日delete全抑制(必須回帰)", () => {
  it("end<=startの異常1コマ混入→そのコマskip+warning、他は正常diffだが当日deleteは全抑制", () => {
    const entries = [entry("10:00", "09:00"), entry("14:00", "18:00")];
    const existing = [selfEvt("old", "09:00", "12:00")]; // 本来なら self-only で delete
    const plan = planJobcanDayUpsert(CTX, entries, existing);
    expect(plan.creates).toHaveLength(1); // 正常コマは作る
    expect(plan.creates[0].startTime).toBe("14:00");
    expect(plan.deleteEventIds).toEqual([]); // 異常保護: delete 全抑制
    expect(plan.warnings.some((w) => w.includes("見送"))).toBe(true);
  });

  it("異常時は残骸掃除も含めdeleteを完全抑制する(deleteEventIdsは空)", () => {
    const entries = [entry("09:00", "09:00"), entry("13:00", "18:00")]; // 0分異常 + 正常
    const existing = [
      selfEvt("k1", "13:00", "18:00"),
      selfEvt("k2", "13:00", "18:00"), // 一致slotの残骸(本来なら掃除対象)
    ];
    const plan = planJobcanDayUpsert(CTX, entries, existing);
    expect(plan.deleteEventIds).toEqual([]); // 異常時は一切消さない(残骸も含む)
    expect(plan.creates).toHaveLength(0); // 13-18 は一致でskip
  });

  it("異常時のwarningに残骸整理も見送った旨を含む", () => {
    const entries = [entry("09:00", "09:00")];
    const existing = [
      selfEvt("k1", "13:00", "18:00"),
      selfEvt("k2", "13:00", "18:00"),
    ];
    const plan = planJobcanDayUpsert(CTX, entries, existing);
    expect(plan.deleteEventIds).toEqual([]);
    expect(plan.warnings.some((w) => w.includes("見送"))).toBe(true);
  });
});

describe("planJobcanDayUpsert: #8 空日削除", () => {
  it("entriesが空なら当日の自タグを全delete", () => {
    const existing = [
      selfEvt("a", "09:00", "12:00"),
      selfEvt("b", "13:00", "18:00"),
    ];
    const plan = planJobcanDayUpsert(CTX, [], existing);
    expect(plan.creates).toEqual([]);
    expect(plan.deleteEventIds).toEqual(["a", "b"]);
  });
});

describe("planJobcanDayUpsert: #9 時刻ゼロ埋め揺れの吸収", () => {
  it("非ゼロ埋め(9:00)とゼロ埋め既存(09:00)はnormalize後一致でskip", () => {
    const entries = [entry("9:00", "18:00")];
    const existing = [selfEvt("s", "09:00", "18:00")];
    const plan = planJobcanDayUpsert(CTX, entries, existing);
    expect(plan.creates).toHaveLength(0);
    expect(plan.deleteEventIds).toEqual([]);
  });
});

describe("planJobcanDayUpsert: #10 ctx違いコマ混入はfail-loud", () => {
  it("別dateのコマが混じればthrow", () => {
    const entries = [entry("09:00", "18:00"), entry("09:00", "18:00", "2026-08-02")];
    expect(() => planJobcanDayUpsert(CTX, entries, [])).toThrow();
  });

  it("別staffのコマが混じればthrow", () => {
    const entries = [entry("09:00", "18:00", DATE, "B0001")];
    expect(() => planJobcanDayUpsert(CTX, entries, [])).toThrow();
  });
});

describe("groupEntriesByDate", () => {
  it("複数日を日ごとに分割し出現順を保持する", () => {
    const entries = [
      entry("09:00", "18:00", "2026-08-03"),
      entry("10:00", "15:00", "2026-08-01"),
      entry("11:00", "20:00", "2026-08-03"),
    ];
    const grouped = groupEntriesByDate(entries);
    expect([...grouped.keys()]).toEqual(["2026-08-03", "2026-08-01"]); // 出現順
    expect(grouped.get("2026-08-03")).toHaveLength(2);
    expect(grouped.get("2026-08-01")).toHaveLength(1);
  });

  it("空配列なら空Mapを返す", () => {
    expect(groupEntriesByDate([]).size).toBe(0);
  });
});
