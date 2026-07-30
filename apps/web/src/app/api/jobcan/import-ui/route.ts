import { NextRequest, NextResponse } from "next/server";
import { POST as importPost } from "../import/route";

/**
 * BFF 中継(ブラウザ管理画面 → /api/jobcan/import)。
 *
 * 前提: この画面は Vercel Deployment Protection(infra 層)が主ゲート。コード側の
 * 画面認証ミドルウェアは持たない。同一オリジンの管理画面からのみ呼ばれる想定。
 *
 * /api/jobcan/import は Bearer JOBCAN_IMPORT_SECRET が必須(2-7b)。ブラウザは secret を
 * 持てないため、この中継が **サーバー内で** Authorization ヘッダを付与して import へ渡す。
 *
 * 実装方式: **二重 fetch を避け、import ルートの POST ハンドラを同一プロセス内で直接呼ぶ**。
 *   - 理由1: 2回目のネットワーク往復を無くす(遅延・失敗点を減らす)。
 *   - 理由2: Vercel 上で自オリジンの絶対 URL を組み立てる不安定さ(ホスト/プロトコル推定)を回避。
 *   - 理由3: 認証・上限・multipart 解析・dry-run ゲートの単一の権威を import ルートに保つ
 *            (この殻でロジックを再実装せず、安全不変条件を弱めない)。
 * multipart ボディはそのまま(arrayBuffer で1度だけ読み)転送し、この殻では解析しない。
 * apply は URL クエリと form の両方を透過(URL を保持し、body も丸ごと渡す)。
 *
 * exceljs / neon を辿るため Node ランタイム必須。
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const secret = process.env.JOBCAN_IMPORT_SECRET;
  // secret 未設定なら "Bearer undefined" を作らず即 500(設定不備)。値は出さない。
  if (typeof secret !== "string" || secret.length === 0) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  // ボディを1度だけ読み、同じ内容で転送用リクエストを組む(body は一度しか読めない)。
  // Content-Type(multipart の boundary を含む)は元ヘッダを引き継ぐ。
  const bodyBuffer = await req.arrayBuffer();
  const headers = new Headers(req.headers);
  headers.set("authorization", `Bearer ${secret}`);
  // 転送で長さがずれないよう content-length は再計算させる。
  headers.delete("content-length");

  // 元 URL(?apply=... を含む)を維持したまま NextRequest を再構築する。
  const forwarded = new NextRequest(req.url, {
    method: "POST",
    headers,
    body: bodyBuffer,
  });

  // import ルートの JSON をそのまま素通し(secret はレスポンス・ログに出さない)。
  return importPost(forwarded);
}
