import { NextRequest, NextResponse } from "next/server";
import { assertStaffCode, assertEmail } from "@management/shift-management";
import { NeonStaffDirectory } from "@/lib/staff-directory-neon";

/**
 * スタッフ名簿 API(staffCode ⇄ email)。
 *
 * 前提(重要): この API は Vercel Deployment Protection(infra 層)で保護された
 * 管理画面からのみ呼ばれる。GET は email を返すが、その保護が主ゲートである。
 * コード側の画面認証ミドルウェアは持たない(社長判断)。NeonStaffDirectory は
 * サーバー内でのみ生成し、DB 接続文字列はレスポンス・ログ・例外に一切出さない。
 *
 * - GET    → 登録済み全件(StaffDirectoryEntry[])
 * - POST   {staffCode,email,overwrite?} → 検証して保存。既存に別 email があり
 *           overwrite:true が無ければ 409(UI が上書き確認を出せるように)
 * - DELETE ?code= または body{staffCode} → 検証して削除
 *
 * neon は Node ランタイム依存。
 */
export const runtime = "nodejs";

/** DB 名簿を取得する。DATABASE_URL 未設定なら null(呼び出し側で 500)。 */
function getDirectory(): NeonStaffDirectory | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) return null;
  return new NeonStaffDirectory(databaseUrl);
}

/** 設定不備(DATABASE_URL 欠落)の共通レスポンス。秘密は出さない。 */
function misconfigured(): NextResponse {
  return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
}

/** DB 由来の例外は一般化した 500 に落とす(接続文字列等の秘密を出さない)。 */
function dbFailed(): NextResponse {
  return NextResponse.json({ error: "operation failed" }, { status: 500 });
}

export async function GET(): Promise<NextResponse> {
  const directory = getDirectory();
  if (!directory) return misconfigured();
  try {
    const entries = await directory.list();
    return NextResponse.json({ entries });
  } catch {
    return dbFailed();
  }
}

/** POST body から staffCode/email/overwrite を取り出し検証する(不正は Error を throw)。 */
function parseUpsertBody(body: unknown): {
  staffCode: string;
  email: string;
  overwrite: boolean;
} {
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<
    string,
    unknown
  >;
  const staffCode = assertStaffCode(String(record.staffCode ?? ""));
  const email = assertEmail(String(record.email ?? ""));
  return { staffCode, email, overwrite: record.overwrite === true };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const directory = getDirectory();
  if (!directory) return misconfigured();

  // 検証は DB アクセス前に行い、検証エラー(400)と DB エラー(500)を明確に分ける。
  let parsed: { staffCode: string; email: string; overwrite: boolean };
  try {
    parsed = parseUpsertBody(await req.json());
  } catch (err) {
    // assert* / JSON パースのメッセージ(入力値は含むが秘密は含まない)を 400 で返す。
    const message = err instanceof Error ? err.message : "invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    // 既存に「別 email」があり overwrite 指定が無ければ 409(UI が上書き確認を出せる)。
    const existing = await directory.get(parsed.staffCode);
    if (existing !== null && existing !== parsed.email && !parsed.overwrite) {
      return NextResponse.json(
        { error: "already registered", staffCode: parsed.staffCode, existingEmail: existing },
        { status: 409 },
      );
    }
    await directory.set(parsed.staffCode, parsed.email);
    return NextResponse.json({ ok: true, staffCode: parsed.staffCode, email: parsed.email });
  } catch {
    return dbFailed();
  }
}

/** DELETE 対象 staffCode を query(?code=)または body{staffCode} から取り出す。 */
async function readDeleteCode(req: NextRequest): Promise<string | null> {
  const fromQuery = req.nextUrl.searchParams.get("code");
  if (typeof fromQuery === "string" && fromQuery.length > 0) return fromQuery;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const code = body?.staffCode;
    return typeof code === "string" && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const directory = getDirectory();
  if (!directory) return misconfigured();

  const rawCode = await readDeleteCode(req);
  if (rawCode === null) {
    return NextResponse.json({ error: "staffCode is required" }, { status: 400 });
  }

  let staffCode: string;
  try {
    staffCode = assertStaffCode(rawCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid staffCode";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await directory.delete(staffCode);
    return NextResponse.json({ ok: true, staffCode });
  } catch {
    return dbFailed();
  }
}
