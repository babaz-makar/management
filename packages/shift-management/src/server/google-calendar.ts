import { google, type calendar_v3 } from "googleapis";
import type { CalendarPlan, ExistingEvent, NewEventSpec } from "../logic/calendar-plan";
import { parseIsoToJst } from "../logic/jst";
import type { JobcanDayContext, JobcanDayPlan } from "../logic/jobcan-plan";

// ---------------------------------------------------------------------------
// OAuth2 クライアント生成
// ---------------------------------------------------------------------------

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export function getAuthUrl(oauth2: ReturnType<typeof createOAuth2Client>, state?: string) {
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
    state,
  });
}

// ---------------------------------------------------------------------------
// Calendar API ラッパー
// ---------------------------------------------------------------------------

/** refresh token から Calendar クライアントを作る。パッケージ内の他モジュールからも使う */
export function calendarClient(refreshToken: string): calendar_v3.Calendar {
  const oauth2 = createOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: oauth2 });
}

/**
 * 指定日の既存イベントを取得し、ExistingEvent[] に正規化する。
 * planCalendarUpsert に渡すためのデータ取得関数。
 */
export async function listEventsForDate(
  refreshToken: string,
  calendarId: string,
  date: string,
): Promise<ExistingEvent[]> {
  const cal = calendarClient(refreshToken);
  const timeMin = `${date}T00:00:00+09:00`;
  const timeMax = `${date}T23:59:59+09:00`;

  const res = await cal.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (
    (res.data.items ?? [])
      .filter((e) => e.start?.dateTime && e.end?.dateTime)
      .map((e) => {
        const start = parseIsoToJst(e.start!.dateTime!);
        const end = parseIsoToJst(e.end!.dateTime!);
        return {
          id: e.id!,
          shiftId: e.extendedProperties?.private?.shiftId,
          // 検索した日付ではなく、予定の開始時刻からJSTの日付を求める
          date: start.date,
          startTime: start.time,
          endTime: end.time,
        };
      })
      // events.list は範囲に「重なる」予定も返すため、JSTで当日開始のものだけ残す
      // （前日22:00-翌1:00 のような予定を当日のシフトと誤認しない）
      .filter((e) => e.date === date)
  );
}

/**
 * CalendarPlan を実際に Google Calendar へ反映する。
 * planCalendarUpsert が返した計画をそのまま渡す。
 */
export async function executePlan(
  refreshToken: string,
  calendarId: string,
  plan: CalendarPlan,
): Promise<{ deletedCount: number; createdEventId: string | null }> {
  const cal = calendarClient(refreshToken);

  let deletedCount = 0;
  for (const eventId of plan.deleteEventIds) {
    await cal.events.delete({ calendarId, eventId });
    deletedCount++;
  }

  let createdEventId: string | null = null;
  if (plan.create) {
    const created = await cal.events.insert({
      calendarId,
      requestBody: buildGoogleEvent(plan.create),
    });
    createdEventId = created.data.id ?? null;
  }

  return { deletedCount, createdEventId };
}

// ---------------------------------------------------------------------------
// ジョブカン確定シフト取込（Step 2-3）: 期間取得 + 日内plan実行
// ---------------------------------------------------------------------------

/** ISO 8601 dateTime → "YYYY-MM-DD"（fmtISO と同方式で +9h JST 日付化） */
function jstDate(iso: string): string {
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Google イベント → ExistingEvent 正規化。純関数(planJobcanDayUpsert)へ渡す形へ落とす。
 * - managedBy/shiftId は extendedProperties.private から verbatim(trim/case変換せず null→undefined のみ)。
 *   突合の厳密等価を壊さないため、ここで加工しない。
 * - startTime/endTime は fmtISO で "HH:MM" 厳密(秒を落とす=slot照合のチャーン穴封じ)。
 * - id 無し / 終日イベント(start.date のみで dateTime 無し)は null で除外。
 */
function toExistingEvent(e: calendar_v3.Schema$Event): ExistingEvent | null {
  if (!e.id) return null;
  const startDt = e.start?.dateTime;
  const endDt = e.end?.dateTime;
  if (!startDt || !endDt) return null;
  return {
    id: e.id,
    shiftId: e.extendedProperties?.private?.shiftId ?? undefined,
    managedBy: e.extendedProperties?.private?.managedBy ?? undefined,
    date: jstDate(startDt),
    startTime: fmtISO(startDt),
    endTime: fmtISO(endDt),
  };
}

/**
 * 期間[startDate..endDate]の既存イベントを取得し ExistingEvent[] に正規化する。
 * nextPageToken を尽きるまでループしてページング漏れを防ぐ(締め日スピルオーバの取りこぼし防止)。
 */
export async function listEventsForRange(
  refreshToken: string,
  calendarId: string,
  startDate: string,
  endDate: string,
): Promise<ExistingEvent[]> {
  const cal = calendarClient(refreshToken);
  const timeMin = `${startDate}T00:00:00+09:00`;
  const timeMax = `${endDate}T23:59:59+09:00`;

  const events: ExistingEvent[] = [];
  let pageToken: string | undefined;
  do {
    const res = await cal.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 2500,
      pageToken,
    });
    for (const item of res.data.items ?? []) {
      const normalized = toExistingEvent(item);
      if (normalized) events.push(normalized);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

/** googleapis(Gaxios)エラーが 404 か */
function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: number | string; response?: { status?: number } };
  return e.code === 404 || e.code === "404" || e.response?.status === 404;
}

/** delete 直前の TOCTOU 再照合結果 */
type OwnershipCheck = "own" | "mismatch" | "gone";

/**
 * delete 直前に events.get で所有権を再確認する(TOCTOU 対策)。
 * private.managedBy==="jobcan-sync" かつ private.shiftId===dayKey の厳密一致のみ own。
 * 404 は既に消えている(冪等)= gone。それ以外のエラーは throw(呼び出し側へ伝播)。
 */
async function verifyOwnership(
  cal: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  dayKey: string,
): Promise<OwnershipCheck> {
  try {
    const res = await cal.events.get({ calendarId, eventId });
    const priv = res.data.extendedProperties?.private;
    if (priv?.managedBy === "jobcan-sync" && priv?.shiftId === dayKey) {
      return "own";
    }
    return "mismatch";
  } catch (err: unknown) {
    if (isNotFound(err)) return "gone";
    throw err;
  }
}

/** executeJobcanDayPlan の実行結果 */
export interface JobcanDayExecution {
  deletedCount: number;
  createdEventIds: string[];
  /** TOCTOU 再照合で自タグ不一致だったため消さなかった件数(付け替え/競合の兆候) */
  skippedMismatch: number;
  /** delete 直前に既に消えていた(404)ため冪等 skip した件数 */
  skippedGone: number;
}

/**
 * JobcanDayPlan を Google Calendar へ反映する。delete→create の順で実行。
 * 各 deleteEventId は delete 前に verifyOwnership で自タグ(jobcan-sync & shiftId=dayKey)を厳密再照合し、
 * 不一致なら消さず skippedMismatch に計上 / 404 なら冪等 skip し skippedGone に計上 / 404以外は throw。
 * 呼び出し側(runJobcanReconcile→Slack通知)が異常兆候を検知できるよう件数を返す。
 */
export async function executeJobcanDayPlan(
  refreshToken: string,
  calendarId: string,
  ctx: JobcanDayContext,
  plan: JobcanDayPlan,
): Promise<JobcanDayExecution> {
  const cal = calendarClient(refreshToken);
  const dayKey = `${ctx.staffCode}:${ctx.date}`;

  let deletedCount = 0;
  let skippedMismatch = 0;
  let skippedGone = 0;
  for (const eventId of plan.deleteEventIds) {
    const check = await verifyOwnership(cal, calendarId, eventId, dayKey);
    if (check === "mismatch") {
      skippedMismatch++;
      continue;
    }
    if (check === "gone") {
      skippedGone++;
      continue;
    }
    await cal.events.delete({ calendarId, eventId });
    deletedCount++;
  }

  const createdEventIds: string[] = [];
  for (const spec of plan.creates) {
    const created = await cal.events.insert({
      calendarId,
      requestBody: buildGoogleEvent(spec),
    });
    if (created.data.id) createdEventIds.push(created.data.id);
  }

  return { deletedCount, createdEventIds, skippedMismatch, skippedGone };
}

/** NewEventSpec → Google Calendar API の event リソース */
function buildGoogleEvent(
  spec: NewEventSpec,
): calendar_v3.Schema$Event {
  return {
    summary: spec.summary,
    description: spec.description,
    start: {
      dateTime: `${spec.date}T${spec.startTime}:00`,
      timeZone: "Asia/Tokyo",
    },
    end: {
      dateTime: `${spec.date}T${spec.endTime}:00`,
      timeZone: "Asia/Tokyo",
    },
    extendedProperties: {
      private: {
        shiftId: spec.shiftId,
        managedBy: spec.managedBy,
      },
    },
  };
}
