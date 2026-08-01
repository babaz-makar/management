# シフトリマインド機能

Googleカレンダーの「SHO-SANシフト」予定を読み取り、**前日21:00（翌日分）** と **当日08:00（当日分）** に Slack チャンネルへ投稿して対象者をメンションする機能。

シフト変更ツール（Slack投稿 → カレンダー反映）の逆方向で、同じ OAuth トークンと同じタイトル定数を共有する。

**対象メンバーはチャンネル単位。** Bot をチャンネルに招待したときに参加者から選び、あとから参加した人はボタン1つで追加できる。

---

## 1. Phase 0：着手前の確認（結果）

| 確認項目 | 結果 |
|---|---|
| 親元ツールの Google OAuth スコープ | ✅ `https://www.googleapis.com/auth/calendar`（フル）。カレンダー読み取り可、追加申請不要（[google-calendar.ts](../packages/shift-management/src/server/google-calendar.ts) の `getAuthUrl`） |
| refresh token の7日失効 | ✅ 同意画面が本番公開済みなので発生しない |
| Slack のインストール済みアプリ数 | ⬜ **人間の確認が必要**（無料プランはワークスペース全体で10個上限） |
| Vercel のプラン | ⬜ **人間の確認が必要**（Hobbyは各cron 1日1回まで、かつ発火が指定「時」の中でズレる） |

---

## 2. 使い方（運用の流れ）

```
1. Bot を通知したいチャンネルに招待
      ↓
2. Bot が「対象メンバーを選んでください」と投稿（参加者が初期選択済み）
      ↓
3. ボタンから Modal を開き、不要な人を外して保存
      ↓
4. 未連携の人にはカレンダー連携リンクが提示される → 各自が認証
      ↓
5. 前日21時 / 当日8時に、そのチャンネルの対象メンバーのシフトが投稿される
```

- **あとから人が参加したとき** … Bot が「対象に追加しますか？」とボタン付きで聞く。押すだけで追加され、未連携なら連携リンクも出る
- **人が退出したとき** … 自動で対象から外す（見えないチャンネルでメンションされ続けないように）
- **Bot を外したとき** … そのチャンネルへの通知が止まる。登録メンバーは残るので、再招待すれば選び直し不要

### スラッシュコマンド（実行したチャンネルに対して効く）

| コマンド | 動作 |
|---|---|
| `/shift-remind setup` | 対象メンバーを選ぶ Modal を開く |
| `/shift-remind add @山田 @佐藤` | 対象メンバーを追加（Modalを開かずに素早く） |
| `/shift-remind remove @山田` | 対象メンバーを外す |
| `/shift-remind list` | 対象メンバーと連携状況を一覧表示 |
| `/shift-remind test` | 明日分の通知文をプレビュー（**送信しない**） |
| `/shift-remind test today` | 当日分の通知文をプレビュー |

`test` はカレンダー取得を伴うため、結果は `response_url` 経由の遅延応答で返す。メンバーが多いと Slack 側に一瞬タイムアウト表示が出ることがあるが、結果は後から必ず届く。

---

## 3. 構成

```
Vercel Cron (0 12 * * * UTC = JST 21:00) ─┐
Vercel Cron (0 23 * * * UTC = JST 08:00) ─┴─→ /api/cron/shift-remind?timing=...
                                               │
                                               ├─ notification_targets から通知先チャンネルを列挙
                                               ├─ channel_members × tokens で各チャンネルの対象メンバー取得
                                               ├─ 人単位で重複排除して Calendar API を並列呼び出し
                                               │    └─「SHO-SANシフト」を含む予定を抽出
                                               ├─ notification_logs で送信枠を予約（UNIQUE制約）
                                               ├─ チャンネルごとに chat.postMessage（1通にまとめる）
                                               ├─ 成功なら sent、失敗なら予約を解放して次回再送
                                               └─ （前日夜のみ）未連携メンバーへ連携依頼

/api/slack/shift-remind/events        … Bot/メンバーの参加・退出（対象メンバー決定の入口）
/api/slack/shift-remind/commands      … /shift-remind コマンド
/api/slack/shift-remind/interactions  … ボタン押下・Modal 送信
```

### ファイル

| パス | 役割 |
|---|---|
| [remind/is-shift.ts](../packages/shift-management/src/remind/is-shift.ts) | タイトル正規化＋キーワード判定（純関数） |
| [remind/target-date.ts](../packages/shift-management/src/remind/target-date.ts) | JST基準の対象日算出・日付ラベル・取得範囲（純関数） |
| [remind/format-message.ts](../packages/shift-management/src/remind/format-message.ts) | 通知文・連携依頼文の組み立て（純関数） |
| [remind/views.ts](../packages/shift-management/src/remind/views.ts) | Modal / ボタン（Block Kit）と送信値のパース |
| [server/remind-calendar.ts](../packages/shift-management/src/server/remind-calendar.ts) | Calendar API 呼び出し（リトライ・終日除外・401判定） |
| [server/slack-remind.ts](../packages/shift-management/src/server/slack-remind.ts) | 専用Botの Slack API ラッパー（投稿・Modal・参加者取得） |
| [server/remind-store.ts](../packages/shift-management/src/server/remind-store.ts) | 永続化層のインターフェース |
| [server/remind-runner.ts](../packages/shift-management/src/server/remind-runner.ts) | 実行本体（取得 → 予約 → 送信 → 確定） |
| [apps/web/src/lib/remind-store-neon.ts](../apps/web/src/lib/remind-store-neon.ts) | Neon 実装・DDL |
| [apps/web/src/lib/remind-config.ts](../apps/web/src/lib/remind-config.ts) | 環境変数 |
| [apps/web/src/lib/remind-ui.ts](../apps/web/src/lib/remind-ui.ts) | Modal を開く処理（コマンドとボタンで共用） |

---

## 4. セットアップ手順

### 4-1. Slack App を新規作成（既存のシフト変更Botとは分ける）

分ける理由：表示名・アイコンを分けられる／スコープを最小化できる／障害の切り分けが楽。

1. <https://api.slack.com/apps> で **Create New App**（名前例：`シフトリマインド`）
2. **OAuth & Permissions → Bot Token Scopes** に追加
   | スコープ | 用途 |
   |---|---|
   | `chat:write` | メッセージ送信 |
   | `commands` | スラッシュコマンド |
   | `users:read` | Bot・削除済みユーザーを除外して参加者を提案する |
   | `channels:read` | **公開**チャンネルの参加者取得・参加/退出イベント |
   | `groups:read` | **非公開**チャンネルでも使う場合 |
   | `chat:write.public` | 未参加チャンネルにも投稿する場合（通常は招待するので不要） |
3. **Event Subscriptions** を ON
   - Request URL: `https://<本番URL>/api/slack/shift-remind/events`
   - Subscribe to bot events: **`member_joined_channel`** と **`member_left_channel`**
4. **Interactivity & Shortcuts** を ON
   - Request URL: `https://<本番URL>/api/slack/shift-remind/interactions`
5. **Slash Commands** に登録
   - Command: `/shift-remind`（**同一ワークスペースで同じコマンド名は登録できない**ので既存と重複しない名前にする）
   - Request URL: `https://<本番URL>/api/slack/shift-remind/commands`
6. **Install to Workspace** → `xoxb-` トークンを控える
7. アイコンと表示名を既存Botと明確に変える

> Slack User ID（`U0123ABCD`）はワークスペース単位で一意なので、既存ツールが持っている `slack_user_id` はそのまま使える。別になるのは Bot User ID とトークン・Signing Secret だけ。

### 4-2. 環境変数（Vercel）

| 変数 | 必須 | 内容 |
|---|---|---|
| `SLACK_REMIND_BOT_TOKEN` | ✅ | 新規Botの `xoxb-` トークン。**既存の `SLACK_BOT_TOKEN` とは共有しない** |
| `SLACK_REMIND_SIGNING_SECRET` | ✅ | 新規App の Signing Secret |
| `CRON_SECRET` | ✅ | 任意の長いランダム文字列。Vercel Cron が `Authorization: Bearer` で送ってくる値の検証に使う |
| `DATABASE_URL` | ✅ | 既存の Neon 接続文字列（そのまま流用） |
| `APP_URL` | ✅ | 既存変数。カレンダー連携リンクの生成に使う。**未設定だと未連携メンバーへの連携依頼が出ない** |
| `SLACK_REMIND_ADMIN_CHANNEL_ID` | – | 警告・エラーの通知先。未設定なら console だけ |
| `SLACK_REMIND_CHANGE_CHANNEL` | – | 「変更がある場合は〜まで」に出す表記。`C0123ABCD` を入れるとリンクになる |
| `GOOGLE_CALENDAR_ID` | – | 既存変数。個別設定が無いメンバーの既定カレンダー |

`CRON_SECRET` を設定していないと cron エンドポイントは 500 を返す（外部から叩かれて通知が乱発するのを防ぐため、未設定では動かさない）。

### 4-3. DB

テーブルは初回アクセス時に自動作成される（`CREATE TABLE IF NOT EXISTS`）。手動で流すなら以下。

```sql
-- 通知先チャンネル。Bot招待時に登録、Bot退出時に enabled=false
CREATE TABLE IF NOT EXISTS notification_targets (
  channel_id TEXT PRIMARY KEY,
  label      TEXT,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE
);

-- チャンネルごとの対象メンバー。「誰に通知するか」はチャンネル単位で明示的に決める
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id    TEXT NOT NULL,
  slack_user_id TEXT NOT NULL,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, slack_user_id)
);

-- メンバーの個人設定。tokens に列を足さないのは refresh_token NOT NULL のため
-- （未連携メンバーの設定を先に保存できるようにする）
CREATE TABLE IF NOT EXISTS remind_settings (
  slack_user_id   TEXT PRIMARY KEY,
  display_name    TEXT,
  remind_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  calendar_id     TEXT NOT NULL DEFAULT 'primary',
  calendar_status TEXT NOT NULL DEFAULT 'ok',   -- ok / revoked
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 送信ログ（二重送信防止 & 監査）
CREATE TABLE IF NOT EXISTS notification_logs (
  id            BIGSERIAL PRIMARY KEY,
  channel_id    TEXT NOT NULL DEFAULT '',
  slack_user_id TEXT NOT NULL,
  event_uid     TEXT NOT NULL,
  timing        TEXT NOT NULL CHECK (timing IN ('prev_night','morning')),
  shift_start   TIMESTAMPTZ NOT NULL,
  shift_end     TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending / sent
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_logs_uniq
  ON notification_logs (channel_id, slack_user_id, event_uid, timing);
```

`notification_logs_uniq` が二重送信防止の要。アプリ側のフラグ判定には頼っていない。
`channel_id` が入っているので、**同じ人が複数チャンネルに登録されていればチャンネルごとに1通ずつ**送られる。

**refresh token は保存しない。** 既存 `tokens` テーブルを参照するだけ（二重管理すると片方だけ失効して原因不明の不具合になる）。

### 4-4. Vercel Cron

[vercel.json](../vercel.json) に定義済み。JSON にコメントは書けないので、JSTでの意図は
[cron ルート](../apps/web/src/app/api/cron/shift-remind/route.ts) の先頭コメントに併記してある。

| 意図（JST） | vercel.json（UTC固定） |
|---|---|
| 毎日 21:00（翌日分） | `0 12 * * *` |
| 毎日 08:00（当日分） | `0 23 * * *` ← **UTCでは前日の日付で発火** |

日本にサマータイムは無いので JST = UTC+9 は年間固定。

> **Vercel の Root Directory を `apps/web` に設定している場合は `vercel.json` を `apps/web/` へ移動すること。** cron は Root Directory 直下の `vercel.json` しか読まない。デプロイ後、Vercel ダッシュボードの **Settings → Cron Jobs** に2件表示されるかで確認できる。

---

## 5. 動作確認

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<本番URL>/api/cron/shift-remind?timing=prev_night&dryRun=1"
```

| クエリ | 用途 |
|---|---|
| `timing=prev_night` / `morning` | 必須。対象日の算出に使う |
| `date=2026-08-02` | 対象日を固定（任意の日付でテスト） |
| `dryRun=1` | 送信も送信ログの記録もせず、組み立てたメッセージだけ返す |

レスポンスは `channels[]` にチャンネルごとの `memberCount` / `activeCount` / `shiftCount` / `notifiedCount` / `sent` / `skippedReason` / `unconnected` が入る。

### 通知メッセージ

```
:calendar: 明日 8/2(日) のシフト

<@U0123ABCD> 10:00 - 19:00
<@U0456EFGH> 13:00 - 22:00

変更がある場合は #シフト変更 まで
```

当日朝は `:sunny: 本日 …` になる。日跨ぎシフトは `22:00 - 翌6:00` と表示（**開始日基準**で当日分として扱う）。

### 決めた挙動

| 事象 | 挙動 |
|---|---|
| 対象メンバーが未設定のチャンネル | 何も送らない（`/shift-remind setup` を促す） |
| その日シフトの人が0人 | **通知を送らない**（「本日シフトなし」を毎日流すと通知が形骸化するため） |
| カレンダー未連携のメンバーがいる | **前日夜のみ**チャンネルに連携リンクを投稿（1日2回だと煩いため）。追加した瞬間にも案内する |
| 日跨ぎシフト（22:00-翌6:00） | 開始日基準で当日分。終了時刻に「翌」を付けて表示 |
| Calendar API 401/403 | `calendar_status='revoked'` に更新して以降スキップ。管理チャンネルに再連携を促す警告 |
| Calendar API 5xx/タイムアウト | 指数バックオフで2回リトライ。失敗ならそのメンバーだけスキップ＋警告 |
| 終日予定 | リマインド不可なのでスキップし、管理チャンネルに警告 |
| Slack 送信失敗 | 1回リトライ。失敗なら送信予約を解放して**次回の実行で再送** |
| 同じ人が複数チャンネルに登録 | チャンネルごとに1通ずつ送る（Calendar API 呼び出しは人単位で1回） |
| 対象カレンダー | 既定 `primary`（`GOOGLE_CALENDAR_ID` があればそれ）。メンバー単位で上書き可 |

---

## 6. 段階リリース

| Phase | 内容 | 状態 |
|---|---|---|
| 0 | OAuthスコープ確認 / Slackアプリ数・Vercelプラン確認 | スコープ✅ / 残り2件は人間の確認 |
| 1 | Slack App 新規作成 + Bot Token + イベント/コマンドURL設定 | **人間の作業** |
| 2 | Calendar読み取り + 通知送信 + cron + 二重送信防止 | ✅ 実装済み |
| 3 | チャンネル単位の対象メンバー設定UI（Bot招待・ボタン・Modal） | ✅ 実装済み |
| 4 | エラー通知（管理チャンネルへの警告投稿） | ✅ 実装済み |
| 5 | 通知内容の調整 | 運用しながら |

### デプロイ後に確認すること

- [ ] Bot をテストチャンネルに招待して、対象メンバー選択の案内が出る
- [ ] Modal で保存 → `/shift-remind list` に反映されている
- [ ] 未連携メンバーに連携リンクが出て、リンクから認証すると `list` が「有効」に変わる
- [ ] あとから人を招待して「対象に追加」ボタンが機能する
- [ ] Vercel の **Settings → Cron Jobs** に2件表示されている
- [ ] `dryRun=1` で通知文が意図どおり組み立てられる
- [ ] `0 23 * * *` が **翌朝8時（JST）** に発火している（ログの `executedAt` で確認。UTC日跨ぎのバグが出やすい箇所）
- [ ] 繰り返し予定（毎週シフト）が展開されて取れている
- [ ] cron を2回叩いて2回目が送信されない
- [ ] タイトルの表記揺れ（全角スペース、`SHO−SANシフト` 等）を拾えている

---

## 7. LINE を見送った理由

シフトリマインドは「こちらから21時に送る」ので構造上プッシュ確定で、LINE の無料枠（月200通、送信回数×受信者数でカウント）では約3人で上限に達する。

将来入れるなら、まず **「シフト」と送ると自分の今週のシフトが返る応答Bot**（Reply API なのでカウント対象外＝完全無料）を検討する。
