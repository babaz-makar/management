import { google, type calendar_v3 } from "googleapis";
import type { CalendarPlan, ExistingEvent, NewEventSpec } from "../logic/calendar-plan";

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

function calendarClient(refreshToken: string): calendar_v3.Calendar {
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

  return (res.data.items ?? [])
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({
      id: e.id!,
      shiftId: e.extendedProperties?.private?.shiftId,
      date,
      startTime: fmtISO(e.start!.dateTime!),
      endTime: fmtISO(e.end!.dateTime!),
    }));
}

/** ISO 8601 dateTime → "HH:MM"（タイムゾーン変換せずJST部分を直接抽出） */
function fmtISO(iso: string): string {
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
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
