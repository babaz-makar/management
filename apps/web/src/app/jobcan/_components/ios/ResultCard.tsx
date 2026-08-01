"use client";

import type { ReactNode } from "react";
import { IOS, iosType } from "../../_lib/tokens";

interface ResultCardProps {
  /** 大きな数値。 */
  value: ReactNode;
  /** ラベル。 */
  label: string;
  /** トーン(追加=青・削除=グレー/危険赤・注意=オレンジ)。 */
  tone: "add" | "del" | "del-hot" | "warn";
}

/** 取込の確認結果を集約する大カード(追加/削除/反映できない人の 3 枚)。 */
export function ResultCard({ value, label, tone }: ResultCardProps) {
  const valueColor =
    tone === "add"
      ? IOS.color.blue
      : tone === "del-hot"
        ? IOS.color.red
        : tone === "warn"
          ? IOS.color.orangeText
          : IOS.color.tertiaryLabel;
  return (
    <div
      style={{
        background: IOS.color.cardBg,
        borderRadius: IOS.metrics.radiusList,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        padding: "16px 14px",
        textAlign: "center",
      }}
    >
      <div style={{ ...iosType("largeTitle"), color: valueColor, fontWeight: 800, letterSpacing: "-1px" }}>
        {value}
      </div>
      <div style={{ ...iosType("caption"), color: IOS.color.secondaryLabel, fontWeight: 600, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

interface Result3Props {
  children: ReactNode;
}

/** 結果カード 3 枚のグリッド。 */
export function Result3({ children }: Result3Props) {
  return (
    <div className="jobcan-result3" style={{ margin: "14px 0" }}>
      {children}
    </div>
  );
}
