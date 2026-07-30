/**
 * 取込 UI / 名簿 UI 共通の最小色トークン(中央化)。
 *
 * 既存アプリの素朴なインライン style 基調を保つため、CSS ライブラリは入れず、
 * ここで 3 系統(危険=赤 / 警告=オレンジ / 成功・通常=黒)だけを一元管理する。
 * コンポーネントはこの定数を参照し、色をハードコードしない。
 */
export const COLORS = {
  /** 危険操作(削除・取り違え)。 */
  danger: "#c0392b",
  dangerBg: "#fdecea",
  dangerBorder: "#e6b0aa",
  /** 警告(スキップ・要注意だが致命ではない)。 */
  warning: "#b9770e",
  warningBg: "#fef5e7",
  warningBorder: "#f5cba7",
  /** 成功・通常(既定)。 */
  text: "#111",
  success: "#1e8449",
  successBg: "#eafaf1",
  successBorder: "#a9dfbf",
  /** 中立(枠線・補助テキスト)。 */
  muted: "#666",
  border: "#ddd",
  surface: "#fafafa",
} as const;

/** 画面共通の外枠 style(page.tsx / staff/page.tsx で共有)。 */
export const PAGE_STYLE: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "3rem 1.5rem",
  maxWidth: 960,
  margin: "0 auto",
  color: COLORS.text,
};
