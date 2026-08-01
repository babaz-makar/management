import { describe, expect, it } from "vitest";
import {
  APPLY_OFF_BANNER_MESSAGE,
  currentJstYearMonth,
  formatImportDate,
  monthRangeIso,
  resolveHomeState,
  type HomeSnapshot,
} from "../logic/jobcan-home-state";
import type { ImportHistoryRow } from "../server/jobcan-import-history-neon-core";

/** 正常系のベース snapshot(各テストで一部だけ壊す)。 */
function baseSnapshot(overrides?: Partial<HomeSnapshot>): HomeSnapshot {
  const latest: ImportHistoryRow = {
    id: 1,
    executedAt: "2026-08-01T09:30:00.000Z",
    dryRun: false,
    totalFiles: 3,
    importedFiles: 3,
    erroredFiles: 0,
    totalEntries: 40,
    staffMonthCount: 2,
    totalCreates: 30,
    totalDeletes: 0,
    warningCount: 0,
    conversionErrorCount: 0,
    reconcileError: false,
    warningBreakdown: {},
  };
  return {
    statusOk: true,
    applyEnabled: true,
    historyOk: true,
    summary: { latestImport: latest, monthlyRealCount: 1, unregisteredCount: 0 },
    staffOk: true,
    staffCount: 10,
    ...overrides,
  };
}

describe("resolveHomeState: primary の優先順位(1つだけ選ぶ)", () => {
  it("いずれかの取得失敗が最優先で error になる", () => {
    for (const broken of [{ statusOk: false }, { historyOk: false }, { staffOk: false }]) {
      const state = resolveHomeState(baseSnapshot(broken));
      expect(state.primary.kind).toBe("error");
      expect(state.primary.message).toContain("状態を確認できませんでした");
      expect(state.primary.ctaHref).toBeNull();
    }
  });

  it("名簿0件は error の次に優先し needStaff(→ /jobcan/staff)", () => {
    const state = resolveHomeState(baseSnapshot({ staffCount: 0 }));
    expect(state.primary.kind).toBe("needStaff");
    expect(state.primary.message).toContain("名簿を登録");
    expect(state.primary.ctaHref).toBe("/jobcan/staff");
  });

  it("未登録>0 は hasUnregistered で人数を出す(→ /jobcan/staff)", () => {
    const state = resolveHomeState(
      baseSnapshot({
        summary: {
          latestImport: baseSnapshot().summary!.latestImport,
          monthlyRealCount: 1,
          unregisteredCount: 3,
        },
      }),
    );
    expect(state.primary.kind).toBe("hasUnregistered");
    expect(state.primary.message).toContain("3");
    expect(state.primary.unregisteredCount).toBe(3);
    expect(state.primary.ctaHref).toBe("/jobcan/staff");
  });

  it("取込記録なし(latestImport=null)は noImport(→ /jobcan)", () => {
    const state = resolveHomeState(
      baseSnapshot({
        summary: { latestImport: null, monthlyRealCount: 0, unregisteredCount: 0 },
      }),
    );
    expect(state.primary.kind).toBe("noImport");
    expect(state.primary.message).toContain("取込の記録はまだありません");
    expect(state.primary.ctaHref).toBe("/jobcan");
  });

  it("通常は直近の取込(本反映)を日付付きで出す(→ /jobcan)", () => {
    const state = resolveHomeState(baseSnapshot());
    expect(state.primary.kind).toBe("normal");
    expect(state.primary.message).toContain("直近の取込");
    expect(state.primary.message).toContain("本反映");
    expect(state.primary.ctaHref).toBe("/jobcan");
    expect(state.primary.latestImport?.id).toBe(1);
  });

  it("通常・dry-run の直近取込は (dry-run) 表記になる", () => {
    const latest = { ...baseSnapshot().summary!.latestImport!, dryRun: true };
    const state = resolveHomeState(
      baseSnapshot({
        summary: { latestImport: latest, monthlyRealCount: 0, unregisteredCount: 0 },
      }),
    );
    expect(state.primary.kind).toBe("normal");
    expect(state.primary.message).toContain("dry-run");
  });
});

describe("resolveHomeState: applyEnabled バナー(primary と別枠の常時判定)", () => {
  it("apply が既知オフのときだけバナーを出す", () => {
    expect(resolveHomeState(baseSnapshot({ applyEnabled: false })).showApplyOffBanner).toBe(true);
    expect(resolveHomeState(baseSnapshot({ applyEnabled: true })).showApplyOffBanner).toBe(false);
  });

  it("status 取得失敗時は apply 状態が不明なので誤ったオフバナーを出さない", () => {
    const state = resolveHomeState(baseSnapshot({ statusOk: false, applyEnabled: false }));
    expect(state.showApplyOffBanner).toBe(false);
  });

  it("バナー文言は固定(本反映オフの明示)", () => {
    expect(APPLY_OFF_BANNER_MESSAGE).toContain("本反映");
    expect(APPLY_OFF_BANNER_MESSAGE).toContain("オフ");
  });
});

describe("formatImportDate: JST で M月D日 に整形", () => {
  it("UTC 09:30 は JST 同日 → 8月1日", () => {
    expect(formatImportDate("2026-08-01T09:30:00.000Z")).toBe("8月1日");
  });

  it("UTC 20:00 は JST 翌日 → 8月2日(タイムゾーン跨ぎ)", () => {
    expect(formatImportDate("2026-08-01T20:00:00.000Z")).toBe("8月2日");
  });

  it("不正な日時は握りつぶさず固定文言を返す", () => {
    expect(formatImportDate("not-a-date")).toBe("日時不明");
  });
});

describe("monthRangeIso: JST 暦月の境界を UTC ISO で返す(M-2)", () => {
  it("JST 8月 = [7/31 15:00Z, 8/31 15:00Z)(=JST 8/1 00:00 〜 9/1 00:00)", () => {
    const { startIso, endIso } = monthRangeIso(2026, 8);
    expect(startIso).toBe("2026-07-31T15:00:00.000Z");
    expect(endIso).toBe("2026-08-31T15:00:00.000Z");
  });

  it("12月は翌年1月へ繰り上がる(JST 境界)", () => {
    const { startIso, endIso } = monthRangeIso(2026, 12);
    expect(startIso).toBe("2026-11-30T15:00:00.000Z");
    expect(endIso).toBe("2026-12-31T15:00:00.000Z");
  });
});

describe("currentJstYearMonth: 現在時刻を JST 暦月へ(月初深夜帯の取りこぼし防止)", () => {
  it("JST 8/1 00:30(=7/31 15:30Z)は 2026年8月", () => {
    const nowMs = Date.parse("2026-07-31T15:30:00.000Z");
    expect(currentJstYearMonth(nowMs)).toEqual({ year: 2026, month: 8 });
  });

  it("JST 7/31 23:30(=7/31 14:30Z)はまだ 2026年7月", () => {
    const nowMs = Date.parse("2026-07-31T14:30:00.000Z");
    expect(currentJstYearMonth(nowMs)).toEqual({ year: 2026, month: 7 });
  });

  it("JST 1/1 00:10(=前年 12/31 15:10Z)は年跨ぎで翌年1月", () => {
    const nowMs = Date.parse("2026-12-31T15:10:00.000Z");
    expect(currentJstYearMonth(nowMs)).toEqual({ year: 2027, month: 1 });
  });
});
