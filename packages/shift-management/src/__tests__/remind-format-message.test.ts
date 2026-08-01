import { describe, expect, it } from "vitest";
import {
  formatRemindMessage,
  formatWarningMessage,
} from "../remind/format-message";
import type { ShiftEntry } from "../remind/types";

function shift(
  slackUserId: string,
  startTime: string,
  endTime: string,
  crossesMidnight = false,
): ShiftEntry {
  return {
    slackUserId,
    eventUid: `${slackUserId}-evt`,
    date: "2026-08-02",
    startTime,
    endTime,
    startIso: `2026-08-02T${startTime}:00+09:00`,
    endIso: `2026-08-0${crossesMidnight ? 3 : 2}T${endTime}:00+09:00`,
    crossesMidnight,
  };
}

describe("通知文の組み立て", () => {
  it("前日通知はカレンダー絵文字と「明日」", () => {
    const text = formatRemindMessage({
      timing: "prev_night",
      date: "2026-08-02",
      shifts: [shift("U1", "10:00", "19:00"), shift("U2", "13:00", "22:00")],
      changeChannelLabel: "<#C999>",
    });

    expect(text).toBe(
      [
        ":calendar: 明日 8/2(日) のシフト",
        "",
        "<@U1> 10:00 - 19:00",
        "<@U2> 13:00 - 22:00",
        "",
        "変更がある場合は <#C999> まで",
      ].join("\n"),
    );
  });

  it("当日通知は太陽絵文字と「本日」", () => {
    const text = formatRemindMessage({
      timing: "morning",
      date: "2026-08-02",
      shifts: [shift("U1", "10:00", "19:00")],
    });
    expect(text).toBe(
      [":sunny: 本日 8/2(日) のシフト", "", "<@U1> 10:00 - 19:00"].join("\n"),
    );
  });

  it("開始時刻の早い順に並べる", () => {
    const text = formatRemindMessage({
      timing: "morning",
      date: "2026-08-02",
      shifts: [shift("U2", "13:00", "22:00"), shift("U1", "09:00", "18:00")],
    });
    expect(text).toContain("<@U1> 09:00 - 18:00\n<@U2> 13:00 - 22:00");
  });

  it("日跨ぎシフトは終了時刻に「翌」を付ける", () => {
    const text = formatRemindMessage({
      timing: "prev_night",
      date: "2026-08-02",
      shifts: [shift("U1", "22:00", "06:00", true)],
    });
    expect(text).toContain("<@U1> 22:00 - 翌6:00");
  });

  it("対象0人なら null（通知を送らない）", () => {
    expect(
      formatRemindMessage({ timing: "morning", date: "2026-08-02", shifts: [] }),
    ).toBeNull();
  });

  it("警告が無ければ管理チャンネルへは投げない", () => {
    expect(formatWarningMessage("2026-08-02", [])).toBeNull();
    expect(formatWarningMessage("2026-08-02", ["終日予定があります"])).toContain(
      "• 終日予定があります",
    );
  });
});
