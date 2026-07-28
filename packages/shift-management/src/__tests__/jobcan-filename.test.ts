import { describe, expect, it } from "vitest";
import { parseJobcanFileName } from "../logic/jobcan-filename";

describe("parseJobcanFileName: 正常系", () => {
  it("氏名(コード) YYYY年MM月度.xlsx から年月とstaffCodeを取り出す", () => {
    // Arrange
    const name = "馬場優蔵(A0187) 2026年08月度.xlsx";
    // Act
    const result = parseJobcanFileName(name);
    // Assert
    expect(result).toEqual({ year: 2026, month: 8, staffCodeInName: "A0187" });
  });

  it("ゼロ埋め月(08)を number 8 に変換する", () => {
    const result = parseJobcanFileName("試 太郎(Z9999) 2026年08月度.xlsx");
    expect(result.month).toBe(8);
  });

  it("非ゼロ埋め月(8月)でも number 8 になる", () => {
    const result = parseJobcanFileName("試 太郎(Z9999) 2026年8月度.xlsx");
    expect(result.month).toBe(8);
  });

  it("12月など2桁月をそのまま number にする", () => {
    const result = parseJobcanFileName("試 太郎(Z9999) 2026年12月度.xlsx");
    expect(result).toEqual({ year: 2026, month: 12, staffCodeInName: "Z9999" });
  });
});

describe("parseJobcanFileName: staffCode の抽出と書式検証", () => {
  it("全角括弧（）内のコードも取り込む", () => {
    const result = parseJobcanFileName("馬場優蔵（A0187） 2026年08月度.xlsx");
    expect(result.staffCodeInName).toBe("A0187");
  });

  it("全角空白を含んでも年月を解決する", () => {
    const result = parseJobcanFileName("馬場優蔵（A0187）　2026年08月度.xlsx");
    expect(result).toEqual({ year: 2026, month: 8, staffCodeInName: "A0187" });
  });

  it("括弧内が書式外(A1)なら staffCodeInName は undefined(ここでは throw しない)", () => {
    const result = parseJobcanFileName("試 太郎(A1) 2026年08月度.xlsx");
    expect(result.staffCodeInName).toBeUndefined();
    expect(result.year).toBe(2026);
    expect(result.month).toBe(8);
  });

  it("括弧内が数字のみ(1234)なら staffCodeInName は undefined", () => {
    const result = parseJobcanFileName("試 太郎(1234) 2026年08月度.xlsx");
    expect(result.staffCodeInName).toBeUndefined();
  });

  it("括弧内が5桁(Z99999)なら書式外で undefined", () => {
    const result = parseJobcanFileName("試 太郎(Z99999) 2026年08月度.xlsx");
    expect(result.staffCodeInName).toBeUndefined();
  });

  it("括弧が無ければ staffCodeInName は undefined(年月は取れる)", () => {
    const result = parseJobcanFileName("2026年08月度.xlsx");
    expect(result.staffCodeInName).toBeUndefined();
    expect(result).toMatchObject({ year: 2026, month: 8 });
  });

  it("拡張子が違っても(.xls)前後空白があっても年月を解決する", () => {
    const result = parseJobcanFileName("  馬場優蔵(A0187) 2026年08月度.xls  ");
    expect(result).toEqual({ year: 2026, month: 8, staffCodeInName: "A0187" });
  });
});

describe("parseJobcanFileName: fail-loud", () => {
  it("年月が無ければ throw(推測して既定値を入れない)", () => {
    expect(() => parseJobcanFileName("馬場優蔵(A0187) シフト.xlsx")).toThrow();
  });

  it("年だけ(月なし)でも throw", () => {
    expect(() => parseJobcanFileName("2026年 シフト.xlsx")).toThrow();
  });

  it("月が範囲外(13月)なら throw(不正月を黙って通さない)", () => {
    expect(() =>
      parseJobcanFileName("試 太郎(Z9999) 2026年13月度.xlsx"),
    ).toThrow();
  });
});
