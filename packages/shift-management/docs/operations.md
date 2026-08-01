# 運用手順書 — jobcan-calendar-sync（デプロイ・運用）

> このドキュメントは **運用者（社長）がデプロイし、日々運用するため** の実務手順書。
> 何を・なぜ作るかは [requirements.md](./requirements.md)、どう作るかは [design.md](./design.md)、
> いつ・どの順で作ったかは [plan.md](./plan.md) を参照。
>
> ここに書くのは「既に決まった判断・実装済みの事実」だけ。秘密（実トークン・実接続文字列・実メアド）は載せない。
> 例示の staffCode は `A0187` 等の記号で伏せる。

---

## 0. これは何をする機能か（30秒）

ジョブカンの確定シフト xlsx（1人1ヶ月分）を、各スタッフ本人の Google カレンダーへ一括反映する。
**他人のカレンダーに書き込む**ため、安全設計を最優先する。運用の合言葉は次の3つ。

1. **既定は dry-run（計画表示のみ・書き込まない）。**
2. **本当に書き込むスイッチは `JOBCAN_APPLY_ENABLED` ただ1つ。**
3. **突合は staffCode（例 A0187）だけ。氏名では突き合わせない。**

---

## 1. 必要な環境変数一覧

値は設定しない・出力しない。ここでは **役割** だけを示す。

### 1.1 必須（未設定だと機能が動かない／全拒否になる）

| 変数名 | 役割 | 未設定時の挙動 |
| --- | --- | --- |
| `DATABASE_URL` | Neon 接続文字列。名簿（staff_directory）とトークンストアの読み書き先 | 取込ルートが 500（server misconfigured） |
| `SLACK_BOT_TOKEN` | Slack Bot トークン。`users.lookupByEmail`（email→在籍確認・slack_user_id 解決）と通知に使う | 同上／在籍確認 API が 500 |
| `GOOGLE_CLIENT_ID` | Google OAuth クライアント ID | 取込ルートが 500 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth クライアントシークレット | 取込ルートが 500 |
| `GOOGLE_REDIRECT_URI` | Google OAuth リダイレクト URI | 取込ルートが 500 |
| `JOBCAN_IMPORT_SECRET` | 取込ルート（`/api/jobcan/import`）の Bearer 共有シークレット。**十分長いランダム値**にする。**空白のみは禁止**（設定済みに見えて実質空になり得るため） | ルートが全拒否（未設定＝fail-closed で全 POST を弾く） |

### 1.2 安全・運用スイッチ

| 変数名 | 役割 | 既定（未設定時） |
| --- | --- | --- |
| `JOBCAN_APPLY_ENABLED` | **本反映の有効化スイッチ。** `"true"` または `"1"` のときだけ本反映を許す。**唯一の停止スイッチ**（後述） | **未設定＝強制 dry-run**（書き込まない） |
| `JOBCAN_STAFF_ALLOWLIST` | 反映対象を staffCode で絞る**第二関門**（任意）。カンマ／空白区切り。各要素は `^[A-Z]\d{4}$`（例 `A0187,B0002`） | 未設定・空・空白のみ＝**制限なし（名簿全員が対象）** |
| `SLACK_JOBCAN_CHANNEL_ID` | 異常・警告の通知先チャンネル（任意）。未設定時は `SLACK_WATCH_CHANNEL_ID` にフォールバック | どちらも無ければ通知しない（取込結果は返す） |

> 補足: `JOBCAN_STAFF_ALLOWLIST` に staffCode 形式でない要素が1つでも混じると、
> 取込ルートは起動時 fail-loud で 500（`invalid: JOBCAN_STAFF_ALLOWLIST`）を返す。書き間違いに即気づける設計。

---

## 2. 安全設計の思想（誤爆防止5層）

書き込み事故を「運用の注意」ではなく **構造** で防ぐ。5層すべてが同時に効く。

1. **既定 dry-run。** 明示的に apply しない限り、計画を返すだけで書き込まない。
2. **`JOBCAN_APPLY_ENABLED` 未設定なら強制 dry-run。** 環境変数（`"true"`/`"1"`）と apply 指定の
   **二重ゲートが両方揃った時だけ**本反映になる。どちらか欠ける・未知値・型違いは必ず dry-run 側へ倒れる
   （フェイルオープンしない）。
3. **staffCode allowlist（二段構え）。**
   - 第一関門＝**名簿**。名簿（staff_directory）に staffCode↔email が無い人は `email_not_registered` でスキップ＝反映されない。
   - 第二関門＝**env `JOBCAN_STAFF_ALLOWLIST`**。設定するとその staffCode 以外を `not_allowlisted` で隔離する。
4. **書き込み関数は dry-run 分岐の内側のみ。** dry-run のときは Google Calendar への I/O 自体を呼ばない。
5. **削除は自タグ限定。** 削除するのは `managedBy === "jobcan-sync"` かつ `shiftId === staffCode:date`（dayKey）が
   完全一致するイベントだけ。無タグ・本人の手動予定・他ツール予定・偽装タグ（shiftId 不一致）は絶対に消さず warning にする。
   さらに削除直前に `events.get` で再照合する（TOCTOU 多層防御）。

---

## 3. 重要な運用上の注意（申し送り・必読）

### 3.1 allowlist はキルスイッチではない

**`JOBCAN_STAFF_ALLOWLIST` を空にしても「全拒否」にはならない。「全許可（名簿全員が対象）」になる。**
これは絞り込み用の第二関門であって、緊急停止装置ではない。

- **反映を止めたいときは `JOBCAN_APPLY_ENABLED` を外す（未設定にする）。これが唯一の停止スイッチ。**
  外せば二重ゲートが崩れ、必ず dry-run に倒れる。
- allowlist は「対象を減らす」専用。既存ガード（二重ゲート・削除の自タグ限定・一人の失敗を他人に波及させない隔離・
  取り違え検出）は allowlist の有無に関係なく常に効く。

### 3.2 M4 — 画面認証は Vercel Deployment Protection が唯一のゲート

管理画面（`/jobcan`・`/jobcan/staff`）にはコード側の画面認証を持たせていない（社長判断）。
画面を守る唯一のゲートは **Vercel Deployment Protection**。

- **結合前に必ず、本番で Deployment Protection が有効・正設定であることを実証する。** ここが外れると画面が露出する。
- **`JOBCAN_APPLY_ENABLED` は常時 ON にしない。** 本反映を回す短時間だけ ON にし、終わったら外す。
- BFF 中継（`/api/jobcan/import-ui`）がサーバー内で `JOBCAN_IMPORT_SECRET` を付与するため、
  ブラウザ側にシークレットは出ない。取込ルート本体（`/api/jobcan/import`）は Bearer 認証必須（dry-run でも必須）。

### 3.3 レート制限・CSRF は infra 層に依存する

サーバーレス（Vercel）ではインメモリのレート制限が持てないため、コード側に独自レート制限・CSRF トークンは持たせていない。
これらは **infra 層（Vercel の body 上限・Cookie の SameSite・Deployment Protection）に依存** する前提。
自前ホスト等へ移す場合はこの前提が外れるため、レート制限・CSRF・body 上限を別途手当てすること。

---

## 4. 使い方フロー

### ステップ A. 名簿を登録する（`/jobcan/staff`）

staffCode ↔ email の対応を人間が確定して登録する。

1. staffCode（例 A0187）と email を入力する。
2. 画面が Slack 在籍確認（`users.lookupByEmail`）を行い、その email が Slack にいるかを表示する。
3. 似た名前の既存登録があれば警告が出る。**最終的に人間が確認して確定** する（氏名では自動突合しない）。
4. 別の email で同じ staffCode を上書きしようとすると 409 で止まる（取り違え防止）。

> 名簿にいない staffCode は取込時に `email_not_registered` でスキップされる＝反映されない（第一関門）。

### ステップ B. xlsx を取り込む（`/jobcan`）

1. 確定シフト xlsx（1ファイル＝1人1ヶ月分）を複数アップロードできる。
2. **まず dry-run。** 計画（作成件数・反映できない人・ファイルエラー）を確認する。この時点では**何も書き込まれていない**。
   - 「まだ変更していません」と画面に明示される。
   - ファイルを差し替えると計画は破棄され、古い計画のまま apply はできない。
3. 内容に問題がなければ **本反映（apply）** する。apply ボタンは dry-run 成功後だけ出る（段階的な摩擦）。
   - 実際に書き込むには、加えて **`JOBCAN_APPLY_ENABLED` が有効** である必要がある（二重ゲート）。
4. 突合キーは **staffCode のみ**。ファイル名の括弧内 staffCode と xlsx シート内 staffCode が食い違うファイルは
   取り違えの兆候として throw し、そのファイルだけ取込中止（他ファイルは継続）。

### staffCode の書式（統一方針）

- **staffCode = 大文字英字1 + 数字4桁（`^[A-Z]\d{4}$`、例 A0187）。** 小文字は弾く（社長判断）。
- 名簿・allowlist・UI バリデーションはこの大文字限定に揃っている。パーサ側も同じ書式へ統一する（[design.md](./design.md) 論点2-9）。

---

## 5. 通知

異常・警告（反映できない人・ファイルエラー・reconcile 警告など）が出たときだけ、`SLACK_JOBCAN_CHANNEL_ID`
（無ければ `SLACK_WATCH_CHANNEL_ID`）へ Slack 通知する。通知はベストエフォート（通知に失敗しても取込結果は返す）。
ファイル名は改行・制御文字を除去し長さ制限した上で載せる（サマリ偽装・偽行注入の防止）。秘密（トークン等）は通知に載せない。

---

## 6. 未実証（デプロイ時に必ず確認すること）

正直に明示する。**本ドキュメント作成時点で、実 env 下の実データ E2E は未実施。**

- 純関数・server 層・各ユニットは検証済み（415 テスト green、スネイプ／ムーディ通過）。
- ただし **実 `DATABASE_URL` / `SLACK_BOT_TOKEN` / `GOOGLE_*` / `JOBCAN_IMPORT_SECRET` を入れた環境で、
  実 xlsx → dry-run → apply までを画面で通した検証はまだ行っていない。** ローカルに秘密（.env）を置かない方針のため。
- **デプロイ時に、社長環境で以下を最初に確認すること:**
  1. Vercel Deployment Protection が有効・正設定（唯一の画面ゲート）。
  2. `JOBCAN_IMPORT_SECRET` が十分長いランダム値（空白のみでない）。
  3. まず dry-run で計画が正しく出る（書き込みゼロ）。
  4. `JOBCAN_APPLY_ENABLED` を短時間だけ ON にして、1人分の apply が本人カレンダーに正しく反映される。
  5. 反映確認後に `JOBCAN_APPLY_ENABLED` を外す。

---

## 参照

- [requirements.md](./requirements.md) — 目的・利用者・安全要件（WHAT / WHY）
- [design.md](./design.md) — アーキテクチャ・設計判断の記録（HOW）
- [plan.md](./plan.md) — ステップ一覧と進行状況（WHEN / STEPS）
</content>
</invoke>
