/**
 * 取込 UI / 名簿 UI 共通の最小色トークン(中央化)。
 *
 * 既存アプリの素朴なインライン style 基調を保つため、CSS ライブラリは入れず、
 * ここで 3 系統(危険=赤 / 警告=オレンジ / 成功・通常=黒)だけを一元管理する。
 * コンポーネントはこの定数を参照し、色をハードコードしない。
 *
 * iOS 風リスキンの拡張トークン(IOS / iosType 等)は packages の純粋ロジック
 * (client 安全バレル)に置き、ここから再輸出する。値の回帰は packages 側の
 * ios-tokens.test.ts で固定済み(apps/web にテストランナーが無いため)。
 * 既存の COLORS / PAGE_STYLE は後方互換のため残す。
 */
export {
  IOS,
  IOS_FONT_FAMILY,
  iosType,
  iosButtonColors,
  iosCalloutColors,
  iosRowBackground,
} from "@management/shift-management/ui";
export type {
  IosTypeLevel,
  IosTypeStyle,
  IosButtonVariant,
  IosButtonState,
  IosButtonColors,
  IosCalloutTone,
  IosCalloutColors,
} from "@management/shift-management/ui";

export const COLORS = {
  /** 危険操作(削除・取り違え)。 */
  danger: "#c0392b",
  dangerBg: "#fdecea",
  dangerBorder: "#e6b0aa",
  /** 警告(スキップ・要注意だが致命ではない)。warningBg(#fef5e7)上で WCAG AA(4.5:1)を満たす濃さ。 */
  warning: "#8f5b00",
  warningBg: "#fef5e7",
  warningBorder: "#f5cba7",
  /** 成功・通常(既定)。success は successBg(#eafaf1)上・白上いずれでも WCAG AA(4.5:1)を満たす濃さ。 */
  text: "#111",
  success: "#1b7a42",
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
