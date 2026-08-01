"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  IOS,
  iosButtonColors,
  iosType,
  type IosButtonVariant,
} from "../../_lib/tokens";

interface IosButtonProps {
  children: ReactNode;
  variant?: IosButtonVariant;
  disabled?: boolean;
  /** 全幅で表示するか(主導線は全幅)。 */
  fullWidth?: boolean;
  /** 主要ボタン(高さ 50)か補助(高さ 44)か。plain は高さを詰める。 */
  size?: "primary" | "regular";
  onClick?: () => void;
  /** 渡すとリンク(<a>)として描画する。CTA の href をそのまま保つ用途。 */
  href?: string;
  ariaLabel?: string;
  style?: CSSProperties;
}

/**
 * iOS 風ボタン(filled / tinted / plain / destructive)。
 * 色の割り当て(variant × state)は純関数 iosButtonColors に委譲(値は packages 側でテスト済み)。
 * 状態(押下/disabled)はここで state 文字列に落として色を引く薄い層。
 */
export function IosButton({
  children,
  variant = "filled",
  disabled = false,
  fullWidth = false,
  size = "regular",
  onClick,
  href,
  ariaLabel,
  style,
}: IosButtonProps) {
  const [pressed, setPressed] = useState(false);
  const state = disabled ? "disabled" : pressed ? "pressed" : "default";
  const colors = iosButtonColors(variant, state);
  const isPlain = variant === "plain";
  const height = isPlain
    ? undefined
    : size === "primary"
      ? IOS.metrics.buttonPrimaryHeight
      : IOS.metrics.controlHeight;

  const visualStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    gap: 6,
    width: fullWidth ? "100%" : undefined,
    height,
    padding: isPlain ? "6px 4px" : "0 18px",
    background: colors.background,
    color: colors.color,
    border: "none",
    borderRadius: isPlain ? 0 : IOS.metrics.radiusCard,
    cursor: disabled ? "not-allowed" : "pointer",
    textDecoration: "none",
    WebkitTapHighlightColor: "transparent",
    transition: "background-color 120ms ease, opacity 120ms ease",
    ...iosType("headline"),
    ...style,
  };

  const pressHandlers = {
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
  };

  // href を渡された時はリンク(<a>)として描画し、本来の href を保つ。
  if (href && !disabled) {
    return (
      <a href={href} aria-label={ariaLabel} {...pressHandlers} style={visualStyle}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      {...pressHandlers}
      style={visualStyle}
    >
      {children}
    </button>
  );
}
