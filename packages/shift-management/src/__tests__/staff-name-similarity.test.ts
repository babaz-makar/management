import { describe, expect, it } from "vitest";
import { findSimilarStaffNames } from "../server/staff-name-similarity";

/**
 * findSimilarStaffNames: 名簿確定時の「取り違え」警告用の似名判定。
 * 前方一致 + 簡易編集距離でヒットを返す。氏名が無い運用でも安全に動く。
 */
describe("findSimilarStaffNames: 似名ヒット", () => {
  it("完全一致は exact として返す", () => {
    const matches = findSimilarStaffNames("田中太郎", [
      { staffCode: "A0001", staffName: "田中太郎" },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].staffCode).toBe("A0001");
    expect(matches[0].matchType).toBe("exact");
  });

  it("前方一致(片方が他方の接頭辞)は prefix として返す", () => {
    const matches = findSimilarStaffNames("田中", [
      { staffCode: "A0002", staffName: "田中太郎" },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe("prefix");
  });

  it("一文字違い(編集距離1)は edit_distance として返す", () => {
    const matches = findSimilarStaffNames("佐藤", [
      { staffCode: "A0003", staffName: "佐籐" },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe("edit_distance");
  });

  it("複数候補から似ているものだけを返す", () => {
    const matches = findSimilarStaffNames("田中太郎", [
      { staffCode: "A0001", staffName: "田中太郎" },
      { staffCode: "A0004", staffName: "鈴木一郎" },
    ]);
    expect(matches.map((m) => m.staffCode)).toEqual(["A0001"]);
  });
});

describe("findSimilarStaffNames: 非ヒット・空・氏名なし", () => {
  it("似ていない氏名は返さない", () => {
    const matches = findSimilarStaffNames("山田", [
      { staffCode: "A0004", staffName: "鈴木一郎" },
    ]);
    expect(matches).toEqual([]);
  });

  it("target が空文字なら空配列(誤警告しない)", () => {
    const matches = findSimilarStaffNames("", [
      { staffCode: "A0001", staffName: "田中太郎" },
    ]);
    expect(matches).toEqual([]);
  });

  it("target が空白のみなら空配列", () => {
    const matches = findSimilarStaffNames("   ", [
      { staffCode: "A0001", staffName: "田中太郎" },
    ]);
    expect(matches).toEqual([]);
  });

  it("氏名の無い候補(staffName未設定)は安全にスキップする", () => {
    const matches = findSimilarStaffNames("田中太郎", [
      { staffCode: "A0005" },
      { staffCode: "A0006", staffName: "" },
    ]);
    expect(matches).toEqual([]);
  });

  it("existing が空配列なら空配列", () => {
    const matches = findSimilarStaffNames("田中太郎", []);
    expect(matches).toEqual([]);
  });

  it("前後空白は無視して一致判定する", () => {
    const matches = findSimilarStaffNames(" 田中太郎 ", [
      { staffCode: "A0001", staffName: "田中太郎" },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe("exact");
  });
});
