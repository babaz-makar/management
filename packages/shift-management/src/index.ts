// 公開API (バレル)。本アプリからはこの index.ts 経由でのみ import されます。
export { ShiftManagement } from "./components/ShiftManagement";
export type { ShiftManagementProps } from "./components/ShiftManagement";
export { ShiftGrid } from "./components/ShiftGrid";
export type { ShiftGridProps, SelectedCell } from "./components/ShiftGrid";
export { useShiftStore } from "./hooks/useShiftStore";
export { DEFAULT_SHIFT_TYPES, SAMPLE_STAFF } from "./data";
export type {
  Assignments,
  ScheduleState,
  ShiftChange,
  ShiftEntry,
  ShiftTime,
  ShiftType,
  StaffMember,
  StaffToken,
} from "./types";
export { assignmentKey } from "./types";

// Slack変更報告パーサー（DESIGN.md フェーズ1）
export { parseShiftReport } from "./parsers/slack-report";
export type { SlackReportInput } from "./parsers/slack-report";
export { completeDate } from "./logic/date-complete";
export { normalizeText, normalizeTime } from "./logic/normalize";

// ジョブカン確定シフト取込（取込フェーズ1）
export { parseJobcanSheet } from "./parsers/jobcan-sheet";
export type { JobcanSheetInput } from "./parsers/jobcan-sheet";
export { completeJobcanDate } from "./logic/jobcan-date";

// カレンダーupsert計画（DESIGN.md フェーズ2の純関数部分）
export { planCalendarUpsert } from "./logic/calendar-plan";
export type {
  CalendarPlan,
  ExistingEvent,
  NewEventSpec,
} from "./logic/calendar-plan";

// サーバー側（Google Calendar API / Slack検証 / パイプライン）
export {
  createOAuth2Client,
  getAuthUrl,
  listEventsForDate,
  executePlan,
  verifySlackRequest,
  runPipeline,
  formatResultMessage,
  JsonFileTokenStore,
} from "./server";
export type { PipelineResult, TokenStore } from "./server";
