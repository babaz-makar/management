"use client";

import { describeImportReason } from "@management/shift-management/ui";
import type { JobcanStaffWarning } from "@management/shift-management";
import { COLORS } from "../_lib/tokens";

interface WarningListProps {
  warnings: JobcanStaffWarning[];
  /** email 未登録の staffCode を名簿画面へ渡す導線を作るためのリンク生成。 */
  staffHref: (staffCode: string) => string;
}

/** 「反映できない人」(per-staff warning)の一覧。未登録者は名簿画面への導線を出す。 */
export function WarningList({ warnings, staffHref }: WarningListProps) {
  if (warnings.length === 0) return null;

  return (
    <section style={{ marginBottom: "1.25rem" }}>
      <h3 style={{ color: COLORS.warning, marginBottom: ".5rem" }}>
        反映できない人({warnings.length}件)
      </h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {warnings.map((warning, index) => (
          <li
            key={`${warning.staffCode}-${warning.sourceMonth}-${index}`}
            style={{
              padding: ".5rem .8rem",
              border: `1px solid ${COLORS.warningBorder}`,
              background: COLORS.warningBg,
              borderRadius: 4,
              marginBottom: ".3rem",
            }}
          >
            <div>
              <strong>{warning.staffCode}</strong>
              <span style={{ color: COLORS.muted, marginLeft: ".5rem" }}>
                {warning.email ?? "(email 未登録)"}
              </span>
              <span style={{ color: COLORS.muted, marginLeft: ".5rem" }}>
                対象月 {warning.sourceMonth}
              </span>
            </div>
            <div style={{ color: COLORS.warning }}>
              {describeImportReason(warning.reason)}
            </div>
            {warning.reason === "email_not_registered" && (
              <div style={{ marginTop: ".25rem" }}>
                <a href={staffHref(warning.staffCode)}>
                  → スタッフ名簿でこの staffCode を登録する
                </a>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
