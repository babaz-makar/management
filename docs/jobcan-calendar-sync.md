ジョブカン → カレンダー反映モジュール 設計メモ
シフト変更ツール（Next.js / TypeScript, GitHub管理）へ、ジョブカンの確定シフトを各メンバーの個人カレンダーへ半自動反映する機能を 同一リポジトリのモジュールとして 追加するための設計。開発は Claude Code を使える社員が担当する前提。
1. 全体の流れ

```
[ジョブカン]
   │  ① 確定シフトをエクスポート（Claude in Chrome + 1Password でログイン→CSV/XLSX取得）
   ▼
[取込アダプタ ingestion]  ← 取込トリガーは差し替え可能（手動 / 定期 / 承認連動）
   │  ② CSV/XLSXをパース → 正規化 ShiftEntry[]
   ▼
[メンバーマッピング mapping]
   │  ③ ジョブカン社員 → ツールのメンバー → 本人のカレンダーID / OAuthトークン
   ▼
[差分計算 diff]
   │  ④ 「あるべき予定」と「今のカレンダー」を比較 → create / update / delete
   ▼
[承認 approval]  ← ユニットリーダーが確定を承認するとここが発火
   │
   ▼
[カレンダー書込 writer]
      ⑤ 本人のOAuthトークンで各自のGoogleカレンダーへ反映（旧予定は消して修正後に）

```

ポイント

* 書込の鍵は既存の仕組みを再利用：シフト変更ツールは既に Google OAuth（方式2, `calendar.events` スコープ）で各メンバー本人のトークンを保持している。Gmailメンバーでも本人トークンで本人カレンダーに書けるので、ドメイン委任も追加共有も不要。
* 取込（①〜②）と反映（③〜⑤）は分離。取込はブラウザ自動化で壊れやすいため、`ISource` インターフェースで差し替え可能にする（初期は手動ファイルインポート、後で定期実行や承認連動に置換できる）。
* 冪等性：予定に安定IDタグ（`extendedProperties.private.jobcanShiftId`）を付け、`calendar_event_link` テーブルで `googleEventId` を保持。再同期しても重複せず、修正時は旧予定を消して差し替えられる。

2. ファイル構成（既存リポジトリへの追加）
`＋` が新規追加。既存構成は Next.js App Router を想定（実際の構成に合わせて調整）。

```
shift-management/
├─ app/
│  ├─ (console)/
│  │  └─ shift/                         # 既存：シフト変更コンソール
│  ├─ jobcan-sync/                      ＋ 反映機能のUI
│  │  ├─ page.tsx                       ＋ 取込画面（CSV/XLSXアップロード・プレビュー）
│  │  ├─ preview/page.tsx               ＋ 差分プレビュー（create/update/deleteの確認）
│  │  └─ history/page.tsx               ＋ 同期履歴・監査ログ
│  └─ api/
│     ├─ auth/                          # 既存：Google OAuth
│     └─ jobcan-sync/                   ＋ APIルート
│        ├─ import/route.ts             ＋ エクスポートファイル受領→パース→ステージング
│        ├─ preview/route.ts            ＋ 差分計算（カレンダー現状 vs ステージング）
│        └─ apply/route.ts              ＋ 承認後：各メンバーのカレンダーへ書込
│
├─ src/
│  ├─ features/
│  │  ├─ shift/                         # 既存：シフトドメイン
│  │  └─ jobcan-sync/                   ＋ コアロジック（フレームワーク非依存）
│  │     ├─ ingestion/
│  │     │  ├─ types.ts                 ＋ RawJobcanRow / ShiftEntry 型定義
│  │     │  ├─ parse.ts                 ＋ ジョブカンCSV/XLSX → ShiftEntry[]
│  │     │  └─ sources/
│  │     │     ├─ ISource.ts            ＋ 取込ソースの共通IF（差し替え点）
│  │     │     └─ fileUpload.ts         ＋ 初期実装：手動ファイル取込
│  │     ├─ mapping/
│  │     │  └─ memberMap.ts             ＋ ジョブカン社員↔メンバー↔calendarId 解決
│  │     ├─ diff/
│  │     │  └─ computeDiff.ts           ＋ あるべき予定 vs 現状 → 差分
│  │     ├─ calendar/
│  │     │  ├─ eventMapper.ts           ＋ ShiftEntry → Googleイベント（IDタグ付与）
│  │     │  └─ writer.ts                ＋ 本人トークンで create/update/delete
│  │     ├─ approval/
│  │     │  └─ syncOrchestrator.ts      ＋ 承認→差分→書込→ログ を束ねる
│  │     └─ index.ts                    ＋ モジュール公開API
│  ├─ lib/
│  │  ├─ google/
│  │  │  ├─ oauthClient.ts              # 既存：トークンストア（再利用）
│  │  │  └─ calendarClient.ts           ＋/既存 googleapis ラッパ
│  │  └─ db/                            # 既存：DBアクセス
│  └─ ...
│
├─ prisma/  (or migrations/)
│  └─ schema.prisma                     ＋ 3テーブル追加（下記）
│
├─ docs/
│  ├─ 要件・構想.md                      # 既存
│  └─ jobcan-calendar-sync.md           ＋ この設計メモをリポジトリにも配置
└─ ...

```

3. データモデル追加（3テーブル）

```
jobcan_member_map      ジョブカン社員 ↔ メンバー の対応
  - jobcanEmployeeId   (ジョブカン側の社員コード)
  - memberId           (ツール内メンバーID)
  - calendarId         (＝本人のメール。書込先)
  - active

calendar_event_link    シフト1件 ↔ Googleイベント の対応（冪等性の要）
  - id
  - memberId
  - shiftDate
  - jobcanShiftId       (取込データ側の一意キー)
  - googleEventId        (書き込んだイベントのID)
  - status              (active / deleted)

sync_log               監査・トラブル追跡
  - id
  - runAt
  - triggeredBy          (承認者 = ユニットリーダー)
  - memberId
  - action               (create / update / delete)
  - result               (success / error) + message

```

4. 承認 → 反映のロジック（syncOrchestrator）

1. ユニットリーダーがシフト変更ツールで確定シフトを承認 → `apply` が発火。
2. 対象メンバーの `ShiftEntry[]`（ステージング済み）を取得。
3. `computeDiff` で「あるべき予定」と `calendar_event_link` の現状を突合し、`{create, update, delete}` を算出。
4. `writer` が 本人のOAuthトークン でGoogleカレンダーへ反映。
   * 旧予定は delete、修正後を create/update（要件「元の予定も消して修正後にさせる」に対応）。
   * すべての予定に `extendedProperties.private = { source: "jobcan-sync", jobcanShiftId }` を付与。
5. 結果を `calendar_event_link` と `sync_log` に記録。1件失敗しても他メンバーは継続（部分失敗を許容）。

5. 取込トリガー（開発者が選択）
`ISource` を実装すれば入口を差し替えられる。想定は3通り：

* 手動（初期推奨）：社員が Claude in Chrome + 1Password で各自のジョブカンからエクスポート → `jobcan-sync` 画面にアップロード。壊れにくく、まず動かせる。
* 承認連動：シフト変更ツールの確定承認をトリガーに取込を走らせる。
* 定期実行：毎日/毎週の定時に自動。※ 1Password for Claude 連携は現状 macOS のみ・Windows非対応の制約があるため、実行環境に注意。

初期は `fileUpload.ts` だけ実装し、他は後追いで追加すれば足りる。
6. 実装前に確認・注意したい点

* OAuthスコープ：既存トークンが `calendar.events`（書込）を含むか。読み取りのみだと書けないので、含まなければ再同意フローが必要。
* トークン失効：Workspace外（Gmail）ユーザー相手でGoogle Cloudアプリが「テスト」状態だと、リフレッシュトークンが7日で失効。継続運用にはアプリの本番公開（Google審査）が必要。
* メンバーマッピングの初期整備：ジョブカンの社員コードとツール内メンバー・カレンダーIDの対応表を最初に作る必要がある（`jobcan_member_map`）。
* タイムゾーン：全カレンダーが Asia/Tokyo。イベント生成時に固定する。
* 削除の安全策：`extendedProperties` タグ付きイベントのみを delete 対象にし、本人が手で入れた予定を消さないようにする。

7. デプロイ / レビュー運用（Vercel + GitHub）
開発中も本番は止まらない

* デプロイ済みのシフト変更ツール（shift-management ブランチ = 本番ライン）はそのまま稼働継続。
* 開発は作業ブランチ `feature/jobcan-calendar-sync` で行い、Vercel が ブランチごとにプレビューURL を自動発行。ここでジョブカン反映機能だけを実URLで検証してからマージする。

プレビュー時の重要注意（カレンダー書込）

* プレビュー環境でも `writer` が動くと 本物のGoogleカレンダーに実イベントが書き込まれる（サンドボックスではない）。誤って社員の本番カレンダーを汚さないため、検証時は次のいずれかを徹底する：
   * テスト用メンバー / テスト用カレンダーに対してのみ実行する
   * `DRY_RUN` 環境変数を用意し、プレビューでは書込せず差分ログのみ出す実装にする
* プレビューが本番DBを共有する場合、書込は「新テーブル追加のみ」なので既存には無害。ただし可能ならプレビュー用DBを分けるのが安全。

マージ承認フロー（最終承認者：babaz-makar）
GitHub のブランチ保護で、shift-management ブランチへのマージに承認を必須化する。

* Settings → Branches → Branch protection rules で対象を `shift-management`（本番ライン）に設定
   * ✅ Require a pull request before merging（直push禁止・PR必須）
   * ✅ Require approvals（最低1）
   * ✅ Require review from Code Owners
* CODEOWNERS ファイルを追加して、対象パスのレビュー担当を babaz-makar に固定：


```
# .github/CODEOWNERS
/src/features/jobcan-sync/   @babaz-makar
/app/jobcan-sync/            @babaz-makar
/app/api/jobcan-sync/        @babaz-makar
# ブランチ全体を対象にしたい場合は次の1行でも可
*                            @babaz-makar

```

これで、該当変更を含むPRは自動的に babaz-makar のレビュー要求が付き、babaz-makar が Approve するまでマージできない状態になる。
