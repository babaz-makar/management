/**
 * スタッフ名簿画面(staff/page.tsx)のクライアント側ロジック。
 * 同一オリジンの /api/staff・/api/staff/slack-check を叩き、結果/エラーを人間語へ翻訳する。
 */
import type { StaffDirectoryEntry } from "@management/shift-management";
import {
  describeHttpError,
  isValidStaffCode,
  STAFF_CODE_PATTERN,
  translateJobcanServerError,
} from "@management/shift-management/ui";

// staffCode 形式判定は packages の純関数へ集約(テスト可能)。既存 import 互換のため再輸出する。
export { isValidStaffCode, STAFF_CODE_PATTERN };

/** GET /api/staff の結果。 */
export type ListResult =
  | { ok: true; entries: StaffDirectoryEntry[] }
  | { ok: false; errorMessage: string };

/** POST /api/staff の結果(409=既存別 email は conflict として区別)。 */
export type UpsertResult =
  | { ok: true; entry: StaffDirectoryEntry }
  | { ok: false; conflict: true; existingEmail: string }
  | { ok: false; conflict: false; errorMessage: string };

/** DELETE /api/staff の結果。 */
export type DeleteResult =
  | { ok: true }
  | { ok: false; errorMessage: string };

/** Slack 在籍確認の結果(確認不可=unknown を present と混同させない)。 */
export type SlackCheckResult =
  | { status: "present" }
  | { status: "absent" }
  | { status: "unknown"; errorMessage: string };

/** ネットワーク障害(fetch 自体が失敗)の共通文言。非2xx とは区別する。 */
const NETWORK_ERROR = "通信に失敗しました。ネットワークを確認して再試行してください。";

/** サーバーが返した明示エラーメッセージ(秘密を含まない列挙的文言)を取り出す。 */
function readServerMessage(body: unknown): string | null {
  if (typeof body === "object" && body !== null) {
    const message = (body as Record<string, unknown>).error;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return null;
}

/**
 * レスポンス body を安全に JSON パースする(非 JSON=HTML/テキストでも例外にしない)。
 * import-client.ts と同じ方針。パース失敗は null に退避する。
 */
async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * 非 2xx を人間語へ翻訳する。
 *
 * サーバーの `error` は英語の機械コード("server misconfigured" 等)なので**生のまま表示しない**。
 * 既知コードだけ日本語へ写し(translateJobcanServerError)、未知(検証エラーの生 err.message 等)は
 * HTTP ステータスベースの日本語へ落とす(describeHttpError に serverMessage を渡さない)。
 * これで英語コードが画面に露出しない。翻訳の本体は packages の純関数に集約(テスト可能)。
 */
function translateHttpError(
  status: number,
  body: unknown,
  fallback: string,
): string {
  const serverCode = readServerMessage(body);
  const known = serverCode ? translateJobcanServerError(serverCode) : null;
  if (known) return known;
  return describeHttpError(status, undefined, fallback);
}

/** 名簿全件を取得する。 */
export async function fetchStaff(): Promise<ListResult> {
  let response: Response;
  try {
    response = await fetch("/api/staff");
  } catch {
    return { ok: false, errorMessage: NETWORK_ERROR };
  }
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      errorMessage: translateHttpError(
        response.status,
        body,
        "名簿の取得に失敗しました。",
      ),
    };
  }
  const entries =
    (body as { entries?: StaffDirectoryEntry[] } | null)?.entries ?? [];
  return { ok: true, entries };
}

/** 名簿へ登録/更新する。overwrite:true で既存別 email を上書き。 */
export async function upsertStaff(
  staffCode: string,
  email: string,
  overwrite: boolean,
): Promise<UpsertResult> {
  let response: Response;
  try {
    response = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffCode, email, overwrite }),
    });
  } catch {
    return { ok: false, conflict: false, errorMessage: NETWORK_ERROR };
  }
  const body = await parseJsonSafe(response);
  if (response.status === 409) {
    const existing =
      typeof body === "object" && body !== null
        ? String((body as Record<string, unknown>).existingEmail ?? "")
        : "";
    return { ok: false, conflict: true, existingEmail: existing };
  }
  if (!response.ok) {
    return {
      ok: false,
      conflict: false,
      errorMessage: translateHttpError(
        response.status,
        body,
        "登録に失敗しました。",
      ),
    };
  }
  return { ok: true, entry: { staffCode, email } };
}

/** 名簿から削除する。 */
export async function deleteStaff(staffCode: string): Promise<DeleteResult> {
  let response: Response;
  try {
    response = await fetch(`/api/staff?code=${encodeURIComponent(staffCode)}`, {
      method: "DELETE",
    });
  } catch {
    return { ok: false, errorMessage: NETWORK_ERROR };
  }
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      errorMessage: translateHttpError(
        response.status,
        body,
        "削除に失敗しました。",
      ),
    };
  }
  return { ok: true };
}

/** email が Slack ワークスペースにいるか確認する。502=確認不可は unknown で返す。 */
export async function checkSlack(email: string): Promise<SlackCheckResult> {
  let response: Response;
  try {
    // email はクエリではなく JSON body で送る(URL/アクセスログに PII を残さない)。
    response = await fetch("/api/staff/slack-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch {
    return {
      status: "unknown",
      errorMessage: "通信に失敗しました。Slack 確認をやり直してください。",
    };
  }
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    return {
      status: "unknown",
      errorMessage:
        response.status === 502
          ? "Slack に問い合わせできませんでした(在籍の有無は確認できません)。"
          : translateHttpError(response.status, body, "Slack 確認に失敗しました。"),
    };
  }
  const present =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).present === true
      : false;
  return { status: present ? "present" : "absent" };
}
