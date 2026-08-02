/**
 * ホーム画面(home/page.tsx)のクライアント側ロジック(委譲のみの薄い層)。
 *
 * 同一オリジンの /api/jobcan/status・/api/jobcan/history・/api/staff を **並行取得**し、
 * 応答の畳み込み・正規化・snapshot 組み立ては packages の純関数(jobcan-home-fetch)へ委譲する。
 * ここが持つのは fetch と JSON パースだけ(テスト可能なロジックは packages 側で被覆済み)。
 * 各ソースの失敗は握りつぶさず ok:false として畳み込む(→ resolveHomeState が error 表示)。
 */
import {
  buildHomeSnapshot,
  normalizeHistoryResponse,
  normalizeStaffCountResponse,
  normalizeStatusResponse,
  type HistoryFetch,
  type HomeSnapshot,
  type StaffCountFetch,
  type StatusFetch,
} from "@management/shift-management/ui";

/** レスポンスを安全に JSON パースする(非 JSON でも例外にしない)。 */
async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** GET /api/jobcan/status → StatusFetch(畳み込みは純関数へ委譲)。 */
async function fetchStatus(): Promise<StatusFetch> {
  try {
    const response = await fetch("/api/jobcan/status");
    return normalizeStatusResponse(response.ok, await parseJsonSafe(response));
  } catch {
    return { ok: false };
  }
}

/** GET /api/jobcan/history → HistoryFetch。 */
async function fetchHistory(): Promise<HistoryFetch> {
  try {
    const response = await fetch("/api/jobcan/history");
    return normalizeHistoryResponse(response.ok, await parseJsonSafe(response));
  } catch {
    return { ok: false };
  }
}

/** GET /api/staff → StaffCountFetch(entries.length を再利用。新規 API は作らない)。 */
async function fetchStaffCount(): Promise<StaffCountFetch> {
  try {
    const response = await fetch("/api/staff");
    return normalizeStaffCountResponse(
      response.ok,
      await parseJsonSafe(response),
    );
  } catch {
    return { ok: false };
  }
}

/**
 * 3ソースを並行取得し、resolveHomeState に渡す HomeSnapshot を組む。
 * ウォーターフォールにしない(Promise.all)。畳み込みは純関数 buildHomeSnapshot に委譲。
 */
export async function loadHomeSnapshot(): Promise<HomeSnapshot> {
  const [status, history, staff] = await Promise.all([
    fetchStatus(),
    fetchHistory(),
    fetchStaffCount(),
  ]);
  return buildHomeSnapshot(status, history, staff);
}
