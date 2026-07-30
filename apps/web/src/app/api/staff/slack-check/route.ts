import { NextRequest, NextResponse } from "next/server";
import { assertEmail, lookupSlackUserIdByEmail } from "@management/shift-management";

/**
 * Slack 在籍確認(email が Slack ワークスペースにいるか)。
 *
 * 前提: Vercel Deployment Protection 下の管理画面からのみ呼ばれる(主ゲートは infra 層)。
 * bot token はサーバー内(SLACK_BOT_TOKEN)のみで扱い、レスポンス・ログ・例外に出さない。
 *
 * - GET ?email= → { present: boolean } のみ返す(slack_user_id や詳細は返さない)。
 * - lookup が throw(invalid_auth / ratelimit / HTTP 非2xx 等)した場合は 502 を返し、
 *   「確認できなかった」ことを present:false と誤認させない(fail-loud を UI へ伝える)。
 *
 * fetch のみで neon 非依存だが、他の staff API と揃えて Node ランタイムにする。
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (typeof botToken !== "string" || botToken.length === 0) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const rawEmail = req.nextUrl.searchParams.get("email") ?? "";
  let email: string;
  try {
    email = assertEmail(rawEmail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid email";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    // 見つかれば id、未在籍なら null。id 自体は返さず在籍有無だけに落とす。
    const slackUserId = await lookupSlackUserIdByEmail(email, botToken);
    return NextResponse.json({ present: slackUserId !== null });
  } catch {
    // 呼び出し自体の失敗(認証エラー等)。present:false と混同させない。秘密は出さない。
    return NextResponse.json({ error: "could not verify" }, { status: 502 });
  }
}
