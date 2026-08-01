import { describe, expect, it } from "vitest";
import { isShiftTitle, normalizeTitle, SHIFT_TITLE_KEYWORD } from "../remind/is-shift";
import { SHIFT_EVENT_SUMMARY } from "../logic/calendar-plan";

describe("シフト予定のタイトル判定", () => {
  it("キーワードはシフト変更ツールの作成タイトルと同じ定数を使う", () => {
    expect(SHIFT_TITLE_KEYWORD).toBe(SHIFT_EVENT_SUMMARY);
  });

  it("完全一致を拾う", () => {
    expect(isShiftTitle("SHO-SANシフト")).toBe(true);
  });

  it("前後に文字が付いていても拾う", () => {
    expect(isShiftTitle("【確定】SHO-SANシフト 10-19")).toBe(true);
  });

  it.each([
    ["全角スペース", "SHO-SAN　シフト"],
    ["半角スペース", "SHO-SAN シフト"],
    ["全角英字", "ＳＨＯ－ＳＡＮシフト"],
    ["カタカナ長音ハイフン", "SHOーSANシフト"],
    ["全角ハイフン", "SHO－SANシフト"],
    ["マイナス記号", "SHO−SANシフト"],
    ["enダッシュ", "SHO–SANシフト"],
    ["小文字", "sho-sanシフト"],
  ])("表記揺れ（%s）を拾う", (_label, title) => {
    expect(isShiftTitle(title)).toBe(true);
  });

  it("関係ない予定は拾わない", () => {
    expect(isShiftTitle("面談")).toBe(false);
    expect(isShiftTitle("SHO-SAN 全体MTG")).toBe(false);
  });

  it("タイトルが無い予定は false", () => {
    expect(isShiftTitle(undefined)).toBe(false);
    expect(isShiftTitle(null)).toBe(false);
    expect(isShiftTitle("")).toBe(false);
  });

  it("正規化は大文字・ハイフン統一・空白除去を行う", () => {
    expect(normalizeTitle("sho ー san　シフト")).toBe("SHO-SANシフト");
  });
});
