/**
 * 複数スタッフぶんの確定シフト entries を、各人のカレンダーへ突合反映する
 * 準純粋オーケストレーション(HTTP ルート・UI は Step2-7 の担当)。
 *
 * 処理: entries を staffCode+sourceMonth でバケツ化(同一人物の複数月は月ごとに別バケツ=
 * 両月とも独立に反映、別人・別月の混入なし)→ 各バケツの email(StaffDirectory)→
 * refreshToken/calendarId(resolver 経由)を解決 → 解決できたバケツだけ reconcile 実行、
 * できないバケツは warning 収集(warning は月ごと)。
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
  /** どの締め月の処理かを示す "YYYY-MM"(複数月まとめ投入時の識別用)。 */
  sourceMonth: string;
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

/** staffCode+sourceMonth ごとの集約バケツ(単一人物・単一月を厳密に保証)。 */
interface StaffMonthBucket {
  staffCode: string;
  sourceMonth: string;
  entries: ShiftEntry[];
}

/**
 * entries を staffCode+sourceMonth でグルーピング(出現順を保つ)。
 *
 * 集約キーに sourceMonth を含めることで、同一人物の複数月をまとめて投入しても
 * 月ごとに別バケツになり(両月とも独立に reconcile される)、別人・別月が同一
 * バケツに混入しない(取り違え防止)。各バケツは必ず単一 staffCode かつ単一 sourceMonth。
 */
function groupByStaffAndMonth(entries: ShiftEntry[]): StaffMonthBucket[] {
  const map = new Map<string, StaffMonthBucket>();
  for (const e of entries) {
    const key = `${e.staffCode}::${e.sourceMonth}`;
    const bucket = map.get(key);
    if (bucket) bucket.entries.push(e);
    else map.set(key, { staffCode: e.staffCode, sourceMonth: e.sourceMonth, entries: [e] });
  }
  return [...map.values()];
}

/**
 * スキップ理由を人間可読の日本語にする(Step2-7 の Slack 通知用)。秘密情報は載せない。
 * sourceMonth があれば先頭に "[YYYY-MM] " を付け、どの月の処理かを運用者に示す。
 */
export function describeStaffSkipReason(
  reason: JobcanStaffSkipReason,
  ctx: { staffCode: string; email: string | null; sourceMonth?: string },
): string {
  const who = ctx.email ?? ctx.staffCode;
  const month = ctx.sourceMonth ? `[${ctx.sourceMonth}] ` : "";
  switch (reason) {
    case "email_not_registered":
      return `${month}${ctx.staffCode} は email 未登録です(スタッフ名簿に追加してください)`;
    case "directory_error":
      return `${month}${ctx.staffCode} の名簿引き当てに失敗しました(DB障害の可能性)。この人はスキップし、他の人の処理は継続しました`;
    case "slack_not_found":
      return `${month}${who} は Slack ワークスペースに見つかりません(未在籍の可能性)`;
    case "google_not_linked":
      return `${month}${who} は Google カレンダー未連携です`;
    case "resolve_error":
      return `${month}${ctx.staffCode} のトークン解決に失敗しました(Slack API 障害の可能性)`;
    case "reconcile_error":
      return `${month}${ctx.staffCode}(${who})のカレンダー突合に失敗しました(Google カレンダー API 障害の可能性)。この人はスキップし、他の人の処理は継続しました`;
  }
}

function warn(
  staffCode: string,
  email: string | null,
  sourceMonth: string,
  reason: JobcanStaffSkipReason,
): JobcanStaffWarning {
  return {
    staffCode,
    email,
    sourceMonth,
    reason,
    message: describeStaffSkipReason(reason, { staffCode, email, sourceMonth }),
  };
}

/**
 * 1人ぶんを解決する。成功なら token/calendarId、失敗なら warning を返す(例外は隔離)。
 * email/token 解決は staffCode 単位(同一人物は同じ email/token)だが、warning は
 * バケツの sourceMonth を持たせ「どの月の失敗か」を識別できるようにする。
 * 上流例外の生 message は warning に転写しない(接続文字列等の秘密流出を防ぐ=M-3)。
 */
async function resolveOneStaff(
  staffCode: string,
  sourceMonth: string,
  deps: JobcanReconcileAllDeps,
): Promise<
  | { ok: true; refreshToken: string; calendarId: string }
  | { ok: false; warning: JobcanStaffWarning }
> {
  let email: string | null;
  try {
    email = await deps.staffDirectory.get(staffCode);
  } catch {
    // 名簿引き当ての例外(DB障害等)はその人だけ warning に隔離(他人を止めない)。
    // get が null を返す「未登録(email_not_registered)」とは別 reason に分ける。
    return { ok: false, warning: warn(staffCode, null, sourceMonth, "directory_error") };
  }
  if (email === null) {
    return { ok: false, warning: warn(staffCode, null, sourceMonth, "email_not_registered") };
  }
  let resolution: TokenResolution;
  try {
    resolution = await deps.resolveToken(email);
  } catch {
    // Slack API 障害などはその人だけ warning に隔離(他人を止めない)。
    return { ok: false, warning: warn(staffCode, email, sourceMonth, "resolve_error") };
  }
  if (!resolution.ok) {
    return { ok: false, warning: warn(staffCode, email, sourceMonth, resolution.reason) };
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

  for (const bucket of groupByStaffAndMonth(entries)) {
    const { staffCode, sourceMonth } = bucket;
    const resolved = await resolveOneStaff(staffCode, sourceMonth, deps);
    if (!resolved.ok) {
      warnings.push(resolved.warning);
      continue;
    }
    // reconcile は常にその人自身の token/calendarId と、その人×その月の entries だけで呼ぶ
    // (バケツは単一 staffCode+単一 sourceMonth を保証)。
    // 突合本体(カレンダーI/O)が throw しても、resolveToken 隔離と対称に
    // その (人×月) だけ warning へ隔離し、残りの処理は継続する(全体を止めない)。
    // 上流の生 err.message は転写しない(秘密流出防止=M-3)。reason ベースの一般文言のみ。
    try {
      reconciled.push(
        await deps.reconcile(bucket.entries, resolved.refreshToken, resolved.calendarId),
      );
    } catch {
      warnings.push(warn(staffCode, resolved.calendarId, sourceMonth, "reconcile_error"));
    }
  }

  return { reconciled, warnings };
}
