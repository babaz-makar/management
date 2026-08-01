import { describe, expect, it } from "vitest";
import { describeImportReason } from "../server/import-reason-describe";

/**
 * describeImportReason: 機械可読 reason を人間向け日本語へ変換する。
 * UI(2-8b)が import-ui / staff API の各 reason をそのまま表示できることを保証する。
 * すべての既知 reason で「非空・クラッシュしない」ことを網羅し、未知 reason でも
 * 無難な既定文言に落ちる(空文字/例外を返さない)ことを固定する。
 */
describe("describeImportReason: 既知 reason を日本語化する", () => {
  // canonical キーのみ(エイリアス "payload too large" は別テストで検証)。
  const routeReasons = [
    "unauthorized",
    "payload_too_large",
    "file_too_large",
    "too_many_files",
    "total_too_large",
    "secret_not_configured",
  ];
  const warningReasons = [
    "email_not_registered",
    "directory_error",
    "slack_not_found",
    "google_not_linked",
    "resolve_error",
    "reconcile_error",
  ];
  const fileErrorReasons = [
    "filename_parse_error",
    "sheet_parse_error",
    "staff_code_mismatch",
    "unexpected_error",
    "conversion_error",
  ];

  const allKnown = [...routeReasons, ...warningReasons, ...fileErrorReasons];

  it.each([...allKnown, "payload too large"])(
    "既知 reason '%s' は非空の日本語文言を返す",
    (reason) => {
      const message = describeImportReason(reason);
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
    },
  );

  it("既知 reason ごとに文言が異なる(取り違えを防ぐ)", () => {
    const messages = allKnown.map((r) => describeImportReason(r));
    const unique = new Set(messages);
    expect(unique.size).toBe(messages.length);
  });

  it("payload too large と payload_too_large は同一文言に正規化される", () => {
    expect(describeImportReason("payload too large")).toBe(
      describeImportReason("payload_too_large"),
    );
  });
});

describe("describeImportReason: 未知 reason でも安全に落ちる", () => {
  it("未知 reason は非空の既定文言を返す(空文字を返さない)", () => {
    const message = describeImportReason("some_totally_unknown_reason");
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
  });

  it("空文字 reason でも例外を投げず非空の既定文言を返す", () => {
    const message = describeImportReason("");
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
  });

  it("未知 reason の文言は既知文言と衝突しない一般文言である", () => {
    const unknown = describeImportReason("xyz_unknown");
    expect(unknown).not.toBe(describeImportReason("unauthorized"));
  });
});
