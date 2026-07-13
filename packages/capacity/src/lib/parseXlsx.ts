// Excel（キャパ管理シート）のパース。元HTML版の xlsx parse をそのまま移植。
import * as XLSX from "xlsx";
import type { MonthData, ParsedSheet, CapacityItem } from "../types";
import { sf } from "./utils";

type Row = Array<unknown>;

/** 1シート分の行配列を MonthData に変換 */
export function parseSheetRows(rows: Row[]): MonthData {
  // 明細テーブル（2つ目の「項目」見出し）の手前までを上段集計エリアとして扱う。
  // 「合計」行がシートの何行目にあっても拾えるようにする。
  const end = rows.findIndex((r, i) => i > 0 && String(r && r[0]) === "項目");
  const top = rows.slice(0, end > 0 ? end : 26);
  let actual: number | null = null;
  const items: CapacityItem[] = [];
  top.forEach((row) => {
    const name = row[0];
    if (String(name) === "合計") {
      const v = sf(row[1]);
      if (v !== null) actual = Math.round(v * 100) / 100;
    }
    if (!name || ["項目", "合計"].includes(String(name))) return;
    const act = sf(row[1]);
    const rec = sf(row[2]);
    if (act === null && rec === null) return;
    items.push({ name: String(name), actual: act ?? 0, rec: rec ?? 0, flag: sf(row[5]) ?? 0 });
  });
  const shift = rows[0]?.[9] != null ? sf(rows[0][9]) : null;
  const rec = rows[1]?.[9] != null ? sf(rows[1][9]) : null;
  const diff = rows[3]?.[9] != null ? sf(rows[3][9]) : null;
  const clients: Record<string, number> = {};
  (
    [
      [9, "スタンダード"],
      [11, "アドバンス"],
      [13, "ライト"],
      [15, "レポートチェック"],
    ] as Array<[number, string]>
  ).forEach(([i, label]) => {
    clients[label] = (rows[i] && sf(rows[i][9])) ?? 0;
  });
  return {
    shift: shift != null ? Math.round(shift) : null,
    rec: rec != null ? Math.round(rec) : null,
    actual,
    diff: diff != null ? Math.round(diff) : null,
    items,
    clients,
  };
}

/** ArrayBuffer を読み込み、シートごとに月キー付きでパース */
export function parseXlsx(ab: ArrayBuffer): ParsedSheet {
  const wb = XLSX.read(new Uint8Array(ab), { type: "array" });
  const result: ParsedSheet = {};
  wb.SheetNames.forEach((name) => {
    // テンプレシート（「コピー」や未入力の「◯月」を含む）は登録しない
    if (/コピー|テンプレ|◯|○/.test(String(name))) return;
    // シート名から「N月」を抽出して月キーにする（例:「鈴木碧羽＿6月」→「6月」）。無ければシート名のまま
    const m = String(name).match(/(\d+)\s*月/);
    const key = m ? `${m[1]}月` : name;
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { header: 1, defval: null });
    result[key] = parseSheetRows(rows);
  });
  return result;
}

/** File を ArrayBuffer として読む */
export function readFileAB(file: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => res(e.target!.result as ArrayBuffer);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
}
