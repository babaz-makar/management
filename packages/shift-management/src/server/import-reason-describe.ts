/**
 * 取込 UI(2-8b)向け: 機械可読 reason を人間向け日本語へ変換する純関数。
 *
 * import-ui / staff API が返す各 reason(route レベルの拒否理由、per-staff の
 * warning 理由、per-file の fileError 理由、xlsx 変換失敗)を UI がそのまま
 * 表示できるようにする。exceljs / fetch 非依存(文字列マップのみ)。
 *
 * 方針:
 *   - 既知 reason は固定の日本語文言。原因の一次切り分けができる粒度にする。
 *   - 未知 reason でも空文字/例外を返さず、無難な既定文言に落とす(UI をクラッシュさせない)。
 *   - 秘密情報は一切含めない(reason は列挙値であり値ではない)。
 */

/** reason → 日本語文言の対応表。route/warning/fileError の各カテゴリを1表に集約する。 */
const REASON_MESSAGES: Record<string, string> = {
  // --- route レベル(import-ui / import の拒否理由) ---
  unauthorized: "認証に失敗しました(管理画面から実行してください)",
  payload_too_large: "アップロード容量が上限を超えています",
  file_too_large: "1ファイルのサイズが上限を超えています",
  too_many_files: "一度にアップロードできるファイル数の上限を超えています",
  total_too_large: "アップロード合計サイズが上限を超えています",
  secret_not_configured:
    "サーバー設定が未完了です(取込シークレット未設定)。管理者に連絡してください",

  // --- per-staff の warning(その人だけスキップし他は継続) ---
  email_not_registered:
    "email が未登録のためスキップしました(スタッフ名簿に追加してください)",
  directory_error:
    "名簿の引き当てに失敗したためスキップしました(DB 障害の可能性)。他の人の処理は継続しました",
  slack_not_found:
    "Slack ワークスペースに見つからないためスキップしました(未在籍の可能性)",
  google_not_linked:
    "Google カレンダー未連携のためスキップしました",
  resolve_error:
    "トークン解決に失敗したためスキップしました(Slack API 障害の可能性)",
  reconcile_error:
    "カレンダー突合に失敗したためスキップしました(Google カレンダー API 障害の可能性)。他の人の処理は継続しました",

  // --- per-file の fileError(そのファイルだけ隔離し他は継続) ---
  filename_parse_error:
    "ファイル名から対象月・スタッフコードを読み取れませんでした",
  sheet_parse_error:
    "シートの内容を解釈できませんでした(様式が想定と異なる可能性)",
  staff_code_mismatch:
    "ファイル名のスタッフコードとシート内の情報が一致しませんでした",
  unexpected_error:
    "このファイルの処理中に想定外のエラーが発生しました(他のファイルの処理は継続しました)",
  conversion_error:
    "xlsx の読み込みに失敗しました(ファイルが壊れているか様式が異なる可能性)",
};

/** 表記ゆれ(スペース区切りの route エラー field)を canonical キーへ寄せる。 */
const REASON_ALIASES: Record<string, string> = {
  "payload too large": "payload_too_large",
};

/** 未知・空 reason 用の既定文言(空文字/例外を返さないための安全弁)。 */
const FALLBACK_MESSAGE = "処理中に問題が発生しました(詳細は不明です)";

/**
 * reason を人間向け日本語へ変換する。
 * 未知 reason・空文字でも例外を投げず、無難な既定文言を返す。
 */
export function describeImportReason(reason: string): string {
  const key = typeof reason === "string" ? reason.trim() : "";
  const canonical = REASON_ALIASES[key] ?? key;
  return REASON_MESSAGES[canonical] ?? FALLBACK_MESSAGE;
}
