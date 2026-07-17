import type { ShiftChange, ShiftTime } from "../types";

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
  /** 例: "シフト 12:00-18:00" */
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

/** 同じ日付・同じ開始/終了時刻の予定か */
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
    summary: `シフト ${after.startTime}-${after.endTime}`,
    description: reason,
  };
}

/**
 * DESIGN.md「全体フロー」の upsert 手順を副作用なしで計画する純関数。
 *
 * 削除候補の決め方（安全側に倒す）:
 *   1. shiftId が一致する当ツール管理イベントがあれば、それを削除対象にする
 *   2. 無ければ「変更前の時間帯」に一致する予定を探し、**ちょうど1件**なら削除対象
 *   3. 0件 or 複数件なら削除しない（新予定だけ作り、手動削除を促す警告を出す）
 *   4. 変更後の予定を作成する（shiftId付き）
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
    const shiftId = buildShiftId(change.slackUserId, change.before.date);
    const byShiftId = existing.filter((e) => e.shiftId === shiftId);

    if (byShiftId.length > 0) {
      // 当ツールが作った予定なので安全に置き換えられる（複数あっても全て掃除）
      deleteEventIds.push(...byShiftId.map((e) => e.id));
    } else {
      const bySlot = existing.filter((e) => sameSlot(e, change.before!));
      if (bySlot.length === 1) {
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
