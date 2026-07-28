import type { ShiftEntry } from "../types";
import type { CalendarPlan, ExistingEvent, NewEventSpec } from "./calendar-plan";

/** ジョブカン取込で作成するイベントの managedBy タグ */
const MANAGED_BY_JOBCAN = "jobcan-sync";

/** entry から作成イベント仕様を組み立てる（shiftId は jobcanShiftId をそのまま使う） */
function buildNewEvent(entry: ShiftEntry): NewEventSpec {
  const { date, startTime, endTime } = entry.shift;
  return {
    shiftId: entry.jobcanShiftId,
    managedBy: MANAGED_BY_JOBCAN,
    date,
    startTime,
    endTime,
    summary: `シフト ${startTime}-${endTime}`,
  };
}

/**
 * ジョブカン確定シフト1コマ(ShiftEntry)をカレンダーへ upsert する操作計画を返す純関数。
 * 副作用なし。「何を消して何を作るか」と「⚠️注意すべき警告」だけを返す。
 *
 * ルール:
 *   1. 自タグ(managedBy=jobcan-sync)かつ shiftId 一致で時刻も一致 → skip（冪等）
 *   2. 自タグ shiftId 一致だが時刻違い → 旧を delete + 新を create
 *   3. 一致する自タグが無い → create
 *   4. 管理外(managedBy≠jobcan-sync)の予定は絶対 delete しない。
 *      同時刻帯に居ても create のみ行い、重複注意を warnings に積む
 *   5. 終了 < 開始（深夜跨ぎ想定外のデータ異常）はイベントを生成せず warnings に明示。
 *      parseJobcanSheet は end<start を verbatim で残す設計のため、この planning 層で loud に弾く。
 *
 * ルール5を throw ではなく warning にした理由:
 *   calendar-plan.ts の planCalendarUpsert が「異常は throw せず warnings へ積んで plan を返す」
 *   流儀であり、これに揃える。1件の異常データで取込バッチ全体を落とさない
 *   （parseJobcanSheet の行単位ロバスト性とも整合）。warnings は上位で ⚠️ として可視化される。
 */
export function planJobcanEntryUpsert(
  entry: ShiftEntry,
  existing: ExistingEvent[],
): CalendarPlan {
  const warnings: string[] = [];
  const { date, startTime, endTime } = entry.shift;

  // --- ルール5: 終了<開始はデータ異常として loud に弾く（生成しない） ---
  if (endTime < startTime) {
    warnings.push(
      `${date} のシフトは終了(${endTime})が開始(${startTime})より前のため反映しませんでした。` +
        "深夜跨ぎ勤務は想定していないためデータ異常として扱います。元データを確認してください。",
    );
    return { deleteEventIds: [], create: null, warnings };
  }

  // --- 自タグ(jobcan-sync)かつ shiftId 一致の既存イベント ---
  const selfManaged = existing.filter(
    (e) =>
      e.managedBy === MANAGED_BY_JOBCAN && e.shiftId === entry.jobcanShiftId,
  );

  // --- ルール1: 時刻も一致する自タグがあれば冪等 skip ---
  const identical = selfManaged.find(
    (e) => e.startTime === startTime && e.endTime === endTime,
  );
  if (identical) {
    return { deleteEventIds: [], create: null, warnings: [] };
  }

  // --- ルール2: 残る自タグ(時刻違い)は全て置き換え対象として delete ---
  const deleteEventIds = selfManaged.map((e) => e.id);

  // --- ルール4: 管理外の同時刻帯予定は消さず、重複注意を積む ---
  const foreignSameSlot = existing.filter(
    (e) =>
      e.managedBy !== MANAGED_BY_JOBCAN &&
      e.date === date &&
      e.startTime === startTime &&
      e.endTime === endTime,
  );
  if (foreignSameSlot.length > 0) {
    warnings.push(
      `${date} ${startTime}-${endTime} に当ツール管理外の予定が${foreignSameSlot.length}件あります。` +
        "重複の可能性がありますが自動削除はしません。手動で確認してください。",
    );
  }

  // --- ルール2/3: 新イベントを作成 ---
  const create = buildNewEvent(entry);
  return { deleteEventIds, create, warnings };
}
