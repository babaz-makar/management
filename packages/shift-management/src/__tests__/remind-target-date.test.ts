import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDateLabel,
  jstDayRange,
  resolveTargetDate,
} from "../remind/target-date";

describe("リマインド対象日の算出（JST基準）", () => {
  it("前日21時の実行では翌日分を対象にする", () => {
    // 2026-08-01 12:00Z = 2026-08-01 21:00 JST
    const now = new Date("2026-08-01T12:00:00Z");
    expect(resolveTargetDate("prev_night", now)).toBe("2026-08-02");
  });

  it("当日8時の実行では当日分を対象にする（UTCでは前日23時＝日跨ぎ）", () => {
    // 2026-08-01 23:00Z = 2026-08-02 08:00 JST
    const now = new Date("2026-08-01T23:00:00Z");
    expect(resolveTargetDate("morning", now)).toBe("2026-08-02");
  });

  it("JST 23時台（UTCでは同日14時台）でも1日ズレない", () => {
    // 2026-08-01 14:30Z = 2026-08-01 23:30 JST → 翌日は 08-02
    const now = new Date("2026-08-01T14:30:00Z");
    expect(resolveTargetDate("prev_night", now)).toBe("2026-08-02");
    expect(resolveTargetDate("morning", now)).toBe("2026-08-01");
  });

  it("月末・年末をまたいでも繰り上がる", () => {
    // 2026-12-31 12:00Z = 2026-12-31 21:00 JST
    expect(resolveTargetDate("prev_night", new Date("2026-12-31T12:00:00Z"))).toBe(
      "2027-01-01",
    );
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // 閏年
    expect(addDays("2026-08-02", -1)).toBe("2026-08-01");
  });

  it("見出し用の日付ラベルは曜日付き", () => {
    expect(formatDateLabel("2026-08-02")).toBe("8/2(日)");
    expect(formatDateLabel("2026-08-03")).toBe("8/3(月)");
  });

  it("Calendar API の取得範囲は対象日00:00〜翌日00:00（JST）", () => {
    expect(jstDayRange("2026-08-02")).toEqual({
      timeMin: "2026-08-02T00:00:00+09:00",
      timeMax: "2026-08-03T00:00:00+09:00",
    });
  });
});
