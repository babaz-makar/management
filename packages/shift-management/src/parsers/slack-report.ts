import { completeDate } from "../logic/date-complete";
import { normalizeText } from "../logic/normalize";
import type { ShiftChange } from "../types";

/** parseShiftReport への入力。Slackイベントから組み立てる */
export interface SlackReportInput {
  /** 報告メッセージ本文 */
  text: string;
  /** 投稿者のSlack user id（対象者 = 投稿者本人） */
  slackUserId: string;
  channelId: string;
  /** Slackメッセージのts（例 "1751244000.000200"）。冪等性キーの元 */
  messageTs: string;
  /**
   * 年補完の基準日時。省略時は messageTs から算出する。
   * テストでは明示的に渡すこと。
   */
  messageDate?: Date;
}

/** 時刻範囲 "HH:MM-HH:MM" or "なし" */
const TIME_RANGE = /(\d{1,2}:\d{2})\s*[〜~\-]\s*(\d{1,2}:\d{2})/;
const NASHI = /(?:なし|ナシ|無し|休み|お休み)/;

/** 日付部分: `7/30` or `7月30日` */
const DATE_PART = /(\d{1,2})[/月](\d{1,2})日?/;

/**
 * split-modify (中抜け): `7/22 12:00-18:00→11:30-14:30 18:00-21:00`
 * 矢印の右側に2つの時間帯がある場合、2つの別イベントとして登録する
 */
const SPLIT_MODIFY_LINE = new RegExp(
  DATE_PART.source +
    String.raw`\s*` +
    TIME_RANGE.source +
    String.raw`\s*(?:→|->|⇒)\s*` +
    TIME_RANGE.source +
    String.raw`\s+` +
    TIME_RANGE.source,
  "g",
);

/**
 * modify: `7/30 11:00-18:00→9:00-17:00`
 * cancel: `7/30 11:00-18:00→なし`
 * add:    `7/30 なし→11:00-18:00`
 */
const MODIFY_LINE = new RegExp(
  DATE_PART.source +
    String.raw`\s*` +
    TIME_RANGE.source +
    String.raw`\s*(?:→|->|⇒)\s*` +
    TIME_RANGE.source,
  "g",
);

const CANCEL_LINE = new RegExp(
  DATE_PART.source +
    String.raw`\s*` +
    TIME_RANGE.source +
    String.raw`\s*(?:→|->|⇒)\s*` +
    NASHI.source,
  "g",
);

const ADD_LINE = new RegExp(
  DATE_PART.source +
    String.raw`\s*` +
    NASHI.source +
    String.raw`\s*(?:→|->|⇒)\s*` +
    TIME_RANGE.source,
  "g",
);

/** `【見出し】` から次の `【` （または末尾）までの本文を取り出す */
function extractSection(text: string, header: string): string | undefined {
  const start = text.indexOf(header);
  if (start === -1) return undefined;
  const body = text.slice(start + header.length);
  const next = body.indexOf("【");
  const section = (next === -1 ? body : body.slice(0, next)).trim();
  return section === "" ? undefined : section;
}

/**
 * Slackのシフト変更報告メッセージを ShiftChange[] にパースする純関数。
 *
 * 対応パターン:
 *   - modify: `7/30 11:00-18:00→9:00-17:00`
 *   - cancel: `7/30 11:00-18:00→なし`
 *   - add:    `7/30 なし→11:00-18:00`
 *
 * - 対象者は投稿者本人。本文中の @メンション（UL宛の承認依頼）は無視される
 * - `【シフト変更依頼】` ブロックがあればその中だけを、無ければ本文全体を走査する
 * - 1メッセージに複数行の変更依頼があれば行ごとに1件返す
 * - 1件も取れなければ空配列（呼び出し側でClaude APIフォールバックへ回す）
 */
export function parseShiftReport(input: SlackReportInput): ShiftChange[] {
  const text = normalizeText(input.text);
  const baseDate =
    input.messageDate ??
    new Date(Number(input.messageTs.split(".")[0]) * 1000);

  const target = extractSection(text, "【シフト変更依頼】") ?? text;
  const reason = extractSection(text, "【変更理由】");

  const changes: ShiftChange[] = [];

  // 中抜け（split-modify）を先にマッチし、該当部分を除去してから通常パターンを走査
  let remaining = target;
  for (const m of target.matchAll(SPLIT_MODIFY_LINE)) {
    const [matched, month, day, beforeStart, beforeEnd, after1Start, after1End, after2Start, after2End] = m;
    const date = completeDate(Number(month), Number(day), baseDate);
    changes.push({
      id: `${input.messageTs}:${changes.length}`,
      kind: "modify",
      slackUserId: input.slackUserId,
      before: { date, startTime: beforeStart, endTime: beforeEnd },
      after: { date, startTime: after1Start, endTime: after1End },
      reason,
      sourceMessageTs: input.messageTs,
      channelId: input.channelId,
    });
    changes.push({
      id: `${input.messageTs}:${changes.length}`,
      kind: "add",
      slackUserId: input.slackUserId,
      after: { date, startTime: after2Start, endTime: after2End },
      reason,
      sourceMessageTs: input.messageTs,
      channelId: input.channelId,
    });
    remaining = remaining.replace(matched, "");
  }

  for (const m of remaining.matchAll(MODIFY_LINE)) {
    const [, month, day, beforeStart, beforeEnd, afterStart, afterEnd] = m;
    const date = completeDate(Number(month), Number(day), baseDate);
    changes.push({
      id: `${input.messageTs}:${changes.length}`,
      kind: "modify",
      slackUserId: input.slackUserId,
      before: { date, startTime: beforeStart, endTime: beforeEnd },
      after: { date, startTime: afterStart, endTime: afterEnd },
      reason,
      sourceMessageTs: input.messageTs,
      channelId: input.channelId,
    });
  }

  for (const m of remaining.matchAll(CANCEL_LINE)) {
    const [, month, day, beforeStart, beforeEnd] = m;
    const date = completeDate(Number(month), Number(day), baseDate);
    changes.push({
      id: `${input.messageTs}:${changes.length}`,
      kind: "cancel",
      slackUserId: input.slackUserId,
      before: { date, startTime: beforeStart, endTime: beforeEnd },
      reason,
      sourceMessageTs: input.messageTs,
      channelId: input.channelId,
    });
  }

  for (const m of remaining.matchAll(ADD_LINE)) {
    const [, month, day, afterStart, afterEnd] = m;
    const date = completeDate(Number(month), Number(day), baseDate);
    changes.push({
      id: `${input.messageTs}:${changes.length}`,
      kind: "add",
      slackUserId: input.slackUserId,
      after: { date, startTime: afterStart, endTime: afterEnd },
      reason,
      sourceMessageTs: input.messageTs,
      channelId: input.channelId,
    });
  }

  return changes;
}
