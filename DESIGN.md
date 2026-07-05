# shift-management 設計書

Slackのシフト変更報告を起点に、各スタッフの個人Googleカレンダーへシフト変更を自動反映するツール。
`packages/shift-management`（このモノレポ）で開発し、最終的に本アプリへ結合する。

## 決定事項（経緯サマリ）

| 論点 | 決定 |
| --- | --- |
| 入口 | Slackのシフト変更報告チャンネル（自動）。ジョブカンCSVは将来の整合性チェック用に保留 |
| 承認 | ツールでは行わない。承認はULがジョブカン上で実施（既存フロー、ツールは関与しない） |
| コンソールUI | 不要。確認・結果通知はSlackスレッド返信で完結 |
| 反映タイミング | 報告メッセージが投稿された時点で即反映 |
| 反映先 | 各スタッフの個人Googleカレンダー |
| 認証 | **各自OAuth方式**（Workspace委任は使わない）。初回のみ各スタッフが同意 |
| メール解決 | 手動対応表なし。**報告者のSlackプロフィールのメールアドレス**から自動取得 |
| 反映対象 | 確定シフトではなく「変更を依頼したシフト」 |

## 全体フロー

```
Slack変更報告チャンネルに投稿
 → Slackイベント受信（API route）
 → パース（正規表現 → 失敗時のみClaude APIフォールバック）
 → 報告者のSlackプロフィールからメールアドレスを取得（users.info）
 → メールに紐づくOAuthトークンを取得（未登録なら同意リンクをスレッド返信して終了）
 → 個人カレンダーをupsert
     1. extendedProperties.private.shiftId が一致する既存イベントを検索 → あれば削除
     2. なければ「変更前の時間帯」に一致する予定を検索 → 1件だけ一致なら削除
     3. 一致0件 or 複数件なら削除しない（新予定のみ作成し、スレッドで手動削除を依頼）
     4. 変更後の予定を作成（shiftId付き）
 → 報告メッセージのスレッドに結果を返信 ＋ ✅リアクション
```

失敗時（パース不能・OAuth未登録・カレンダーAPIエラー）は
スレッドに ⚠️ と理由・再投稿テンプレを返信する。**黙って失敗しない**こと。

## 報告文フォーマット（実サンプルより）

社内で既に定着しているテンプレ：

```
@tanaka(rui)
お疲れ様です。
シフト変更お願いします！

【シフト変更依頼】
6/30 16:00〜22:00→12:00〜18:00

【変更理由】
定例等があるため
```

### パース仕様

- 対象者 = **投稿者本人**（Slack user id）。本文中の @メンションはUL宛の承認依頼なので無視
- `【シフト変更依頼】` ブロックから `日付 変更前開始〜変更前終了→変更後開始〜変更後終了` を抽出
  - 想定正規表現（揺れ吸収込み）:
    `(\d{1,2})[\/月](\d{1,2})日?\s*(\d{1,2}:\d{2})\s*[〜~-]\s*(\d{1,2}:\d{2})\s*(?:→|->|⇒)\s*(\d{1,2}:\d{2})\s*[〜~-]\s*(\d{1,2}:\d{2})`
  - 全角数字・全角コロンは正規化してからマッチ
- 年の補完: メッセージのタイムスタンプ基準。報告月より2ヶ月以上前の月なら翌年と判定（12月に「1/5」→翌年1/5）
- `【変更理由】` はカレンダーイベントのdescriptionに転記（任意項目）
- 1メッセージに複数行の変更依頼がある可能性を考慮し、戻り値は `ShiftChange[]`
- 正規表現で取れない場合のみ Claude API にフォールバック（構造化JSON出力、confidence低なら⚠️返信扱い）

## 型定義

```typescript
export interface ShiftTime {
  date: string;        // "2026-06-30" (年補完済みISO)
  startTime: string;   // "16:00"
  endTime: string;     // "22:00"
}

export interface ShiftChange {
  id: string;              // slackMessageTs + 行番号（冪等性キー）
  kind: "modify" | "add" | "cancel";  // 現テンプレはmodifyのみ。将来拡張
  slackUserId: string;
  before?: ShiftTime;
  after?: ShiftTime;
  reason?: string;
  sourceMessageTs: string; // スレッド返信・重複排除に使用
  channelId: string;
}

export interface StaffToken {
  googleEmail: string;      // OAuth同意時に取得（照合キー）
  refreshToken: string;     // 暗号化して保存
  consentedAt: string;
}
```

## Googleカレンダー連携

- **認証: 各スタッフのOAuth同意方式**
  - Google Cloudで OAuthクライアント（Webアプリ）を作成。scope: `https://www.googleapis.com/auth/calendar.events` ＋ `email`
  - 初回フロー: 未登録のスタッフが報告 → Botがスレッドに同意URLを返信 → スタッフが同意 → コールバックで refresh token とGoogleメールを保存 → 以後は自動反映
  - **照合ルール**: OAuth時に取得したGoogleメール ＝ Slackプロフィールのメール で紐付ける。
    不一致（Slackが会社メール・カレンダーが個人Gmail等）の場合は同意時に警告し、Slackメール側をキーに紐付けを保存する
  - refresh token は暗号化して保存し、アクセストークンは都度リフレッシュ
  - **注意: OAuth同意画面が「テスト」状態だと refresh token が7日で失効する。**
    社内運用でも「本番」に公開すること（Calendarはセンシティブスコープのため未検証だと同意画面に警告が出るが、社内利用なら許容可。ユーザー上限100人）
- イベント作成時に必ず付与:
  ```json
  { "extendedProperties": { "private": { "shiftId": "<slackUserId>:<date>", "managedBy": "shift-management" } } }
  ```
- upsert検索は `events.list` の `privateExtendedProperty=shiftId=...` を使用（calendarId は `primary`）
- イベントタイトル例: `シフト 12:00-18:00`、description に変更理由と元Slackメッセージへのリンク

## Slack連携

- 取得方式は2択（運用環境が決まってから選択）:
  - **Events API**（リアルタイム、公開URLが必要）… `message` イベント購読
  - **ポーリング**（`conversations.history` を数分間隔、デプロイ制約が緩い）
- 必要スコープ: `channels:history`, `chat:write`, `reactions:write`, `users:read`, **`users:read.email`**（報告者のメール取得に必須）
- **冪等性**: メッセージ `ts` を処理済みとして永続化し、二重反映を防ぐ
- メッセージ編集（`message_changed`）: v1では対象外。編集されたら再投稿を促す運用
- Bot自身の投稿・スレッド返信は無視する

## モノレポ内の配置

CLAUDE.mdの規約（パッケージはreact依存のみ・相対import・バレル集約）に従い、
サーバー処理はパッケージに入れない。

```
packages/shift-management/src/
├── index.ts                 # バレル
├── types.ts
├── parsers/
│   └── slack-report.ts      # 純関数: (text, messageDate) => ShiftChange[]
├── logic/
│   ├── date-complete.ts     # 年補完
│   └── normalize.ts         # 全角→半角等の正規化
└── __tests__/               # パーサーは必ずテストを書く（実サンプル文面を使用）

apps/web/app/api/
├── slack/events/route.ts    # Slack受信（署名検証込み）
├── google/oauth/route.ts    # 同意開始URL生成 + コールバック（token保存）
└── internal/                # カレンダー操作・Claude APIフォールバック
```

- パーサー・年補完・正規化は**副作用なしの純関数**にする（本アプリ結合時にそのままコピーするため）
- Slack SDK / googleapis 等の依存は apps/web 側にのみ追加する

## 実装フェーズ

1. **types + slack-reportパーサー + テスト**（外部依存ゼロ、実サンプルで検証）
2. **カレンダーupsertモジュール**（OAuthフロー＋トークン保存、shiftId方式、削除候補の安全判定）
3. **Slack受信**（Events API or ポーリング）＋ スレッド返信・リアクション
4. **安全装置**: 冪等性ストア、Claude APIフォールバック、エラー時の⚠️返信テンプレ

## 未確定・要準備

- [ ] Google CloudプロジェクトとOAuthクライアントの作成（同意画面は「本番」公開にする）
- [ ] Slack App作成の権限（ワークスペース管理者承認の要否）。`users:read.email` を含むこと
- [ ] Slackプロフィールにメールアドレスが全員分入っているかの確認
- [ ] Slack取得方式の選択（デプロイ先が決まってから）
- [ ] 処理済みts・OAuthトークンの保存先（初期はSQLiteで可、トークンは暗号化必須。本アプリ結合時にDBへ）
