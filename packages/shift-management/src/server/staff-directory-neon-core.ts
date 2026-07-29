import {
  assertEmail,
  assertStaffCode,
  type StaffDirectoryEntry,
} from "./staff-directory";

/**
 * タグ付きテンプレートで呼べる SQL 実行関数の最小シグネチャ。
 * Neon の `neon(databaseUrl)` が返す関数と互換。
 *
 * packages/shift-management は追加依存ゼロ(Neon に依存しない)ため、この型で縫い目を作り、
 * SQL 文言・行マッピング・検証呼び出しを純粋関数としてここに集約する。
 * apps/web の NeonStaffDirectory はこれらを呼ぶだけの薄いラッパにする
 * (「別実装(Neon側)だけ検証が抜ける」構造をテストで塞ぐのが目的)。
 */
export type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown>;

/** staff_directory テーブルを冪等に作成する(CREATE TABLE IF NOT EXISTS)。 */
export async function ensureStaffDirectoryTable(sql: SqlTag): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS staff_directory (
      staff_code TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

/**
 * staffCode に対応する email を取得する。未登録なら null。
 * 不正な staffCode は SQL 実行前に throw(fail-loud / 部分実行しない)。
 */
export async function neonGetEmail(
  sql: SqlTag,
  staffCode: string,
): Promise<string | null> {
  const key = assertStaffCode(staffCode);
  const rows = (await sql`
    SELECT email FROM staff_directory WHERE staff_code = ${key}
  `) as Record<string, string>[];
  // neonListEntries と対称に、返す email が非nullなら検証する(汚染値を下流に流さない)。
  return rows.length > 0 ? assertEmail(rows[0].email) : null;
}

/**
 * staffCode → email を upsert する。
 * staffCode / email いずれも SQL 実行前に検証し、不正なら throw(部分書き込みしない)。
 */
export async function neonSetEmail(
  sql: SqlTag,
  staffCode: string,
  email: string,
): Promise<void> {
  const key = assertStaffCode(staffCode);
  const value = assertEmail(email);
  await sql`
    INSERT INTO staff_directory (staff_code, email, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (staff_code)
    DO UPDATE SET email = ${value}, updated_at = NOW()
  `;
}

/**
 * 登録済み全件を staff_code 昇順で返す。
 * スネークケース(staff_code)→キャメルケース(staffCode)へ写像し、
 * 保存値も assertStaffCode / assertEmail で検証する(汚染データを下流に流さない)。
 */
export async function neonListEntries(
  sql: SqlTag,
): Promise<StaffDirectoryEntry[]> {
  const rows = (await sql`
    SELECT staff_code, email FROM staff_directory ORDER BY staff_code
  `) as Record<string, string>[];
  return rows.map((row) => ({
    staffCode: assertStaffCode(row.staff_code),
    email: assertEmail(row.email),
  }));
}

/**
 * staffCode の行を削除する。不正な staffCode は SQL 実行前に throw。
 * 有効書式だが未登録の staffCode は no-op(DELETE がヒット0件になるだけ)。
 */
export async function neonDeleteEntry(
  sql: SqlTag,
  staffCode: string,
): Promise<void> {
  const key = assertStaffCode(staffCode);
  await sql`
    DELETE FROM staff_directory WHERE staff_code = ${key}
  `;
}
