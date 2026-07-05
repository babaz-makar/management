"use client";

import type { CSSProperties } from "react";
import type { Assignments, ShiftType, StaffMember } from "../types";
import { assignmentKey } from "../types";
import {
  WEEKDAY_LABELS,
  formatMonthDay,
  isSameDay,
  isWeekend,
  toDateKey,
} from "../lib/date";

export type SelectedCell = {
  staffId: string;
  dateKey: string;
};

export type ShiftGridProps = {
  weekDates: Date[];
  staff: StaffMember[];
  shiftTypes: ShiftType[];
  assignments: Assignments;
  selectedCell: SelectedCell | null;
  onSelectCell: (cell: SelectedCell) => void;
  onRemoveStaff: (staffId: string) => void;
};

const cellBase: CSSProperties = {
  border: "1px solid #e5e7eb",
  padding: ".4rem .3rem",
  textAlign: "center",
  minWidth: 52,
};

/** スタッフ×曜日のシフト表グリッド */
export function ShiftGrid({
  weekDates,
  staff,
  shiftTypes,
  assignments,
  selectedCell,
  onSelectCell,
  onRemoveStaff,
}: ShiftGridProps) {
  const today = new Date();
  const shiftById = new Map(shiftTypes.map((t) => [t.id, t]));

  // 日ごとの出勤人数（時間を持つシフトが割り当てられている人数）
  const workingCount = (dateKey: string) =>
    staff.filter((s) => {
      const t = shiftById.get(assignments[assignmentKey(s.id, dateKey)] ?? "");
      return t?.startTime != null;
    }).length;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: ".9rem" }}>
        <thead>
          <tr>
            <th style={{ ...cellBase, background: "#f9fafb", minWidth: 120, textAlign: "left" }}>
              スタッフ
            </th>
            {weekDates.map((date, i) => (
              <th
                key={toDateKey(date)}
                style={{
                  ...cellBase,
                  background: isSameDay(date, today)
                    ? "#eef2ff"
                    : isWeekend(date)
                      ? "#fef2f2"
                      : "#f9fafb",
                  fontWeight: 600,
                }}
              >
                <div>{WEEKDAY_LABELS[i]}</div>
                <div style={{ fontSize: ".75rem", color: "#6b7280", fontWeight: 400 }}>
                  {formatMonthDay(date)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => (
            <tr key={member.id}>
              <th style={{ ...cellBase, textAlign: "left", background: "#fff", fontWeight: 500 }}>
                <span>{member.name}</span>
                {member.role && (
                  <span style={{ marginLeft: ".4rem", fontSize: ".72rem", color: "#9ca3af" }}>
                    {member.role}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveStaff(member.id)}
                  title={`${member.name} を削除`}
                  style={{
                    float: "right",
                    border: "none",
                    background: "transparent",
                    color: "#d1d5db",
                    cursor: "pointer",
                    fontSize: ".8rem",
                    padding: "0 .2rem",
                  }}
                >
                  ✕
                </button>
              </th>
              {weekDates.map((date) => {
                const dateKey = toDateKey(date);
                const shift = shiftById.get(
                  assignments[assignmentKey(member.id, dateKey)] ?? "",
                );
                const isSelected =
                  selectedCell?.staffId === member.id && selectedCell?.dateKey === dateKey;
                return (
                  <td
                    key={dateKey}
                    onClick={() => onSelectCell({ staffId: member.id, dateKey })}
                    style={{
                      ...cellBase,
                      cursor: "pointer",
                      background: shift ? shift.color : "#fff",
                      color: shift ? shift.textColor : "#d1d5db",
                      fontWeight: 600,
                      outline: isSelected ? "2px solid #4f46e5" : "none",
                      outlineOffset: -2,
                    }}
                  >
                    {shift ? shift.shortLabel : "−"}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <th style={{ ...cellBase, textAlign: "left", background: "#f9fafb", fontSize: ".78rem", color: "#6b7280" }}>
              出勤人数
            </th>
            {weekDates.map((date) => {
              const dateKey = toDateKey(date);
              return (
                <td
                  key={dateKey}
                  style={{ ...cellBase, background: "#f9fafb", fontSize: ".82rem", color: "#374151" }}
                >
                  {workingCount(dateKey)}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
