// キャパ管理ツールのデータモデル。
// 元の単一HTML版（Supabase の members / capacity_data）と同じ構造を型で表現する。

/** 明細テーブルの1項目（例: リーダー / 育成unit / スタンダード1社 …） */
export type CapacityItem = {
  name: string;
  actual: number;
  rec: number;
  flag: number;
};

/** クライアント区分ごとの担当社数 */
export type ClientCounts = {
  [label: string]: number;
};

/** ある月のキャパ実績1件 */
export type MonthData = {
  shift: number | null;
  rec: number | null;
  actual: number | null;
  diff: number | null;
  items: CapacityItem[];
  clients: ClientCounts;
  uploadedAt?: string | null;
};

/** メンバー1人分（月キー -> その月のデータ） */
export type MemberData = {
  [monthKey: string]: MonthData;
};

/** 全メンバー（メンバー名 -> 月データ） */
export type AllData = {
  [name: string]: MemberData;
};

/** メンバーのメタ情報（Supabase members 行） */
export type MemberMeta = {
  id: string;
  file_name: string | null;
  updated_at: string | null;
};

export type AllMeta = {
  [name: string]: MemberMeta;
};

/** parseXlsx の戻り値（月キー -> その月のパース結果） */
export type ParsedSheet = {
  [monthKey: string]: MonthData;
};

/** ページ識別子 */
export type PageId = "manager" | "overview" | "detail" | "gap" | "settings";
