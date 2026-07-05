"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SHIFT_TYPES, SAMPLE_STAFF } from "../data";
import type { ScheduleState, StaffMember } from "../types";
import { assignmentKey } from "../types";

const DEFAULT_STORAGE_KEY = "shift-management/schedule";

function createInitialState(): ScheduleState {
  return {
    staff: SAMPLE_STAFF,
    shiftTypes: DEFAULT_SHIFT_TYPES,
    assignments: {},
  };
}

/**
 * シフト表の状態管理フック。
 * localStorage に自動保存する（SSR ではデフォルト状態を返し、マウント後に復元する）。
 */
export function useShiftStore(storageKey: string = DEFAULT_STORAGE_KEY) {
  const [state, setState] = useState<ScheduleState>(createInitialState);
  const hydrated = useRef(false);

  // マウント後に localStorage から復元（SSR とのハイドレーション不一致を避ける）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as ScheduleState;
        if (saved && Array.isArray(saved.staff)) {
          setState(saved);
        }
      }
    } catch {
      // 壊れたデータは無視してデフォルトのまま使う
    }
    hydrated.current = true;
  }, [storageKey]);

  // 復元完了後の変更だけを保存する
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // ストレージが使えない環境ではメモリ上でのみ動作する
    }
  }, [state, storageKey]);

  /** セルにシフトを割り当てる。shiftTypeId が null なら未割り当てに戻す */
  const assign = useCallback(
    (staffId: string, dateKey: string, shiftTypeId: string | null) => {
      setState((prev) => {
        const key = assignmentKey(staffId, dateKey);
        const assignments = { ...prev.assignments };
        if (shiftTypeId === null) {
          delete assignments[key];
        } else {
          assignments[key] = shiftTypeId;
        }
        return { ...prev, assignments };
      });
    },
    [],
  );

  const addStaff = useCallback((name: string, role?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const member: StaffMember = {
      id: `staff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      role: role?.trim() || undefined,
    };
    setState((prev) => ({ ...prev, staff: [...prev.staff, member] }));
  }, []);

  const removeStaff = useCallback((staffId: string) => {
    setState((prev) => {
      const assignments = Object.fromEntries(
        Object.entries(prev.assignments).filter(
          ([key]) => !key.startsWith(`${staffId}:`),
        ),
      );
      return {
        ...prev,
        staff: prev.staff.filter((s) => s.id !== staffId),
        assignments,
      };
    });
  }, []);

  /** すべて初期状態に戻す */
  const reset = useCallback(() => {
    setState(createInitialState());
  }, []);

  return { state, assign, addStaff, removeStaff, reset };
}
