/**
 * ホーム画面の取得結果を正規化する純関数群(H-1)。
 *
 * apps/web にはテストランナーが無いため、テストすべき純ロジック(limit の不正値
 * フォールバック、各 API 応答の畳み込み、summary の as キャスト前検証、snapshot 組み立て)を
 * ここ(vitest 被覆下の logic/)へ抽出する。apps/web の home-client は fetch と、この純関数の
 * 呼び出しだけを行う「委譲のみ」の薄い層にする(既存 token-store-neon 等と同方針)。
 *
 * React・Neon 非依存。型のみ leaf(jobcan-import-history-types)を参照し、
 * server グラフ(googleapis/crypto)へは辿らない(ui バレルから安全に公開できる)。
 */
import type { ImportHistorySummary } from "./jobcan-import-history-types";
import type { HomeSnapshot } from "./jobcan-home-state";

/** status の畳み込み結果。 */
export type StatusFetch = { ok: true; applyEnabled: boolean } | { ok: false };
/** history の畳み込み結果。 */
export type HistoryFetch =
  | { ok: true; summary: ImportHistorySummary }
  | { ok: false };
/** staff 件数の畳み込み結果。 */
export type StaffCountFetch = { ok: true; count: number } | { ok: false };

/** ?limit= の既定値・上限(無制限クエリ防止。core listRecent も二重にクランプする)。 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * ?limit= を安全な整数へ解決する。
 * null・非数・0以下・NaN・Infinity は既定値(20)。正の有限値は切り捨てて [1, 100] にクランプ。
 */
export function resolveHistoryLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  const floored = Math.floor(n);
  if (floored < 1) return 1;
  return floored > MAX_LIMIT ? MAX_LIMIT : floored;
}

/** body を安全に Record として読む(非オブジェクトは空扱い)。 */
function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

/** status 応答を畳み込む。httpOk=false は取得失敗。applyEnabled は厳密 true のみ true。 */
export function normalizeStatusResponse(
  httpOk: boolean,
  body: unknown,
): StatusFetch {
  if (!httpOk) return { ok: false };
  return { ok: true, applyEnabled: asRecord(body).applyEnabled === true };
}

/** summary が期待形(数値2つ + latestImport が null|object)かを as キャスト前に検証する。 */
function isValidSummary(value: unknown): value is ImportHistorySummary {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (typeof s.monthlyRealCount !== "number" || !Number.isFinite(s.monthlyRealCount)) {
    return false;
  }
  if (typeof s.unregisteredCount !== "number" || !Number.isFinite(s.unregisteredCount)) {
    return false;
  }
  const latest = s.latestImport;
  return latest === null || typeof latest === "object";
}

/** history 応答を畳み込む。summary が不正形なら信用せず ok:false。 */
export function normalizeHistoryResponse(
  httpOk: boolean,
  body: unknown,
): HistoryFetch {
  if (!httpOk) return { ok: false };
  const summary = asRecord(body).summary;
  if (!isValidSummary(summary)) return { ok: false };
  return { ok: true, summary };
}

/** staff 応答を畳み込む。entries 配列の length を件数にする(配列でなければ 0)。 */
export function normalizeStaffCountResponse(
  httpOk: boolean,
  body: unknown,
): StaffCountFetch {
  if (!httpOk) return { ok: false };
  const entries = asRecord(body).entries;
  return { ok: true, count: Array.isArray(entries) ? entries.length : 0 };
}

/** 3ソースの畳み込み結果を resolveHomeState に渡す HomeSnapshot へ組む。 */
export function buildHomeSnapshot(
  status: StatusFetch,
  history: HistoryFetch,
  staff: StaffCountFetch,
): HomeSnapshot {
  return {
    statusOk: status.ok,
    applyEnabled: status.ok ? status.applyEnabled : false,
    historyOk: history.ok,
    summary: history.ok ? history.summary : null,
    staffOk: staff.ok,
    staffCount: staff.ok ? staff.count : 0,
  };
}
