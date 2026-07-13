// アプリ全体の状態（元HTML版のグローバル変数 allData/memberMeta/currentMember… を集約）。
// React context で各ビューへ配布する。
import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AllData, AllMeta, PageId } from "./types";
import { createClient, DEFAULT_CONFIG, type SupabaseConfig, type SupabaseClient } from "./lib/supabase";

export type CapacityStore = {
  allData: AllData;
  memberMeta: AllMeta;
  lastUpdated: string;
  client: SupabaseClient;

  reload: () => Promise<void>;
  toast: (msg: string, ms?: number) => void;

  page: PageId;
  setPage: (p: PageId) => void;

  currentMember: string | null;
  currentMonth: string | null;
  openDetail: (name: string) => void;
  setCurrentMonth: (mo: string) => void;

  /** ギャップ分析①→②のジャンプ要求（項目名・月）。②側が消費する */
  gapJump: { item: string; month: string } | null;
  requestGapJump: (item: string, month: string) => void;
  clearGapJump: () => void;
};

const Ctx = createContext<CapacityStore | null>(null);

export function useCapacity(): CapacityStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCapacity must be used within <CapacityProvider>");
  return v;
}

export type CapacityProviderProps = {
  config?: Partial<SupabaseConfig>;
  onToast: (msg: string, ms: number) => void;
  children: ReactNode;
};

export function CapacityProvider({ config, onToast, children }: CapacityProviderProps) {
  const client = useMemo(() => createClient({ ...DEFAULT_CONFIG, ...config }), [config]);

  const [allData, setAllData] = useState<AllData>({});
  const [memberMeta, setMemberMeta] = useState<AllMeta>({});
  const [lastUpdated, setLastUpdated] = useState("");
  const [page, setPage] = useState<PageId>("manager");
  const [currentMember, setCurrentMember] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  const [gapJump, setGapJump] = useState<{ item: string; month: string } | null>(null);

  const toastRef = useRef(onToast);
  toastRef.current = onToast;
  const toast = useCallback((msg: string, ms = 2500) => toastRef.current(msg, ms), []);

  const reload = useCallback(async () => {
    setLastUpdated("読み込み中...");
    try {
      const { allData: ad, memberMeta: mm } = await client.loadAll();
      setAllData(ad);
      setMemberMeta(mm);
      setLastUpdated("最終更新: " + new Date().toLocaleTimeString("ja-JP"));
    } catch (e) {
      setLastUpdated("エラー: " + (e as Error).message);
    }
  }, [client]);

  const openDetail = useCallback(
    (name: string) => {
      setAllData((cur) => {
        const months = Object.keys(cur[name] || {});
        setCurrentMember(name);
        setCurrentMonth(months[months.length - 1] ?? null);
        return cur;
      });
      setPage("detail");
    },
    []
  );

  const requestGapJump = useCallback((item: string, month: string) => {
    setGapJump({ item, month });
  }, []);
  const clearGapJump = useCallback(() => setGapJump(null), []);

  const value: CapacityStore = {
    allData,
    memberMeta,
    lastUpdated,
    client,
    reload,
    toast,
    page,
    setPage,
    currentMember,
    currentMonth,
    openDetail,
    setCurrentMonth,
    gapJump,
    requestGapJump,
    clearGapJump,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
