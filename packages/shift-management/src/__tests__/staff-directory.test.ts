import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  JsonFileStaffDirectory,
  type StaffDirectory,
} from "../server/staff-directory";

describe("JsonFileStaffDirectory: 正常系(set/get/list/delete)", () => {
  let dir: string;
  let store: StaffDirectory;

  beforeEach(() => {
    // Arrange: テストごとに使い捨てのファイルパスを用意
    dir = mkdtempSync(join(tmpdir(), "staff-dir-"));
    store = new JsonFileStaffDirectory(join(dir, "staff.json"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("set した staffCode の email を get で取り出せる", async () => {
    // Act
    await store.set("A0187", "baba@example.com");
    const email = await store.get("A0187");
    // Assert
    expect(email).toBe("baba@example.com");
  });

  it("未登録の staffCode の get は null を返す", async () => {
    const email = await store.get("A0001");
    expect(email).toBeNull();
  });

  it("同じ staffCode に set し直すと email が上書きされる", async () => {
    await store.set("A0187", "old@example.com");
    await store.set("A0187", "new@example.com");
    expect(await store.get("A0187")).toBe("new@example.com");
  });

  it("list は登録済みの全件を返す", async () => {
    await store.set("A0187", "a@example.com");
    await store.set("B0002", "b@example.com");
    const entries = await store.list();
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual({ staffCode: "A0187", email: "a@example.com" });
    expect(entries).toContainEqual({ staffCode: "B0002", email: "b@example.com" });
  });

  it("0件のとき list は空配列を返す", async () => {
    const entries = await store.list();
    expect(entries).toEqual([]);
  });

  it("delete した後は get が null を返す", async () => {
    await store.set("A0187", "a@example.com");
    await store.delete("A0187");
    expect(await store.get("A0187")).toBeNull();
  });

  it("delete は他の staffCode に影響しない", async () => {
    await store.set("A0187", "a@example.com");
    await store.set("B0002", "b@example.com");
    await store.delete("A0187");
    expect(await store.get("A0187")).toBeNull();
    expect(await store.get("B0002")).toBe("b@example.com");
  });

  it("永続化されており別インスタンスからも読める", async () => {
    await store.set("A0187", "a@example.com");
    const reopened = new JsonFileStaffDirectory(join(dir, "staff.json"));
    expect(await reopened.get("A0187")).toBe("a@example.com");
  });
});

describe("JsonFileStaffDirectory: staffCode の書式検証(fail-loud)", () => {
  let dir: string;
  let store: StaffDirectory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "staff-dir-"));
    store = new JsonFileStaffDirectory(join(dir, "staff.json"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("英字が無い(数字5桁 01234)の set は throw する", async () => {
    await expect(store.set("01234", "a@example.com")).rejects.toThrow();
  });

  it("数字が3桁(A012)の set は throw する", async () => {
    await expect(store.set("A012", "a@example.com")).rejects.toThrow();
  });

  it("数字が5桁(A01234)の set は throw する", async () => {
    await expect(store.set("A01234", "a@example.com")).rejects.toThrow();
  });

  it("空文字の set は throw する", async () => {
    await expect(store.set("", "a@example.com")).rejects.toThrow();
  });

  it("英字が2文字(AB012)の set は throw する", async () => {
    await expect(store.set("AB012", "a@example.com")).rejects.toThrow();
  });

  it("小文字始まり(a0187)の set は throw する(大文字前提・自動正規化しない)", async () => {
    await expect(store.set("a0187", "a@example.com")).rejects.toThrow();
  });

  it("小文字境界(z9999)の set は throw する", async () => {
    await expect(store.set("z9999", "z@example.com")).rejects.toThrow();
  });

  it("不正な staffCode の get も throw する(推測して null を返さない)", async () => {
    await expect(store.get("A1")).rejects.toThrow();
  });

  it("不正な staffCode の delete も throw する", async () => {
    await expect(store.delete("bad")).rejects.toThrow();
  });
});

describe("JsonFileStaffDirectory: email の書式検証(fail-loud)", () => {
  let dir: string;
  let store: StaffDirectory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "staff-dir-"));
    store = new JsonFileStaffDirectory(join(dir, "staff.json"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("@ が無い email の set は throw する", async () => {
    await expect(store.set("A0187", "not-an-email")).rejects.toThrow();
  });

  it("ドメインにドットが無い email の set は throw する", async () => {
    await expect(store.set("A0187", "a@localhost")).rejects.toThrow();
  });

  it("ローカル部が空の email の set は throw する", async () => {
    await expect(store.set("A0187", "@example.com")).rejects.toThrow();
  });

  it("空文字の email の set は throw する", async () => {
    await expect(store.set("A0187", "")).rejects.toThrow();
  });
});

describe("JsonFileStaffDirectory: staffCode の境界(正常系)", () => {
  let dir: string;
  let store: StaffDirectory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "staff-dir-"));
    store = new JsonFileStaffDirectory(join(dir, "staff.json"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("大文字始まり A0187 は通る", async () => {
    await store.set("A0187", "a@example.com");
    expect(await store.get("A0187")).toBe("a@example.com");
  });

  it("大文字境界 Z9999 は通る", async () => {
    await store.set("Z9999", "z@example.com");
    expect(await store.get("Z9999")).toBe("z@example.com");
  });

  it("数字オール0 A0000 は通る", async () => {
    await store.set("A0000", "a@example.com");
    expect(await store.get("A0000")).toBe("a@example.com");
  });
});

describe("JsonFileStaffDirectory: 破損JSONの握りつぶし禁止(fail-loud)", () => {
  let dir: string;
  let filePath: string;
  let store: StaffDirectory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "staff-dir-"));
    filePath = join(dir, "staff.json");
    store = new JsonFileStaffDirectory(filePath);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("破損JSON(パース不能)に対して get は throw する", async () => {
    // Arrange: 壊れた JSON を仕込む
    writeFileSync(filePath, "{ not valid json", "utf-8");
    // Act / Assert
    await expect(store.get("A0187")).rejects.toThrow();
  });

  it("破損JSONに対して list は throw する", async () => {
    writeFileSync(filePath, "{ broken", "utf-8");
    await expect(store.list()).rejects.toThrow();
  });

  it("破損JSONに対して set は throw し、既存の壊れた内容を上書き消去しない", async () => {
    // Arrange: 壊れた JSON(=空{}に握りつぶすと全件消える状況)
    const broken = "{ broken content";
    writeFileSync(filePath, broken, "utf-8");
    // Act / Assert: throw し、ファイルは書き換えられない
    await expect(store.set("A0187", "a@example.com")).rejects.toThrow();
    expect(readFileSync(filePath, "utf-8")).toBe(broken);
  });
});

describe("JsonFileStaffDirectory: list は保存値を検証する(汚染データを流さない)", () => {
  let dir: string;
  let filePath: string;
  let store: StaffDirectory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "staff-dir-"));
    filePath = join(dir, "staff.json");
    store = new JsonFileStaffDirectory(filePath);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("手編集で不正な staffCode が混入していると list は throw する", async () => {
    // Arrange: 不正キー(小文字)を直接書き込む
    writeFileSync(
      filePath,
      JSON.stringify({ a0187: "a@example.com" }, null, 2),
      "utf-8",
    );
    await expect(store.list()).rejects.toThrow();
  });

  it("手編集で不正な email が混入していると list は throw する", async () => {
    writeFileSync(
      filePath,
      JSON.stringify({ A0187: "not-an-email" }, null, 2),
      "utf-8",
    );
    await expect(store.list()).rejects.toThrow();
  });
});

describe("JsonFileStaffDirectory: read() の top-level 型検査(配列/null/プリミティブを弾く)", () => {
  let dir: string;
  let filePath: string;
  let store: StaffDirectory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "staff-dir-"));
    filePath = join(dir, "staff.json");
    store = new JsonFileStaffDirectory(filePath);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("ファイル内容が空配列 [] のとき get は throw する", async () => {
    writeFileSync(filePath, "[]", "utf-8");
    await expect(store.get("A0187")).rejects.toThrow();
  });

  it("ファイル内容が空配列 [] のとき set は throw する", async () => {
    writeFileSync(filePath, "[]", "utf-8");
    await expect(store.set("A0187", "a@example.com")).rejects.toThrow();
  });

  it("ファイル内容が空配列 [] のとき list は throw する", async () => {
    writeFileSync(filePath, "[]", "utf-8");
    await expect(store.list()).rejects.toThrow();
  });

  it("配列JSON [{...}] に set したとき throw し、既存ファイル内容を上書き消去しない", async () => {
    // Arrange: 配列の名前付きプロパティは JSON.stringify で捨てられ静かに消える形
    const arrayJson = JSON.stringify([{ A0187: "x@y.z" }], null, 2);
    writeFileSync(filePath, arrayJson, "utf-8");
    // Act / Assert: throw し、ファイルは書き換えられない
    await expect(store.set("B0002", "b@example.com")).rejects.toThrow();
    expect(readFileSync(filePath, "utf-8")).toBe(arrayJson);
  });

  it("ファイル内容が null のとき get は throw する(生 TypeError でなく文脈付きエラー)", async () => {
    writeFileSync(filePath, "null", "utf-8");
    await expect(store.get("A0187")).rejects.toThrow(
      /staff directory JSON/,
    );
  });

  it("ファイル内容が数値プリミティブ 42 のとき get は throw する", async () => {
    writeFileSync(filePath, "42", "utf-8");
    await expect(store.get("A0187")).rejects.toThrow(/staff directory JSON/);
  });

  it("ファイル内容が文字列プリミティブ のとき list は throw する", async () => {
    writeFileSync(filePath, '"hello"', "utf-8");
    await expect(store.list()).rejects.toThrow(/staff directory JSON/);
  });
});

describe("JsonFileStaffDirectory: get は戻り値の email を検証する(list と対称)", () => {
  let dir: string;
  let filePath: string;
  let store: StaffDirectory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "staff-dir-"));
    filePath = join(dir, "staff.json");
    store = new JsonFileStaffDirectory(filePath);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("手編集で不正な email が入った storage に対し get は throw する", async () => {
    writeFileSync(
      filePath,
      JSON.stringify({ A0187: "not-an-email" }, null, 2),
      "utf-8",
    );
    await expect(store.get("A0187")).rejects.toThrow();
  });

  it("正常な email なら get はそのまま返す", async () => {
    writeFileSync(
      filePath,
      JSON.stringify({ A0187: "ok@example.com" }, null, 2),
      "utf-8",
    );
    expect(await store.get("A0187")).toBe("ok@example.com");
  });

  it("未登録(null)は検証を挟まず null を返す", async () => {
    writeFileSync(
      filePath,
      JSON.stringify({ A0187: "ok@example.com" }, null, 2),
      "utf-8",
    );
    expect(await store.get("B0002")).toBeNull();
  });
});

describe("JsonFileStaffDirectory: delete の no-op と set の部分書き込み防止", () => {
  let dir: string;
  let filePath: string;
  let store: StaffDirectory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "staff-dir-"));
    filePath = join(dir, "staff.json");
    store = new JsonFileStaffDirectory(filePath);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("有効書式だが未登録の staffCode の delete は throw せず no-op", async () => {
    await store.set("A0187", "a@example.com");
    // Act: 未登録の有効コードを delete
    await expect(store.delete("B0002")).resolves.toBeUndefined();
    // Assert: 既存データは消えない
    expect(await store.get("A0187")).toBe("a@example.com");
  });

  it("email 検証失敗時の set はファイルに部分書き込みしない(ファイル未作成)", async () => {
    // Act / Assert: 検証を書き込み前に実施しているので throw し、ファイルは作られない
    await expect(store.set("A0187", "bad-email")).rejects.toThrow();
    expect(existsSync(filePath)).toBe(false);
  });

  it("staffCode 検証失敗時の set は既存データを書き換えない", async () => {
    // Arrange: 正常に1件保存
    await store.set("A0187", "a@example.com");
    const before = readFileSync(filePath, "utf-8");
    // Act / Assert: 不正コードで set → throw、ファイル不変
    await expect(store.set("bad", "b@example.com")).rejects.toThrow();
    expect(readFileSync(filePath, "utf-8")).toBe(before);
  });
});
