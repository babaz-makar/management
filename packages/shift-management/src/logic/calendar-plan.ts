import type { ShiftChange, ShiftTime } from "../types";

/**
 * カレンダーに入れるシフト予定のタイトル（固定）。
 *
 * シフト予定を作る経路はすべてこの定数を使うこと。当ツールの方式を親とし、
 * 後から足す取込経路（ジョブカン確定シフト等）も同じタイトルに揃える。
 * 時刻はタイトルに含めない — 予定の時間枠そのもので表現する。
 */
export const SHIFT_EVENT_SUMMARY = "SHO-SANシフト";

/**
 * upsert判定に渡す既存カレンダーイベントの最小形。
 * apps/web 側で Google の events.list 結果（start.dateTime 等）を
 * この形へ正規化してから渡す（純関数を Google のスキーマから切り離すため）。
 */
export interface ExistingEvent {
  /** Googleカレンダーのイベントid（削除に使用） */
  id: string;
  /** extendedProperties.private.shiftId（当ツール管理イベントのみ持つ） */
  shiftId?: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
}

/** 作成すべき新規イベントの仕様（Google非依存の純データ） */
export interface NewEventSpec {
  /** "<slackUserId>:<date>"。冪等な再反映のキー */
  shiftId: string;
  /** 常に "shift-management"。当ツール管理イベントの目印 */
  managedBy: "shift-management";
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
  /** 常に SHIFT_EVENT_SUMMARY（"SHO-SANシフト"） */
  summary: string;
  /**
   * 変更理由（あれば）。apps/web 側で元Slackメッセージへの
   * パーマリンクを追記してから events.insert する想定。
   */
  description?: string;
}

/**
 * 1件の ShiftChange をカレンダーへ反映するための操作計画。
 * 副作用は持たず、「何を消して何を作るか」と「⚠️返信すべき警告」だけを返す。
 */
export interface CalendarPlan {
  /** 削除すべき既存イベントのid（安全と判断できたものだけ） */
  deleteEventIds: string[];
  /** 作成するイベント。cancel の場合など作成不要なら null */
  create: NewEventSpec | null;
  /**
   * スレッドに ⚠️ で伝えるべき注意点。
   * 「変更前の予定が見つからない」「複数一致で自動削除を見送った」等。
   * 空配列なら黙って成功してよい。
   */
  warnings: string[];
}

/** shiftId は「誰の・いつのシフトか」で決める（再報告時に同じ枠を上書きするため） */
function buildShiftId(slackUserId: string, date: string): string {
  return `${slackUserId}:${date}`;
}

/**
 * 同じ日付・同じ開始/終了時刻の予定か（すべてJST基準の "YYYY-MM-DD" / "HH:MM" 比較）。
 * 予定のタイトルは一切見ない — シフトの同定は時間だけで行う。
 */
function sameSlot(event: ExistingEvent, slot: ShiftTime): boolean {
  return (
    event.date === slot.date &&
    event.startTime === slot.startTime &&
    event.endTime === slot.endTime
  );
}

function buildNewEvent(
  slackUserId: string,
  after: ShiftTime,
  reason: string | undefined,
): NewEventSpec {
  return {
    shiftId: buildShiftId(slackUserId, after.date),
    managedBy: "shift-management",
    date: after.date,
    startTime: after.startTime,
    endTime: after.endTime,
    summary: SHIFT_EVENT_SUMMARY,
    description: reason,
  };
}

/**
 * DESIGN.md「全体フロー」の upsert 手順を副作用なしで計画する純関数。
 *
 * 元シフトの同定は**時間だけ**で行う（タイトルは見ない）。JST基準の
 * 日付+開始+終了が「変更前」と完全一致する予定だけが削除候補になる。
 *
 * 削除候補の決め方（安全側に倒す）:
 *   1. 「変更前の時間帯」に完全一致する予定を集める
 *   2. その中に shiftId 一致（当ツール管理）があれば、それを全て削除対象にする
 *   3. 無ければ、候補が**ちょうど1件**のときだけ削除対象にする
 *   4. 0件 or 複数件なら削除しない（新予定だけ作り、手動削除を促す警告を出す）
 *   5. 変更後の予定を作成する（shiftId付き）
 *
 * kind ごとの扱い:
 *   - "modify": before で削除候補を探し、after を作成
 *   - "add":    削除は探さず after を作成のみ
 *   - "cancel": before に一致する予定を削除、作成はしない
 *
 * @param change   1行分のシフト変更依頼
 * @param existing 対象カレンダーの既存イベント（正規化済み）
 */
export function planCalendarUpsert(
  change: ShiftChange,
  existing: ExistingEvent[],
): CalendarPlan {
  const warnings: string[] = [];

  // --- 削除候補の決定（cancel/modify のみ。add は探さない） ---
  const deleteEventIds: string[] = [];
  if (change.kind !== "add" && change.before) {
    // 候補は「変更前の時間帯に完全一致する予定」だけ。タイトルも shiftId も入口にはしない。
    const bySlot = existing.filter((e) => sameSlot(e, change.before!));
    const shiftId = buildShiftId(change.slackUserId, change.before.date);
    const managed = bySlot.filter((e) => e.shiftId === shiftId);

    if (managed.length > 0) {
      // 時間が一致したうえで当ツール管理分と分かるので、複数あっても安全に掃除できる
      deleteEventIds.push(...managed.map((e) => e.id));
    } else if (bySlot.length === 1) {
      deleteEventIds.push(bySlot[0].id);
    } else if (bySlot.length === 0) {
      if (change.kind !== "cancel") {
        warnings.push(
          `変更前の予定（${change.before.date} ${change.before.startTime}-${change.before.endTime}）が見つかりませんでした。手動で削除をお願いします。`,
        );
      }
    } else {
      warnings.push(
        `変更前の時間帯（${change.before.date} ${change.before.startTime}-${change.before.endTime}）に一致する予定が${bySlot.length}件あるため、自動削除は見送りました。手動で削除をお願いします。`,
      );
    }
  }

  // --- 作成イベントの決定 ---
  let create: NewEventSpec | null = null;
  if (change.kind === "cancel") {
    // deleteEventIds が空 & 警告なし → すでに取り消し済み（冪等）
  } else if (change.after) {
    create = buildNewEvent(change.slackUserId, change.after, change.reason);

    // 冪等性チェック: 変更後と同じイベントがすでに存在すればスキップ
    const alreadyExists = existing.some(
      (e) =>
        e.shiftId === create!.shiftId &&
        e.startTime === create!.startTime &&
        e.endTime === create!.endTime,
    );
    if (alreadyExists) {
      return { deleteEventIds: [], create: null, warnings: [] };
    }
  } else {
    warnings.push(
      "変更後のシフト時間を特定できなかったため、予定を作成できませんでした。",
    );
  }

  return { deleteEventIds, create, warnings };
}
