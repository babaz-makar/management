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
export { normalizeText } from "./logic/normalize";

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
  calendarClient,
  verifySlackRequest,
  runPipeline,
  formatResultMessage,
  JsonFileTokenStore,
} from "./server";
export type { PipelineResult, TokenStore } from "./server";

// ---------------------------------------------------------------------------
// シフトリマインド機能（カレンダーのシフトを読んで Slack へ事前通知）
// ---------------------------------------------------------------------------
export { SHIFT_EVENT_SUMMARY } from "./logic/calendar-plan";
export { isShiftTitle, normalizeTitle, SHIFT_TITLE_KEYWORD } from "./remind/is-shift";
export {
  resolveTargetDate,
  addDays,
  formatDateLabel,
  jstDayRange,
} from "./remind/target-date";
export {
  formatRemindMessage,
  formatRange,
  formatWarningMessage,
} from "./remind/format-message";
export type { FormatRemindOptions } from "./remind/format-message";
export {
  buildSetupView,
  buildChannelsView,
  parseSetupSubmission,
  parseChannelsSubmission,
  SETUP_CALLBACK_ID,
  CHANNELS_CALLBACK_ID,
} from "./remind/views";
export type { SetupSubmission } from "./remind/views";
export type {
  RemindTiming,
  RemindMember,
  ShiftEntry,
  MemberShiftResult,
} from "./remind/types";
export {
  getShiftsForMember,
  getShiftsForMembers,
  nowJstLabel,
  slackApi,
  postMessage,
  openView,
  respondEphemeral,
  runRemind,
} from "./server";
export type {
  RunRemindOptions,
  RunRemindResult,
  RemindStore,
  RemindSettings,
  NotificationTarget,
} from "./server";
