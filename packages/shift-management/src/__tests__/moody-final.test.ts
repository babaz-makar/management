import { describe, expect, it } from "vitest";
import { parseJobcanSheet } from "../parsers/jobcan-sheet";
const ID = ["試 太郎", "", "Z9999", "", "TEST", "", ""];
const HDR = ["日付", "曜日", "区分", "", "", "出勤", "退勤"];
// r0/r1 を自由に差し込めるビルダ
function mk(r0: string[], r1: string[], data: string[][]): string[][] {
  return [r0, r1, ["","","","","","",""], ID, ["","","","","","",""], HDR, ...data];
}
const DATA = [["8/1","","","","","9:00","18:00"]];
function run(r0: string[], r1: string[] = ["","","","","","",""]) {
  try { const e = parseJobcanSheet({ rows: mk(r0, r1, DATA) });
        return { ok: true, sm: e[0]?.sourceMonth, date: e[0]?.shift.date }; }
  catch (e:any) { return { ok: false, msg: e.message }; }
}
const cell = (s: string) => [s,"","","","","",""];

describe("MOODY FINAL", () => {
  it("A ④-a 密着 2026年8月2026年9月 は曖昧throw(silent hijack無し)", () => {
    console.log("A dense =>", JSON.stringify(run(cell("2026年8月2026年9月度"))));
  });
  it("B 全角 ２０２６年８月 は正しく captured", () => {
    console.log("B zenkaku =>", JSON.stringify(run(cell("２０２６年８月度 シフト表"))));
  });
  it("C ④-b残: 正当ヘッダに日を含む '2026年8月15日締切' が唯一→誤除外でthrow(DoS)", () => {
    console.log("C day-in-title sole =>", JSON.stringify(run(cell("2026年8月15日締切 シフト表"))));
  });
  it("D 範囲ヘッダ '2026年8月1日〜2026年9月30日' 両方日付で誤除外→throw(DoS)", () => {
    console.log("D range =>", JSON.stringify(run(cell("2026年8月1日〜2026年9月30日"))));
  });
  it("E SILENT HIJACK: 締切2026年8月15日(除外) + 別セル 2025年12月(素通し) → 黙って2025-12採用", () => {
    console.log("E hijack via lookahead =>", JSON.stringify(run(cell("締切 2026年8月15日"), cell("2025年12月"))));
  });
  it("F ④-b残: 出力日時をセル分割 '出力2026年7月'+'25日' + 本物'2026年8月度' → throw(DoS)", () => {
    const r0 = ["2026年8月度 シフト表","","","","","",""];
    const r1 = ["出力 2026年7月","25日","","","","",""];
    console.log("F split-date =>", JSON.stringify(run(r0, r1)));
  });
  it("G lastIndex共有チェック: 複数セルに1件ずつ同一年月 → 1件扱いでok(取りこぼし/二重無し)", () => {
    const r0 = ["2026年8月度","","2026年8月","","","",""];
    console.log("G multi-cell same =>", JSON.stringify(run(r0)));
  });
  it("G2 複数セル異なる年月 → 曖昧throw(取りこぼしで素通ししない)", () => {
    const r0 = ["2026年8月度","2026年9月","","","","",""];
    console.log("G2 multi-cell diff =>", JSON.stringify(run(r0)));
  });
  it("H 正常系: '2026年8月度 シフト表' 単独 → 通る", () => {
    console.log("H normal =>", JSON.stringify(run(cell("2026年8月度 シフト表"))));
  });
  it("I 先読み境界: '2026年12月250日'(日が3桁) は除外されず captured か", () => {
    console.log("I 3digit-day =>", JSON.stringify(run(cell("2026年12月250日"))));
  });
});
