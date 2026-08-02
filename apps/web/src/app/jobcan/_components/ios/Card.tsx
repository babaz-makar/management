"use client";

import type { CSSProperties, ReactNode } from "react";
import { IOS, iosType } from "../../_lib/tokens";

interface IosCardProps {
  children: ReactNode;
  /** 危険トーン(error 等)なら淡赤地に。 */
  tone?: "default" | "danger" | "success";
  /** カード角丸(独立=12 / 大型ヒーロー=16)。 */
  radius?: number;
  padding?: number;
  style?: CSSProperties;
}

/** 白角丸カード。枠線なしで床との明度差で浮かせる。 */
export function IosCard({
  children,
  tone = "default",
  radius = IOS.metrics.radiusCard,
  padding = 16,
  style,
}: IosCardProps) {
  const background =
    tone === "danger"
      ? IOS.color.redTintBg
      : tone === "success"
        ? IOS.color.greenTintBg
        : IOS.color.cardBg;
  return (
    <div
      style={{
        background,
        borderRadius: radius,
        padding,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface IosSectionProps {
  children: ReactNode;
  /** セクション上部ヘッダ(footnote グレー)。 */
  header?: ReactNode;
  /** セクション下部フッタ(footnote グレー)。 */
  footer?: ReactNode;
  style?: CSSProperties;
}

/**
 * セクション枠(上下に footnote グレーのヘッダ/フッタ)。
 * iOS の GroupedList のセクション見出し・脚注に相当。
 */
export function IosSection({ children, header, footer, style }: IosSectionProps) {
  return (
    <section style={{ marginBottom: IOS.metrics.sectionGap, ...style }}>
      {header && (
        <div
          style={{
            padding: "0 16px 6px",
            color: IOS.color.secondaryLabel,
            textTransform: "uppercase",
            ...iosType("footnote"),
          }}
        >
          {header}
        </div>
      )}
      {children}
      {footer && (
        <div
          style={{
            padding: "6px 16px 0",
            color: IOS.color.secondaryLabel,
            ...iosType("footnote"),
          }}
        >
          {footer}
        </div>
      )}
    </section>
  );
}
