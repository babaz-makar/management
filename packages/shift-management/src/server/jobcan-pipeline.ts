import {
  groupEntriesByDate,
  planJobcanDayUpsert,
  type JobcanDayContext,
  type JobcanDayPlan,
} from "../logic/jobcan-plan";
import type { ExistingEvent } from "../logic/calendar-plan";
import type { ShiftEntry } from "../types";
import { executeJobcanDayPlan, listEventsForRange } from "./google-calendar";

/** カレンダー I/O 境界。テストで fake を差し込めるよう DI する */
export interface JobcanCalendarPort {
  listEventsForRange(
    refreshToken: string,
    calendarId: string,
    startDate: string,
    endDate: string,
  ): Promise<ExistingEvent[]>;
  executeDayPlan(
    refreshToken: string,
    calendarId: string,
    ctx: JobcanDayContext,
    plan: JobcanDayPlan,
  ): Promise<{ deletedCount: number; createdEventIds: string[] }>;
}

/** 既定 port: google-calendar.ts の実装をバインド */
const defaultPort: JobcanCalendarPort = {
  listEventsForRange,
  executeDayPlan: executeJobcanDayPlan,
};

export interface JobcanReconcileOptions {
  /** true なら plan までで実行しない(executeDayPlan を呼ばない) */
  dryRun: boolean;
  /** entries に無い欠番日の空日削除まで行うか(既定 false=安全側) */
  reconcileRemovals?: boolean;
}

export interface JobcanDayResult {
  date: string;
  plan: JobcanDayPlan;
  executed: { deletedCount: number; createdEventIds: string[] } | null;
  error?: string;
}

export interface JobcanReconcileResult {
  staffCode: string;
  calendarId: string;
  sourceMonth: string;
  dryRun: boolean;
  days: JobcanDayResult[];
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 1日分の plan を dryRun 判定つきで実行し結果へ変換(per-day error は握って収集) */
async function runDay(
  port: JobcanCalendarPort,
  refreshToken: string,
  calendarId: string,
  ctx: JobcanDayContext,
  plan: JobcanDayPlan,
  dryRun: boolean,
): Promise<JobcanDayResult> {
  if (dryRun) {
    return { date: ctx.date, plan, executed: null };
  }
  try {
    const executed = await port.executeDayPlan(refreshToken, calendarId, ctx, plan);
    return { date: ctx.date, plan, executed };
  } catch (err: unknown) {
    return { date: ctx.date, plan, executed: null, error: getErrorMessage(err) };
  }
}

/** existing を date でバケツ化(当日スコープ用) */
function bucketByDate(existing: ExistingEvent[]): Map<string, ExistingEvent[]> {
  const map = new Map<string, ExistingEvent[]>();
  for (const e of existing) {
    const bucket = map.get(e.date);
    if (bucket) bucket.push(e);
    else map.set(e.date, [e]);
  }
  return map;
}

/**
 * 1人1か月ぶんの確定シフト entries をカレンダーへ突合反映する。
 *
 * ガードを構造で担保:
 *   - 空 entries → 即 no-op(fetch すらしない=マス削除の起点を作らない)。
 *   - staffCode / sourceMonth の混在は throw(fail-loud)。
 *   - 取込レンジは entries の min..max(締め日スピルオーバを全カバー)。
 *   - **反復は entries に在る日だけ**。カレンダー側の日を合成しない(部分取込でのマス削除防止=最重要)。
 *   - plan へ渡す existing は当日分だけ(当日スコープ)。
 *   - reconcileRemovals=true のときのみ、レンジ内・自タグ有りの欠番日を空日削除。
 *
 * @param port テスト用に差し替え可能なカレンダー I/O。既定は google-calendar 実装。
 */
export async function runJobcanReconcile(
  entries: ShiftEntry[],
  refreshToken: string,
  calendarId: string,
  options: JobcanReconcileOptions,
  port: JobcanCalendarPort = defaultPort,
): Promise<JobcanReconcileResult> {
  // 1. 空 → no-op。fetch もしない。
  if (entries.length === 0) {
    return { staffCode: "", calendarId, sourceMonth: "", dryRun: options.dryRun, days: [] };
  }

  // 2. staffCode / sourceMonth の単一性を検証(fail-loud)。
  const staffCode = entries[0].staffCode;
  const sourceMonth = entries[0].sourceMonth;
  for (const e of entries) {
    if (e.staffCode !== staffCode) {
      throw new Error(
        `runJobcanReconcile: entries に複数の staffCode が混在(${staffCode} と ${e.staffCode})。1人分ずつ渡してください`,
      );
    }
    if (e.sourceMonth !== sourceMonth) {
      throw new Error(
        `runJobcanReconcile: entries に複数の sourceMonth が混在(${sourceMonth} と ${e.sourceMonth})。1か月分ずつ渡してください`,
      );
    }
  }

  // 3. レンジ = min..max(YYYY-MM-DD 文字列比較は単調)。
  const byDate = groupEntriesByDate(entries);
  const dates = [...byDate.keys()].sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  // 4. 既存取得 → 5. 当日スコープへバケツ化。
  const existing = await port.listEventsForRange(refreshToken, calendarId, minDate, maxDate);
  const existingByDate = bucketByDate(existing);

  const days: JobcanDayResult[] = [];

  // 6/7. entries に在る日だけ反復(カレンダー日を合成しない)。
  for (const [date, dayEntries] of byDate) {
    const ctx: JobcanDayContext = { staffCode, date };
    const dayExisting = existingByDate.get(date) ?? [];
    const plan = planJobcanDayUpsert(ctx, dayEntries, dayExisting);
    days.push(await runDay(port, refreshToken, calendarId, ctx, plan, options.dryRun));
  }

  // 8. reconcileRemovals のときだけ、レンジ内・自タグ有りの欠番日を空日削除。
  if (options.reconcileRemovals === true) {
    for (const [date, dayExisting] of existingByDate) {
      if (byDate.has(date)) continue; // entries に在る日は処理済み
      if (date < minDate || date > maxDate) continue; // レンジ外は絶対触らない
      const dayKey = `${staffCode}:${date}`;
      const hasSelf = dayExisting.some(
        (e) => e.managedBy === "jobcan-sync" && e.shiftId === dayKey,
      );
      if (!hasSelf) continue; // 自タグ無い日は触らない
      const ctx: JobcanDayContext = { staffCode, date };
      const plan = planJobcanDayUpsert(ctx, [], dayExisting);
      days.push(await runDay(port, refreshToken, calendarId, ctx, plan, options.dryRun));
    }
  }

  return { staffCode, calendarId, sourceMonth, dryRun: options.dryRun, days };
}
