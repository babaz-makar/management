# 実行計画書 — jobcan-calendar-sync（WHEN / STEPS）

> このドキュメントは **いつ・どの順で・何をやるか** を定義する。
> 何を・なぜ作るかは [requirements.md](./requirements.md)、どう作るかは [design.md](./design.md) を参照。
>
> チェックボックスは **現状の事実** を反映する。着手前に本書で次タスクを特定する。

---

## 進め方の原則

- **TDD**（RED → GREEN → REFACTOR）。テストを先に書く。
- **カバレッジ 80% 以上を維持**。
- **作る役と検証役を分離**する（書いた本人はチェックしない）。
  作る（ハグリッド）→ 品質（スネイプ）→ 重要変更は敵対検証（ムーディ）。

---

## Phase 1 — 取込パーサー（純関数）

- [x] **Phase 1: `parseJobcanSheet`（rows → ShiftEntry[]）**
  完了・検証済み。マクゴナガル → ハグリッド TDD → スネイプ → ムーディ を5周。
  HIGH級（範囲外時刻・非実在日繰上げ・別人コード誤採用・冪等キー・型崩れクラッシュ）は全て塞ぎ済み。
  関連: `logic/jobcan-date.ts`（completeJobcanDate）、`logic/normalize.ts`、型 `ShiftEntry`。

---

## Phase 2 — apps/web 結合

> 設計の骨子・確定論点は [design.md](./design.md) の「設計判断の記録」を参照。

- [x] **2-1 `parseJobcanFileName`（純関数）**
  完了・二重検証済み（スネイプ合格 + ムーディ条件付き GO）。
  ファイル名 → `{ year, month, staffCodeInName? }`。相異なる年月が複数あれば throw（誤月防止）。

- [x] **2-2 `planJobcanDayUpsert`（純関数・日内 diff）**
  完了・二重検証済み。旧 `planJobcanEntryUpsert`（1エントリ単位）の巻き添え削除バグを
  日内 diff で解消（[design.md](./design.md) 「重大な設計転換」参照）。
  異常時（`end <= start`）は残骸掃除含め `deleteEventIds` を完全に空にする（社長方針「異常時は何もしない」）。
  `groupEntriesByDate` ヘルパも追加。

- [x] **2-3 `listEventsForRange` / `executeJobcanDayPlan`（server 層）**
  完了（171テスト green）。
  - `listEventsForRange`: 月一括取得で N+1 回避、nextPageToken を尽くしてページング漏れ防止。
    `toExistingEvent` で managedBy/shiftId を verbatim、時刻を "HH:MM" 厳密に正規化。
  - `executeJobcanDayPlan`: delete → create 順。`verifyOwnership` で TOCTOU 再照合し、
    `skippedMismatch` / `skippedGone` を返す（握りつぶさない）。
    複合テスト（delete 2件中1件 mismatch）を含む要求テスト完備。

- [x] **2-4 `runJobcanReconcile`（1人1ヶ月の突合オーケストレーション）**
  実装済み（`server/jobcan-pipeline.ts`）。
  - 空 entries は即 no-op（fetch すらしない = マス削除の起点を作らない）。
  - staffCode / sourceMonth の混在は throw（fail-loud）。
  - 反復は entries に在る日だけ（カレンダー日を合成しない = 部分取込のマス削除防止）。
  - existing は当日スコープで `planJobcanDayUpsert` へ渡す。
  - `reconcileRemovals=true` のときのみ、レンジ内・自タグ有りの欠番日を空日削除。
  - カレンダー I/O は `JobcanCalendarPort` で DI（テストで fake 差し替え可能）。
  - 複数人版 `reconcileJobcanForAllStaff`（`server/jobcan-reconcile-all.ts`）も実装済み。
    解決失敗は warning に隔離し他人へ波及させない。

- [x] **2-5 StaffDirectory（Neon 永続 + 純関数抽出）**
  完了・フル検証1周通過（CRITICAL/HIGH ゼロ、227テスト green、pnpm build 通過）。
  - `StaffDirectory` interface + `JsonFileStaffDirectory` + `assertStaffCode`（`/^[A-Z]\d{4}$/`
    大文字のみ・小文字は throw）/ `assertEmail` → `server/staff-directory.ts`。
  - Neon SQL 純関数群 + `SqlTag` 注入の縫い目 → `server/staff-directory-neon-core.ts`。
  - `NeonStaffDirectory`（薄いラッパ）→ `apps/web/src/lib/staff-directory-neon.ts`。
    テーブル `staff_directory(staff_code TEXT PK, email TEXT NOT NULL, updated_at)`。
  - fail-loud 堅牢化済（read() の top-level 型検査で黙って全消しを防止、get/list とも assertEmail）。
  - **未結線**（NeonStaffDirectory はまだ呼ばれていない。2-6/2-7 で結線）。

- [x] **2-6 token の email 解決（Slack 橋渡し）**
  完了・検証済み（後続の 2-7 フル検証で同時に回収。スネイプ合格 → ムーディ GO）。
  - `resolveRefreshTokenByEmail`（`server/jobcan-token-resolver.ts`）:
    `email →（lookupSlackUserIdByEmail）→ slack_user_id →（TokenStore）→ refreshToken`。
    失敗理由を構造化（`slack_not_found` / `google_not_linked`）。calendarId = email。
  - `lookupSlackUserIdByEmail` / `interpretSlackLookupResponse`（`server/slack-directory.ts`）:
    見つからない = null、呼び出し失敗 = throw。botToken はメッセージに載せない。

- [x] **2-7 `/api/jobcan/import` 結合 + 異常 warning の Slack 通知**
  完了・フル検証通過（スネイプ差し戻し → 共有シークレット認証追加 → スネイプ合格 → ムーディ最終 GO・CRITICAL/HIGH ゼロ）。
  - 取込オーケストレーション（`server/jobcan-import.ts` / `jobcan-reconcile-all.ts`）: 複数 xlsx をファイル単位でパース +
    staffCode 突合 throw（論点4）、全レイヤ per-staff 隔離 + 二重防御、集約キー `${staffCode}::${sourceMonth}`、
    エラー文言は固定（生 `err.message` 非転写）。
  - 本番 `/api/jobcan/import`（薄い殻）: 共有シークレット認証（`verifyImportAuth`・timingSafeEqual・
    **secret 未設定 fail-closed**）を最前段に、`validateUploadLimits`（50件/5MB/20MB）、`resolveDryRun`（M-4 二重ゲート）、
    `sanitizeFileName`、`missingImportEnvVars`。異常・警告時のみ Slack 通知（`SLACK_JOBCAN_CHANNEL_ID`）。
  - **exceljs 4.4.0 を apps/web に導入**（server 専用 `xlsxToRows` + `coerceCellText` でマージセル null 吸収、[design.md](./design.md) 論点2）。
  - 実 xlsx 通し確認済み（実ファイル → xlsxToRows → parse → 13コマ → dry-run creates=13・書き込みなし）。

- [x] **2-8 `jobcan/page.tsx` UI + 名簿の手動確定登録**
  完了・フル検証通過（スネイプ差し戻し2回 → 修正 → スネイプ合格 → ムーディ GO・条件なし。ロンのブラウザ実証済み）。
  - `/jobcan`（取込 UI・dry-run 最小プレビュー・段階的 apply 確認・「まだ変更していません」明示）と
    `/jobcan/staff`（名簿・Slack 在籍確認・似名警告・人間が最終確定）。
  - 画面認証 = **Vercel Deployment Protection**（infra 主ゲート・コード側画面認証なし＝社長判断）。
  - BFF 中継 `/api/jobcan/import-ui`（同一プロセスで import を直接呼び secret 付与・`checkContentLength` 早期拒否）、
    名簿 API `/api/staff`（GET/POST/DELETE・別 email 上書きは 409）、`/api/staff/slack-check`（POST body・`{present}` のみ）。
  - client 安全バレル `@management/shift-management/ui`（純葉のみ・crypto/googleapis 非混入をビルドで実証）。

- [x] **2-9 書込ガード仕上げ**
  完了・クローズ（スネイプ合格 → ムーディ条件付き GO・実弾で破れず。**415 テスト green**）。
  - staffCode allowlist 第二関門（`parseStaffAllowlist(env) → Set | null`・未設定/空/空白=null=全許可・
    不正要素 fail-loud throw・秘密非包含、`isStaffAllowed`、`reconcileJobcanForAllStaff` 入口で `not_allowlisted` 隔離）。
  - slack-check を GET → POST body 化（email を URL から外す）。
  - `JOBCAN_APPLY_ENABLED` 強制 dry-run は `resolveDryRun` で実装済み（2-7）。
  - **運用注意（[operations.md](./operations.md) へ反映）:** allowlist はキルスイッチではない。空にしても全許可になる。
    反映を止める唯一のスイッチは `JOBCAN_APPLY_ENABLED` を外すこと。
  - staffCode 正規表現の統一（`^[A-Z]\d{4}$`）: 名簿・allowlist・共有判定・UI は大文字限定で確定。パーサ側も同書式へ統一する。

---

## PR / 統合の段取り

- ブランチ `feature/jobcan-calendar-sync` は `main` 比で先行。
  統合はオーナーが **squash merge** で行う（WIP コミットを1本にまとめる想定）。
- **現状:** Phase 1〜2-9 が全クローズ（全ステップ 設計 → 実装 → スネイプ →（重要変更は）ムーディを通過、415 テスト green）。
  機能は「動く単位」（名簿登録 UI + 取込 UI + apply）に到達。
- **残り:** ① 実 env 下の実データ E2E（社長環境／デプロイ時、[operations.md](./operations.md) 6）
  ② 1本の PR（オーナー squash merge・M4 運用条件 = Vercel Deployment Protection 実証／`JOBCAN_APPLY_ENABLED` 既定 OFF）。

---

## 既知の残課題・申し送り

- **実データ E2E 未実施**（[requirements.md](./requirements.md) 7 / [operations.md](./operations.md) 6 参照）。
  実 `DATABASE_URL` / `SLACK_BOT_TOKEN` / `GOOGLE_*` / `JOBCAN_IMPORT_SECRET` を入れた環境での通し検証がデプロイ時に必要。
- `JsonFileStaffDirectory.read()` の値レベル型検査、email の制御文字（NUL 等）通過は別タスク候補。
  calendarId 利用側での再検証が望ましい（[design.md](./design.md) 5 未決事項）。
- 論点1 の email 統一の最終形（OAuth コールバックで email 保存し Slack 橋渡しを外す）は未決。
- staffCode 正規表現の完全統一（パーサ側 `parsers/jobcan-sheet.ts` / `logic/jobcan-filename.ts` を `^[A-Z]\d{4}$` へ）は
  統一方針として確定・反映中（[design.md](./design.md) 「staffCode 書式の統一方針」）。
- infra 依存の申し送り（レート制限・CSRF・body 上限は Vercel 層に依存）は [operations.md](./operations.md) 3.3。

---

## 参照

- [requirements.md](./requirements.md) — 目的・利用者・安全要件（WHAT / WHY）
- [design.md](./design.md) — アーキテクチャ・設計判断の記録（HOW）
- [operations.md](./operations.md) — デプロイ・運用手順（環境変数・安全設計・運用注意）
</content>
