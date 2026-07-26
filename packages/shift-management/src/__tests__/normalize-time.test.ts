import { describe, expect, it } from "vitest";
import { normalizeTime } from "../logic/normalize";

/** normalizeTime: 全角除去済み前提で ":" 区切り2要素、時のみゼロ埋め */
describe("normalizeTime", () => {
  it("1桁の時をゼロ埋めする", () => {
    expect(normalizeTime("9:00")).toBe("09:00");
  });

  it("2桁の時はそのまま保つ", () => {
    expect(normalizeTime("10:00")).toBe("10:00");
  });

  it("0時をゼロ埋めして 00:00 にする", () => {
    expect(normalizeTime("0:00")).toBe("00:00");
  });

  it("分はゼロ埋めせずそのまま保つ", () => {
    expect(normalizeTime("22:05")).toBe("22:05");
  });

  it(":区切り2要素でない入力はそのまま返す", () => {
    expect(normalizeTime("")).toBe("");
    expect(normalizeTime("休")).toBe("休");
  });
});
