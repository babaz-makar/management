/**
 * 複数スタッフぶんの確定シフト entries を、各人のカレンダーへ突合反映する
 * 準純粋オーケストレーション(HTTP ルート・UI は Step2-7 の担当)。
 *
 * 処理: staffCode の集合 → 各人の email(StaffDirectory)→ refreshToken/calendarId
 * (resolver 経由)を解決 → 解決できた人だけ reconcile 実行、できない人は warning 収集。
 *
 * 最重要ガード: 解決失敗(未登録/名簿例外/未在籍/未連携/解決時例外)は **その人をスキップして
 * warning に積む** だけ。reconcile は常にその人自身の refreshToken と
 * calendarId(=email)で呼ぶため、失敗した人が他人のカレンダーに影響することはない。
 * 名簿 get・resolveToken・reconcile 本体いずれの例外もその人の warning に隔離し、
 * 他人の処理を止めない(fail-loud だが波及させない)。全レイヤで対称。
 */
import type { ShiftEntry } from "../types";
import type { StaffDirectory } from "./staff-directory";
import type { TokenResolution } from "./jobcan-token-resolver";
import type { JobcanReconcileResult } from "./jobcan-pipeline";

/**
 * スキップ理由。email→token の失敗(resolver reason)＋その前後の失敗を合わせた union。
 * resolve_error は解決段(token取得)の例外、reconcile_error は突合段(カレンダーI/O本体)の例外。
 * どちらも「その人だけ隔離し他人へ波及させない」ための reason。
 */
export type JobcanStaffSkipReason =
  | "email_not_registered"
  | "directory_error"
  | "slack_not_found"
  | "google_not_linked"
  | "resolve_error"
  | "reconcile_error";

export interface JobcanStaffWarning {
  staffCode: string;
  /** email 未登録のときは null。 */
  email: string | null;
  reason: JobcanStaffSkipReason;
  message: string;
}

export interface JobcanReconcileAllResult {
  /** 解決できた人ぶんの突合結果。 */
  reconciled: JobcanReconcileResult[];
  /** スキップした人ぶんの warning。 */
  warnings: JobcanStaffWarning[];
}

/** テストで fake を差し込めるよう DI する依存。 */
export interface JobcanReconcileAllDeps {
  /** staffCode → email(未登録なら null、不正 staffCode は throw)。 */
  staffDirectory: StaffDirectory;
  /** email → refreshToken/calendarId の解決(Slack橋渡し)。 */
  resolveToken: (email: string) => Promise<TokenResolution>;
  /** 1人1か月ぶんの突合実行(options/port は呼び出し側で束ねて渡す)。 */
  reconcile: (
    entries: ShiftEntry[],
    refreshToken: string,
    calendarId: string,
  ) => Promise<JobcanReconcileResult>;
}

/** entries を staffCode でグルーピング(出現順を保つ)。 */
function groupByStaffCode(entries: ShiftEntry[]): Map<string, ShiftEntry[]> {
  const map = new Map<string, ShiftEntry[]>();
  for (const e of entries) {
    const bucket = map.get(e.staffCode);
    if (bucket) bucket.push(e);
    else map.set(e.staffCode, [e]);
  }
  return map;
}

/** スキップ理由を人間可読の日本語にする(Step2-7 の Slack 通知用)。秘密情報は載せない。 */
export function describeStaffSkipReason(
  reason: JobcanStaffSkipReason,
  ctx: { staffCode: string; email: string | null },
): string {
  const who = ctx.email ?? ctx.staffCode;
  switch (reason) {
    case "email_not_registered":
      return `${ctx.staffCode} は email 未登録です(スタッフ名簿に追加してください)`;
    case "directory_error":
      return `${ctx.staffCode} の名簿引き当てに失敗しました(DB障害の可能性)。この人はスキップし、他の人の処理は継続しました`;
    case "slack_not_found":
      return `${who} は Slack ワークスペースに見つかりません(未在籍の可能性)`;
    case "google_not_linked":
      return `${who} は Google カレンダー未連携です`;
    case "resolve_error":
      return `${ctx.staffCode} のトークン解決に失敗しました(Slack API 障害の可能性)`;
    case "reconcile_error":
      return `${ctx.staffCode}(${who})のカレンダー突合に失敗しました(Google カレンダー API 障害の可能性)。この人はスキップし、他の人の処理は継続しました`;
  }
}

function warn(
  staffCode: string,
  email: string | null,
  reason: JobcanStaffSkipReason,
): JobcanStaffWarning {
  return { staffCode, email, reason, message: describeStaffSkipReason(reason, { staffCode, email }) };
}

/** err の可読メッセージだけ取り出す(生スタックや token を warning に載せないため)。 */
function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 1人ぶんを解決する。成功なら token/calendarId、失敗なら warning を返す(例外は隔離)。 */
async function resolveOneStaff(
  staffCode: string,
  deps: JobcanReconcileAllDeps,
): Promise<
  | { ok: true; refreshToken: string; calendarId: string }
  | { ok: false; warning: JobcanStaffWarning }
> {
  let email: string | null;
  try {
    email = await deps.staffDirectory.get(staffCode);
  } catch (err) {
    // 名簿引き当ての例外(DB障害等)はその人だけ warning に隔離(他人を止めない)。
    // get が null を返す「未登録(email_not_registered)」とは別 reason に分ける。
    const base = warn(staffCode, null, "directory_error");
    return { ok: false, warning: { ...base, message: `${base.message}: ${errorDetail(err)}` } };
  }
  if (email === null) {
    return { ok: false, warning: warn(staffCode, null, "email_not_registered") };
  }
  let resolution: TokenResolution;
  try {
    resolution = await deps.resolveToken(email);
  } catch {
    // Slack API 障害などはその人だけ warning に隔離(他人を止めない)。
    return { ok: false, warning: warn(staffCode, email, "resolve_error") };
  }
  if (!resolution.ok) {
    return { ok: false, warning: warn(staffCode, email, resolution.reason) };
  }
  return { ok: true, refreshToken: resolution.refreshToken, calendarId: resolution.calendarId };
}

/**
 * 複数スタッフぶんを解決→突合する。解決できた人だけ reconcile、できない人は warning。
 */
export async function reconcileJobcanForAllStaff(
  entries: ShiftEntry[],
  deps: JobcanReconcileAllDeps,
): Promise<JobcanReconcileAllResult> {
  const reconciled: JobcanReconcileResult[] = [];
  const warnings: JobcanStaffWarning[] = [];

  for (const [staffCode, staffEntries] of groupByStaffCode(entries)) {
    const resolved = await resolveOneStaff(staffCode, deps);
    if (!resolved.ok) {
      warnings.push(resolved.warning);
      continue;
    }
    // reconcile は常にその人自身の token/calendarId とその人の entries だけで呼ぶ。
    // 突合本体(カレンダーI/O)が throw しても、resolveToken 隔離と対称に
    // その人だけ warning へ隔離し、残りのスタッフの処理は継続する(全体を止めない)。
    try {
      reconciled.push(
        await deps.reconcile(staffEntries, resolved.refreshToken, resolved.calendarId),
      );
    } catch (err) {
      // calendarId は design 上その人の email。token 等の秘密は載せず err.message のみ添える。
      const base = warn(staffCode, resolved.calendarId, "reconcile_error");
      warnings.push({ ...base, message: `${base.message}: ${errorDetail(err)}` });
    }
  }

  return { reconciled, warnings };
}
