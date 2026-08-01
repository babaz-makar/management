import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChannelMember,
  MemberShiftResult,
  RemindMember,
  RemindTiming,
  ShiftEntry,
} from "../remind/types";
import type {
  NotificationTarget,
  RemindStore,
} from "../server/remind-store";

// Google Calendar と Slack は差し替える（ネットワークに出さない）
const getShiftsForMembers = vi.fn<
  (members: RemindMember[], date: string) => Promise<MemberShiftResult[]>
>();
const postMessage = vi.fn<
  (token: string, channel: string, text: string) => Promise<{ ok: boolean; error?: string }>
>();

vi.mock("../server/remind-calendar", () => ({
  getShiftsForMembers: (members: RemindMember[], date: string) =>
    getShiftsForMembers(members, date),
  nowJstLabel: () => "2026-08-01 21:00 JST",
}));
vi.mock("../server/slack-remind", () => ({
  postMessage: (token: string, channel: string, text: string) =>
    postMessage(token, channel, text),
}));

const { runRemind } = await import("../server/remind-runner");

/**
 * notification_logs の UNIQUE (channel_id, slack_user_id, event_uid, timing) を
 * Map で再現した偽ストア。
 */
class FakeStore implements RemindStore {
  logs = new Map<string, "pending" | "sent">();
  statuses: Record<string, "ok" | "revoked"> = {};
  members = new Map<string, string[]>();
  /** Google未連携のユーザー（connected=false になる） */
  unconnected = new Set<string>();
  targets: string[] = [];

  constructor(channels: Record<string, string[]>, unconnected: string[] = []) {
    this.targets = Object.keys(channels);
    for (const [channelId, users] of Object.entries(channels)) {
      this.members.set(channelId, users);
    }
    unconnected.forEach((u) => this.unconnected.add(u));
  }

  async init() {}

  async listNotificationTargets(): Promise<NotificationTarget[]> {
    return this.targets.map((channelId) => ({ channelId, enabled: true }));
  }
  async addNotificationTarget() {}
  async disableNotificationTarget() {}

  async listChannelMembers(channelId: string): Promise<ChannelMember[]> {
    return (this.members.get(channelId) ?? []).map((slackUserId) => ({
      channelId,
      slackUserId,
      connected: !this.unconnected.has(slackUserId),
      remindEnabled: true,
      calendarStatus: this.statuses[slackUserId] === "revoked" ? "revoked" : "ok",
      calendarId: "primary",
    }));
  }
  async listChannelRemindMembers(channelId: string): Promise<RemindMember[]> {
    return (this.members.get(channelId) ?? [])
      .filter((u) => !this.unconnected.has(u) && this.statuses[u] !== "revoked")
      .map((slackUserId) => ({
        slackUserId,
        refreshToken: `rt-${slackUserId}`,
        calendarId: "primary",
      }));
  }
  async setChannelMembers(channelId: string, ids: string[]) {
    this.members.set(channelId, ids);
  }
  async addChannelMembers(channelId: string, ids: string[]) {
    this.members.set(channelId, [...(this.members.get(channelId) ?? []), ...ids]);
  }
  async removeChannelMembers(channelId: string, ids: string[]) {
    this.members.set(
      channelId,
      (this.members.get(channelId) ?? []).filter((u) => !ids.includes(u)),
    );
  }

  async saveSettings() {}
  async markCalendarStatus(slackUserId: string, status: "ok" | "revoked") {
    this.statuses[slackUserId] = status;
  }
  async hasGoogleToken(slackUserId: string) {
    return !this.unconnected.has(slackUserId);
  }

  async claimSends(channelId: string, shifts: ShiftEntry[], timing: RemindTiming) {
    const claimed: ShiftEntry[] = [];
    for (const s of shifts) {
      const key = this.key(channelId, s, timing);
      if (this.logs.has(key)) continue; // UNIQUE制約に弾かれた相当
      this.logs.set(key, "pending");
      claimed.push(s);
    }
    return claimed;
  }
  async markSent(channelId: string, shifts: ShiftEntry[], timing: RemindTiming) {
    for (const s of shifts) this.logs.set(this.key(channelId, s, timing), "sent");
  }
  async releaseClaims(channelId: string, shifts: ShiftEntry[], timing: RemindTiming) {
    for (const s of shifts) {
      const key = this.key(channelId, s, timing);
      if (this.logs.get(key) === "pending") this.logs.delete(key);
    }
  }
  private key(channelId: string, s: ShiftEntry, timing: RemindTiming) {
    return `${channelId}|${s.slackUserId}|${s.eventUid}|${timing}`;
  }
}

function entry(id: string): ShiftEntry {
  return {
    slackUserId: id,
    eventUid: `evt-${id}`,
    date: "2026-08-02",
    startTime: "10:00",
    endTime: "19:00",
    startIso: "2026-08-02T10:00:00+09:00",
    endIso: "2026-08-02T19:00:00+09:00",
    crossesMidnight: false,
  };
}

function ok(id: string): MemberShiftResult {
  return { slackUserId: id, shifts: [entry(id)], warnings: [], revoked: false };
}

function baseOpts(store: RemindStore) {
  return {
    store,
    botToken: "xoxb-test",
    timing: "prev_night" as RemindTiming,
    date: "2026-08-02",
  };
}

beforeEach(() => {
  getShiftsForMembers.mockReset();
  postMessage.mockReset();
  postMessage.mockResolvedValue({ ok: true });
});

describe("runRemind（チャンネル単位）", () => {
  it("チャンネルの対象メンバーだけを1通にまとめて投稿する", async () => {
    const store = new FakeStore({ C1: ["U1", "U2"] });
    getShiftsForMembers.mockResolvedValue([ok("U1"), ok("U2")]);

    const result = await runRemind(baseOpts(store));

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][1]).toBe("C1");
    expect(result.channels[0].sent).toBe(true);
    expect(result.channels[0].message).toContain("<@U1>");
    expect(result.channels[0].message).toContain("<@U2>");
  });

  it("チャンネルごとに対象が違えば、それぞれの対象だけが載る", async () => {
    const store = new FakeStore({ C1: ["U1"], C2: ["U2"] });
    getShiftsForMembers.mockResolvedValue([ok("U1"), ok("U2")]);

    const result = await runRemind(baseOpts(store));

    expect(postMessage).toHaveBeenCalledTimes(2);
    const c1 = result.channels.find((c) => c.channelId === "C1")!;
    const c2 = result.channels.find((c) => c.channelId === "C2")!;
    expect(c1.message).toContain("<@U1>");
    expect(c1.message).not.toContain("<@U2>");
    expect(c2.message).toContain("<@U2>");
    expect(c2.message).not.toContain("<@U1>");
  });

  it("同じ人が複数チャンネルにいてもカレンダー取得は1回だけ", async () => {
    const store = new FakeStore({ C1: ["U1"], C2: ["U1"] });
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    await runRemind(baseOpts(store));

    expect(getShiftsForMembers).toHaveBeenCalledTimes(1);
    expect(getShiftsForMembers.mock.calls[0][0]).toHaveLength(1);
    // 通知はチャンネルごとに1通ずつ
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it("2回叩いても2回目は送信しない（送信ログで二重送信防止）", async () => {
    const store = new FakeStore({ C1: ["U1"] });
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    await runRemind(baseOpts(store));
    const second = await runRemind(baseOpts(store));

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(second.channels[0].sent).toBe(false);
    expect(second.channels[0].skippedReason).toContain("送信済み");
  });

  it("timing が違えば同じシフトでも送る（前日夜と当日朝）", async () => {
    const store = new FakeStore({ C1: ["U1"] });
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    await runRemind(baseOpts(store));
    await runRemind({ ...baseOpts(store), timing: "morning" });

    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it("送信に失敗したら予約を解放し、次回の実行で再送できる", async () => {
    const store = new FakeStore({ C1: ["U1"] });
    getShiftsForMembers.mockResolvedValue([ok("U1")]);
    postMessage.mockResolvedValueOnce({ ok: false, error: "ratelimited" });

    const first = await runRemind(baseOpts(store));
    expect(first.channels[0].sent).toBe(false);
    expect(store.logs.size).toBe(0);

    const second = await runRemind(baseOpts(store));
    expect(second.channels[0].sent).toBe(true);
  });

  it("対象メンバーが未設定のチャンネルには何も送らない", async () => {
    const store = new FakeStore({ C1: [] });
    getShiftsForMembers.mockResolvedValue([]);

    const result = await runRemind(baseOpts(store));
    expect(postMessage).not.toHaveBeenCalled();
    expect(result.channels[0].skippedReason).toContain("対象メンバーが未設定");
  });

  it("対象日にシフトが無ければ何も送らない", async () => {
    const store = new FakeStore({ C1: ["U1"] });
    getShiftsForMembers.mockResolvedValue([
      { slackUserId: "U1", shifts: [], warnings: [], revoked: false },
    ]);

    const result = await runRemind(baseOpts(store));
    expect(postMessage).not.toHaveBeenCalled();
    expect(result.channels[0].skippedReason).toContain("シフトのあるメンバーがいません");
  });

  it("通知先チャンネルが1つも無ければエラーとして記録する", async () => {
    const store = new FakeStore({});
    const result = await runRemind(baseOpts(store));

    expect(result.channels).toEqual([]);
    expect(result.errors[0]).toContain("通知先チャンネルがありません");
  });

  it("トークン失効のメンバーがいても他のメンバーの送信は止まらない", async () => {
    const store = new FakeStore({ C1: ["U1", "U2"] });
    getShiftsForMembers.mockResolvedValue([
      { slackUserId: "U1", shifts: [], warnings: [], revoked: true, error: "401" },
      ok("U2"),
    ]);

    const result = await runRemind({ ...baseOpts(store), adminChannelId: "CADMIN" });

    expect(store.statuses.U1).toBe("revoked");
    expect(result.channels[0].message).toContain("<@U2>");
    // 通知1通 + 管理チャンネルへの警告1通
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls[1][1]).toBe("CADMIN");
  });

  it("dryRun では送信もログ記録もしない", async () => {
    const store = new FakeStore({ C1: ["U1"] });
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    const result = await runRemind({ ...baseOpts(store), dryRun: true });

    expect(postMessage).not.toHaveBeenCalled();
    expect(store.logs.size).toBe(0);
    expect(result.channels[0].message).toContain("<@U1>");
  });

  it("channelIds を渡すとそのチャンネルだけを対象にする", async () => {
    const store = new FakeStore({ C1: ["U1"], C2: ["U2"] });
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    const result = await runRemind({ ...baseOpts(store), channelIds: ["C1"] });

    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].channelId).toBe("C1");
  });
});

describe("カレンダー未連携メンバーへの連携依頼", () => {
  it("前日夜は未連携メンバーへ連携リンクを投稿する", async () => {
    const store = new FakeStore({ C1: ["U1", "U2"] }, ["U2"]);
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    const result = await runRemind({
      ...baseOpts(store),
      appUrl: "https://example.com",
    });

    expect(result.channels[0].unconnected).toEqual(["U2"]);
    expect(result.channels[0].connectRequestSent).toBe(true);

    const connectCall = postMessage.mock.calls.find((c) =>
      c[2].includes("api/auth/google?slack_user_id=U2"),
    );
    expect(connectCall).toBeDefined();
    expect(connectCall![1]).toBe("C1");
  });

  it("当日朝は連携依頼を出さない（1日2回だと煩いため）", async () => {
    const store = new FakeStore({ C1: ["U1", "U2"] }, ["U2"]);
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    const result = await runRemind({
      ...baseOpts(store),
      timing: "morning",
      appUrl: "https://example.com",
    });

    expect(result.channels[0].connectRequestSent).toBe(false);
    expect(
      postMessage.mock.calls.some((c) => c[2].includes("api/auth/google")),
    ).toBe(false);
  });

  it("APP_URL が無ければ連携依頼を送らない", async () => {
    const store = new FakeStore({ C1: ["U1", "U2"] }, ["U2"]);
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    const result = await runRemind(baseOpts(store));
    expect(result.channels[0].connectRequestSent).toBe(false);
  });

  it("未連携メンバーはカレンダー取得の対象に含めない", async () => {
    const store = new FakeStore({ C1: ["U1", "U2"] }, ["U2"]);
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    await runRemind(baseOpts(store));

    expect(getShiftsForMembers.mock.calls[0][0].map((m) => m.slackUserId)).toEqual([
      "U1",
    ]);
  });
});
