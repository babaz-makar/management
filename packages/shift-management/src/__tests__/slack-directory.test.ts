import { describe, expect, it } from "vitest";
import {
  interpretSlackLookupResponse,
  lookupSlackUserIdByEmail,
  type SlackFetch,
} from "../server/slack-directory";

describe("interpretSlackLookupResponse: レスポンス解釈(純関数)", () => {
  it("ok=true で user.id があればその id を返す", () => {
    const data = { ok: true, user: { id: "U123" } };
    expect(interpretSlackLookupResponse(data)).toBe("U123");
  });

  it("ok=false かつ error=users_not_found は null(見つからない)", () => {
    const data = { ok: false, error: "users_not_found" };
    expect(interpretSlackLookupResponse(data)).toBeNull();
  });

  it("ok=false の認証エラー(invalid_auth)は throw(呼び出し失敗=fail-loud)", () => {
    const data = { ok: false, error: "invalid_auth" };
    expect(() => interpretSlackLookupResponse(data)).toThrow();
  });

  it("ok=false の ratelimited も throw(見つからない扱いにしない)", () => {
    const data = { ok: false, error: "ratelimited" };
    expect(() => interpretSlackLookupResponse(data)).toThrow();
  });

  it("ok=true だが user.id 欠落は throw(壊れたレスポンス=fail-loud)", () => {
    const data = { ok: true, user: {} };
    expect(() => interpretSlackLookupResponse(data)).toThrow();
  });

  it("形が想定外(null/文字列)なら throw", () => {
    expect(() => interpretSlackLookupResponse(null)).toThrow();
    expect(() => interpretSlackLookupResponse("nope")).toThrow();
  });

  it("throw メッセージに botToken は含めない(そもそも受け取らない純関数)", () => {
    try {
      interpretSlackLookupResponse({ ok: false, error: "invalid_auth" });
      throw new Error("should have thrown");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toContain("invalid_auth");
      expect(msg).not.toContain("xoxb");
    }
  });
});

describe("lookupSlackUserIdByEmail: HTTP薄実体(fetch注入)", () => {
  function fakeFetch(
    status: number,
    body: unknown,
    record?: { url?: string; auth?: string },
  ): SlackFetch {
    return async (url, init) => {
      if (record) {
        record.url = url;
        record.auth = init?.headers?.Authorization;
      }
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      };
    };
  }

  it("見つかれば slack_user_id を返す", async () => {
    const id = await lookupSlackUserIdByEmail(
      "baba@example.com",
      "xoxb-token",
      fakeFetch(200, { ok: true, user: { id: "U999" } }),
    );
    expect(id).toBe("U999");
  });

  it("users_not_found は null を返す(throw しない)", async () => {
    const id = await lookupSlackUserIdByEmail(
      "ghost@example.com",
      "xoxb-token",
      fakeFetch(200, { ok: false, error: "users_not_found" }),
    );
    expect(id).toBeNull();
  });

  it("HTTP非2xx は throw(呼び出し自体の失敗)", async () => {
    await expect(
      lookupSlackUserIdByEmail(
        "x@example.com",
        "xoxb-token",
        fakeFetch(500, "server error"),
      ),
    ).rejects.toThrow();
  });

  it("email を encodeURIComponent して問い合わせURLに載せる", async () => {
    const rec: { url?: string; auth?: string } = {};
    await lookupSlackUserIdByEmail(
      "a+b@example.com",
      "xoxb-token",
      fakeFetch(200, { ok: true, user: { id: "U1" } }, rec),
    );
    expect(rec.url).toContain("users.lookupByEmail");
    expect(rec.url).toContain("a%2Bb%40example.com");
    expect(rec.url).not.toContain("a+b@example.com");
  });

  it("Authorization ヘッダに Bearer botToken を載せる", async () => {
    const rec: { url?: string; auth?: string } = {};
    await lookupSlackUserIdByEmail(
      "a@example.com",
      "xoxb-secret",
      fakeFetch(200, { ok: true, user: { id: "U1" } }, rec),
    );
    expect(rec.auth).toBe("Bearer xoxb-secret");
  });

  it("HTTPエラーの throw メッセージに botToken を漏らさない", async () => {
    try {
      await lookupSlackUserIdByEmail(
        "a@example.com",
        "xoxb-super-secret",
        fakeFetch(401, "unauthorized"),
      );
      throw new Error("should have thrown");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toContain("xoxb-super-secret");
    }
  });
});
