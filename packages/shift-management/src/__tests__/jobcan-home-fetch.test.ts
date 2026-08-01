import { describe, expect, it } from "vitest";
import {
  buildHomeSnapshot,
  normalizeHistoryResponse,
  normalizeStaffCountResponse,
  normalizeStatusResponse,
  resolveHistoryLimit,
} from "../logic/jobcan-home-fetch";
import type { ImportHistorySummary } from "../logic/jobcan-import-history-types";

const validSummary: ImportHistorySummary = {
  latestImport: null,
  monthlyRealCount: 0,
  unregisteredCount: 0,
};

describe("resolveHistoryLimit: ?limit= の不正値フォールバック/クランプ", () => {
  it.each([
    ["null(未指定)", null, 20],
    ["abc(非数)", "abc", 20],
    ["空文字", "", 20],
    ["-0", "-0", 20],
    ["NaN", "NaN", 20],
    ["Infinity", "Infinity", 20],
    ["0", "0", 20],
    ["負数 -5", "-5", 20],
    ["1.9(小数→切り捨て)", "1.9", 1],
    ["20(正常)", "20", 20],
    ["1e9(上限100へクランプ)", "1e9", 100],
    ["999999(上限100へクランプ)", "999999", 100],
  ])("%s → %d", (_label, raw, expected) => {
    expect(resolveHistoryLimit(raw as string | null)).toBe(expected);
  });
});

describe("normalizeStatusResponse: status 応答の畳み込み", () => {
  it("httpOk かつ applyEnabled=true → {ok:true, applyEnabled:true}", () => {
    expect(normalizeStatusResponse(true, { applyEnabled: true })).toEqual({
      ok: true,
      applyEnabled: true,
    });
  });

  it("httpOk だが applyEnabled が true 以外 → applyEnabled:false", () => {
    expect(normalizeStatusResponse(true, { applyEnabled: "true" })).toEqual({
      ok: true,
      applyEnabled: false,
    });
    expect(normalizeStatusResponse(true, {})).toEqual({
      ok: true,
      applyEnabled: false,
    });
  });

  it("httpOk=false は取得失敗として ok:false", () => {
    expect(normalizeStatusResponse(false, { applyEnabled: true })).toEqual({
      ok: false,
    });
  });

  it("body が非オブジェクト(null/文字列)でも例外にせず applyEnabled:false", () => {
    expect(normalizeStatusResponse(true, null)).toEqual({
      ok: true,
      applyEnabled: false,
    });
    expect(normalizeStatusResponse(true, "boom")).toEqual({
      ok: true,
      applyEnabled: false,
    });
  });
});

describe("normalizeHistoryResponse: summary の as キャスト前検証", () => {
  it("正しい summary 形なら ok:true", () => {
    expect(normalizeHistoryResponse(true, { summary: validSummary })).toEqual({
      ok: true,
      summary: validSummary,
    });
  });

  it("httpOk=false は ok:false", () => {
    expect(normalizeHistoryResponse(false, { summary: validSummary })).toEqual({
      ok: false,
    });
  });

  it("summary 欠落/型不正(数値でない)は ok:false(汚染値を信用しない)", () => {
    expect(normalizeHistoryResponse(true, {})).toEqual({ ok: false });
    expect(
      normalizeHistoryResponse(true, {
        summary: { latestImport: null, monthlyRealCount: "x", unregisteredCount: 0 },
      }),
    ).toEqual({ ok: false });
    expect(normalizeHistoryResponse(true, null)).toEqual({ ok: false });
  });

  it("monthlyRealCount は数値だが unregisteredCount が非数値なら ok:false", () => {
    expect(
      normalizeHistoryResponse(true, {
        summary: { latestImport: null, monthlyRealCount: 3, unregisteredCount: null },
      }),
    ).toEqual({ ok: false });
  });

  it("latestImport が null でも object でもない値は ok:false", () => {
    expect(
      normalizeHistoryResponse(true, {
        summary: { latestImport: 123, monthlyRealCount: 0, unregisteredCount: 0 },
      }),
    ).toEqual({ ok: false });
  });
});

describe("normalizeStaffCountResponse: entries.length の畳み込み", () => {
  it("entries 配列の length を数える", () => {
    expect(
      normalizeStaffCountResponse(true, { entries: [{}, {}, {}] }),
    ).toEqual({ ok: true, count: 3 });
  });

  it("entries が無い/配列でないなら count:0", () => {
    expect(normalizeStaffCountResponse(true, {})).toEqual({ ok: true, count: 0 });
    expect(normalizeStaffCountResponse(true, { entries: "x" })).toEqual({
      ok: true,
      count: 0,
    });
  });

  it("httpOk=false は ok:false", () => {
    expect(normalizeStaffCountResponse(false, { entries: [] })).toEqual({
      ok: false,
    });
  });
});

describe("buildHomeSnapshot: 3ソースを HomeSnapshot へ畳み込む", () => {
  it("全成功なら各値を反映", () => {
    const snapshot = buildHomeSnapshot(
      { ok: true, applyEnabled: false },
      { ok: true, summary: { ...validSummary, monthlyRealCount: 2 } },
      { ok: true, count: 7 },
    );
    expect(snapshot).toEqual({
      statusOk: true,
      applyEnabled: false,
      historyOk: true,
      summary: { ...validSummary, monthlyRealCount: 2 },
      staffOk: true,
      staffCount: 7,
    });
  });

  it("失敗ソースは ok:false と既定値へ畳み込む(握りつぶさず error 判定へ渡す)", () => {
    const snapshot = buildHomeSnapshot(
      { ok: false },
      { ok: false },
      { ok: false },
    );
    expect(snapshot).toEqual({
      statusOk: false,
      applyEnabled: false,
      historyOk: false,
      summary: null,
      staffOk: false,
      staffCount: 0,
    });
  });
});
