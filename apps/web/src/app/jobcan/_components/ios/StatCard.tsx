"use client";

import type { ReactNode } from "react";
import { IOS, iosType } from "../../_lib/tokens";

interface StatCardProps {
  /** 見出し(小さいラベル)。 */
  label: string;
  /** 主役の数値/文字(大きく表示)。 */
  value: ReactNode;
  /** 値の後ろの単位(件・人など)。 */
  unit?: string;
  /** トーン(良好=緑・注意=オレンジ・既定=黒)。 */
  tone?: "default" | "good" | "warn";
}

/** bento の数値カード 1 枚。ホームのサマリで横並びにする。 */
export function StatCard({ label, value, unit, tone = "default" }: StatCardProps) {
  const valueColor =
    tone === "good"
      ? IOS.color.greenText
      : tone === "warn"
        ? IOS.color.orangeText
        : IOS.color.label;
  return (
    <div
      style={{
        background: IOS.color.cardBg,
        borderRadius: IOS.metrics.radiusList,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        padding: "13px 12px",
      }}
    >
      <div style={{ ...iosType("caption"), color: IOS.color.secondaryLabel, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ ...iosType("title2"), marginTop: 3, color: valueColor, fontWeight: 800, letterSpacing: "-0.5px" }}>
        {value}
        {unit && (
          <span
            style={{
              ...iosType("caption"),
              marginLeft: 2,
              color: IOS.color.secondaryLabel,
              fontWeight: 600,
              letterSpacing: 0,
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

interface BentoProps {
  children: ReactNode;
}

/** 数値カードの横並びグリッド(既定 4 列、狭幅で 2 列に折り返す=CSS 制御)。 */
export function Bento({ children }: BentoProps) {
  return (
    <div className="jobcan-bento" style={{ marginTop: 14 }}>
      {children}
    </div>
  );
}
