/**
 * xlsx バイナリ → 行×列の文字列(string[][])変換(サーバー専用)。
 *
 * exceljs はこのファイル(route handler からのみ import)に閉じ込め、クライアントに載せない。
 * packages 側は exceljs 非依存(追加依存ゼロ)を保ち、「セルを文字列化する縫い目」だけを
 * coerceCellText として packages から借りる。マージセルで exceljs の cell.text が null 参照で
 * throw する既知問題は coerceCellText が cell.value フォールバックで吸収する。
 */
import ExcelJS from "exceljs";
import { coerceCellText } from "@management/shift-management";

export interface XlsxSheet {
  /** 0 始まり配列。行内は列 1..columnCount を 0 始まりで格納。空セルは ""。 */
  rows: string[][];
  /** シート名(staffName フォールバック等に利用)。 */
  sheetName: string;
}

/**
 * xlsx バッファを読み、先頭シートを string[][] に変換する。
 * exceljs のセルインデックスは 1 始まりなので、1..count を走査して 0 始まり配列へ詰める。
 * どのセルも coerceCellText(() => cell.text, () => cell.value) で防御的に文字列化し、
 * マージセルでも throw させない。
 */
export async function xlsxToRows(buffer: ArrayBuffer | Buffer): Promise<XlsxSheet> {
  const workbook = new ExcelJS.Workbook();
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  // exceljs の型は独自 `Buffer extends ArrayBuffer` を要求するが、Node ランタイムでは
  // Node Buffer を渡すのが正(@types/node の Buffer generic と噛み合わないため橋渡しキャスト)。
  type LoadBuffer = Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(buf as unknown as LoadBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { rows: [], sheetName: "" };

  const rowCount = worksheet.rowCount;
  const colCount = worksheet.columnCount;
  const rows: string[][] = [];

  for (let r = 1; r <= rowCount; r += 1) {
    const row = worksheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= colCount; c += 1) {
      const cell = row.getCell(c);
      cells.push(coerceCellText(() => cell.text, () => cell.value));
    }
    rows.push(cells);
  }

  return { rows, sheetName: worksheet.name };
}
