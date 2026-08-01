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
