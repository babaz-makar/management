import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client, getAuthUrl } from "@management/shift-management";

export async function GET(req: NextRequest) {
  const slackUserId = req.nextUrl.searchParams.get("slack_user_id");
  if (!slackUserId) {
    return NextResponse.json(
      { error: "slack_user_id パラメータが必要です" },
      { status: 400 },
    );
  }

  const oauth2 = createOAuth2Client();
  const url = getAuthUrl(oauth2, slackUserId);
  return NextResponse.redirect(url);
}
