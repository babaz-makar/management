export {
  createOAuth2Client,
  getAuthUrl,
  listEventsForDate,
  executePlan,
  listEventsForRange,
  executeJobcanDayPlan,
} from "./google-calendar";
export type { JobcanDayExecution } from "./google-calendar";

export { verifySlackRequest } from "./slack-verify";

export { runPipeline, formatResultMessage } from "./pipeline";
export type { PipelineResult } from "./pipeline";

export { runJobcanReconcile } from "./jobcan-pipeline";
export type {
  JobcanCalendarPort,
  JobcanReconcileOptions,
  JobcanReconcileResult,
  JobcanDayResult,
} from "./jobcan-pipeline";

export { JsonFileTokenStore } from "./token-store";
export type { TokenStore } from "./token-store";

export {
  lookupSlackUserIdByEmail,
  interpretSlackLookupResponse,
} from "./slack-directory";
export type { SlackFetch } from "./slack-directory";

export {
  resolveRefreshTokenByEmail,
  describeResolutionFailure,
} from "./jobcan-token-resolver";
export type {
  TokenResolution,
  TokenResolutionSuccess,
  TokenResolutionFailure,
  TokenResolutionFailureReason,
  TokenResolverDeps,
} from "./jobcan-token-resolver";

export {
  reconcileJobcanForAllStaff,
  describeStaffSkipReason,
} from "./jobcan-reconcile-all";
export type {
  JobcanReconcileAllResult,
  JobcanReconcileAllDeps,
  JobcanStaffWarning,
  JobcanStaffSkipReason,
} from "./jobcan-reconcile-all";

export {
  sanitizeFileName,
  resolveDryRun,
  coerceCellText,
  verifyImportAuth,
  validateUploadLimits,
  missingImportEnvVars,
  DEFAULT_UPLOAD_LIMITS,
  REQUIRED_IMPORT_ENV_VARS,
} from "./jobcan-import-safeguards";
export type {
  ImportAuthResult,
  UploadLimits,
  UploadLimitResult,
} from "./jobcan-import-safeguards";

export { runJobcanImport, formatJobcanImportSummary } from "./jobcan-import";
export type {
  JobcanImportFile,
  JobcanImportOptions,
  JobcanImportFileError,
  JobcanImportSummary,
  JobcanImportResult,
  JobcanImportDeps,
} from "./jobcan-import";

export {
  JsonFileStaffDirectory,
  assertStaffCode,
  assertEmail,
} from "./staff-directory";
export type { StaffDirectory, StaffDirectoryEntry } from "./staff-directory";

export {
  ensureStaffDirectoryTable,
  neonGetEmail,
  neonSetEmail,
  neonListEntries,
  neonDeleteEntry,
} from "./staff-directory-neon-core";
export type { SqlTag } from "./staff-directory-neon-core";

export { describeImportReason } from "./import-reason-describe";

export { findSimilarStaffNames } from "./staff-name-similarity";
export type {
  StaffNameCandidate,
  StaffNameMatchType,
  SimilarStaffMatch,
} from "./staff-name-similarity";
