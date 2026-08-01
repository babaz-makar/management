import { describe, expect, it } from "vitest";
import {
  resolveRefreshTokenByEmail,
  describeResolutionFailure,
  type TokenResolverDeps,
  type TokenResolution,
} from "../server/jobcan-token-resolver";
import type { TokenStore } from "../server/token-store";

/** slackUserId -> refreshToken の fake TokenStore(get だけ使う) */
function fakeTokenStore(map: Record<string, string>): TokenStore {
  return {
    async get(id) {
      return map[id] ?? null;
    },
    async set() {
      /* unused */
    },
    async delete() {
      /* unused */
    },
  };
}

function deps(
  lookup: (email: string) => Promise<string | null>,
  tokenMap: Record<string, string>,
): TokenResolverDeps {
  return { lookupSlackUserId: lookup, tokenStore: fakeTokenStore(tokenMap) };
}

describe("resolveRefreshTokenByEmail: 成功", () => {
  it("email→slackUserId→refreshToken が全て解決すれば ok=true / calendarId=email", async () => {
    const d = deps(async () => "U100", { U100: "rt-abc" });
    const res = await resolveRefreshTokenByEmail("baba@example.com", d);
    expect(res).toEqual<TokenResolution>({
      ok: true,
      refreshToken: "rt-abc",
      calendarId: "baba@example.com",
    });
  });
});

describe("resolveRefreshTokenByEmail: 失敗を構造化(握りつぶさない)", () => {
  it("Slackに居なければ reason=slack_not_found", async () => {
    const d = deps(async () => null, { U100: "rt-abc" });
    const res = await resolveRefreshTokenByEmail("ghost@example.com", d);
    expect(res).toEqual<TokenResolution>({
      ok: false,
      reason: "slack_not_found",
      email: "ghost@example.com",
    });
  });

  it("SlackにはいるがGoogle未連携なら reason=google_not_linked", async () => {
    const d = deps(async () => "U404", {});
    const res = await resolveRefreshTokenByEmail("nolink@example.com", d);
    expect(res).toEqual<TokenResolution>({
      ok: false,
      reason: "google_not_linked",
      email: "nolink@example.com",
    });
  });
});

describe("resolveRefreshTokenByEmail: 入力検証(fail-loud)", () => {
  it("不正 email は throw(assertEmail 再利用、推測しない)", async () => {
    const d = deps(async () => "U1", { U1: "rt" });
    await expect(
      resolveRefreshTokenByEmail("not-an-email", d),
    ).rejects.toThrow();
  });

  it("不正 email のときは Slack 問い合わせもしない(検証が先)", async () => {
    let called = false;
    const d = deps(
      async () => {
        called = true;
        return "U1";
      },
      { U1: "rt" },
    );
    await expect(resolveRefreshTokenByEmail("bad", d)).rejects.toThrow();
    expect(called).toBe(false);
  });
});

describe("resolveRefreshTokenByEmail: 秘密情報を戻り値に載せない", () => {
  it("失敗結果に refreshToken を含めない", async () => {
    const d = deps(async () => null, { U1: "rt-secret" });
    const res = await resolveRefreshTokenByEmail("x@example.com", d);
    expect(JSON.stringify(res)).not.toContain("rt-secret");
  });
});

describe("describeResolutionFailure: reason→日本語文言(2-7用)", () => {
  it("slack_not_found の文言に email を含む(トークンは含めない)", () => {
    const msg = describeResolutionFailure({
      ok: false,
      reason: "slack_not_found",
      email: "ghost@example.com",
    });
    expect(msg).toContain("ghost@example.com");
    expect(msg).not.toContain("rt-");
  });

  it("google_not_linked の文言に email を含む", () => {
    const msg = describeResolutionFailure({
      ok: false,
      reason: "google_not_linked",
      email: "nolink@example.com",
    });
    expect(msg).toContain("nolink@example.com");
  });
});
