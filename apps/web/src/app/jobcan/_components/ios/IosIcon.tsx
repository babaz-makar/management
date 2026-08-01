"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * iOS/SF Symbols 風の線画アイコン(JSX 直描画)。
 *
 * モックのアイコン語彙を本番へ移植。`dangerouslySetInnerHTML` は使わず JSX の
 * <svg><path/></svg> で描く(XSS 面ゼロ)。単色 stroke ベースで currentColor に乗るため、
 * 置き場所の文字色(青/グレー/赤/緑)へ自然に馴染む。シンプルな幾何形状で自前描画。
 */
export type IosIconName =
  | "home"
  | "import"
  | "staff"
  | "file"
  | "tray"
  | "search"
  | "plus"
  | "check"
  | "check-circle"
  | "info"
  | "alert"
  | "trash"
  | "arrow"
  | "chevron";

/** 各アイコンの中身(path 群)。viewBox 0 0 24 24 前提。 */
const PATHS: Record<IosIconName, ReactNode> = {
  home: (
    <>
      <path d="M3.5 11.5 12 4l8.5 7.5" />
      <path d="M5.5 10v9.5H10v-5.5h4v5.5h4.5V10" />
    </>
  ),
  import: (
    <>
      <path d="M12 3.5v9" />
      <path d="M8.5 9 12 12.5 15.5 9" />
      <path d="M4.5 15v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </>
  ),
  staff: (
    <>
      <circle cx="9" cy="8" r="3.1" />
      <path d="M3.6 19c0-3 2.5-4.6 5.4-4.6S14.4 16 14.4 19" />
      <path d="M15.8 5.4a3 3 0 0 1 0 5.4" />
      <path d="M17.4 14.7c1.9.6 3.1 2 3.1 4.3" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.6h6l4 4V20a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 7 20z" />
      <path d="M13 3.6V8h4" />
    </>
  ),
  tray: (
    <>
      <path d="M4 13.5 6 5.6A1.5 1.5 0 0 1 7.5 4.4h9A1.5 1.5 0 0 1 18 5.6l2 7.9" />
      <path d="M4 13.5h4l1.4 2.4h5.2L20 13.5v4.4A1.6 1.6 0 0 1 18.4 19.5H5.6A1.6 1.6 0 0 1 4 17.9z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  check: <path d="m5 12.5 4.2 4L19 6.5" />,
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m8.4 12 2.5 2.5 4.7-5.2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 21 19H3z" />
      <path d="M12 10v4" />
      <path d="M12 16.6h.01" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9 7V5.6A1.5 1.5 0 0 1 10.5 4.1h3A1.5 1.5 0 0 1 15 5.6V7" />
      <path d="M6.6 7 7.5 19a1.6 1.6 0 0 0 1.6 1.5h5.8a1.6 1.6 0 0 0 1.6-1.5L17.4 7" />
    </>
  ),
  arrow: (
    <>
      <path d="M4.5 12h14" />
      <path d="m13 6.5 5.5 5.5-5.5 5.5" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
};

interface IosIconProps {
  name: IosIconName;
  /** px サイズ(既定 20)。 */
  size?: number;
  /** stroke 太さ(既定 1.8)。 */
  strokeWidth?: number;
  /** 追加 style(色は親の currentColor を継承)。 */
  style?: CSSProperties;
  /** aria-hidden を外したい場合のラベル(基本は装飾=hidden)。 */
  title?: string;
}

/** 線画アイコン本体。色は currentColor 継承(置き場所の文字色に乗る)。 */
export function IosIcon({
  name,
  size = 20,
  strokeWidth = 1.8,
  style,
  title,
}: IosIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ display: "block", flex: "none", ...style }}
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
