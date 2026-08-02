import { NextRequest, NextResponse } from "next/server";
import {
  currentJstYearMonth,
  monthRangeIso,
  resolveHistoryLimit,
} from "@management/shift-management";
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const store = getStore();
  if (!store) return misconfigured();

  // 「当月」は JST 暦月で集計する(月初深夜帯の取りこぼし防止)。境界計算は純関数へ委譲。
  const { year, month } = currentJstYearMonth(Date.now());
  const { startIso, endIso } = monthRangeIso(year, month);
  const limit = resolveHistoryLimit(req.nextUrl.searchParams.get("limit"));

  try {
    const [summary, recent] = await Promise.all([
      store.getSummary(startIso, endIso),
      store.listRecent(limit),
    ]);
    return NextResponse.json({ summary, recent });
  } catch {
    return dbFailed();
  }
}
