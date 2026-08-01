import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MemberShiftResult,
  RemindMember,
  RemindTiming,
  ShiftEntry,
} from "../remind/types";
import type {
  NotificationTarget,
  RemindSettings,
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

/** notification_logs の UNIQUE (slack_user_id, event_uid, timing) を Set で再現した偽ストア */
class FakeStore implements RemindStore {
  logs = new Map<string, "pending" | "sent">();
  statuses: Record<string, "ok" | "revoked"> = {};

  constructor(private members: RemindMember[]) {}

  async init() {}
  async listRemindMembers() {
    return this.members;
  }
  async listSettings(): Promise<RemindSettings[]> {
    return [];
  }
  async saveSettings() {}
  async markCalendarStatus(slackUserId: string, status: "ok" | "revoked") {
    this.statuses[slackUserId] = status;
  }
  async listNotificationTargets(): Promise<NotificationTarget[]> {
    return [];
  }
  async setNotificationTargets() {}
  async claimSends(shifts: ShiftEntry[], timing: RemindTiming) {
    const claimed: ShiftEntry[] = [];
    for (const s of shifts) {
      const key = this.key(s, timing);
      if (this.logs.has(key)) continue; // UNIQUE制約に弾かれた相当
      this.logs.set(key, "pending");
      claimed.push(s);
    }
    return claimed;
  }
  async markSent(shifts: ShiftEntry[], timing: RemindTiming) {
    for (const s of shifts) this.logs.set(this.key(s, timing), "sent");
  }
  async releaseClaims(shifts: ShiftEntry[], timing: RemindTiming) {
    for (const s of shifts) {
      const key = this.key(s, timing);
      if (this.logs.get(key) === "pending") this.logs.delete(key);
    }
  }
  async hasGoogleToken() {
    return true;
  }
  private key(s: ShiftEntry, timing: RemindTiming) {
    return `${s.slackUserId}|${s.eventUid}|${timing}`;
  }
}

function member(id: string): RemindMember {
  return { slackUserId: id, refreshToken: `rt-${id}`, calendarId: "primary" };
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
    channelIds: ["C1"],
  };
}

beforeEach(() => {
  getShiftsForMembers.mockReset();
  postMessage.mockReset();
  postMessage.mockResolvedValue({ ok: true });
});

describe("runRemind", () => {
  it("シフトのあるメンバーを1通にまとめて投稿する", async () => {
    const store = new FakeStore([member("U1"), member("U2")]);
    getShiftsForMembers.mockResolvedValue([ok("U1"), ok("U2")]);

    const result = await runRemind(baseOpts(store));

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(result.sentChannels).toEqual(["C1"]);
    expect(result.notifiedCount).toBe(2);
    expect(result.message).toContain("<@U1>");
    expect(result.message).toContain("<@U2>");
  });

  it("2回叩いても2回目は送信しない（送信ログで二重送信防止）", async () => {
    const store = new FakeStore([member("U1")]);
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    await runRemind(baseOpts(store));
    const second = await runRemind(baseOpts(store));

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(second.sentChannels).toEqual([]);
    expect(second.skippedReason).toContain("送信済み");
  });

  it("timing が違えば同じシフトでも送る（前日夜と当日朝）", async () => {
    const store = new FakeStore([member("U1")]);
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    await runRemind(baseOpts(store));
    await runRemind({ ...baseOpts(store), timing: "morning" });

    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it("送信に失敗したら予約を解放し、次回の実行で再送できる", async () => {
    const store = new FakeStore([member("U1")]);
    getShiftsForMembers.mockResolvedValue([ok("U1")]);
    postMessage.mockResolvedValueOnce({ ok: false, error: "ratelimited" });

    const first = await runRemind(baseOpts(store));
    expect(first.sentChannels).toEqual([]);
    expect(store.logs.size).toBe(0);

    const second = await runRemind(baseOpts(store));
    expect(second.sentChannels).toEqual(["C1"]);
  });

  it("対象日にシフトが無ければ何も送らない", async () => {
    const store = new FakeStore([member("U1")]);
    getShiftsForMembers.mockResolvedValue([
      { slackUserId: "U1", shifts: [], warnings: [], revoked: false },
    ]);

    const result = await runRemind(baseOpts(store));
    expect(postMessage).not.toHaveBeenCalled();
    expect(result.skippedReason).toContain("シフトのあるメンバーがいません");
  });

  it("メンバーが0人でもエラーにならない", async () => {
    const store = new FakeStore([]);
    getShiftsForMembers.mockResolvedValue([]);

    const result = await runRemind(baseOpts(store));
    expect(result.memberCount).toBe(0);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("トークン失効のメンバーがいても他のメンバーの送信は止まらない", async () => {
    const store = new FakeStore([member("U1"), member("U2")]);
    getShiftsForMembers.mockResolvedValue([
      { slackUserId: "U1", shifts: [], warnings: [], revoked: true, error: "401" },
      ok("U2"),
    ]);

    const result = await runRemind({
      ...baseOpts(store),
      adminChannelId: "CADMIN",
    });

    expect(store.statuses.U1).toBe("revoked");
    expect(result.message).toContain("<@U2>");
    // 通知1通 + 管理チャンネルへの警告1通
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls[1][1]).toBe("CADMIN");
  });

  it("dryRun では送信もログ記録もしない", async () => {
    const store = new FakeStore([member("U1")]);
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    const result = await runRemind({ ...baseOpts(store), dryRun: true });

    expect(postMessage).not.toHaveBeenCalled();
    expect(store.logs.size).toBe(0);
    expect(result.message).toContain("<@U1>");
  });

  it("通知先が未設定なら送らず予約も残さない", async () => {
    const store = new FakeStore([member("U1")]);
    getShiftsForMembers.mockResolvedValue([ok("U1")]);

    const result = await runRemind({ ...baseOpts(store), channelIds: [] });

    expect(result.skippedReason).toBe("通知先未設定");
    expect(store.logs.size).toBe(0);
  });
});
