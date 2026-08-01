"use client";

import type { StaffDirectoryEntry } from "@management/shift-management";
import { IOS, iosType } from "../../_lib/tokens";
import { IosCard } from "../../_components/ios";

interface StaffTableProps {
  entries: StaffDirectoryEntry[];
  query: string;
  onQueryChange: (value: string) => void;
  onDelete: (staffCode: string) => void;
}

/** 名簿一覧(検索 + 削除操作)。テーブルの見た目のみ iOS 化(列は維持)。 */
export function StaffTable({ entries, query, onQueryChange, onDelete }: StaffTableProps) {
  const normalized = query.trim().toLowerCase();
  const filtered =
    normalized.length === 0
      ? entries
      : entries.filter(
          (entry) =>
            entry.staffCode.toLowerCase().includes(normalized) ||
            entry.email.toLowerCase().includes(normalized),
        );

  return (
    <section style={{ marginBottom: IOS.metrics.sectionGap }}>
      {/* iOS search: 角丸 10・虫眼鏡自前 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flex: 1,
            height: IOS.metrics.controlHeight,
            padding: "0 12px",
            background: IOS.gray.g6,
            borderRadius: IOS.metrics.radiusControl,
          }}
        >
          <span aria-hidden="true" style={{ color: IOS.color.secondaryLabel }}>
            &#9906;
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="staffCode / email で検索"
            aria-label="staffCode / email で検索"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: IOS.color.label,
              ...iosType("body"),
            }}
          />
        </div>
        <span style={{ color: IOS.color.secondaryLabel, ...iosType("subhead") }}>
          {filtered.length} / {entries.length} 件
        </span>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: IOS.color.secondaryLabel, ...iosType("subhead") }}>
          該当する登録がありません。
        </p>
      ) : (
        <IosCard padding={0} radius={IOS.metrics.radiusList}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={cellHead}>staffCode</th>
                <th style={cellHead}>email</th>
                <th style={cellHead}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.staffCode}>
                  <td style={cell}>{entry.staffCode}</td>
                  <td style={cell}>{entry.email}</td>
                  <td style={cell}>
                    <button
                      type="button"
                      onClick={() => onDelete(entry.staffCode)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: IOS.color.redText,
                        cursor: "pointer",
                        padding: "4px 2px",
                        ...iosType("body"),
                      }}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </IosCard>
      )}
    </section>
  );
}

// ヘッダ = gray footnote、左揃え、hairline 下線。
const cellHead: React.CSSProperties = {
  textAlign: "left",
  color: IOS.color.secondaryLabel,
  borderBottom: `0.5px solid ${IOS.color.separator}`,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 400,
  letterSpacing: "0px",
};

// 行 = hairline 区切り、行高 44pt、ゼブラなし。
const cell: React.CSSProperties = {
  borderBottom: `0.5px solid ${IOS.color.separator}`,
  padding: "0 16px",
  height: IOS.metrics.rowMinHeight,
  color: IOS.color.label,
  fontSize: 17,
};
