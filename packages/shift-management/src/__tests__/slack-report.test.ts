import { describe, expect, it } from "vitest";
import { parseShiftReport } from "../parsers/slack-report";

/** DESIGN.md に載っている実サンプル文面 */
const REAL_SAMPLE = `@tanaka(rui)
お疲れ様です。
シフト変更お願いします！

【シフト変更依頼】
6/30 16:00〜22:00→12:00〜18:00

【変更理由】
定例等があるため`;

const BASE_INPUT = {
  slackUserId: "U012ABCDEF",
  channelId: "C0SHIFTCH",
  messageTs: "1750900000.000200",
  messageDate: new Date(2026, 5, 26), // 2026-06-26
};

describe("parseShiftReport: 実サンプル", () => {
  it("1件のmodifyとしてパースする", () => {
    const changes = parseShiftReport({ ...BASE_INPUT, text: REAL_SAMPLE });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      id: "1750900000.000200:0",
      kind: "modify",
      slackUserId: "U012ABCDEF",
      before: { date: "2026-06-30", startTime: "16:00", endTime: "22:00" },
      after: { date: "2026-06-30", startTime: "12:00", endTime: "18:00" },
      reason: "定例等があるため",
      sourceMessageTs: "1750900000.000200",
      channelId: "C0SHIFTCH",
    });
  });

  it("対象者は投稿者本人（本文の@メンションは無視）", () => {
    const changes = parseShiftReport({ ...BASE_INPUT, text: REAL_SAMPLE });
    expect(changes[0].slackUserId).toBe("U012ABCDEF");
  });
});

describe("parseShiftReport: 表記揺れ", () => {
  it("全角数字・全角コロンを正規化してパースする", () => {
    const text = `【シフト変更依頼】
６/３０ １６：００〜２２：００→１２：００〜１８：００`;
    const changes = parseShiftReport({ ...BASE_INPUT, text });
    expect(changes).toHaveLength(1);
    expect(changes[0].before).toEqual({
      date: "2026-06-30",
      startTime: "16:00",
      endTime: "22:00",
    });
  });

  it("「6月30日」形式・矢印/波線の揺れ（-> ⇒ ~ -）を許容する", () => {
    const arrows = [
      "6月30日 16:00~22:00->12:00~18:00",
      "6/30 16:00-22:00⇒12:00-18:00",
    ];
    for (const line of arrows) {
      const changes = parseShiftReport({
        ...BASE_INPUT,
        text: `【シフト変更依頼】\n${line}`,
      });
      expect(changes, line).toHaveLength(1);
      expect(changes[0].after).toEqual({
        date: "2026-06-30",
        startTime: "12:00",
        endTime: "18:00",
      });
    }
  });
});

describe("parseShiftReport: 複数行・境界", () => {
  it("複数行の変更依頼は行ごとに1件返す（idは行番号つき）", () => {
    const text = `【シフト変更依頼】
7/1 9:00〜15:00→13:00〜19:00
7/3 16:00〜22:00→9:00〜15:00

【変更理由】
授業のため`;
    const changes = parseShiftReport({ ...BASE_INPUT, text });
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.id)).toEqual([
      "1750900000.000200:0",
      "1750900000.000200:1",
    ]);
    expect(changes[1].before?.date).toBe("2026-07-03");
    expect(changes.every((c) => c.reason === "授業のため")).toBe(true);
  });

  it("【シフト変更依頼】見出しが無くても本文全体から拾う", () => {
    const text = "6/30 16:00〜22:00→12:00〜18:00 でお願いします";
    const changes = parseShiftReport({ ...BASE_INPUT, text });
    expect(changes).toHaveLength(1);
  });

  it("変更行が無ければ空配列（Claude APIフォールバック行き）", () => {
    const text = "お疲れ様です。シフト変更お願いします！";
    expect(parseShiftReport({ ...BASE_INPUT, text })).toEqual([]);
  });

  it("【変更理由】が無ければ reason は undefined", () => {
    const text = "【シフト変更依頼】\n6/30 16:00〜22:00→12:00〜18:00";
    const changes = parseShiftReport({ ...BASE_INPUT, text });
    expect(changes[0].reason).toBeUndefined();
  });
});

describe("parseShiftReport: 年補完", () => {
  it("12月の報告で「1/5」は翌年と判定する", () => {
    const changes = parseShiftReport({
      ...BASE_INPUT,
      messageDate: new Date(2026, 11, 20), // 2026-12-20
      text: "【シフト変更依頼】\n1/5 16:00〜22:00→12:00〜18:00",
    });
    expect(changes[0].before?.date).toBe("2027-01-05");
  });

  it("messageDate 省略時は messageTs から基準日を算出する", () => {
    // 1782436000 = 2026-06-26 (UTC)
    const changes = parseShiftReport({
      slackUserId: "U012ABCDEF",
      channelId: "C0SHIFTCH",
      messageTs: "1782436000.000200",
      text: "【シフト変更依頼】\n6/30 16:00〜22:00→12:00〜18:00",
    });
    expect(changes[0].before?.date).toBe("2026-06-30");
  });
});
