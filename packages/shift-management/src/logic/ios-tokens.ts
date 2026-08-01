/**
 * iOS(Apple)風リスキン用の純粋デザイントークン + style 生成ヘルパ。
 *
 * jobcan ツールの 3 画面を iOS 標準ライト相当の見た目に寄せるための「値」を一元管理する。
 * apps/web にはテストランナーが無いため(前タスク H-1 と同方針)、値の回帰を固定できる
 * 純粋な定数/ヘルパはこの packages 側に置き、client 安全バレル(../ui)経由で公開する。
 * apps/web の tokens.ts はここを再輸出し、最終利用点(インライン style)で参照する。
 *
 * 依存ゼロ(react の型のみ・実行時 import なし)。ui バレルの client 安全性を汚さない。
 *
 * 名前空間設計: 色は将来ダークを併設しやすいよう IOS.color(ライト値)配下にまとめる。
 * ダーク対応時は IOS.colorDark を足し、利用点でテーマ切替すればよい(今回はライトのみ)。
 */
import type { CSSProperties } from "react";

/** iOS 標準ライト相当の色トークン。 */
const COLOR = {
  /** グループ化リスト画面の床。 */
  groupedBg: "#F2F2F7",
  /** カード/面。 */
  cardBg: "#FFFFFF",
  /** タップ押下時のカード地。 */
  cardBgPressed: "#D1D1D6",
  /** hairline 分割線。 */
  separator: "#C6C6C8",
  /** ラベル階層(不透明近似)。 */
  label: "#000000",
  secondaryLabel: "#8A8A8E",
  tertiaryLabel: "#B9B9BE",
  /** アクセント(systemBlue)。操作・リンク・tint は全てこの 1 色。 */
  blue: "#007AFF",
  bluePressed: "#0062CC",
  blueTintBg: "#E7F0FF",
  /** 危険(systemRed 階調)。 */
  red: "#FF3B30",
  redText: "#D70015",
  redTintBg: "#FFEBE9",
  /** 警告(systemOrange 階調)。 */
  orange: "#FF9500",
  orangeText: "#8F5B00",
  orangeTintBg: "#FFF4E5",
  /**
   * 成功(systemGreen 階調)。
   * greenText は白地(5.40:1)・greenTintBg 上(4.95:1)いずれも WCAG AA(4.5:1)を満たす濃さ。
   * iOS 標準の #248A3D は両背景で AA 未達(4.40/4.03)のため一段濃く調整している。
   */
  green: "#34C759",
  greenText: "#1E7A34",
  greenTintBg: "#E9F9EE",
} as const;

/** systemGray1-6(濃→淡)。 */
const GRAY = {
  g1: "#8E8E93",
  g2: "#AEAEB2",
  g3: "#C7C7CC",
  g4: "#D1D1D6",
  g5: "#E5E5EA",
  g6: "#F2F2F7",
} as const;

/** 余白・角丸・行/入力寸法(px)。 */
const METRICS = {
  /** 画面水平余白: 狭い幅 / >=768。 */
  screenPadX: 16,
  screenPadXWide: 20,
  /** 1 カラム前提の最大幅(960→絞る)。 */
  maxWidth: 680,
  /** 分割線の左インセット。 */
  separatorInset: 16,
  /** カード角丸: リスト / 独立 / 大型ヒーロー。 */
  radiusList: 10,
  radiusCard: 12,
  radiusHero: 16,
  /** ダイアログ角丸。 */
  radiusDialog: 14,
  /** 入力欄・ボタン角丸。 */
  radiusControl: 10,
  /** セクション間の余白。 */
  sectionGap: 35,
  /** 行の最小高さと内 padding。 */
  rowMinHeight: 44,
  rowPadY: 11,
  rowPadX: 16,
  /** 入力欄・ボタン高さ。 */
  controlHeight: 44,
  /** 主要ボタンの高さ。 */
  buttonPrimaryHeight: 50,
} as const;

/** iOS 標準のシステムフォントスタック(SF Pro 相当 → 日本語フォールバック)。 */
export const IOS_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif';

/** タイポ階層のレベル名。 */
export type IosTypeLevel =
  | "largeTitle"
  | "title2"
  | "title3"
  | "headline"
  | "body"
  | "callout"
  | "subhead"
  | "footnote"
  | "caption";

/** iosType() が返す style 断片(px 単位を文字列で持つ)。 */
export interface IosTypeStyle {
  fontSize: number;
  fontWeight: number;
  letterSpacing: string;
  lineHeight: string;
}

/** タイポ階層の生値: [fontSize, fontWeight, letterSpacing(px), lineHeight(px)]。 */
const TYPE_SCALE: Record<IosTypeLevel, readonly [number, number, number, number]> = {
  largeTitle: [34, 700, -0.4, 41],
  title2: [22, 700, -0.3, 28],
  title3: [20, 600, -0.2, 25],
  headline: [17, 600, 0, 22],
  body: [17, 400, 0, 22],
  callout: [16, 400, 0, 21],
  subhead: [15, 400, 0, 20],
  footnote: [13, 400, 0, 18],
  caption: [12, 400, 0, 16],
};

/**
 * タイポ階層 → style 断片(純関数)。
 * letterSpacing / lineHeight は px を文字列化して返す(0 は "0px")。
 */
export function iosType(level: IosTypeLevel): IosTypeStyle {
  const [fontSize, fontWeight, letterSpacing, lineHeight] = TYPE_SCALE[level];
  return {
    fontSize,
    fontWeight,
    letterSpacing: `${letterSpacing}px`,
    lineHeight: `${lineHeight}px`,
  };
}

/** ボタンの見た目バリアント。 */
export type IosButtonVariant = "filled" | "tinted" | "plain" | "destructive";
/** ボタンの状態(押下/無効/通常)。 */
export type IosButtonState = "default" | "pressed" | "disabled";

/** ボタンの色(背景・文字)。レイアウト(高さ・角丸)は利用点で付与。 */
export interface IosButtonColors {
  background: string;
  color: string;
}

/**
 * variant × state から背景色・文字色を決める純関数(色の割り当てを固定)。
 * - filled: 青地/白文字。危険色は destructive で表現する。
 * - tinted: 淡青地/青文字。
 * - plain: 地なし/青文字。
 * - destructive: 赤地/白文字。
 * - disabled: 地=gray4 / 文字=gray1(地なし系は地を透明に)。
 */
export function iosButtonColors(
  variant: IosButtonVariant,
  state: IosButtonState,
): IosButtonColors {
  if (state === "disabled") {
    const transparentBg = variant === "plain" || variant === "tinted";
    return {
      background: transparentBg ? "transparent" : GRAY.g4,
      color: GRAY.g1,
    };
  }
  const pressed = state === "pressed";
  switch (variant) {
    case "filled":
      return { background: pressed ? COLOR.bluePressed : COLOR.blue, color: "#FFFFFF" };
    case "destructive":
      return { background: pressed ? COLOR.redText : COLOR.red, color: "#FFFFFF" };
    case "tinted":
      return {
        background: COLOR.blueTintBg,
        color: pressed ? COLOR.bluePressed : COLOR.blue,
      };
    case "plain":
      return {
        background: "transparent",
        color: pressed ? COLOR.bluePressed : COLOR.blue,
      };
  }
}

/** Callout/Banner のトーン。 */
export type IosCalloutTone = "info" | "warning" | "danger" | "success";

/** Callout の配色(地・文字・左アクセントバー)。 */
export interface IosCalloutColors {
  background: string;
  color: string;
  bar: string;
}

/** トーン → Callout 配色(純関数)。 */
export function iosCalloutColors(tone: IosCalloutTone): IosCalloutColors {
  switch (tone) {
    case "danger":
      return { background: COLOR.redTintBg, color: COLOR.redText, bar: COLOR.red };
    case "warning":
      return {
        background: COLOR.orangeTintBg,
        color: COLOR.orangeText,
        bar: COLOR.orange,
      };
    case "success":
      return {
        background: COLOR.greenTintBg,
        color: COLOR.greenText,
        bar: COLOR.green,
      };
    case "info":
      return {
        background: COLOR.blueTintBg,
        color: COLOR.bluePressed,
        bar: COLOR.blue,
      };
  }
}

/**
 * グループ化リスト行(ListRow)の押下背景(タップ可能行のみ)。
 * pressed=true → cardBgPressed、それ以外 → 透明(カード地を透かす)。
 */
export function iosRowBackground(pressed: boolean, tappable: boolean): string {
  if (tappable && pressed) return COLOR.cardBgPressed;
  return "transparent";
}

/** 公開トークン(名前空間はライト値。将来 colorDark を併設可能)。 */
export const IOS = {
  color: COLOR,
  gray: GRAY,
  metrics: METRICS,
  fontFamily: IOS_FONT_FAMILY,
} as const;

/**
 * 型補助: iosType の戻り値を CSSProperties へそのまま展開できることを保証する
 * (利用点で `{ ...iosType("body") }` と書ける)。実行時には何もしない。
 */
export type IosTypeAsCss = IosTypeStyle & Pick<CSSProperties, never>;
