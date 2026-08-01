"use client";

import type { ReactNode } from "react";
import { IOS, iosType } from "../../_lib/tokens";

interface IosEmptyProps {
  /** 見出し(title3)。 */
  title: string;
  /** 補足説明(footnote グレー)。 */
  description?: string;
  /** 小アイコン(グレー・自前グリフ可)。 */
  icon?: ReactNode;
  /** 任意のアクション(tinted ボタン等)。 */
  action?: ReactNode;
}

/** 空状態: 中央寄せの小アイコン + 見出し + 説明 + 任意アクション。 */
export function IosEmpty({ title, description, icon, action }: IosEmptyProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "40px 16px",
        gap: 8,
      }}
    >
      {icon && (
        <div style={{ color: IOS.color.tertiaryLabel, fontSize: 40, lineHeight: 1 }}>
          {icon}
        </div>
      )}
      <div style={{ color: IOS.color.label, ...iosType("title3") }}>{title}</div>
      {description && (
        <div
          style={{
            color: IOS.color.secondaryLabel,
            maxWidth: 320,
            ...iosType("footnote"),
          }}
        >
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
