import type { calendar_v3 } from "googleapis";
import { calendarClient } from "./google-calendar";
import { jstDate, jstTime, parseIsoToJst } from "../logic/jst";
import { isShiftTitle, SHIFT_TITLE_KEYWORD } from "../remind/is-shift";
import { jstDayRange } from "../remind/target-date";
import type { MemberShiftResult, RemindMember, ShiftEntry } from "../remind/types";

/** 5xx・タイムアウト時のリトライ回数（指数バックオフ） */
const MAX_RETRIES = 2;

/**
 * 1メンバーの指定日のシフト予定を取得する。
 *
 * 失敗しても throw せず MemberShiftResult に包んで返す。
 * 1人のトークン失効で全員の通知が止まるのを防ぐため（呼び出し側は Promise.allSettled も併用）。
 */
export async function getShiftsForMember(
  member: RemindMember,
  date: string,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<MemberShiftResult> {
  const warnings: string[] = [];

  let items: calendar_v3.Schema$Event[];
  try {
    items = await listWithRetry(member, date, sleep);
  } catch (err) {
    if (isAuthError(err)) {
      return {
        slackUserId: member.slackUserId,
        shifts: [],
        warnings,
        revoked: true,
        error: "Google Calendar の連携が切れています（401/403）",
      };
    }
    return {
      slackUserId: member.slackUserId,
      shifts: [],
      warnings,
      revoked: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const shifts: ShiftEntry[] = [];

  for (const e of items) {
    if (e.status === "cancelled") continue;
    if (!isShiftTitle(e.summary)) continue;

    // 終日予定は時刻が取れないためリマインドできない。黙って捨てず警告する
    if (!e.start?.dateTime || !e.end?.dateTime) {
      warnings.push(
        `<@${member.slackUserId}> の ${date} に時刻が設定されていない「${SHIFT_TITLE_KEYWORD}」予定があります（終日予定はリマインドできません）`,
      );
      continue;
    }

    const startIso = e.start.dateTime;
    const endIso = e.end.dateTime;
    const start = parseIsoToJst(startIso);
    const end = parseIsoToJst(endIso);

    // events.list は範囲に「重なる」予定も返す。日跨ぎシフトは開始日基準で扱うため、
    // JSTでの開始日が対象日と一致するものだけ残す（前日22:00-当日6:00 を当日分と誤認しない）
    if (start.date !== date) continue;

    shifts.push({
      slackUserId: member.slackUserId,
      eventUid: e.id ?? `${member.slackUserId}:${startIso}`,
      date: start.date,
      startTime: start.time,
      endTime: end.time,
      startIso,
      endIso,
      crossesMidnight: end.date !== start.date,
    });
  }

  return { slackUserId: member.slackUserId, shifts, warnings, revoked: false };
}

/** 全メンバーを並列で取得する。1人の失敗が他を止めない */
export async function getShiftsForMembers(
  members: RemindMember[],
  date: string,
): Promise<MemberShiftResult[]> {
  const settled = await Promise.allSettled(
    members.map((m) => getShiftsForMember(m, date)),
  );

  return settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          slackUserId: members[i].slackUserId,
          shifts: [],
          warnings: [],
          revoked: false,
          error: String(r.reason),
        },
  );
}

async function listWithRetry(
  member: RemindMember,
  date: string,
  sleep: (ms: number) => Promise<void>,
): Promise<calendar_v3.Schema$Event[]> {
  const { timeMin, timeMax } = jstDayRange(date);
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const cal = calendarClient(member.refreshToken);
      const res = await cal.events.list({
        calendarId: member.calendarId,
        timeMin,
        timeMax,
        // 繰り返し予定（毎週シフト）を実体に展開する。付けないと取りこぼす
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
      });
      return res.data.items ?? [];
    } catch (err) {
      lastErr = err;
      // 認証エラーはリトライしても直らないので即座に投げる
      if (isAuthError(err) || attempt === MAX_RETRIES) throw err;
      await sleep(500 * 2 ** attempt);
    }
  }

  throw lastErr;
}

/** トークン失効・権限剥奪（401/403）か */
function isAuthError(err: unknown): boolean {
  const code = (err as { code?: number; status?: number; response?: { status?: number } });
  const status = code?.code ?? code?.status ?? code?.response?.status;
  if (status === 401 || status === 403) return true;
  const message = err instanceof Error ? err.message : "";
  return /invalid_grant|invalid_token|unauthorized/i.test(message);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 現在時刻のJST日付・時刻（ログ出力用） */
export function nowJstLabel(now: Date = new Date()): string {
  return `${jstDate(now)} ${jstTime(now)} JST`;
}
