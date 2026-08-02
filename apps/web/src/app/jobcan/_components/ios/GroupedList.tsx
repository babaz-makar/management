"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { IOS, iosRowBackground, iosType } from "../../_lib/tokens";

interface GroupedListProps {
  children: ReactNode;
  style?: CSSProperties;
}

/** 白カード内に行を積むグループ化リスト(角丸 10・枠線なし)。 */
export function GroupedList({ children, style }: GroupedListProps) {
  return (
    <div
      style={{
        background: IOS.color.cardBg,
        borderRadius: IOS.metrics.radiusList,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface ListRowProps {
  /** 左・主タイトル(headline)。 */
  title: ReactNode;
  /** 左・副題(subhead グレー)。 */
  subtitle?: ReactNode;
  /** 右・詳細テキスト(グレー)。 */
  detail?: ReactNode;
  /** タップ導線(href)。渡すと chevron 付きの押下可能行に。 */
  href?: string;
  /** クリックハンドラ(href の代わり)。 */
  onClick?: () => void;
  /** 最終行(hairline を出さない)。 */
  last?: boolean;
}

/**
 * グループ化リストの 1 行。左 16px インセットの hairline 区切り、行高 44。
 * href / onClick があるタップ可能行は右に chevron を出し、押下で cardBgPressed。
 */
export function ListRow({
  title,
  subtitle,
  detail,
  href,
  onClick,
  last = false,
}: ListRowProps) {
  const [pressed, setPressed] = useState(false);
  const tappable = Boolean(href || onClick);
  const background = iosRowBackground(pressed, tappable);

  const inner = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: IOS.metrics.rowMinHeight,
        padding: `${IOS.metrics.rowPadY}px ${IOS.metrics.rowPadX}px`,
        background,
        transition: "background-color 80ms ease",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: IOS.color.label, ...iosType("headline") }}>{title}</div>
        {subtitle && (
          <div
            style={{
              color: IOS.color.secondaryLabel,
              marginTop: 2,
              ...iosType("subhead"),
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {detail && (
        <div style={{ color: IOS.color.secondaryLabel, ...iosType("subhead") }}>
          {detail}
        </div>
      )}
      {tappable && (
        <span
          aria-hidden="true"
          style={{ color: IOS.color.tertiaryLabel, fontSize: 18, lineHeight: 1 }}
        >
          &#8250;
        </span>
      )}
    </div>
  );

  const pressHandlers = tappable
    ? {
        onPointerDown: () => setPressed(true),
        onPointerUp: () => setPressed(false),
        onPointerLeave: () => setPressed(false),
      }
    : {};

  // 左 16px インセットの hairline 区切り(最終行は出さない)。iOS 標準の見た目。
  const separator = !last ? (
    <div
      aria-hidden="true"
      style={{
        height: "0.5px",
        background: IOS.color.separator,
        marginLeft: IOS.metrics.separatorInset,
      }}
    />
  ) : null;

  if (href) {
    return (
      <div>
        <a
          href={href}
          {...pressHandlers}
          style={{ textDecoration: "none", color: "inherit", display: "block" }}
        >
          {inner}
        </a>
        {separator}
      </div>
    );
  }
  if (onClick) {
    return (
      <div>
        <button
          type="button"
          onClick={onClick}
          {...pressHandlers}
          style={{
            display: "block",
            width: "100%",
            border: "none",
            background: "transparent",
            padding: 0,
            textAlign: "left",
            cursor: "pointer",
            font: "inherit",
            color: "inherit",
          }}
        >
          {inner}
        </button>
        {separator}
      </div>
    );
  }
  return (
    <div>
      {inner}
      {separator}
    </div>
  );
}
