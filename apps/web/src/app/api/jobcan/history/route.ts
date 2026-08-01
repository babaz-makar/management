import { NextRequest, NextResponse } from "next/server";
import { monthRangeIso } from "@management/shift-management";
import { NeonImportHistoryStore } from "@/lib/import-history-neon";

/**
 * ジョブカン取込履歴の読取専用 API(PII なし)。
 *
 * - GET /api/jobcan/history?limit=N → `{ summary, recent }`。
 *   summary/recent は packages 側で reason 別カウントのみを持つ PII フリーな行。
 *   email・氏名・ファイル名・自由文字列は構造的に一切返らない。
 * - エラー形は staff route を踏襲(misconfigured→500 / dbFailed→500)。
 *   接続文字列等の秘密は本文・ログ・例外に出さない。
 *
 * 前提: この API は Vercel Deployment Protection(infra 層)配下の管理画面から呼ばれる。
 * neon は Node ランタイム依存。
 */
export const runtime = "nodejs";

/** ?limit= の既定値(未指定・不正時)。上限クランプは core 側が行う。 */
const DEFAULT_LIMIT = 20;

/** DB 履歴ストアを得る。DATABASE_URL 未設定なら null(呼び出し側で 500)。 */
function getStore(): NeonImportHistoryStore | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) return null;
  return new NeonImportHistoryStore(databaseUrl);
}

/** 設定不備(DATABASE_URL 欠落)の共通レスポンス。秘密は出さない。 */
function misconfigured(): NextResponse {
  return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
}

/** DB 由来の例外は一般化した 500 に落とす(接続文字列等の秘密を出さない)。 */
function dbFailed(): NextResponse {
  return NextResponse.json({ error: "operation failed" }, { status: 500 });
}

/** ?limit= を非負整数へ(不正は既定値)。最終的な上限は core が clamp する。 */
function readLimit(req: NextRequest): number {
  const raw = req.nextUrl.searchParams.get("limit");
  if (raw === null) return DEFAULT_LIMIT;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_LIMIT;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const store = getStore();
  if (!store) return misconfigured();

  // 「当月」は UTC 基準の月境界で集計する(ホームの補助統計。厳密な JST 境界ではない)。
  const now = new Date();
  const { startIso, endIso } = monthRangeIso(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
  );

  try {
    const [summary, recent] = await Promise.all([
      store.getSummary(startIso, endIso),
      store.listRecent(readLimit(req)),
    ]);
    return NextResponse.json({ summary, recent });
  } catch {
    return dbFailed();
  }
}
