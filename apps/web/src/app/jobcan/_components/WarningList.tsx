"use client";

import { describeImportReason } from "@management/shift-management/ui";
import type { JobcanStaffWarning } from "@management/shift-management";
import { IOS, iosType } from "../_lib/tokens";
import { IosCallout } from "./ios";

interface WarningListProps {
  warnings: JobcanStaffWarning[];
  /** email 未登録の staffCode を名簿画面へ渡す導線を作るためのリンク生成。 */
  staffHref: (staffCode: string) => string;
}

/** 「反映できない人」(per-staff warning)の一覧。未登録者は名簿画面への導線を出す。 */
export function WarningList({ warnings, staffHref }: WarningListProps) {
  if (warnings.length === 0) return null;

  return (
    <section style={{ marginBottom: 20 }}>
      <h3
        style={{
          color: IOS.color.orangeText,
          margin: "0 0 8px",
          padding: "0 4px",
          ...iosType("headline"),
        }}
      >
        反映できない人({warnings.length}件)
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {warnings.map((warning, index) => (
          <IosCallout
            key={`${warning.staffCode}-${warning.sourceMonth}-${index}`}
            tone="warning"
          >
            <div>
              <strong>{warning.staffCode}</strong>
              <span style={{ color: IOS.color.secondaryLabel, marginLeft: ".5rem" }}>
                {warning.email ?? "(email 未登録)"}
              </span>
              <span style={{ color: IOS.color.secondaryLabel, marginLeft: ".5rem" }}>
                対象月 {warning.sourceMonth}
              </span>
            </div>
            <div style={{ marginTop: 2 }}>{describeImportReason(warning.reason)}</div>
            {warning.reason === "email_not_registered" && (
              <div style={{ marginTop: 4 }}>
                <a
                  href={staffHref(warning.staffCode)}
                  style={{ color: IOS.color.blue, textDecoration: "none" }}
                >
                  → スタッフ名簿でこの staffCode を登録する
                </a>
              </div>
            )}
          </IosCallout>
        ))}
      </div>
    </section>
  );
}
