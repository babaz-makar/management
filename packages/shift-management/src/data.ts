import type { ShiftType, StaffMember } from "./types";

/** 初期シフト区分。運用に合わせて編集・追加してください */
export const DEFAULT_SHIFT_TYPES: ShiftType[] = [
  {
    id: "early",
    label: "早番",
    shortLabel: "早",
    color: "#dbeafe",
    textColor: "#1d4ed8",
    startTime: "07:00",
    endTime: "16:00",
  },
  {
    id: "day",
    label: "日勤",
    shortLabel: "日",
    color: "#dcfce7",
    textColor: "#15803d",
    startTime: "09:00",
    endTime: "18:00",
  },
  {
    id: "late",
    label: "遅番",
    shortLabel: "遅",
    color: "#fef3c7",
    textColor: "#b45309",
    startTime: "13:00",
    endTime: "22:00",
  },
  {
    id: "off",
    label: "休み",
    shortLabel: "休",
    color: "#f3f4f6",
    textColor: "#9ca3af",
  },
];

/** 動作確認用のサンプルスタッフ */
export const SAMPLE_STAFF: StaffMember[] = [
  { id: "staff-1", name: "佐藤", role: "ホール" },
  { id: "staff-2", name: "鈴木", role: "キッチン" },
  { id: "staff-3", name: "田中", role: "ホール" },
];
