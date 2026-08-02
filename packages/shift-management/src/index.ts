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
// ジョブカン取込の1件（ジョブカン → カレンダーへ書き込む元データ）。
// リマインドの ShiftEntry（カレンダー → Slack へ読み出した結果）とは別概念のため、
// バレルでは別名で公開して同名衝突を避ける。
export type { ShiftEntry as JobcanShiftEntry } from "./types";
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
export { parseJobcanFileName } from "./logic/jobcan-filename";
export { planJobcanDayUpsert, groupEntriesByDate } from "./logic/jobcan-plan";
export type { JobcanDayPlan, JobcanDayContext } from "./logic/jobcan-plan";

// ジョブカン ホーム画面の状態判定(純関数・Neon非依存)
export {
  resolveHomeState,
  formatImportDate,
  monthRangeIso,
  currentJstYearMonth,
  APPLY_OFF_BANNER_MESSAGE,
} from "./logic/jobcan-home-state";
export type {
  HomeState,
  HomePrimary,
  HomePrimaryKind,
  HomeSnapshot,
} from "./logic/jobcan-home-state";

// ホーム取得結果の正規化(純関数)＋ best-effort 書込の timeout ユーティリティ
export {
  resolveHistoryLimit,
  normalizeStatusResponse,
  normalizeHistoryResponse,
  normalizeStaffCountResponse,
  buildHomeSnapshot,
} from "./logic/jobcan-home-fetch";
export type {
  StatusFetch,
  HistoryFetch,
  StaffCountFetch,
} from "./logic/jobcan-home-fetch";
export { runWithTimeout } from "./logic/run-with-timeout";
export type { TimeoutOutcome } from "./logic/run-with-timeout";

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
  listEventsForRange,
  executeJobcanDayPlan,
  verifySlackRequest,
  runPipeline,
  formatResultMessage,
  runJobcanReconcile,
  JsonFileTokenStore,
  JsonFileStaffDirectory,
  assertStaffCode,
  assertEmail,
  ensureStaffDirectoryTable,
  neonGetEmail,
  neonSetEmail,
  neonListEntries,
  neonDeleteEntry,
  lookupSlackUserIdByEmail,
  interpretSlackLookupResponse,
  resolveRefreshTokenByEmail,
  describeResolutionFailure,
  reconcileJobcanForAllStaff,
  describeStaffSkipReason,
  runJobcanImport,
  formatJobcanImportSummary,
  sanitizeFileName,
  resolveDryRun,
  isJobcanApplyEnabled,
  coerceCellText,
  verifyImportAuth,
  validateUploadLimits,
  checkContentLength,
  missingImportEnvVars,
  parseStaffAllowlist,
  isStaffAllowed,
  DEFAULT_UPLOAD_LIMITS,
  MAX_RELAY_BODY_BYTES,
  REQUIRED_IMPORT_ENV_VARS,
  ensureImportHistoryTable,
  neonInsertImportHistory,
  neonListRecentImportHistory,
  neonGetImportHistorySummary,
  summarizeWarnings,
  buildImportHistoryRecord,
  describeImportReason,
  findSimilarStaffNames,
} from "./server";
export type {
  PipelineResult,
  TokenStore,
  StaffDirectory,
  StaffDirectoryEntry,
  SqlTag,
  JobcanCalendarPort,
  JobcanReconcileOptions,
  JobcanReconcileResult,
  JobcanDayResult,
  JobcanDayExecution,
  SlackFetch,
  TokenResolution,
  TokenResolutionSuccess,
  TokenResolutionFailure,
  TokenResolutionFailureReason,
  TokenResolverDeps,
  JobcanReconcileAllResult,
  JobcanReconcileAllDeps,
  JobcanStaffWarning,
  JobcanStaffSkipReason,
  JobcanImportFile,
  JobcanImportOptions,
  JobcanImportFileError,
  JobcanImportSummary,
  JobcanImportResult,
  JobcanImportDeps,
  ImportAuthResult,
  UploadLimits,
  UploadLimitResult,
  ContentLengthResult,
  StaffNameCandidate,
  StaffNameMatchType,
  SimilarStaffMatch,
  ImportHistoryRecord,
  ImportHistoryRow,
  ImportHistorySummary,
} from "./server";
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
  formatConnectDm,
  formatConnectNotice,
  formatMemberAdded,
  connectUrl,
} from "./remind/format-message";
export type { FormatRemindOptions } from "./remind/format-message";
export {
  buildMembersView,
  buildBotJoinedBlocks,
  buildUserJoinedBlocks,
  parseMembersSubmission,
  parseActionValue,
  MEMBERS_CALLBACK_ID,
  ACTION_OPEN_MEMBERS,
  ACTION_ADD_MEMBER,
  ACTION_DISMISS,
} from "./remind/views";
export type { MembersSubmission } from "./remind/views";
export type {
  RemindTiming,
  RemindMember,
  ChannelMember,
  // カレンダーから読み出したシフト1件。取込側の JobcanShiftEntry とは別概念
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
  respondWebhook,
  openDirectMessage,
  getBotUserId,
  listConversationMembers,
  filterHumanUsers,
  requestCalendarConnect,
  runRemind,
} from "./server";
export type {
  RunRemindOptions,
  RunRemindResult,
  ChannelRunResult,
  ConnectRequestResult,
  RemindStore,
  RemindSettings,
  NotificationTarget,
} from "./server";
