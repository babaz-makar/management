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
  実装完了・スネイプ検証中。
  - `resolveRefreshTokenByEmail`（`server/jobcan-token-resolver.ts`）:
    `email →（lookupSlackUserIdByEmail）→ slack_user_id →（TokenStore）→ refreshToken`。
    失敗理由を構造化（`slack_not_found` / `google_not_linked`）。calendarId = email。
  - `lookupSlackUserIdByEmail` / `interpretSlackLookupResponse`（`server/slack-directory.ts`）:
    見つからない = null、呼び出し失敗 = throw。botToken はメッセージに載せない。

- [ ] **2-7 `/api/jobcan/import` 結合 + 異常 warning の Slack 通知**
  未着手。xlsx → `string[][]` 変換（**exceljs 4.4.0 をここで apps/web に導入**、[design.md](./design.md)
  論点2）、ファイル名 staffCode ↔ シート内 staffCode の突合 throw（論点4）、
  `reconcileJobcanForAllStaff` の呼び出し、warning の Slack 通知配線を行う。
  下地: Slack 経路のエラー通知（`apps/web/.../slack/events/route.ts` の `notifyError`）あり。

- [ ] **2-8 `jobcan/page.tsx` UI + 名簿の手動確定登録**
  未着手。取込 UI と、staffCode ↔ email の手動確定登録
  （初回のみ Slack 名前 → メアドで候補提示 → 人間が確認）を実装する。

- [ ] **2-9 書込ガード仕上げ**
  未着手。誤爆防止5層のうち route レベルの配線を仕上げる:
  `JOBCAN_APPLY_ENABLED` 未設定なら強制 dry-run、staffCode allowlist。

---

## PR / 統合の段取り

- ブランチ `feature/jobcan-calendar-sync` は `main` 比で先行。
  統合はオーナーが **squash merge** で行う（WIP コミットを1本にまとめる想定）。
- **段取り（社長へ提示済み）:** Phase 2 の機能完成 = 最低でも 2-7 結線まで通してから
  1本の PR にするのが綺麗。**PR 判断は保留中。**

---

## 既知の残課題・申し送り

- **実データ E2E 未実施**（[requirements.md](./requirements.md) 7 参照）。2-7/2-8 結線後に必要。
- `JsonFileStaffDirectory.read()` の値レベル型検査、email の制御文字（NUL 等）通過は別タスク候補。
  calendarId 利用側での再検証が望ましい（[design.md](./design.md) 5 未決事項）。
- 論点1 の email 統一の最終形（OAuth コールバックで email 保存し Slack 橋渡しを外す）は未決。

---

## 参照

- [requirements.md](./requirements.md) — 目的・利用者・安全要件（WHAT / WHY）
- [design.md](./design.md) — アーキテクチャ・設計判断の記録（HOW）
</content>
