/**
 * クライアント(ブラウザ)安全バレル。
 *
 * 目的: 管理画面(Client Component)が使う **純粋な表示ヘルパ** だけを、
 * server バレル経由の重い/Node 専用グラフ(googleapis・crypto・neon)を一切辿らずに
 * 公開する。メインバレル(./index)は server から value を再輸出しており、value を
 * client から import すると webpack が googleapis/crypto を client バンドルへ引き込み
 * ビルドが落ちる。ここはそれらを踏まない純ファイルのみを再輸出する。
 *
 * 収録できる条件: 追加 import ゼロ(または純ファイルのみ)で完結すること。
 *   - describeImportReason: 文字列マップのみ(依存ゼロ)
 *   - findSimilarStaffNames: レーベンシュタイン等の純関数(依存ゼロ)
 *   - describeHttpError: HTTP ステータス → 日本語文言のみ(依存ゼロ)
 *   - isValidStaffCode: 正規表現判定のみ(依存ゼロ)
 */
export { describeImportReason } from "./server/import-reason-describe";
export { findSimilarStaffNames } from "./server/staff-name-similarity";
export type {
  StaffNameCandidate,
  StaffNameMatchType,
  SimilarStaffMatch,
} from "./server/staff-name-similarity";
export { describeHttpError } from "./server/http-error-describe";
export { isValidStaffCode, STAFF_CODE_PATTERN } from "./server/staff-code";

// ホーム画面の状態判定(純関数・依存ゼロ。型のみ server を参照=実行時グラフを辿らない)。
export {
  resolveHomeState,
  formatImportDate,
  monthRangeIso,
  APPLY_OFF_BANNER_MESSAGE,
} from "./logic/jobcan-home-state";
export type {
  HomeState,
  HomePrimary,
  HomePrimaryKind,
  HomeSnapshot,
} from "./logic/jobcan-home-state";
export type {
  ImportHistoryRecord,
  ImportHistoryRow,
  ImportHistorySummary,
} from "./logic/jobcan-import-history-types";

// ホーム取得結果の正規化(純関数・依存ゼロ)。home-client が委譲する。
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

// iOS 風リスキンのデザイントークン + style 生成ヘルパ(純関数・依存ゼロ)。
export {
  IOS,
  IOS_FONT_FAMILY,
  iosType,
  iosButtonColors,
  iosCalloutColors,
  iosRowBackground,
} from "./logic/ios-tokens";
export type {
  IosTypeLevel,
  IosTypeStyle,
  IosButtonVariant,
  IosButtonState,
  IosButtonColors,
  IosCalloutTone,
  IosCalloutColors,
} from "./logic/ios-tokens";
