import { parseShiftReport, type SlackReportInput } from "../parsers/slack-report";
import { planCalendarUpsert } from "../logic/calendar-plan";
import {
  listEventsForDate,
  executePlan,
} from "./google-calendar";
import type { ShiftChange } from "../types";
import type { CalendarPlan } from "../logic/calendar-plan";

/** パイプライン1件分の実行結果 */
export interface PipelineResult {
  change: ShiftChange;
  plan: CalendarPlan;
  executed: { deletedCount: number; createdEventId: string | null };
}

/**
 * Slack投稿 → パース → カレンダー反映 の全パイプラインを実行する。
 *
 * 1. parseShiftReport でメッセージから ShiftChange[] を抽出
 * 2. 各 change について対象日の既存イベントを取得
 * 3. planCalendarUpsert で何をするか計画
 * 4. executePlan で Google Calendar に反映
 *
 * @returns 処理結果の配列。パースで0件なら空配列。
 */
export async function runPipeline(
  input: SlackReportInput,
  refreshToken: string,
  calendarId: string,
): Promise<PipelineResult[]> {
  const changes = parseShiftReport(input);
  if (changes.length === 0) return [];

  const results: PipelineResult[] = [];

  for (const change of changes) {
    const targetDate = change.after?.date ?? change.before?.date;
    if (!targetDate) continue;

    const existing = await listEventsForDate(refreshToken, calendarId, targetDate);
    const plan = planCalendarUpsert(change, existing);
    const executed = await executePlan(refreshToken, calendarId, plan);

    results.push({ change, plan, executed });
  }

  return results;
}

/** Slackスレッドに返信するための結果サマリーを組み立てる */
export function formatResultMessage(results: PipelineResult[]): string {
  if (results.length === 0) {
    return "シフト変更の内容を読み取れませんでした。定型フォーマットで再投稿してください。";
  }

  const lines: string[] = [];

  for (const { change, plan, executed } of results) {
    const date = change.after?.date ?? change.before?.date ?? "不明";

    if (change.kind === "modify" && change.before && change.after) {
      lines.push(
        `${date} ${change.before.startTime}-${change.before.endTime} → ${change.after.startTime}-${change.after.endTime}`,
      );
    } else if (change.kind === "add" && change.after) {
      lines.push(`${date} ${change.after.startTime}-${change.after.endTime} を追加`);
    } else if (change.kind === "cancel" && change.before) {
      lines.push(`${date} ${change.before.startTime}-${change.before.endTime} を取消`);
    }

    if (executed.deletedCount > 0) {
      lines.push(`  削除: ${executed.deletedCount}件`);
    }
    if (executed.createdEventId) {
      lines.push(`  作成: 完了`);
    }

    for (const w of plan.warnings) {
      lines.push(`  :warning: ${w}`);
    }
  }

  return lines.join("\n");
}
