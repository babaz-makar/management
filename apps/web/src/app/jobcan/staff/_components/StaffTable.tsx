"use client";

import type { StaffDirectoryEntry } from "@management/shift-management";
import { COLORS } from "../../_lib/tokens";

interface StaffTableProps {
  entries: StaffDirectoryEntry[];
  query: string;
  onQueryChange: (value: string) => void;
  onDelete: (staffCode: string) => void;
}

/** 名簿一覧(検索 + 削除操作)。 */
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
    <section style={{ marginBottom: "1.5rem" }}>
      <div style={{ marginBottom: ".6rem" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="staffCode / email で検索"
          style={{ padding: ".35rem .5rem", width: 280 }}
        />
        <span style={{ color: COLORS.muted, marginLeft: ".75rem" }}>
          {filtered.length} / {entries.length} 件
        </span>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: COLORS.muted }}>該当する登録がありません。</p>
      ) : (
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
                    style={{ color: COLORS.danger }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const cellHead: React.CSSProperties = {
  textAlign: "left",
  borderBottom: `2px solid ${COLORS.border}`,
  padding: ".4rem .6rem",
};

const cell: React.CSSProperties = {
  borderBottom: `1px solid ${COLORS.border}`,
  padding: ".4rem .6rem",
};
