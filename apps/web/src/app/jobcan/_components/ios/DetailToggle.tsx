"use client";

import type { ReactNode } from "react";
import { IOS, iosType } from "../../_lib/tokens";
import { IosIcon } from "./IosIcon";

interface DetailToggleProps {
  /** サマリ(閉じている時に見えるラベル)。 */
  summary: ReactNode;
  children: ReactNode;
  /** 既定で開くか。 */
  defaultOpen?: boolean;
  /** 危険トーン(赤文字のサマリ)。 */
  danger?: boolean;
}

/**
 * 折りたたみ(details/summary)。削除明細・エラー明細・集計値の退避に共通利用。
 * chevron(›)が開閉で回転。中身は具体データ(明細行や集計)を入れる。
 */
export function DetailToggle({
  summary,
  children,
  defaultOpen = false,
  danger = false,
}: DetailToggleProps) {
  return (
    <details open={defaultOpen} className="jobcan-detail">
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
          ...iosType("footnote"),
          padding: "8px 2px",
          fontWeight: 600,
          color: danger ? IOS.color.redText : IOS.color.blue,
        }}
      >
        <span className="jobcan-caret" style={{ color: IOS.color.tertiaryLabel, display: "flex" }}>
          <IosIcon name="chevron" size={14} />
        </span>
        {summary}
      </summary>
      <div style={{ marginTop: 8 }}>{children}</div>
    </details>
  );
}

interface DetailRowProps {
  /** 左のアイコン色トーン。 */
  tone: "danger" | "warn";
  /** 主タイトル。 */
  title: ReactNode;
  /** 補足(グレー)。 */
  meta?: ReactNode;
  /** アイコン名(既定は tone に応じて alert/trash)。 */
  icon?: "alert" | "trash";
  /** 最終行(下線を出さない)。 */
  last?: boolean;
}

/** 明細 1 行(アイコン + タイトル + メタ)。 */
export function DetailRow({ tone, title, meta, icon, last }: DetailRowProps) {
  const iconName = icon ?? (tone === "danger" ? "trash" : "alert");
  const iconColor = tone === "danger" ? IOS.color.red : IOS.color.orange;
  return (
    <div
      style={{
        display: "flex",
        gap: 11,
        alignItems: "flex-start",
        padding: "10px 4px",
        borderBottom: last ? "none" : `0.5px solid ${IOS.color.separator}`,
      }}
    >
      <span style={{ color: iconColor, marginTop: 1, display: "flex" }}>
        <IosIcon name={iconName} size={17} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...iosType("subhead"), fontWeight: 600 }}>{title}</div>
        {meta && (
          <div style={{ color: IOS.color.secondaryLabel, marginTop: 2, ...iosType("caption") }}>
            {meta}
          </div>
        )}
      </div>
    </div>
  );
}
