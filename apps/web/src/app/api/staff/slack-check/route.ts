import { NextRequest, NextResponse } from "next/server";
import { assertEmail, lookupSlackUserIdByEmail } from "@management/shift-management";

/**
 * Slack 在籍確認(email が Slack ワークスペースにいるか)。
 *
 * 前提: Vercel Deployment Protection 下の管理画面からのみ呼ばれる(主ゲートは infra 層)。
 * bot token はサーバー内(SLACK_BOT_TOKEN)のみで扱い、レスポンス・ログ・例外に出さない。
 *
 * - POST { email } (JSON body) → { present: boolean } のみ返す(slack_user_id や詳細は返さない)。
 *   email はクエリではなく body で受ける(URL に PII を載せず、アクセスログに残さない=
 *   ムーディ MEDIUM)。
 * - lookup が throw(invalid_auth / ratelimit / HTTP 非2xx 等)した場合は 502 を返し、
 *   「確認できなかった」ことを present:false と誤認させない(fail-loud を UI へ伝える)。
 *
 * fetch のみで neon 非依存だが、他の staff API と揃えて Node ランタイムにする。
 */
export const runtime = "nodejs";

/** JSON body から email 文字列を安全に取り出す(非 JSON/欠落は空文字で assertEmail に弾かせる)。 */
async function readEmailFromBody(req: NextRequest): Promise<string> {
  try {
    const body: unknown = await req.json();
    if (typeof body === "object" && body !== null) {
      const value = (body as Record<string, unknown>).email;
      if (typeof value === "string") return value;
    }
  } catch {
    // 非 JSON / body 欠落は空文字扱い(下流の assertEmail が 400 で弾く)。
  }
  return "";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (typeof botToken !== "string" || botToken.length === 0) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const rawEmail = await readEmailFromBody(req);
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
