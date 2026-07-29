import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

/**
 * staffCode → email の対応表。staffCode(英字1+数字4桁, 例 A0187)が唯一の安定キー。
 * email は本人の Google カレンダー calendarId として使う。
 */
export interface StaffDirectory {
  /** email を返す。未登録なら null。不正な staffCode は throw(推測しない)。 */
  get(staffCode: string): Promise<string | null>;
  set(staffCode: string, email: string): Promise<void>;
  /** 登録済み全件。allowlist 生成・UI 用。0件なら空配列。 */
  list(): Promise<StaffDirectoryEntry[]>;
  delete(staffCode: string): Promise<void>;
}

export interface StaffDirectoryEntry {
  staffCode: string;
  email: string;
}

/** 英字1文字 + 数字4桁(例 A0187 / z9999)。大文字小文字どちらも許容。 */
const STAFF_CODE_PATTERN = /^[A-Za-z]\d{4}$/;
/** 簡易 email 形式(x@y.z 相当。ローカル部・ドメイン部あり、ドメインにドット必須)。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * staffCode の書式を検証する。違反は throw(自動補正・推測しない = fail-loud)。
 * 検証を通った staffCode をそのまま返す(呼び出し側でキーとして使う)。
 */
export function assertStaffCode(staffCode: string): string {
  if (!STAFF_CODE_PATTERN.test(staffCode)) {
    throw new Error(
      `invalid staffCode: "${staffCode}" (expected 1 letter + 4 digits, e.g. A0187)`,
    );
  }
  return staffCode;
}

/**
 * email の書式を検証する。違反は throw(fail-loud)。
 * 検証を通った email をそのまま返す。
 */
export function assertEmail(email: string): string {
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error(`invalid email format: "${email}"`);
  }
  return email;
}

/**
 * ファイル(JSON)永続の StaffDirectory 実装。追加依存ゼロ(Node 組込 fs/path のみ)。
 * JsonFileTokenStore と同じ構造。
 */
export class JsonFileStaffDirectory implements StaffDirectory {
  constructor(private filePath: string) {}

  private read(): Record<string, string> {
    if (!existsSync(this.filePath)) return {};
    try {
      return JSON.parse(readFileSync(this.filePath, "utf-8"));
    } catch {
      return {};
    }
  }

  private write(data: Record<string, string>): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async get(staffCode: string): Promise<string | null> {
    const key = assertStaffCode(staffCode);
    return this.read()[key] ?? null;
  }

  async set(staffCode: string, email: string): Promise<void> {
    const key = assertStaffCode(staffCode);
    const value = assertEmail(email);
    const data = this.read();
    data[key] = value;
    this.write(data);
  }

  async list(): Promise<StaffDirectoryEntry[]> {
    const data = this.read();
    return Object.keys(data).map((staffCode) => ({
      staffCode,
      email: data[staffCode],
    }));
  }

  async delete(staffCode: string): Promise<void> {
    const key = assertStaffCode(staffCode);
    const data = this.read();
    delete data[key];
    this.write(data);
  }
}
