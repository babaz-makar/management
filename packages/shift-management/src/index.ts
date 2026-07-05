// 公開API (バレル)。本アプリからはこの index.ts 経由でのみ import されます。
export { ShiftManagement } from "./components/ShiftManagement";
export type { ShiftManagementProps } from "./components/ShiftManagement";
export { ShiftGrid } from "./components/ShiftGrid";
export type { ShiftGridProps, SelectedCell } from "./components/ShiftGrid";
export { useShiftStore } from "./hooks/useShiftStore";
export { DEFAULT_SHIFT_TYPES, SAMPLE_STAFF } from "./data";
export type {
  Assignments,
  ScheduleState,
  ShiftType,
  StaffMember,
} from "./types";
export { assignmentKey } from "./types";
