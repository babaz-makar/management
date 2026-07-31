import { describe, expect, it } from "vitest";
import { describeHttpError } from "../server/http-error-describe";

/**
 * describeHttpError の分岐固定。
 *
 * apps/web の staff-client / import-client がそれぞれ持っていた
 * 「HTTP ステータス → 日本語文言」の翻訳を 1 箇所へ集約した純関数。
 * apps/web にはテストランナーが無いため、純ロジックはここで担保する。
 */
describe("describeHttpError", () => {
  it("serverMessage があればステータスより優先して返す", () => {
    // Arrange / Act
    const message = describeHttpError(500, "サーバーが個別に返した明示文言");
    // Assert
    expect(message).toBe("サーバーが個別に返した明示文言");
  });

  it("空文字の serverMessage は無視してステータス翻訳へ落ちる", () => {
    expect(describeHttpError(404, "")).toBe("対象が見つかりませんでした。");
  });

  it("401 は権限エラー文言を返す", () => {
    expect(describeHttpError(401)).toBe(
      "権限がありません(管理画面から操作してください)。",
    );
  });

  it("403 も 401 と同じ権限エラー文言を返す", () => {
    expect(describeHttpError(403)).toBe(
      "権限がありません(管理画面から操作してください)。",
    );
  });

  it("404 は not found 文言を返す", () => {
    expect(describeHttpError(404)).toBe("対象が見つかりませんでした。");
  });

  it("413 はサイズ超過文言を返す", () => {
    expect(describeHttpError(413)).toBe(
      "データが大きすぎます。内容を減らして再試行してください。",
    );
  });

  it("500 はサーバーエラー文言を返す", () => {
    expect(describeHttpError(500)).toBe(
      "サーバーエラーが発生しました。時間をおいて再試行してください。",
    );
  });

  it("502 も 5xx としてサーバーエラー文言を返す", () => {
    expect(describeHttpError(502)).toBe(
      "サーバーエラーが発生しました。時間をおいて再試行してください。",
    );
  });

  it("その他の 4xx はリクエスト不正文言を返す", () => {
    expect(describeHttpError(418)).toBe(
      "リクエストが不正です。入力内容を確認してください。",
    );
  });

  it("400 未満(想定外)で fallback 指定があればそれを返す", () => {
    expect(describeHttpError(200, undefined, "名簿の取得に失敗しました。")).toBe(
      "名簿の取得に失敗しました。",
    );
  });

  it("400 未満(想定外)で fallback 未指定なら汎用文言を返す", () => {
    expect(describeHttpError(302)).toBe(
      "エラーが発生しました。時間をおいて再試行してください。",
    );
  });
});
