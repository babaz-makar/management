"use client";

import type { ReactNode } from "react";
import { IOS, iosType } from "../../_lib/tokens";

interface ScreenProps {
  children: ReactNode;
}

/**
 * iOS グループ化画面の床(groupedBg)+ 1 カラム最大幅の外枠。
 * 既存 PAGE_STYLE(maxWidth 960 / system-ui)の置き換え。見た目のみ。
 */
export function Screen({ children }: ScreenProps) {
  return (
    <main
      style={{
        fontFamily: IOS.fontFamily,
        background: IOS.color.groupedBg,
        color: IOS.color.label,
        minHeight: "100vh",
        boxSizing: "border-box",
        maxWidth: IOS.metrics.maxWidth,
        margin: "0 auto",
        padding: `28px ${IOS.metrics.screenPadX}px 64px`,
        ...iosType("body"),
      }}
    >
      {children}
    </main>
  );
}

interface PageHeaderProps {
  /** largeTitle。文言は各画面が渡す(変更しない)。 */
  title: string;
  /** タイトル直下の footnote 説明スロット(既存の説明文+リンクをそのまま入れる)。 */
  description?: ReactNode;
  /** 左上の戻り導線スロット(任意)。 */
  back?: ReactNode;
}

/**
 * ナビゲーションバー相当のヘッダ。largeTitle + 直下 footnote 説明。
 * description には既存の説明文と inline リンク(href/label 不変)をそのまま入れる。
 */
export function PageHeader({ title, description, back }: PageHeaderProps) {
  return (
    <header style={{ marginBottom: 24 }}>
      {back && <div style={{ marginBottom: 8 }}>{back}</div>}
      <h1
        style={{
          margin: 0,
          color: IOS.color.label,
          ...iosType("largeTitle"),
        }}
      >
        {title}
      </h1>
      {description && (
        <div
          style={{
            marginTop: 6,
            color: IOS.color.secondaryLabel,
            ...iosType("footnote"),
          }}
        >
          {description}
        </div>
      )}
    </header>
  );
}

interface BackLinkProps {
  href: string;
  children: ReactNode;
}

/** iOS 風の戻り導線(‹ + 青文字)。chevron は自前(SVG 追加なし)。 */
export function BackLink({ href, children }: BackLinkProps) {
  return (
    <a
      href={href}
      style={{
        color: IOS.color.blue,
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        ...iosType("body"),
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>
        &#8249;
      </span>
      {children}
    </a>
  );
}
