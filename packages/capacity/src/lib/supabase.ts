// Supabase REST 連携。元HTML版の api()/loadAll/upsert/delete を移植。
// SDK は使わず fetch のみ。接続情報は設定として受け取る（既定値あり）。
import type { AllData, AllMeta, ParsedSheet, MonthData } from "../types";

export type SupabaseConfig = {
  url: string;
  key: string;
  unit: string;
};

/** 元HTML版に埋め込まれていた既定の接続情報（anon key は RLS 前提の公開キー） */
export const DEFAULT_CONFIG: SupabaseConfig = {
  url: "https://uoyllnffwsltujvzouao.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVveWxsbmZmd3NsdHVqdnpvdWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NTY3NDEsImV4cCI6MjA5NjAzMjc0MX0.DU0CGu4eizUdP4lwwDxTjRy2dY0CxTNbVqG9qEIkAZE",
  unit: "UnitG",
};

type FetchOpt = RequestInit & { prefer?: string };

/** REST クライアント（config を束ねた api 関数群） */
export function createClient(cfg: SupabaseConfig) {
  const api = (path: string, opt: FetchOpt = {}) =>
    fetch(`${cfg.url}/rest/v1/${path}`, {
      ...opt,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Prefer: opt.prefer || "",
        ...opt.headers,
      },
    });

  type MemberRow = {
    id: string;
    name: string;
    file_name: string | null;
    updated_at: string | null;
    capacity_data?: Array<{
      month_key: string;
      shift_hours: number | null;
      recommended_hours: number | null;
      actual_hours: number | string | null;
      diff_hours: number | null;
      items: MonthData["items"] | null;
      clients: MonthData["clients"] | null;
      uploaded_at: string | null;
    }>;
  };

  /** 全メンバー＋キャパデータを取得して {allData, memberMeta} を返す */
  async function loadAll(): Promise<{ allData: AllData; memberMeta: AllMeta }> {
    const res = await api(
      `members?select=id,name,file_name,updated_at,capacity_data(month_key,shift_hours,recommended_hours,actual_hours,diff_hours,items,clients,uploaded_at)&unit=eq.${encodeURIComponent(
        cfg.unit
      )}&order=created_at.asc`
    );
    if (!res.ok) throw new Error(await res.text());
    const rows: MemberRow[] = await res.json();
    const allData: AllData = {};
    const memberMeta: AllMeta = {};
    rows.forEach((m) => {
      memberMeta[m.name] = { id: m.id, file_name: m.file_name, updated_at: m.updated_at };
      allData[m.name] = {};
      (m.capacity_data || []).forEach((cd) => {
        allData[m.name][cd.month_key] = {
          shift: cd.shift_hours,
          rec: cd.recommended_hours,
          actual: cd.actual_hours != null ? parseFloat(String(cd.actual_hours)) : null,
          diff: cd.diff_hours,
          items: cd.items || [],
          clients: cd.clients || {},
          uploadedAt: cd.uploaded_at,
        };
      });
    });
    return { allData, memberMeta };
  }

  /** メンバー upsert＋その月次データ upsert */
  async function upsertMember(name: string, fileName: string, sheetData: ParsedSheet) {
    const mRes = await api("members?on_conflict=name", {
      method: "POST",
      prefer: "return=representation,resolution=merge-duplicates",
      body: JSON.stringify({ name, file_name: fileName, unit: cfg.unit }),
    });
    if (!mRes.ok) throw new Error(await mRes.text());
    const [member] = (await mRes.json()) as Array<{ id: string }>;
    const rows = Object.entries(sheetData).map(([month_key, d]) => ({
      member_id: member.id,
      month_key,
      shift_hours: d.shift,
      recommended_hours: d.rec,
      actual_hours: d.actual,
      diff_hours: d.diff,
      items: d.items,
      clients: d.clients,
      uploaded_at: new Date().toISOString(),
    }));
    const cdRes = await api("capacity_data?on_conflict=member_id,month_key", {
      method: "POST",
      prefer: "return=minimal,resolution=merge-duplicates",
      body: JSON.stringify(rows),
    });
    if (!cdRes.ok) throw new Error(await cdRes.text());
    return member;
  }

  /** メンバー削除（id 指定） */
  async function deleteMember(id: string) {
    const res = await api(`members?id=eq.${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
  }

  return { api, loadAll, upsertMember, deleteMember };
}

export type SupabaseClient = ReturnType<typeof createClient>;
