import { describe, expect, it } from "vitest";
import {
  canSubmitStaffEntry,
  consentAfterInputChange,
} from "../logic/staff-consent";

/**
 * O-1: staffCode ⇄ email の取り違え防止ゲート。
 * いずれかの対応入力が変わったら「この対応で間違いない」同意は必ず無効化し、
 * 未同意のまま登録できないことを固定する(staffCode / email で対称)。
 */
describe("consentAfterInputChange: 入力変更で同意は無効化される", () => {
  it("同意済みでも入力変更後は未同意へ戻る", () => {
    expect(consentAfterInputChange()).toBe(false);
  });

  it("未同意なら未同意のまま(冪等)", () => {
    expect(consentAfterInputChange()).toBe(false);
  });
});

describe("canSubmitStaffEntry: 登録可否ゲート", () => {
  const valid = {
    codeValid: true,
    emailLooksValid: true,
    agreed: true,
    busy: false,
  };

  it("全条件が揃えば登録可", () => {
    expect(canSubmitStaffEntry(valid)).toBe(true);
  });

  it("未同意(agreed=false)なら登録不可 — 入力変更でリセットされた直後を表す", () => {
    expect(canSubmitStaffEntry({ ...valid, agreed: false })).toBe(false);
  });

  it("staffCode 不正なら登録不可", () => {
    expect(canSubmitStaffEntry({ ...valid, codeValid: false })).toBe(false);
  });

  it("email 不正なら登録不可", () => {
    expect(canSubmitStaffEntry({ ...valid, emailLooksValid: false })).toBe(false);
  });

  it("busy 中は登録不可", () => {
    expect(canSubmitStaffEntry({ ...valid, busy: true })).toBe(false);
  });
});
