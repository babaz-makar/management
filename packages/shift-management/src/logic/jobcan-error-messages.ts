/**
 * jobcan API がレスポンス body の `error` フィールドで返す **英語の機械コード** を、
 * 利用者向けの日本語(一般化文言)へ翻訳する純関数。
 *
 * 背景: サーバーの `error` は "server misconfigured" のようなプログラム用の英語識別子で、
 * 利用者に見せる文言ではない。UI がこれを生のまま表示すると英語が露出する(名簿の
 * DB 未設定時に "server misconfigured" が画面に出た事故)。既知コードだけを日本語へ写し、
 * 未知(検証エラーの生 err.message 等)は null を返して、呼び出し側で HTTP ステータス
 * ベースの日本語文言に落とす。=生の英語がユーザーに出ないことを保証する。
 *
 * 情報量は増やさない: 接続文字列・env 名・スタック・生の英語は出さず、一般化する。
 * 依存ゼロ。client 安全バレル(../ui)経由で公開する。エラーの意味・HTTP ステータス・
 * API のレスポンス形は一切変えない(これは表示文字列の写像のみ)。
 */

/** サーバーの既知エラーコード(英語)→ 利用者向け日本語(一般化)。 */
const SERVER_ERROR_MESSAGES: Record<string, string> = {
  "server misconfigured": "サーバー設定に問題があります。管理者に連絡してください。",
  "operation failed": "処理に失敗しました。時間をおいて再試行してください。",
  "import failed": "取込に失敗しました。時間をおいて再試行してください。",
  "could not verify": "確認できませんでした。時間をおいて再試行してください。",
  "staffCode is required": "社員コードを指定してください。",
  "already registered": "この社員コードは既に登録されています。",
  unauthorized: "権限がありません(管理画面から操作してください)。",
  "no files uploaded": "ファイルが選択されていません。",
  "payload too large": "データが大きすぎます。内容を減らして再試行してください。",
};

/**
 * サーバーが返した `error` コードを日本語へ翻訳する。
 * 既知コードなら日本語文言、未知(生の英語検証メッセージ・空白等)は null。
 */
export function translateJobcanServerError(code: string): string | null {
  const key = code.trim();
  if (key.length === 0) return null;
  return SERVER_ERROR_MESSAGES[key] ?? null;
}
