import { describe, expect, it } from "vitest";
import { completeDate } from "../logic/date-complete";
import { normalizeText } from "../logic/normalize";

describe("completeDate", () => {
  const june = new Date(2026, 5, 26); // 2026-06-26

  it("報告月と同じ月・近い将来の月は当年", () => {
    expect(completeDate(6, 30, june)).toBe("2026-06-30");
    expect(completeDate(7, 1, june)).toBe("2026-07-01");
    expect(completeDate(12, 5, june)).toBe("2026-12-05");
  });

  it("報告月より2ヶ月以上前の月は翌年と判定する", () => {
    const december = new Date(2026, 11, 20); // 2026-12-20
    expect(completeDate(1, 5, december)).toBe("2027-01-05");
    expect(completeDate(4, 1, june)).toBe("2027-04-01"); // 6月報告の「4/1」
  });

  it("1ヶ月前まではタイプミス等の可能性を考慮して当年のまま", () => {
    expect(completeDate(5, 31, june)).toBe("2026-05-31");
  });

  it("月日をゼロ埋めしたISO形式で返す", () => {
    expect(completeDate(7, 5, june)).toBe("2026-07-05");
  });
});

describe("normalizeText", () => {
  it("全角数字・コロン・スラッシュ・スペースを半角化する", () => {
    expect(normalizeText("６／３０　１６：００")).toBe("6/30 16:00");
  });

  it("矢印や波線はそのまま残す（パーサー側で揺れ吸収）", () => {
    expect(normalizeText("16:00〜22:00→12:00")).toBe("16:00〜22:00→12:00");
  });
});
