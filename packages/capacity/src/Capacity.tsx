"use client";

// キャパ管理ツールの入口コンポーネント。
// 元の単一HTML版（UnitG キャパ管理ツール ver3）を React パッケージへ移植したもの。
// 状態は store.tsx（context）に集約し、各ページは views/ 配下に分割している。
import { useCallback, useEffect, useRef, useState } from "react";
import "./capacity.css";
import type { PageId } from "./types";
import type { SupabaseConfig } from "./lib/supabase";
import { CapacityProvider, useCapacity } from "./store";
import { ManagerView } from "./views/ManagerView";
import { OverviewView } from "./views/OverviewView";
import { DetailView } from "./views/DetailView";
import { GapView } from "./views/GapView";
import { SettingsView } from "./views/SettingsView";

export type CapacityProps = {
  /** Supabase 接続情報の上書き（省略時は元HTML版の既定値を使用） */
  config?: Partial<SupabaseConfig>;
};

const NAV: Array<{ id: PageId; label: string; alignEnd?: boolean }> = [
  { id: "manager", label: "📋 マネージャービュー" },
  { id: "overview", label: "メンバー一覧" },
  { id: "gap", label: "ギャップ分析" },
  { id: "settings", label: "⚙ 設定", alignEnd: true },
];

function Shell() {
  const { page, setPage, reload, lastUpdated, currentMember } = useCapacity();

  // 起動時に読み込み
  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      <div className="topbar">
        <span className="topbar-logo">Capacity</span>
        <span className="topbar-sep" />
        <span className="topbar-unit">UnitG</span>
        <div className="topbar-right">
          <span className="topbar-time">{lastUpdated}</span>
          <button className="btn" onClick={() => reload()}>↻ 更新</button>
          <button className="btn btn-teal" onClick={() => setPage("settings")}>＋ メンバー設定</button>
        </div>
      </div>

      <nav>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={page === n.id ? "active" : undefined}
            style={n.alignEnd ? { marginLeft: "auto" } : undefined}
            onClick={() => setPage(n.id)}
          >
            {n.label}
          </button>
        ))}
        {currentMember && (
          <button className={page === "detail" ? "active" : undefined} onClick={() => setPage("detail")}>
            ▶ {currentMember}
          </button>
        )}
      </nav>

      {page === "manager" && <ManagerView />}
      {page === "overview" && <OverviewView />}
      {page === "detail" && <DetailView />}
      {page === "gap" && <GapView />}
      {page === "settings" && <SettingsView />}
    </>
  );
}

export function Capacity({ config }: CapacityProps) {
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onToast = useCallback((msg: string, ms: number) => {
    setToastMsg(msg);
    setToastShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastShow(false), ms);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div className="cap">
      <CapacityProvider config={config} onToast={onToast}>
        <Shell />
      </CapacityProvider>
      <div className={"toast" + (toastShow ? " show" : "")}>{toastMsg}</div>
    </div>
  );
}
