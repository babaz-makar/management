import { describe, expect, it } from "vitest";
import { translateJobcanServerError } from "../logic/jobcan-error-messages";

/**
 * サーバーが返す英語の機械コード(error フィールド)を利用者向け日本語へ翻訳する。
 * 未知/検証エラー(生の英語 err.message)は null を返し、呼び出し側で status 翻訳に落とす
 * = 生の英語がユーザーに露出しないことを固定する(名簿で "server misconfigured" 露出の再発防止)。
 */
describe("translateJobcanServerError: 既知の英語コード→日本語", () => {
  it.each([
    "server misconfigured",
    "operation failed",
    "staffCode is required",
    "could not verify",
    "unauthorized",
    "already registered",
    "import failed",
    "no files uploaded",
    "payload too large",
  ])("%s は日本語(英字を含まない)を返す", (code) => {
    const message = translateJobcanServerError(code);
    expect(message).not.toBeNull();
    // 日本語化されていること: ラテン英字を含まない(生の英語コードが混じらない)。
    expect(message as string).not.toMatch(/[A-Za-z]/);
  });

  it("server misconfigured は管理者連絡を促す一般化文言", () => {
    expect(translateJobcanServerError("server misconfigured")).toBe(
      "サーバー設定に問題があります。管理者に連絡してください。",
    );
  });

  it("未知コードは null(呼び出し側が status 翻訳へ落とす)", () => {
    expect(translateJobcanServerError("some unknown code")).toBeNull();
  });

  it("生の英語検証メッセージ(assert* の err.message)は null=エコーしない", () => {
    expect(
      translateJobcanServerError(
        'invalid staffCode: "xx" (expected 1 uppercase letter + 4 digits, e.g. A0187)',
      ),
    ).toBeNull();
    expect(translateJobcanServerError('invalid email format: "xx"')).toBeNull();
  });

  it("空/空白は null", () => {
    expect(translateJobcanServerError("")).toBeNull();
    expect(translateJobcanServerError("   ")).toBeNull();
  });
});
