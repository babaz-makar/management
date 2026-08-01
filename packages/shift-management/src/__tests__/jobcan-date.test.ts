import { describe, expect, it } from "vitest";
import { completeJobcanDate } from "../logic/jobcan-date";

/**
 * completeJobcanDate: 締め日ベースの月/日を対象年月(header)基準でISO日付へ補完。
 * 行の月 > 対象月 なら前年扱い。
 */
describe("completeJobcanDate", () => {
  it("対象月と同じ期の前半月(7月)は対象年のまま補完する", () => {
    // Arrange / Act
    const iso = completeJobcanDate(7, 16, 2026, 8);
    // Assert
    expect(iso).toBe("2026-07-16");
  });

  it("対象月と同月(8月)は対象年で補完する", () => {
    expect(completeJobcanDate(8, 1, 2026, 8)).toBe("2026-08-01");
  });

  it("対象月(1月)より大きい月(12月)は前年扱いにする", () => {
    expect(completeJobcanDate(12, 20, 2027, 1)).toBe("2026-12-20");
  });

  it("対象月と同月(1月)は対象年のまま補完する", () => {
    expect(completeJobcanDate(1, 5, 2027, 1)).toBe("2027-01-05");
  });

  it("月・日をゼロ埋めする", () => {
    expect(completeJobcanDate(3, 4, 2026, 3)).toBe("2026-03-04");
  });
});
