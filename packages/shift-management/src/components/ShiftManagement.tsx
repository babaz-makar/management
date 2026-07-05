"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useShiftStore } from "../hooks/useShiftStore";
import { addDays, formatWeekRange, getWeekDates } from "../lib/date";
import { ShiftGrid } from "./ShiftGrid";
import type { SelectedCell } from "./ShiftGrid";
import { assignmentKey } from "../types";

export type ShiftManagementProps = {
  title?: string;
  /** localStorage の保存キー。複数店舗などで分けたいときに指定する */
  storageKey?: string;
};

const buttonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#fff",
  padding: ".35rem .8rem",
  cursor: "pointer",
  fontSize: ".85rem",
};

/**
 * シフト管理ツールのルートコンポーネント。
 * 週単位のシフト表・スタッフ管理・シフト割り当てをこの1つで提供する。
 */
export function ShiftManagement({
  title = "シフト管理",
  storageKey,
}: ShiftManagementProps) {
  const { state, assign, addStaff, removeStaff, reset } = useShiftStore(storageKey);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");

  const weekDates = useMemo(
    () => getWeekDates(addDays(new Date(), weekOffset * 7)),
    [weekOffset],
  );

  const selectedStaff = selectedCell
    ? state.staff.find((s) => s.id === selectedCell.staffId)
    : undefined;
  const selectedShiftId = selectedCell
    ? state.assignments[assignmentKey(selectedCell.staffId, selectedCell.dateKey)]
    : undefined;

  const handleAddStaff = (e: FormEvent) => {
    e.preventDefault();
    addStaff(newName, newRole);
    setNewName("");
    setNewRole("");
  };

  return (
    <section
      style={{
        border: "1px solid #e2e2e2",
        borderRadius: 12,
        padding: "1.25rem 1.5rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* ヘッダー: タイトルと週送り */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: ".5rem",
          marginBottom: ".75rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{title}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
          <button type="button" style={buttonStyle} onClick={() => setWeekOffset((w) => w - 1)}>
            ← 前週
          </button>
          <button type="button" style={buttonStyle} onClick={() => setWeekOffset(0)}>
            今週
          </button>
          <button type="button" style={buttonStyle} onClick={() => setWeekOffset((w) => w + 1)}>
            次週 →
          </button>
        </div>
      </div>

      <p style={{ margin: "0 0 .75rem", color: "#6b7280", fontSize: ".85rem" }}>
        {formatWeekRange(weekDates)}
        ／ セルをクリックして下のボタンでシフトを割り当てます
      </p>

      <ShiftGrid
        weekDates={weekDates}
        staff={state.staff}
        shiftTypes={state.shiftTypes}
        assignments={state.assignments}
        selectedCell={selectedCell}
        onSelectCell={(cell) =>
          setSelectedCell((prev) =>
            prev?.staffId === cell.staffId && prev?.dateKey === cell.dateKey ? null : cell,
          )
        }
        onRemoveStaff={(staffId) => {
          removeStaff(staffId);
          setSelectedCell((prev) => (prev?.staffId === staffId ? null : prev));
        }}
      />

      {/* シフト割り当てパネル */}
      <div
        style={{
          marginTop: ".75rem",
          padding: ".6rem .75rem",
          borderRadius: 8,
          background: "#f9fafb",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: ".4rem",
          minHeight: "2.4rem",
        }}
      >
        {selectedCell && selectedStaff ? (
          <>
            <span style={{ fontSize: ".85rem", color: "#374151", marginRight: ".4rem" }}>
              {selectedStaff.name}／{selectedCell.dateKey.slice(5).replace("-", "/")}：
            </span>
            {state.shiftTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => assign(selectedCell.staffId, selectedCell.dateKey, t.id)}
                style={{
                  ...buttonStyle,
                  background: t.color,
                  color: t.textColor,
                  fontWeight: selectedShiftId === t.id ? 700 : 400,
                  borderColor: selectedShiftId === t.id ? t.textColor : "#d1d5db",
                }}
              >
                {t.label}
                {t.startTime && (
                  <span style={{ fontSize: ".72rem", marginLeft: ".25rem" }}>
                    {t.startTime}-{t.endTime}
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              style={buttonStyle}
              onClick={() => assign(selectedCell.staffId, selectedCell.dateKey, null)}
            >
              クリア
            </button>
          </>
        ) : (
          <span style={{ fontSize: ".85rem", color: "#9ca3af" }}>
            セルを選択するとここにシフトの割り当てボタンが表示されます
          </span>
        )}
      </div>

      {/* スタッフ追加とリセット */}
      <form
        onSubmit={handleAddStaff}
        style={{
          marginTop: ".75rem",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: ".4rem",
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="スタッフ名"
          style={{
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: ".35rem .6rem",
            fontSize: ".85rem",
            width: 140,
          }}
        />
        <input
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          placeholder="役割（任意）"
          style={{
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: ".35rem .6rem",
            fontSize: ".85rem",
            width: 120,
          }}
        />
        <button type="submit" style={buttonStyle} disabled={!newName.trim()}>
          ＋ スタッフ追加
        </button>
        <button
          type="button"
          style={{ ...buttonStyle, marginLeft: "auto", color: "#9ca3af" }}
          onClick={() => {
            if (window.confirm("シフト表を初期状態に戻しますか？")) reset();
          }}
        >
          リセット
        </button>
      </form>
    </section>
  );
}
