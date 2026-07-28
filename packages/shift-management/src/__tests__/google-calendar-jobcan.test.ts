import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewEventSpec } from "../logic/calendar-plan";
import type { JobcanDayContext, JobcanDayPlan } from "../logic/jobcan-plan";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
        generateAuthUrl() {
          return "";
        }
      },
    },
    calendar: () => ({
      events: {
        list: mocks.list,
        get: mocks.get,
        delete: mocks.del,
        insert: mocks.insert,
      },
    }),
  },
}));

import {
  executeJobcanDayPlan,
  listEventsForRange,
} from "../server/google-calendar";

/** events.list の item を組み立てる */
function listItem(
  id: string,
  startDt: string,
  endDt: string,
  priv?: Record<string, string>,
): unknown {
  return {
    id,
    start: { dateTime: startDt },
    end: { dateTime: endDt },
    extendedProperties: priv ? { private: priv } : undefined,
  };
}

function allDayItem(id: string, date: string): unknown {
  return { id, start: { date }, end: { date } };
}

const SPEC: NewEventSpec = {
  shiftId: "A0187:2026-08-01",
  managedBy: "jobcan-sync",
  date: "2026-08-01",
  startTime: "09:00",
  endTime: "18:00",
  summary: "シフト 09:00-18:00",
};
const CTX: JobcanDayContext = { staffCode: "A0187", date: "2026-08-01" };

beforeEach(() => {
  mocks.list.mockReset();
  mocks.get.mockReset();
  mocks.del.mockReset();
  mocks.insert.mockReset();
});

describe("listEventsForRange: クエリ", () => {
  it("timeMin/timeMax/singleEvents/orderBy/maxResults を JST 境界で渡す", async () => {
    mocks.list.mockResolvedValueOnce({ data: { items: [] } });

    await listEventsForRange("rt", "cal", "2026-08-01", "2026-08-05");

    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "cal",
        timeMin: "2026-08-01T00:00:00+09:00",
        timeMax: "2026-08-05T23:59:59+09:00",
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 2500,
      }),
    );
  });
});

describe("listEventsForRange: ページング", () => {
  it("nextPageToken が尽きるまでループし2ページを結合する", async () => {
    mocks.list
      .mockResolvedValueOnce({
        data: {
          items: [listItem("a", "2026-08-01T09:00:00+09:00", "2026-08-01T18:00:00+09:00")],
          nextPageToken: "p2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [listItem("b", "2026-08-02T09:00:00+09:00", "2026-08-02T18:00:00+09:00")],
        },
      });

    const res = await listEventsForRange("rt", "cal", "2026-08-01", "2026-08-05");

    expect(res).toHaveLength(2);
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.list.mock.calls[1][0].pageToken).toBe("p2");
  });
});

describe("listEventsForRange: 正規化", () => {
  it("終日イベント(start.date のみ)は除外する", async () => {
    mocks.list.mockResolvedValueOnce({
      data: {
        items: [
          allDayItem("allday", "2026-08-01"),
          listItem("timed", "2026-08-01T09:00:00+09:00", "2026-08-01T18:00:00+09:00"),
        ],
      },
    });

    const res = await listEventsForRange("rt", "cal", "2026-08-01", "2026-08-05");

    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("timed");
  });

  it("managedBy/shiftId は verbatim(空白・大文字化を加工しない)", async () => {
    mocks.list.mockResolvedValueOnce({
      data: {
        items: [
          listItem("v", "2026-08-01T09:00:00+09:00", "2026-08-01T18:00:00+09:00", {
            managedBy: " JOBCAN-SYNC ",
            shiftId: " A0187:2026-08-01 ",
          }),
        ],
      },
    });

    const res = await listEventsForRange("rt", "cal", "2026-08-01", "2026-08-05");

    expect(res[0].managedBy).toBe(" JOBCAN-SYNC "); // trim も lower もしない
    expect(res[0].shiftId).toBe(" A0187:2026-08-01 ");
  });

  it("seconds付き dateTime でも startTime/endTime は HH:MM 厳密", async () => {
    mocks.list.mockResolvedValueOnce({
      data: {
        items: [listItem("s", "2026-08-01T09:05:30+09:00", "2026-08-01T18:45:59+09:00")],
      },
    });

    const res = await listEventsForRange("rt", "cal", "2026-08-01", "2026-08-05");

    expect(res[0].startTime).toBe("09:05");
    expect(res[0].endTime).toBe("18:45");
  });

  it("date は JST の暦日でバケツ化する", async () => {
    mocks.list.mockResolvedValueOnce({
      data: {
        items: [listItem("late", "2026-08-03T23:30:00+09:00", "2026-08-04T01:00:00+09:00")],
      },
    });

    const res = await listEventsForRange("rt", "cal", "2026-08-01", "2026-08-05");

    expect(res[0].date).toBe("2026-08-03");
    expect(res[0].startTime).toBe("23:30");
  });

  it("private が無いイベントは shiftId/managedBy が undefined", async () => {
    mocks.list.mockResolvedValueOnce({
      data: {
        items: [listItem("bare", "2026-08-01T09:00:00+09:00", "2026-08-01T18:00:00+09:00")],
      },
    });

    const res = await listEventsForRange("rt", "cal", "2026-08-01", "2026-08-05");

    expect(res[0].shiftId).toBeUndefined();
    expect(res[0].managedBy).toBeUndefined();
  });
});

describe("executeJobcanDayPlan: delete→create 順とTOCTOU再照合", () => {
  it("TOCTOU一致なら delete してから create、createdEventIds を返す", async () => {
    const plan: JobcanDayPlan = {
      creates: [SPEC],
      deleteEventIds: ["d1"],
      warnings: [],
    };
    mocks.get.mockResolvedValueOnce({
      data: { extendedProperties: { private: { managedBy: "jobcan-sync", shiftId: "A0187:2026-08-01" } } },
    });
    mocks.del.mockResolvedValueOnce({});
    mocks.insert.mockResolvedValueOnce({ data: { id: "new1" } });

    const res = await executeJobcanDayPlan("rt", "cal", CTX, plan);

    expect(res.deletedCount).toBe(1);
    expect(res.createdEventIds).toEqual(["new1"]);
    expect(res.skippedMismatch).toBe(0);
    expect(res.skippedGone).toBe(0);
    // delete が insert より先
    expect(mocks.del.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.insert.mock.invocationCallOrder[0],
    );
  });

  it("managedBy が jobcan-sync でなければ削除せず skippedMismatch を計上", async () => {
    const plan: JobcanDayPlan = { creates: [], deleteEventIds: ["d1"], warnings: [] };
    mocks.get.mockResolvedValueOnce({
      data: { extendedProperties: { private: { managedBy: "shift-management", shiftId: "A0187:2026-08-01" } } },
    });

    const res = await executeJobcanDayPlan("rt", "cal", CTX, plan);

    expect(res.deletedCount).toBe(0);
    expect(res.skippedMismatch).toBe(1);
    expect(res.skippedGone).toBe(0);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("shiftId が dayKey と異なれば削除せず skippedMismatch を計上", async () => {
    const plan: JobcanDayPlan = { creates: [], deleteEventIds: ["d1"], warnings: [] };
    mocks.get.mockResolvedValueOnce({
      data: { extendedProperties: { private: { managedBy: "jobcan-sync", shiftId: "B0002:2026-08-01" } } },
    });

    const res = await executeJobcanDayPlan("rt", "cal", CTX, plan);

    expect(res.deletedCount).toBe(0);
    expect(res.skippedMismatch).toBe(1);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("extendedProperties 丸ごと無しなら mismatch 計上して削除しない", async () => {
    const plan: JobcanDayPlan = { creates: [], deleteEventIds: ["d1"], warnings: [] };
    mocks.get.mockResolvedValueOnce({ data: {} }); // extendedProperties 無し

    const res = await executeJobcanDayPlan("rt", "cal", CTX, plan);

    expect(res.deletedCount).toBe(0);
    expect(res.skippedMismatch).toBe(1);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("get が 404 なら冪等 skip し skippedGone を計上(throwalso削除もしない)", async () => {
    const plan: JobcanDayPlan = { creates: [], deleteEventIds: ["gone"], warnings: [] };
    mocks.get.mockRejectedValueOnce({ code: 404 });

    const res = await executeJobcanDayPlan("rt", "cal", CTX, plan);

    expect(res.deletedCount).toBe(0);
    expect(res.skippedGone).toBe(1);
    expect(res.skippedMismatch).toBe(0);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("delete 2件中 1件own・1件mismatch → deletedCount=1, skippedMismatch=1", async () => {
    const plan: JobcanDayPlan = { creates: [], deleteEventIds: ["own1", "bad2"], warnings: [] };
    mocks.get
      .mockResolvedValueOnce({
        data: { extendedProperties: { private: { managedBy: "jobcan-sync", shiftId: "A0187:2026-08-01" } } },
      })
      .mockResolvedValueOnce({
        data: { extendedProperties: { private: { managedBy: "jobcan-sync", shiftId: "B0002:2026-08-01" } } },
      });
    mocks.del.mockResolvedValueOnce({});

    const res = await executeJobcanDayPlan("rt", "cal", CTX, plan);

    expect(res.deletedCount).toBe(1);
    expect(res.skippedMismatch).toBe(1);
    expect(res.skippedGone).toBe(0);
    expect(mocks.del).toHaveBeenCalledTimes(1);
    expect(mocks.del.mock.calls[0][0].eventId).toBe("own1"); // own のみ消す
  });

  it("get が 404 以外のエラーなら throw", async () => {
    const plan: JobcanDayPlan = { creates: [], deleteEventIds: ["d1"], warnings: [] };
    mocks.get.mockRejectedValueOnce({ code: 500 });

    await expect(executeJobcanDayPlan("rt", "cal", CTX, plan)).rejects.toThrow();
  });

  it("複数コマ create で createdEventIds を順に返す", async () => {
    const spec2: NewEventSpec = { ...SPEC, startTime: "19:00", endTime: "22:00", summary: "シフト 19:00-22:00" };
    const plan: JobcanDayPlan = { creates: [SPEC, spec2], deleteEventIds: [], warnings: [] };
    mocks.insert
      .mockResolvedValueOnce({ data: { id: "n1" } })
      .mockResolvedValueOnce({ data: { id: "n2" } });

    const res = await executeJobcanDayPlan("rt", "cal", CTX, plan);

    expect(res.createdEventIds).toEqual(["n1", "n2"]);
    expect(res.deletedCount).toBe(0);
    expect(res.skippedMismatch).toBe(0);
    expect(res.skippedGone).toBe(0);
  });
});
