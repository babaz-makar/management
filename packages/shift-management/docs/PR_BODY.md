# feat(shift-management): ジョブカン確定シフト xlsx → 各人 Google カレンダー一括反映（Phase1〜2-9）

> このファイルは GitHub PR 本文にそのまま貼れる下書きです。統合時は **squash merge** を想定
> （`feature/jobcan-calendar-sync` は 58 コミットの WIP auto-push を含むため、履歴は1つにまとめる）。

---

## 概要（なぜ / 何を）

**なぜ:** ジョブカンの確定シフトを各スタッフの Google カレンダーへ手作業で転記していた。
コストが高いだけでなく、**別人の予定に書き込む転記ミス**が起こり得た。

**何を:** 確定シフト xlsx（1ファイル＝1人1ヶ月分）を、各スタッフ本人の Google カレンダーへ
一括反映するエンジンと、それを回す認証付き API・管理画面を一式そろえた。

- 純粋ロジックのエンジン（parse / 日内 diff / token 解決 / allowlist / 取込オーケストレーション）
- server 層（Google Calendar / Slack / Neon への I/O）
- apps/web の API ルート（本番取込 `/api/jobcan/import` ＋ BFF 中継 ＋ 名簿 `/api/staff`）
- 管理画面（取込 UI `/jobcan` ＋ 名簿 UI `/jobcan/staff`）

**他人のカレンダーに書き込む**機能のため、安全設計を最優先に据えている（下記「安全設計」）。

---

## 主な変更

| 層 | 変更 |
| --- | --- |
| packages（純ロジック） | ファイル名パース / 日内 diff（`planJobcanDayUpsert`）/ 取込オーケストレーション / staffCode 突合 / allowlist などを副作用なしの純関数で実装。外部依存は持ち込まない |
| server 層 | Google Calendar（`listEventsForRange` / `executeJobcanDayPlan`）、Slack 橋渡し（email→slack_user_id→token）、Neon（名簿・トークンストア）への I/O |
| apps/web | 本番取込 `/api/jobcan/import`（既定 dry-run・Bearer 認証）、BFF 中継 `/api/jobcan/import-ui`、名簿 `/api/staff`・`/api/staff/slack-check`、管理画面 `/jobcan`・`/jobcan/staff` |
| 依存 | **exceljs 4.4.0** を apps/web にのみ導入（server 専用 import・4.4.0 ピン留め） |

**規模（main 比・squash merge 前）:** 約 120 ファイル変更・約 18,600 行追加。
うち `pnpm-lock.yaml` が exceljs 導入で約 2,889 行を占める。テストは **422 green**。

### exceljs 4.4.0 を選んだ理由

npm 版 SheetJS `xlsx` 0.18.5 は読取経路を直撃する High CVE 2件
（CVE-2023-30533 Prototype Pollution / CVE-2024-22363 ReDoS）を持ち、修正版が npm に無い。
exceljs は修正済み。「外部依存は react/react-dom のみ」規約の例外として、
apps/web 限定・4.4.0 ピン留め・server 専用 import・design.md 追記を条件に導入した。

---

## 安全設計（最重要）

他人のカレンダーへの誤書込を「運用の注意」ではなく **構造** で防ぐ。

- **既定 dry-run。** 明示的に apply しない限り、計画を返すだけで書き込まない。
- **`JOBCAN_APPLY_ENABLED` の二重ゲート。** 環境変数（`"true"`/`"1"`）と apply 指定の両方が
  揃った時だけ本反映。どちらか欠ける・未知値・型違いは必ず dry-run へ倒す（フェイルオープンしない）。
- **staffCode allowlist（二段構え）。** 第一関門＝名簿（未登録者は `email_not_registered` でスキップ）、
  第二関門＝env `JOBCAN_STAFF_ALLOWLIST` による絞り込み。
- **削除は自タグ限定。** `managedBy === "jobcan-sync"` かつ `shiftId === staffCode:date` の完全一致のみ削除。
  無タグ・本人の手動予定・他ツール予定・偽装タグは絶対に消さず warning。削除直前に `events.get` で再照合（TOCTOU 多層防御）。
- **取り違え検出。** ファイル名の括弧内 staffCode ↔ シート内 staffCode を突合し、
  不一致は throw で当該ファイルのみ取込中止（別人書込の兆候を fail-loud で止める）。
  ファイル名側の小文字混入 staffCode 様トークンも `filename_parse_error` で隔離する。
- **共有シークレット認証。** 取込ルートは Bearer `JOBCAN_IMPORT_SECRET` を `crypto.timingSafeEqual` で照合。
  **secret 未設定は fail-closed で全拒否**（500）。BFF 中継がサーバー内で付与するためブラウザに secret は出ない。
- **XSS 対策。** 管理画面は全 text 描画（`dangerouslySetInnerHTML` 不使用）。
- **秘密の非漏洩。** トークン・接続文字列はエラーメッセージ・レスポンス・Slack 通知に載せない（固定文言）。

詳細は [operations.md](./operations.md)（誤爆防止5層・運用注意）を参照。

---

## 検証

全ステップを **設計 → 実装（TDD）→ スネイプ（品質レビュー）→ ムーディ（敵対検証）** で通した。

- **422 テスト green。**
- 認証バイパス・書込フェイルオープン・SQL 注入・秘密漏洩・取り違え偽装は、いずれもムーディの実弾検証を生き残った。
- **ブラウザ実証済み:** OS ダークモードでも `color-scheme: light` 固定で可読、
  `/jobcan/staff?code=A0187` で staffCode 欄の自動プリフィル、env 欠落を人間語で表示（握りつぶさない）、console エラー 0。
- **実 xlsx で dry-run 実証済み:** 実ファイル → `xlsxToRows` → parse → **13 コマ抽出・dry-run 計画 creates=13 / deletes=0 / warnings=0**（書込なし）。
  マージセルで落ちず、締め日跨ぎ（前月16〜当月15）の年補完・公休行の除外・サマリブロックのスキップも確認。

---

## デプロイ前の必須条件（M4 運用条件）

本番結合の前に必ず満たすこと。詳細は [operations.md](./operations.md) 3.2 を参照。

1. **Vercel Deployment Protection を有効・正設定にする。** 管理画面を守る**唯一のゲート**（コード側画面認証は無し＝社長判断）。
2. **`JOBCAN_APPLY_ENABLED` は既定 OFF。** 本反映を回す短時間だけ ON にし、終わったら外す。
3. **`JOBCAN_IMPORT_SECRET` は十分長いランダム値**（空白のみ禁止）。

---

## テスト計画 / レビュー観点（TODO）

- [ ] **env 実データ E2E**（下記「未実証」）を社長環境で実施する。
- [ ] 本番で **Vercel Deployment Protection** が有効・正設定であることを実証する。
- [ ] apply 有効化の前チェック（dry-run で計画が正しく出る → 1人分 apply → 反映確認 → `JOBCAN_APPLY_ENABLED` を外す）。

---

## 未実証（正直な明示）

- **実 env 下の実データ E2E は未実施。** 実 `DATABASE_URL` / `SLACK_BOT_TOKEN` / `GOOGLE_*` /
  `JOBCAN_IMPORT_SECRET` を入れた環境で、実 xlsx → dry-run → apply までを画面で通した検証はまだ行っていない
  （ローカルに秘密を置かない方針のため）。**マージ後 / デプロイ時に社長環境で要確認。**

---

## 既知の制限 / バックログ

いずれも **別人書込・データ喪失は起こさない**。可用性・堅牢化に属する（詳細は [design.md](./design.md) 6章）。

1. **異種 Unicode でのトリップワイヤ回避（ハードニング未・バックログ）:**
   ファイル名の取り違え検出は半角 ASCII 前提（`^[A-Z]\d{4}$`）。全角英字・ゼロ幅スペース・制御文字を混ぜた
   staffCode 様トークンは検出を回避し得る。ただし書込先はシート内 staffCode が 100% 支配するため**別人書込は起きない**
   （トリップワイヤ導入前から在る既存の穴で、本変更の回帰ではない）。NFKC 正規化＋制御文字除去はバックログ。
2. **付随タグ付きファイル名の誤隔離（安全優先のトレードオフ）:**
   `(v2024)` のような小文字を含む付随タグをファイル名に付けると、staffCode 様トークンと見なして誤隔離し得る
   （＝取り込めないだけ・誤書込やデータ喪失は無し）。実ジョブカン形式（丸括弧が大文字 staffCode 1個のみ。
   例 `氏名(A0187) YYYY年MM月度.xlsx`）では発生しないことをスパイクで確認済み。
3. **apps/web ルート層の自動テストは無し。** 純ロジックは packages の TDD（422 テスト）で担保し、UI 配線はブラウザ実証で担保する（社長方針）。
4. **レート制限 / CSRF は infra 依存。** サーバーレス（Vercel）ではインメモリのレート制限が持てないため、
   Vercel の body 上限・Cookie の SameSite・Deployment Protection に依存する前提。自前ホストへ移す場合は別途手当てが必要。

---

## 統合方針

`feature/jobcan-calendar-sync` は WIP auto-push を含む先行ブランチ。**squash merge** で履歴を1つにまとめる想定。

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
