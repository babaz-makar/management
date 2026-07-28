import type { ShiftEntry } from "../types";
import { normalizeTime } from "./normalize";
import type { ExistingEvent, NewEventSpec } from "./calendar-plan";

/** ジョブカン取込で作成するイベントの managedBy タグ（厳密等価で判定。部分一致は禁止） */
const MANAGED_BY_JOBCAN = "jobcan-sync";

/** 1人・1日を指す文脈。date は "YYYY-MM-DD" */
export interface JobcanDayContext {
  staffCode: string;
  date: string;
}

/**
 * 1人・1日ぶんのカレンダー反映計画（副作用なし）。
 * CalendarPlan.create は単数で当日複数コマを表せないため、日内 diff 用に新設した。
 */
export interface JobcanDayPlan {
  /** 新規作成するコマ（0..n）。当日複数コマ対応が肝 */
  creates: NewEventSpec[];
  /** 削除する自タグ event.id（0..n）。managedBy=jobcan-sync かつ shiftId=dayKey のみ */
  deleteEventIds: string[];
  /** ⚠️で人間に伝えるべき注意点 */
  warnings: string[];
}

/** スロットキー。両端 normalizeTime でゼロ埋め揺れを吸収 */
function slotKey(start: string, end: string): string {
  return `${start}-${end}`;
}

/** 作成イベント仕様を組み立てる（shiftId は jobcanShiftId、時刻は正規化済みを使う） */
function buildNewEvent(
  entry: ShiftEntry,
  start: string,
  end: string,
): NewEventSpec {
  return {
    shiftId: entry.jobcanShiftId,
    managedBy: MANAGED_BY_JOBCAN,
    date: entry.shift.date,
    startTime: start,
    endTime: end,
    summary: `シフト ${start}-${end}`,
  };
}

/** desired 側（あるべき姿）の構築結果 */
interface DesiredResult {
  /** slotKey -> 作成仕様。挿入順=entry 出現順を保持 */
  bySlot: Map<string, NewEventSpec>;
  /** 当日に end<=start の異常コマが1件でもあれば true（delete 全抑制トリガ） */
  abnormalPresent: boolean;
  warnings: string[];
}

/**
 * entries から「あるべきコマ集合」を作る。
 * - end<=start（0分/深夜跨ぎ想定外）→ 生成スキップ + 当日削除抑制フラグ on + warning
 * - 同一 slot 重複 → 1つに畳んで warning
 */
function buildDesired(
  ctx: JobcanDayContext,
  entries: ShiftEntry[],
): DesiredResult {
  const bySlot = new Map<string, NewEventSpec>();
  const warnings: string[] = [];
  let abnormalPresent = false;

  for (const entry of entries) {
    const start = normalizeTime(entry.shift.startTime);
    const end = normalizeTime(entry.shift.endTime);

    if (end <= start) {
      abnormalPresent = true;
      warnings.push(
        `${ctx.staffCode} ${ctx.date} ${start}-${end} は終了<=開始の異常コマのため生成をスキップし、` +
          "当日の自動削除も見送りました。0分シフトや深夜跨ぎは想定外です。元データを確認してください。",
      );
      continue;
    }

    const key = slotKey(start, end);
    if (bySlot.has(key)) {
      warnings.push(
        `${ctx.staffCode} ${ctx.date} ${key} が元データで重複しているため1コマに畳みました。`,
      );
      continue;
    }
    bySlot.set(key, buildNewEvent(entry, start, end));
  }

  return { bySlot, abnormalPresent, warnings };
}

/** current-self（自タグ既存）の構築結果 */
interface SelfResult {
  /** slotKey -> 自タグ ExistingEvent[]。同 slot 複数=残骸 */
  bySlot: Map<string, ExistingEvent[]>;
  warnings: string[];
}

/**
 * 既存イベントから「当ツール(jobcan-sync)が当日(dayKey)に作った自タグ」だけを厳密抽出する。
 * - managedBy が jobcan-sync でない → 管理外/手動。含めない・触らない
 * - jobcan-sync だが shiftId≠dayKey（別staff/別date/偽装）→ self に含めない + warning・削除しない
 */
function buildSelf(dayKey: string, existing: ExistingEvent[]): SelfResult {
  const bySlot = new Map<string, ExistingEvent[]>();
  const warnings: string[] = [];

  for (const e of existing) {
    if (e.managedBy !== MANAGED_BY_JOBCAN) continue; // 管理外は絶対に触らない
    if (e.shiftId !== dayKey) {
      warnings.push(
        `jobcan-sync タグの予定(${e.id})が当日の shiftId(${dayKey})と異なる shiftId(${e.shiftId ?? "なし"})を` +
          "持つため、自タグ扱いせず削除対象から除外しました。別スタッフ/別日の混入かタグ偽装の可能性があります。",
      );
      continue;
    }
    const key = slotKey(normalizeTime(e.startTime), normalizeTime(e.endTime));
    const bucket = bySlot.get(key);
    if (bucket) bucket.push(e);
    else bySlot.set(key, [e]);
  }

  return { bySlot, warnings };
}

/** 管理外(managedBy≠jobcan-sync)が占有している当日スロット集合 */
function buildForeignSlots(
  ctx: JobcanDayContext,
  existing: ExistingEvent[],
): Set<string> {
  const set = new Set<string>();
  for (const e of existing) {
    if (e.managedBy === MANAGED_BY_JOBCAN) continue;
    if (e.date !== ctx.date) continue;
    set.add(slotKey(normalizeTime(e.startTime), normalizeTime(e.endTime)));
  }
  return set;
}

/**
 * ctx(1人・1日)の全コマ entries とその日の既存 existing を突合し、日内 diff で upsert 計画を返す純関数。
 *
 * 設計要点:
 *   - dayKey=`${staffCode}:${date}`、slotKey=`${normalizeTime(start)}-${normalizeTime(end)}`。
 *   - diff: matched→skip(self残骸は1件残し他delete) / desired-only→create / self-only→delete(消えたコマ掃除)。
 *   - 管理外・偽装タグ(shiftId≠dayKey)は絶対 delete しない（不変条件）。
 *   - 異常保護: 当日に end<=start が1件でもあれば self-only の delete を全抑制
 *     （matched の残骸掃除は継続、create は正常コマのみ）。
 *
 * fail-loud: entries は ctx の1人1日分のみ。別staff/別date が混じれば throw（束ね間違いを黙って通さない）。
 */
export function planJobcanDayUpsert(
  ctx: JobcanDayContext,
  entries: ShiftEntry[],
  existing: ExistingEvent[],
): JobcanDayPlan {
  for (const entry of entries) {
    if (entry.staffCode !== ctx.staffCode || entry.shift.date !== ctx.date) {
      throw new Error(
        `planJobcanDayUpsert に ctx(${ctx.staffCode}:${ctx.date})と異なるコマ` +
          `(${entry.staffCode}:${entry.shift.date})が混入しています。日・スタッフ単位で束ねてから渡してください`,
      );
    }
  }

  const dayKey = `${ctx.staffCode}:${ctx.date}`;
  const desired = buildDesired(ctx, entries);
  const self = buildSelf(dayKey, existing);
  const foreignSlots = buildForeignSlots(ctx, existing);

  const warnings = [...desired.warnings, ...self.warnings];
  const creates: NewEventSpec[] = [];
  const deleteEventIds: string[] = [];

  // desired 側を出現順に処理: matched→skip(+残骸掃除) / desired-only→create。foreign 重なりは warning。
  for (const [key, spec] of desired.bySlot) {
    const selfBucket = self.bySlot.get(key);
    if (selfBucket && selfBucket.length > 0) {
      // 一致: 作成不要。残骸(2件以上)は先頭を残し他を掃除（異常時も継続）
      for (let i = 1; i < selfBucket.length; i++) {
        deleteEventIds.push(selfBucket[i].id);
      }
    } else {
      creates.push(spec);
      if (foreignSlots.has(key)) {
        warnings.push(
          `${ctx.date} ${key} に当ツール管理外の予定があります。` +
            "作成しますが管理外予定は自動削除しません。重複の可能性があるため手動で確認してください。",
        );
      }
    }
  }

  // self-only(desired に無い自タグ)=消えたコマ掃除。ただし異常時は当日 delete を全抑制。
  if (!desired.abnormalPresent) {
    for (const [key, bucket] of self.bySlot) {
      if (desired.bySlot.has(key)) continue; // matched は処理済み
      for (const e of bucket) deleteEventIds.push(e.id);
    }
  }

  return { creates, deleteEventIds, warnings };
}

/**
 * entries を date でバケツ化する（出現順を保持）。
 * 月ぶんの ShiftEntry[] を日ごとに束ね、planJobcanDayUpsert の ctx 単位へ渡すために使う。
 */
export function groupEntriesByDate(
  entries: ShiftEntry[],
): Map<string, ShiftEntry[]> {
  const map = new Map<string, ShiftEntry[]>();
  for (const entry of entries) {
    const bucket = map.get(entry.shift.date);
    if (bucket) bucket.push(entry);
    else map.set(entry.shift.date, [entry]);
  }
  return map;
}
