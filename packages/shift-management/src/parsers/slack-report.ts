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

/**
 * `6/30 16:00〜22:00→12:00〜18:00` 形式の変更行。
 * 日付は `6/30`・`6月30日`、区切りは `〜 ~ -`、矢印は `→ -> ⇒` の揺れを許容する。
 */
const CHANGE_LINE =
  /(\d{1,2})[/月](\d{1,2})日?\s*(\d{1,2}:\d{2})\s*[〜~-]\s*(\d{1,2}:\d{2})\s*(?:→|->|⇒)\s*(\d{1,2}:\d{2})\s*[〜~-]\s*(\d{1,2}:\d{2})/g;

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
  for (const m of target.matchAll(CHANGE_LINE)) {
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
  return changes;
}
