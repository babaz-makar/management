import { describe, expect, it } from "vitest";
import {
  ensureStaffDirectoryTable,
  neonDeleteEntry,
  neonGetEmail,
  neonListEntries,
  neonSetEmail,
  type SqlTag,
} from "../server/staff-directory-neon-core";

type SqlRows = Record<string, string>[];

interface RecordedCall {
  /** テンプレート文字列を "?" 区切りで結合し空白正規化したもの(=SQL文言) */
  text: string;
  /** 埋め込まれたパラメータ(順序どおり) */
  values: unknown[];
}

/**
 * タグ付きテンプレート互換の fake SQL。呼び出しを記録し、
 * resolver があればその戻り値、無ければ空配列を返す。
 * これにより実 DB 接続なしで SQL 文言・引数・行マッピング・検証呼び出しを検証できる。
 */
function createFakeSql(resolver?: (text: string) => SqlRows): {
  sql: SqlTag;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(resolver ? resolver(text) : ([] as SqlRows));
  };
  return { sql: sql as SqlTag, calls };
}

describe("ensureStaffDirectoryTable", () => {
  it("CREATE TABLE IF NOT EXISTS を引数なしで発行する", async () => {
    const { sql, calls } = createFakeSql();
    await ensureStaffDirectoryTable(sql);
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain(
      "CREATE TABLE IF NOT EXISTS staff_directory",
    );
    expect(calls[0].values).toEqual([]);
  });
});

describe("neonSetEmail", () => {
  it("INSERT ... ON CONFLICT (staff_code) DO UPDATE に正しい引数を渡す", async () => {
    const { sql, calls } = createFakeSql();
    await neonSetEmail(sql, "A0187", "baba@example.com");
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("INSERT INTO staff_directory");
    expect(calls[0].text).toContain("ON CONFLICT (staff_code)");
    expect(calls[0].text).toContain("DO UPDATE SET email = ?");
    // 埋め込み順: key, value(INSERT), value(DO UPDATE)
    expect(calls[0].values).toEqual([
      "A0187",
      "baba@example.com",
      "baba@example.com",
    ]);
  });

  it("不正な staffCode(小文字 z9999)は SQL 実行前に throw し、DB を呼ばない", async () => {
    const { sql, calls } = createFakeSql();
    await expect(neonSetEmail(sql, "z9999", "a@example.com")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("不正な email は SQL 実行前に throw し、DB を呼ばない", async () => {
    const { sql, calls } = createFakeSql();
    await expect(neonSetEmail(sql, "A0187", "not-an-email")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("neonGetEmail", () => {
  it("SELECT の結果 email を返す(staff_code をパラメータ化)", async () => {
    const { sql, calls } = createFakeSql(() => [{ email: "hit@example.com" }]);
    const email = await neonGetEmail(sql, "A0187");
    expect(email).toBe("hit@example.com");
    expect(calls[0].text).toContain("SELECT email FROM staff_directory");
    expect(calls[0].text).toContain("WHERE staff_code = ?");
    expect(calls[0].values).toEqual(["A0187"]);
  });

  it("該当行が無ければ null を返す", async () => {
    const { sql } = createFakeSql(() => []);
    expect(await neonGetEmail(sql, "A0187")).toBeNull();
  });

  it("不正な staffCode は SQL 実行前に throw し、DB を呼ばない", async () => {
    const { sql, calls } = createFakeSql();
    await expect(neonGetEmail(sql, "a0187")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("行が返す email が不正なら throw する(list と対称に戻り値も検証)", async () => {
    const { sql } = createFakeSql(() => [{ email: "not-an-email" }]);
    await expect(neonGetEmail(sql, "A0187")).rejects.toThrow();
  });
});

describe("neonListEntries", () => {
  it("全件を staff_code 昇順で取得し、snake_case→camelCase に写像する", async () => {
    const { sql, calls } = createFakeSql(() => [
      { staff_code: "A0187", email: "a@example.com" },
      { staff_code: "B0002", email: "b@example.com" },
    ]);
    const entries = await neonListEntries(sql);
    expect(calls[0].text).toContain("SELECT staff_code, email");
    expect(calls[0].text).toContain("ORDER BY staff_code");
    expect(entries).toEqual([
      { staffCode: "A0187", email: "a@example.com" },
      { staffCode: "B0002", email: "b@example.com" },
    ]);
  });

  it("0件のとき空配列を返す", async () => {
    const { sql } = createFakeSql(() => []);
    expect(await neonListEntries(sql)).toEqual([]);
  });

  it("保存値に不正な staffCode が混じっていたら throw する", async () => {
    const { sql } = createFakeSql(() => [
      { staff_code: "a0187", email: "a@example.com" },
    ]);
    await expect(neonListEntries(sql)).rejects.toThrow();
  });

  it("保存値に不正な email が混じっていたら throw する", async () => {
    const { sql } = createFakeSql(() => [
      { staff_code: "A0187", email: "not-an-email" },
    ]);
    await expect(neonListEntries(sql)).rejects.toThrow();
  });
});

describe("neonDeleteEntry", () => {
  it("DELETE ... WHERE staff_code = ? に正しい引数を渡す", async () => {
    const { sql, calls } = createFakeSql();
    await neonDeleteEntry(sql, "A0187");
    expect(calls[0].text).toContain("DELETE FROM staff_directory");
    expect(calls[0].text).toContain("WHERE staff_code = ?");
    expect(calls[0].values).toEqual(["A0187"]);
  });

  it("不正な staffCode は SQL 実行前に throw し、DB を呼ばない", async () => {
    const { sql, calls } = createFakeSql();
    await expect(neonDeleteEntry(sql, "bad")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
