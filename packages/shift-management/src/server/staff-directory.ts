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

/**
 * 大文字英字1文字 + 数字4桁(例 A0187)。
 * ジョブカン由来コードは常に大文字始まりのため、小文字は不正として弾く(自動正規化しない)。
 */
const STAFF_CODE_PATTERN = /^[A-Z]\d{4}$/;
/** 簡易 email 形式(x@y.z 相当。ローカル部・ドメイン部あり、ドメインにドット必須)。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * staffCode の書式を検証する。違反は throw(自動補正・推測しない = fail-loud)。
 * 検証を通った staffCode をそのまま返す(呼び出し側でキーとして使う)。
 */
export function assertStaffCode(staffCode: string): string {
  if (!STAFF_CODE_PATTERN.test(staffCode)) {
    throw new Error(
      `invalid staffCode: "${staffCode}" (expected 1 uppercase letter + 4 digits, e.g. A0187)`,
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
 * 配列でない plain object(staffCode -> email マップとして扱える形)か判定する。
 * 配列 / null / プリミティブ(number, string, boolean 等)は false。
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** エラーメッセージ用に JSON 値の種別を人間可読で返す。 */
function describeJsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * ファイル(JSON)永続の StaffDirectory 実装。追加依存ゼロ(Node 組込 fs/path のみ)。
 * JsonFileTokenStore と同じ構造。
 */
export class JsonFileStaffDirectory implements StaffDirectory {
  constructor(private filePath: string) {}

  /**
   * ファイルを読み取る。
   * - 未作成(初回)は空扱い {} を返す。
   * - 存在するが読み取り不能/JSONパース不能は throw(fail-loud)。
   *   握りつぶして {} を返すと、続く set が全件を黙って上書き消去する事故になるため。
   * - パースは通るが「配列でない plain object」でない値(配列 / null / プリミティブ)も throw。
   *   特に配列JSONだと set が throw せず成功を装い、JSON.stringify が名前付き
   *   プロパティを捨てて既存の対応表が黙って消える(別経路の静かなデータ消失)ため。
   */
  private read(): Record<string, string> {
    if (!existsSync(this.filePath)) return {};
    const raw = readFileSync(this.filePath, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      throw new Error(
        `failed to parse staff directory JSON at ${this.filePath}`,
        { cause },
      );
    }
    if (!isPlainObject(parsed)) {
      throw new Error(
        `invalid staff directory JSON at ${this.filePath}: expected a plain object of staffCode -> email`,
        { cause: new TypeError(`got ${describeJsonType(parsed)}`) },
      );
    }
    return parsed as Record<string, string>;
  }

  private write(data: Record<string, string>): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async get(staffCode: string): Promise<string | null> {
    const key = assertStaffCode(staffCode);
    const email = this.read()[key] ?? null;
    // list と対称に、返す email が非nullなら検証する(汚染値を下流に流さない)。
    return email === null ? null : assertEmail(email);
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
    // 保存値も無検証で下流(allowlist生成)に流さない。汚染データは fail-loud で弾く。
    return Object.keys(data).map((staffCode) => ({
      staffCode: assertStaffCode(staffCode),
      email: assertEmail(data[staffCode]),
    }));
  }

  async delete(staffCode: string): Promise<void> {
    const key = assertStaffCode(staffCode);
    const data = this.read();
    delete data[key];
    this.write(data);
  }
}
