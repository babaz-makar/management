/**
 * jobcan 3 画面の UX 再設計で「画面に表示する文字列」を集約する(表示語のみ)。
 *
 * 重要: これは **表示テキストだけ** を言い換える。内部の変数名・prop 名・API・型・
 * データキー(staffCode / email / dryRun / apply など)は一切変えない。
 * 例: UI には「社員コード」と出すが、コード上の識別子は staffCode のまま。
 *
 * 依存ゼロの純データ/純関数。client 安全バレル(../ui)経由で公開する。
 */

/** 共通タブ 1 つ分。href は既存ルートを維持(回遊の再設計はナビ追加のみ)。 */
export interface JobcanTab {
  key: "home" | "import" | "staff";
  label: string;
  href: string;
}

/** 上部共通タブ(ホーム / 取込 / 名簿)。ルーティングは既存維持。 */
export const JOBCAN_TABS: readonly JobcanTab[] = [
  { key: "home", label: "ホーム", href: "/jobcan/home" },
  { key: "import", label: "取込", href: "/jobcan" },
  { key: "staff", label: "名簿", href: "/jobcan/staff" },
] as const;

/** 表示用語(言い換え)。内部識別子とは対応するが別物。 */
export const JOBCAN_UI_TERMS = {
  /** dry-run(内部語)の表示アクション語。 */
  dryRunAction: "選んだ内容を確認する",
  /** apply(本反映・内部語)の表示アクション語。 */
  applyAction: "カレンダーに反映する",
  /** staffCode(内部語)の表示ラベル。 */
  staffCodeLabel: "社員コード",
  /** email(内部語)の表示ラベル。 */
  emailLabel: "メール",
  /** agreed(内部語)の同意チェック文言。 */
  consentLabel: "この社員コードとメールで正しい",
  /** 名簿の検索欄プレースホルダ/aria-label。 */
  searchPlaceholder: "社員コード / メールで検索",
} as const;

/** 取込ステッパーの段番号(1-3)→ ラベル。 */
export function importStepLabel(step: 1 | 2 | 3): string {
  switch (step) {
    case 1:
      return "ファイルを選ぶ";
    case 2:
      return "内容を確認";
    case 3:
      return "カレンダーに反映";
  }
}

/**
 * 取込の phase(内部状態)→ ステッパーの現在段(1-3)。
 * 状態ロジック自体は page.tsx が持つ。ここは表示用の写像(純関数)のみ。
 * - idle: ①(ファイルを選ぶ)
 * - drying / reviewed / applying: ②(内容を確認 — dry-run 実行中も「確認」寄りが自然)
 * - done: ③(反映)
 * - error: ①へ戻す(選び直し導線)
 */
export function importPhaseToStep(
  phase: "idle" | "drying" | "reviewed" | "applying" | "done" | "error",
): 1 | 2 | 3 {
  switch (phase) {
    case "idle":
    case "error":
      return 1;
    case "drying":
    case "reviewed":
    case "applying":
      return 2;
    case "done":
      return 3;
  }
}
