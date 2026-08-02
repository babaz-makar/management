import { NextResponse } from "next/server";
import { isJobcanApplyEnabled } from "@management/shift-management";

/**
 * ジョブカン取込のサーバー状態(本反映スイッチ)を返す読取専用 API。
 *
 * - レスポンスは `{ applyEnabled: boolean }` **だけ**。env の生値は一切露出しない。
 * - DB 不要(env 判定のみ)。判定ロジックは packages の isJobcanApplyEnabled と共有し、
 *   resolveDryRun(取込側の二重ゲート)と「env の見方」がずれないようにする。
 *
 * ホーム画面は本反映オフの常時バナー表示にこの値を使う。
 */
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const applyEnabled = isJobcanApplyEnabled({
    JOBCAN_APPLY_ENABLED: process.env.JOBCAN_APPLY_ENABLED,
  });
  return NextResponse.json({ applyEnabled });
}
