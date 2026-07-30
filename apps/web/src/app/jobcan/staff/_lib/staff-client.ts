/**
 * スタッフ名簿画面(staff/page.tsx)のクライアント側ロジック。
 * 同一オリジンの /api/staff・/api/staff/slack-check を叩き、結果/エラーを人間語へ翻訳する。
 */
import type { StaffDirectoryEntry } from "@management/shift-management";

/** staffCode の形式(大文字英字1 + 数字4桁)。UI 即時バリデーション用。 */
export const STAFF_CODE_PATTERN = /^[A-Z]\d{4}$/;

export function isValidStaffCode(code: string): boolean {
  return STAFF_CODE_PATTERN.test(code);
}

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

function readError(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const message = (body as Record<string, unknown>).error;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

/** 名簿全件を取得する。 */
export async function fetchStaff(): Promise<ListResult> {
  try {
    const response = await fetch("/api/staff");
    const body = (await response.json()) as unknown;
    if (!response.ok) {
      return {
        ok: false,
        errorMessage: readError(body, "名簿の取得に失敗しました。"),
      };
    }
    const entries = (body as { entries?: StaffDirectoryEntry[] }).entries ?? [];
    return { ok: true, entries };
  } catch {
    return { ok: false, errorMessage: "通信に失敗しました。再試行してください。" };
  }
}

/** 名簿へ登録/更新する。overwrite:true で既存別 email を上書き。 */
export async function upsertStaff(
  staffCode: string,
  email: string,
  overwrite: boolean,
): Promise<UpsertResult> {
  try {
    const response = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffCode, email, overwrite }),
    });
    const body = (await response.json()) as unknown;
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
        errorMessage: readError(body, "登録に失敗しました。"),
      };
    }
    return { ok: true, entry: { staffCode, email } };
  } catch {
    return {
      ok: false,
      conflict: false,
      errorMessage: "通信に失敗しました。再試行してください。",
    };
  }
}

/** 名簿から削除する。 */
export async function deleteStaff(staffCode: string): Promise<DeleteResult> {
  try {
    const response = await fetch(
      `/api/staff?code=${encodeURIComponent(staffCode)}`,
      { method: "DELETE" },
    );
    const body = (await response.json()) as unknown;
    if (!response.ok) {
      return { ok: false, errorMessage: readError(body, "削除に失敗しました。") };
    }
    return { ok: true };
  } catch {
    return { ok: false, errorMessage: "通信に失敗しました。再試行してください。" };
  }
}

/** email が Slack ワークスペースにいるか確認する。502=確認不可は unknown で返す。 */
export async function checkSlack(email: string): Promise<SlackCheckResult> {
  try {
    const response = await fetch(
      `/api/staff/slack-check?email=${encodeURIComponent(email)}`,
    );
    const body = (await response.json()) as unknown;
    if (!response.ok) {
      return {
        status: "unknown",
        errorMessage:
          response.status === 502
            ? "Slack に問い合わせできませんでした(在籍の有無は確認できません)。"
            : readError(body, "Slack 確認に失敗しました。"),
      };
    }
    const present =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).present === true
        : false;
    return { status: present ? "present" : "absent" };
  } catch {
    return {
      status: "unknown",
      errorMessage: "通信に失敗しました。Slack 確認をやり直してください。",
    };
  }
}
