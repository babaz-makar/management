"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  IOS,
  iosCalloutColors,
  iosType,
  type IosCalloutTone,
} from "../../_lib/tokens";

interface IosCalloutProps {
  tone: IosCalloutTone;
  children: ReactNode;
  /** 見出し(任意・headline 太字)。 */
  title?: ReactNode;
  style?: CSSProperties;
}

/**
 * 淡色地の帯(warning/danger/success/info)。左に色バー。
 * 配色は純関数 iosCalloutColors に委譲(トーン別の値は packages 側でテスト済み)。
 */
export function IosCallout({ tone, children, title, style }: IosCalloutProps) {
  const colors = iosCalloutColors(tone);
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        background: colors.background,
        borderRadius: IOS.metrics.radiusList,
        color: colors.color,
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: "0 0 3px",
          alignSelf: "stretch",
          background: colors.bar,
          borderRadius: 2,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{ ...iosType("headline"), marginBottom: 4 }}>{title}</div>
        )}
        <div style={iosType("callout")}>{children}</div>
      </div>
    </div>
  );
}
