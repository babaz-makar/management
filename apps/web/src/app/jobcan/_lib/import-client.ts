/**
 * 取込画面(page.tsx)のクライアント側ロジック。
 *
 * - import-ui API(同一オリジン)への POST と、レスポンス/エラーの人間語翻訳。
 * - クライアント側の事前サイズ/件数チェック(サーバー validateUploadLimits が最終権威。
 *   ここはアップロード前の軽い事前警告目的)。
 *
 * ⚠️ 重要: packages の validateUploadLimits は crypto を含む同一ファイルに同居するため
 * import しない(client バンドルへ crypto が混入するのを避ける)。上限値だけを定数として
 * ここに持ち、size/件数の比較のみを純粋に行う。
 */
import type {
  JobcanImportSummary,
  JobcanImportFileError,
  JobcanStaffWarning,
} from "@management/shift-management";
import { describeHttpError } from "@management/shift-management/ui";

/** xlsx 変換に失敗したファイル(route が conversionErrors として返す)。 */
export interface ConversionError {
  fileName: string;
  message: string;
}

/** import-ui / import が成功時に返す JSON(route が flatten した形)。 */
export interface ImportResponse {
  dryRun: boolean;
  summary: JobcanImportSummary;
  fileErrors: JobcanImportFileError[];
  warnings: JobcanStaffWarning[];
  reconcileError: string | null;
  conversionErrors: ConversionError[];
  message: string;
}

// --- クライアント側 事前上限(サーバー DEFAULT_UPLOAD_LIMITS と同値。権威はサーバー) ---
const MAX_FILES = 50;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

/** 事前チェックの結果(超過理由を人間語で持つ。ブロックはせず警告表示に使う)。 */
export interface ClientLimitWarning {
  kind: "too_many_files" | "file_too_large" | "total_too_large";
  message: string;
}

/** バイト数を MB 表記へ(表示用)。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 選択ファイルの件数/サイズを事前検証する(crypto 非依存の純ロジック)。
 * サーバーが最終権威なので、ここでは超過を「警告」として返すだけでブロックしない。
 */
export function checkClientLimits(files: readonly File[]): ClientLimitWarning[] {
  const warnings: ClientLimitWarning[] = [];
  if (files.length > MAX_FILES) {
    warnings.push({
      kind: "too_many_files",
      message: `ファイル数が上限(${MAX_FILES}件)を超えています。現在 ${files.length}件`,
    });
  }
  let total = 0;
  for (const file of files) {
    const size = Number.isFinite(file.size) && file.size > 0 ? file.size : 0;
    total += size;
    if (size > MAX_FILE_BYTES) {
      warnings.push({
        kind: "file_too_large",
        message: `${file.name} が 1ファイル上限(${formatBytes(MAX_FILE_BYTES)})を超えています(${formatBytes(size)})`,
      });
    }
  }
  if (total > MAX_TOTAL_BYTES) {
    warnings.push({
      kind: "total_too_large",
      message: `合計サイズが上限(${formatBytes(MAX_TOTAL_BYTES)})を超えています(${formatBytes(total)})`,
    });
  }
  return warnings;
}

/** 選択ファイルの合計サイズ。 */
export function totalSize(files: readonly File[]): number {
  return files.reduce(
    (sum, f) => sum + (Number.isFinite(f.size) && f.size > 0 ? f.size : 0),
    0,
  );
}

/** HTTP ステータス + エラー body を人間語へ翻訳する(秘密は含めない)。 */
function translateError(status: number, body: unknown): string {
  const record =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  if (status === 401) {
    return "認証に失敗しました。この画面は保護された管理画面からのみ操作できます。";
  }
  if (status === 413) {
    return "アップロード容量が上限を超えています。ファイル数・サイズを減らして再試行してください。";
  }
  if (status === 400) {
    if (record.error === "no files uploaded") {
      return "ファイルが選択されていません。";
    }
    return "リクエストが不正です。";
  }
  if (status === 500) {
    const missing = record.missing;
    if (Array.isArray(missing) && missing.length > 0) {
      return `サーバー設定が未完了です(未設定: ${missing.join(", ")})。管理者に連絡してください。`;
    }
    if (record.error === "server misconfigured") {
      return "サーバー設定が未完了です。管理者に連絡してください。";
    }
    return "取込処理でサーバーエラーが発生しました。時間をおいて再試行してください。";
  }
  // 取込固有の特例(上記)に当たらない汎用ステータスは共通純関数へ委譲する。
  // <400 の想定外だけは従来どおりステータス番号を添えて返す。
  return describeHttpError(
    status,
    undefined,
    `想定外の応答(HTTP ${status})が返りました。`,
  );
}

/** import-ui への POST 結果(成功=result / 失敗=errorMessage)。 */
export type ImportPostResult =
  | { ok: true; result: ImportResponse }
  | { ok: false; errorMessage: string };

/**
 * import-ui API へ multipart POST する。apply=true で本反映(サーバーが二重ゲートで最終判断)。
 * 通信エラー・非 2xx を握りつぶさず、人間語メッセージへ翻訳して返す。
 */
export async function postImport(
  files: readonly File[],
  apply: boolean,
): Promise<ImportPostResult> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);

  const url = apply ? "/api/jobcan/import-ui?apply=true" : "/api/jobcan/import-ui";
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", body: formData });
  } catch {
    return {
      ok: false,
      errorMessage: "通信に失敗しました。ネットワークを確認して再試行してください。",
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    return { ok: false, errorMessage: translateError(response.status, body) };
  }
  return { ok: true, result: body as ImportResponse };
}
