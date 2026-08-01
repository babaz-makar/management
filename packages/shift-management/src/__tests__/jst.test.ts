import { describe, expect, it } from "vitest";
import { jstDate, jstTime, jstYearMonth, parseIsoToJst } from "../logic/jst";

describe("JSTユーティリティ", () => {
  it("+09:00 表記のISOをそのままJSTとして読む", () => {
    expect(parseIsoToJst("2026-06-30T16:00:00+09:00")).toEqual({
      date: "2026-06-30",
      time: "16:00",
    });
  });

  it("UTC表記のISOをJSTへ変換する", () => {
    // 2026-06-30T07:00Z = 2026-06-30 16:00 JST
    expect(parseIsoToJst("2026-06-30T07:00:00Z")).toEqual({
      date: "2026-06-30",
      time: "16:00",
    });
  });

  it("UTCでは前日でもJSTの日付を返す", () => {
    // 2026-06-29T16:00Z = 2026-06-30 01:00 JST
    expect(parseIsoToJst("2026-06-29T16:00:00Z")).toEqual({
      date: "2026-06-30",
      time: "01:00",
    });
  });

  it("日跨ぎ（JSTで翌日00:30）も正しく繰り上がる", () => {
    const instant = new Date("2026-06-30T15:30:00Z");
    expect(jstDate(instant)).toBe("2026-07-01");
    expect(jstTime(instant)).toBe("00:30");
  });

  it("jstYearMonth はJSTの年月を返す", () => {
    // 2025-12-31T16:00Z = 2026-01-01 01:00 JST
    expect(jstYearMonth(new Date("2025-12-31T16:00:00Z"))).toEqual({
      year: 2026,
      month: 1,
    });
  });
});
