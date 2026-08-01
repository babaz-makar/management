import { NextRequest, NextResponse } from "next/server";
import { createOAuth2Client } from "@management/shift-management";
import { getTokenStore } from "@/lib/token-store";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const slackUserId = req.nextUrl.searchParams.get("state");

  if (!code || !slackUserId) {
    return NextResponse.json(
      { error: "missing code or state" },
      { status: 400 },
    );
  }

  const oauth2 = createOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    return new NextResponse(
      "<h2>エラー: refresh_token が取得できませんでした。</h2><p>Googleアカウントの設定で、このアプリのアクセスを一度取り消してから再度お試しください。</p>",
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const tokenStore = getTokenStore();
  await tokenStore.set(slackUserId, tokens.refresh_token);

  return new NextResponse(
    "<h2>Google Calendar 連携完了！</h2><p>このページを閉じてください。Slackでシフト変更を投稿すると、あなたのカレンダーに反映されます。</p>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
