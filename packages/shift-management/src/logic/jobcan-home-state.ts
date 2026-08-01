/**
 * ジョブカン ホーム画面の状態判定(純関数・Neon 非依存・React 非依存)。
 *
 * 画面(apps/web の /jobcan/home)はこの純関数に status/history/staff の取得結果を渡し、
 * 「いま何を促すか(primary)」を1つだけ決める。UI 側にロジックを持たせず、優先順位と
 * 文言をここへ集約して単体テストの核にする(既存 logic/ 配下の純関数群と同じ流儀)。
 */
import type {
  ImportHistorySummary,
  ImportHistoryRow,
} from "./jobcan-import-history-types";

/** 画面が促す主アクション(primary)。優先順位で1つだけ選ぶ。 */
export type HomePrimaryKind =
  | "error"
  | "needStaff"
  | "hasUnregistered"
  | "noImport"
  | "normal";

export interface HomePrimary {
  kind: HomePrimaryKind;
  /** 見出し(ルナ語彙踏襲)。 */
  message: string;
  /** 誘導先。error は再読み込みのみで遷移先を持たないため null。 */
  ctaHref: string | null;
  /** ボタン文言。error のときは null。 */
  ctaLabel: string | null;
  /** hasUnregistered のときの未登録人数。 */
  unregisteredCount?: number;
  /** normal のときの直近取込行(サマリ表示用)。 */
  latestImport?: ImportHistoryRow;
}

export interface HomeState {
  primary: HomePrimary;
  /** 本反映が「既知でオフ」のときだけ true(status 不明時は誤バナーを出さない)。 */
  showApplyOffBanner: boolean;
}

/** 画面が取得した3ソースの結果を正規化したスナップショット。 */
export interface HomeSnapshot {
  /** status API の取得可否。 */
  statusOk: boolean;
  /** 本反映スイッチ(status 成功時のみ意味を持つ)。 */
  applyEnabled: boolean;
  /** history API の取得可否。 */
  historyOk: boolean;
  /** history の集計(取得失敗時は null 可)。 */
  summary: ImportHistorySummary | null;
  /** staff API の取得可否。 */
  staffOk: boolean;
  /** 登録済み名簿件数。 */
  staffCount: number;
}

/** apply オフの常時バナー文言(固定)。 */
export const APPLY_OFF_BANNER_MESSAGE =
  "本反映はいまオフ。取込してもカレンダーには書き込みません。";

const STAFF_HREF = "/jobcan/staff";
const IMPORT_HREF = "/jobcan";

/**
 * primary を優先順位で1つに決める。
 * 1) 取得失敗 2) 名簿0件 3) 未登録あり 4) 取込記録なし 5) 通常。
 */
function resolvePrimary(snapshot: HomeSnapshot): HomePrimary {
  const anyError = !snapshot.statusOk || !snapshot.historyOk || !snapshot.staffOk;
  if (anyError) {
    return {
      kind: "error",
      message: "状態を確認できませんでした。再読み込みしてください。",
      ctaHref: null,
      ctaLabel: null,
    };
  }

  if (snapshot.staffCount === 0) {
    return {
      kind: "needStaff",
      message: "まず名簿を登録しましょう。",
      ctaHref: STAFF_HREF,
      ctaLabel: "名簿を登録する",
    };
  }

  const unregistered = snapshot.summary?.unregisteredCount ?? 0;
  if (unregistered > 0) {
    return {
      kind: "hasUnregistered",
      message: `名簿に未登録の人が ${unregistered} 人います。`,
      ctaHref: STAFF_HREF,
      ctaLabel: "名簿を確認する",
      unregisteredCount: unregistered,
    };
  }

  const latest = snapshot.summary?.latestImport ?? null;
  if (latest === null) {
    return {
      kind: "noImport",
      message: "取込の記録はまだありません。",
      ctaHref: IMPORT_HREF,
      ctaLabel: "取込画面へ",
    };
  }

  const mode = latest.dryRun ? "dry-run" : "本反映";
  return {
    kind: "normal",
    message: `直近の取込: ${formatImportDate(latest.executedAt)} 完了(${mode})`,
    ctaHref: IMPORT_HREF,
    ctaLabel: "取込画面へ",
    latestImport: latest,
  };
}

/** スナップショットから画面状態を決める。 */
export function resolveHomeState(snapshot: HomeSnapshot): HomeState {
  return {
    primary: resolvePrimary(snapshot),
    // apply オフのバナーは status が取れているときだけ(不明時に誤って「オフ」と出さない)。
    showApplyOffBanner: snapshot.statusOk && snapshot.applyEnabled === false,
  };
}

/** ISO 日時を JST(Asia/Tokyo)の「M月D日」へ整形する。不正値は固定文言。 */
export function formatImportDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "日時不明";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${month}月${day}日`;
}

/** JST は UTC+9。暦月境界を JST 基準で扱うためのオフセット(ミリ秒)。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 指定 JST 暦月の半開区間 [当月1日 00:00 JST, 翌月1日 00:00 JST) を **UTC の ISO** で返す。
 * executed_at は timestamptz(UTC 実時刻)なので、JST 月初の瞬間を UTC へ変換した境界を渡す。
 * 例: JST 8月 → [2026-07-31T15:00:00Z, 2026-08-31T15:00:00Z)。
 * M-2: UTC 暦月ではなく JST 暦月に統一し、月初深夜帯(JST 0〜9時)の取りこぼしを無くす。
 */
export function monthRangeIso(
  year: number,
  month: number,
): { startIso: string; endIso: string } {
  const start = new Date(Date.UTC(year, month - 1, 1) - JST_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - JST_OFFSET_MS);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * 現在時刻(ms)を JST 暦の年・月(1-12)に変換する。
 * UTC+9 したうえで UTC フィールドを読むことで、JST の「今何月か」を得る
 * (月初深夜帯に UTC 基準だと前月扱いになる取りこぼしを防ぐ)。
 */
export function currentJstYearMonth(nowMs: number): {
  year: number;
  month: number;
} {
  const jst = new Date(nowMs + JST_OFFSET_MS);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 };
}
