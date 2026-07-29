import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
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

  it("小文字始まり z9999 は通る", async () => {
    await store.set("z9999", "z@example.com");
    expect(await store.get("z9999")).toBe("z@example.com");
  });

  it("数字オール0 A0000 は通る", async () => {
    await store.set("A0000", "a@example.com");
    expect(await store.get("A0000")).toBe("a@example.com");
  });
});
