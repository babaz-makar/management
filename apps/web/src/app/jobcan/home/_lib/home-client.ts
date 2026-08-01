/**
 * ホーム画面(home/page.tsx)のクライアント側ロジック。
 *
 * 同一オリジンの /api/jobcan/status・/api/jobcan/history・/api/staff を **並行取得**し、
 * 判定に必要な素材だけを HomeSnapshot へ正規化する。状態判定そのものは packages の
 * 純関数 resolveHomeState に委ねる(この層は取得と正規化のみ。ロジックを持たない)。
 * 各ソースの失敗は握りつぶさず ok:false として snapshot に畳み込む(→ resolveHomeState が error 表示)。
 */
import type { HomeSnapshot, ImportHistorySummary } from "@management/shift-management/ui";

/** 名簿件数の取得結果。 */
type StaffFetch = { ok: true; count: number } | { ok: false };
/** status の取得結果。 */
type StatusFetch = { ok: true; applyEnabled: boolean } | { ok: false };
/** history の取得結果。 */
type HistoryFetch = { ok: true; summary: ImportHistorySummary } | { ok: false };

/** レスポンスを安全に JSON パースする(非 JSON でも例外にしない)。 */
async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** GET /api/jobcan/status → applyEnabled。失敗は ok:false。 */
async function fetchStatus(): Promise<StatusFetch> {
  try {
    const response = await fetch("/api/jobcan/status");
    if (!response.ok) return { ok: false };
    const body = await parseJsonSafe(response);
    const applyEnabled =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).applyEnabled === true
        : false;
    return { ok: true, applyEnabled };
  } catch {
    return { ok: false };
  }
}

/** GET /api/jobcan/history → summary。失敗は ok:false。 */
async function fetchHistory(): Promise<HistoryFetch> {
  try {
    const response = await fetch("/api/jobcan/history");
    if (!response.ok) return { ok: false };
    const body = await parseJsonSafe(response);
    const summary =
      typeof body === "object" && body !== null
        ? ((body as Record<string, unknown>).summary as ImportHistorySummary | undefined)
        : undefined;
    if (!summary) return { ok: false };
    return { ok: true, summary };
  } catch {
    return { ok: false };
  }
}

/** GET /api/staff → 件数(entries.length を再利用。新規 API は作らない)。失敗は ok:false。 */
async function fetchStaffCount(): Promise<StaffFetch> {
  try {
    const response = await fetch("/api/staff");
    if (!response.ok) return { ok: false };
    const body = await parseJsonSafe(response);
    const entries =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).entries
        : undefined;
    return { ok: true, count: Array.isArray(entries) ? entries.length : 0 };
  } catch {
    return { ok: false };
  }
}

/**
 * 3ソースを並行取得し、resolveHomeState に渡す HomeSnapshot を組む。
 * ウォーターフォールにしない(Promise.all)。個々の失敗は snapshot の ok フラグに畳み込む。
 */
export async function loadHomeSnapshot(): Promise<HomeSnapshot> {
  const [status, history, staff] = await Promise.all([
    fetchStatus(),
    fetchHistory(),
    fetchStaffCount(),
  ]);
  return {
    statusOk: status.ok,
    applyEnabled: status.ok ? status.applyEnabled : false,
    historyOk: history.ok,
    summary: history.ok ? history.summary : null,
    staffOk: staff.ok,
    staffCount: staff.ok ? staff.count : 0,
  };
}
