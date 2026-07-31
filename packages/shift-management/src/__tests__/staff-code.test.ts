import { describe, expect, it } from "vitest";
import { isValidStaffCode } from "../server/staff-code";

/**
 * staffCode 形式判定(大文字英字1 + 数字4桁)の分岐固定。
 * apps/web の即時バリデーションが依存する純関数。
 */
describe("isValidStaffCode", () => {
  it("正例(大文字1 + 数字4桁)を受理する", () => {
    expect(isValidStaffCode("A0187")).toBe(true);
  });

  it("小文字始まりは拒否する", () => {
    expect(isValidStaffCode("a0187")).toBe(false);
  });

  it("桁数違い(数字3桁)は拒否する", () => {
    expect(isValidStaffCode("A018")).toBe(false);
  });

  it("桁数違い(数字5桁)は拒否する", () => {
    expect(isValidStaffCode("A01870")).toBe(false);
  });

  it("空文字は拒否する", () => {
    expect(isValidStaffCode("")).toBe(false);
  });

  it("英字が複数の先頭は拒否する", () => {
    expect(isValidStaffCode("AB187")).toBe(false);
  });
});
