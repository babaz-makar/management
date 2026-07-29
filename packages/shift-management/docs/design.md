# 設計書 — jobcan-calendar-sync（HOW）

> このドキュメントは **どう作るか** の方針を定義する。
> 何を・なぜ作るかは [requirements.md](./requirements.md)、いつ・どの順で作るかは [plan.md](./plan.md) を参照。
>
> 本書は「既に決まっている判断」と「実装済みの事実」を構造化したもの。
> 未確定事項は「未決」と明示する。

---

## 1. アーキテクチャ

**packages（純粋ロジック・server 層）と apps/web（Next.js 結合層）を分離する。**

```
packages/shift-management/src/
├── logic/           純関数（副作用なし）
│   ├── jobcan-filename.ts   parseJobcanFileName（ファイル名 → 年月/staffCode）
│   ├── jobcan-date.ts       completeJobcanDate（締め日ベース年補完）
│   ├── jobcan-plan.ts       planJobcanDayUpsert / groupEntriesByDate（日内 diff）
│   ├── calendar-plan.ts     ExistingEvent / NewEventSpec 型 + planCalendarUpsert（Slack経路）
│   └── normalize.ts         normalizeText / normalizeTime
├── parsers/
│   └── jobcan-sheet.ts      parseJobcanSheet（rows → ShiftEntry[]）
├── server/          外部 I/O（Google Calendar / Slack / ストア）
│   ├── google-calendar.ts   listEventsForRange / executeJobcanDayPlan
│   ├── jobcan-pipeline.ts   runJobcanReconcile（1人1ヶ月の突合）
│   ├── jobcan-reconcile-all.ts  reconcileJobcanForAllStaff（複数人）
│   ├── jobcan-token-resolver.ts resolveRefreshTokenByEmail（email → token）
│   ├── slack-directory.ts   lookupSlackUserIdByEmail（email → slack_user_id）
│   ├── staff-directory.ts   StaffDirectory / JsonFileStaffDirectory / assert*
│   ├── staff-directory-neon-core.ts  Neon SQL 純関数群 + SqlTag 縫い目
│   └── token-store.ts       TokenStore / JsonFileTokenStore
└── types.ts         ShiftEntry / ShiftTime など

apps/web/src/
├── app/api/auth/google/route.ts + callback/route.ts   Google OAuth
├── app/api/slack/events/route.ts                       Slack イベント（既存 Slack 経路）
└── lib/  token-store-neon.ts / staff-directory-neon.ts（Neon 実装）
```

### 依存規約

- **packages の外部依存は react / react-dom のみ**（リポジトリ規約）。
- **例外: exceljs は apps/web 側にのみ追加する**（後述「設計判断の記録」論点2）。
  packages には持ち込まない。パーサーは `string[][]` を受け取る純関数として xlsx から切り離す。
- Neon（`@neondatabase/serverless`）依存は apps/web 側にのみ置く。
  packages 側は `SqlTag` 型の縫い目で SQL 純関数を抽出し、Neon に依存しない。

---

## 2. データフロー

```
xlsx アップロード（複数）
  │
  ├─ parseJobcanFileName(fileName)         ファイル名 → { year, month, staffCodeInName? }
  │
  ├─ parseJobcanSheet({ rows, targetMonth })  → ShiftEntry[]
  │     ※ targetMonth はファイル名由来を必須で渡す（in-sheet ヘッダの silent 誤月を構造で解消）
  │     ※ ファイル名 staffCode ↔ シート内 staffCode の不一致は throw（上位で照合・取込中止）
  │
  ├─ staffCode でグループ化（reconcileJobcanForAllStaff 内 groupByStaffCode）
  │
  ├─ StaffDirectory.get(staffCode)          staffCode → email
  │
  ├─ resolveRefreshTokenByEmail(email)      email →（Slack lookup）→ slack_user_id
  │                                                →（TokenStore）→ refreshToken
  │     ※ calendarId = 本人 email
  │
  ├─ listEventsForRange(refreshToken, calendarId, minDate, maxDate)
  │     ※ 月一括取得で N+1 を回避。nextPageToken を尽くしてページング漏れ防止
  │
  ├─ planJobcanDayUpsert(ctx, dayEntries, dayExisting)   1人1日の全コマ集合の日内 diff
  │     → { creates, deleteEventIds, warnings }
  │
  └─ executeJobcanDayPlan(refreshToken, calendarId, ctx, plan)
        delete → create の順で実行（dry-run 時は呼ばない）
```

### 2.1 締め日と取込レンジ

- ジョブカン締めは **前月16日〜当月15日**。年補完は `completeJobcanDate` が締め日基準で行う
  （行の月が対象月より大きければ前年と判定。例: 対象1月シートの「12/20」→ 前年12/20）。
- `runJobcanReconcile` の取込レンジは **entries の min..max**（締め日スピルオーバを全カバー）。
- `sourceMonth` は "YYYY-MM"。

### 2.2 冪等キーとスロットキー

- `jobcanShiftId = ${staffCode}:${date}`（dayKey）。時刻成分を含まない。
- スロットキー = `${normalizeTime(start)}-${normalizeTime(end)}`。
  同日複数コマ（中抜け・分割シフト）は slot で識別する。

---

## 3. 設計判断の記録

> CLAUDE.md はこの節を必須とする。以下は社長承認済み・覆さない確定論点と、その理由。
> 併せて **現状の実装状況（事実）** を明記する。

### 論点1 — token 保存キーは email 統一（ただし現状は Slack 橋渡しで実現）

- **確定方針:** token の識別を email に統一し、`StaffDirectory(staffCode → email)` と直結、
  `calendarId = email` にする。将来は Slack 側も email 化して識別を統一する。
- **現状の実装（事実）:** 新しいトークンストアや追加 OAuth スコープは作っていない。
  既存の `slack_user_id` キーの `TokenStore` をそのまま使い、
  `email →（Slack users.lookupByEmail）→ slack_user_id →（TokenStore）→ refreshToken`
  の2段で解決する（`resolveRefreshTokenByEmail`）。
  OAuth コールバック（`apps/web/.../auth/google/callback`）は現状 `state = slack_user_id` を
  キーに `refresh_token` を保存しており、email 保存へは **まだ切り替えていない**。
- **理由:** 既存資産を活かしつつ email を運用キーにできる。OAuth スコープ拡張は
  `calendar` のみ（`getAuthUrl`）で据え置き、書込事故面を増やさない。

### 論点2 — xlsx 読取は exceljs 4.4.0

- **確定方針:** xlsx の読取は **exceljs 4.4.0** を使う。
- **理由:** npm 版 SheetJS `xlsx` 0.18.5 は読取経路を直撃する High CVE 2件
  （CVE-2023-30533 Prototype Pollution / CVE-2024-22363 ReDoS）を持ち、
  修正版が npm に無い（修正は自社 CDN のみ）。exceljs は修正済み。
- **規約例外の条件:** 「外部依存は react/react-dom のみ」規約の例外。以下を条件とする。
  - apps/web の `package.json` のみに追加（packages には入れない）。
  - **4.4.0 にピン留め**。
  - サーバー（route handler）専用 import。
  - 本 design.md に追記（本項）。
- **現状の実装（事実）:** exceljs は **まだ apps/web に導入されていない**
  （`apps/web/package.json` に依存が無い）。xlsx → `string[][]` 変換を行う
  `/api/jobcan/import` の実装（Step 2-7）で導入予定。パーサー `parseJobcanSheet` は
  ライブラリ非依存の `string[][]` 入力で既に完成している。

### 論点3 — 深夜跨ぎは存在しない前提、`end <= start` は異常凍結

- **確定方針:** 深夜跨ぎ勤務は存在しない前提。跨ぎ処理は作らない。
- **実装:** `planJobcanDayUpsert` は `end <= start` のコマを見つけると、
  そのコマの生成をスキップし、**当日の削除を残骸掃除・消えたコマ掃除を問わず一切抑制**し、
  warning を出す（`deleteEventIds` は完全に空になる）。
  typo が正当な既存予定を消す事故を防ぐための「異常日は何もしない」方針（社長確定）。
- **将来注意:** もし将来夜勤が出たら `end <= start` 判定の見直しが必要。

### 論点4 — ファイル名 staffCode ↔ シート内 staffCode 不一致は throw

- **確定方針:** ファイル名の括弧内 staffCode と xlsx 4行目セルの staffCode が
  不一致なら **throw して当該ファイルの取込を中止**する（他ファイルは継続）。
- **理由:** 不一致 = ファイル取り違え／リネームミス = 別人カレンダーへの書込事故の兆候。
- **現状の実装（事実）:** 部品は揃っている
  （`parseJobcanFileName` が `staffCodeInName` を返し、`parseJobcanSheet` が
  シート内 staffCode を返す）。両者を突合して throw する結線は
  `/api/jobcan/import`（Step 2-7）で行う。

### 論点5 — managedBy に "jobcan-sync" を追加、削除は自タグ限定

- **確定方針:** `NewEventSpec.managedBy` を `"shift-management" | "jobcan-sync"` に widening。
  削除は `managedBy === "jobcan-sync"` かつ `shiftId === dayKey` の完全一致のみ。
- **不変条件:** 無タグ・本人手動予定・他ツール予定・偽装タグ（`shiftId ≠ dayKey`）は
  絶対に削除しない。除外時は warning を出す。

### 重大な設計転換 — 1エントリ単位 → 日内 diff（planJobcanDayUpsert）

- **背景（ムーディ敵対検証で発覚）:** 当初の `planJobcanEntryUpsert`（1エントリ単位）は
  HIGH の巻き添え削除バグを持っていた。冪等キー `shiftId = staffCode:date` に時刻成分が無く、
  1人が同日に複数コマ（中抜け・分割シフト）を持つとキーが衝突し、
  午前コマの再取込で午後コマが巻き添え削除される（偽装不要・正規運用でのデータ損失）。
- **転換:** 突合単位を **「1人・1日の全コマ集合」に変え、日内 diff 方式** に再設計。
  - `planJobcanDayUpsert(ctx, entries, existing) → { creates, deleteEventIds, warnings }`。
    旧 `planJobcanEntryUpsert` は置換（削除）。`groupEntriesByDate` ヘルパを追加。
  - **slotKey = `${normalizeTime(start)}-${normalizeTime(end)}`** で
    desired（あるべき集合）と current-self（既存の自タグ集合）を集合 diff。
    - matched（両方にある）→ skip（残骸があれば1件残し他を delete）
    - desired-only → create
    - self-only → delete（消えたコマ掃除）
  - `shiftId = staffCode:date` は維持（論点1）。識別は slot + `event.id`。冪等。

### Step 2-6 — email → token を Slack 橋渡しで解決

- `resolveRefreshTokenByEmail`（`jobcan-token-resolver.ts`）が
  `email →（lookupSlackUserIdByEmail）→ slack_user_id →（TokenStore）→ refreshToken` を解決。
- 失敗理由を構造化して返す（握りつぶさない）:
  - `slack_not_found`（Slack 未在籍）/ `google_not_linked`（Google 未連携）
  - 呼び出し側 `reconcileJobcanForAllStaff` はさらに
    `email_not_registered`（名簿未登録）/ `resolve_error`（Slack API 障害等の例外隔離）を加える。
- 秘密情報（botToken / refreshToken）はエラーメッセージ・失敗結果に載せない。

---

## 4. ガード（防御を設計に落とす）

### 4.1 誤爆防止5層（[requirements.md](./requirements.md) 4.3 の実装方針）

1. 既定 dry-run（`JobcanReconcileOptions.dryRun`）。
2. `JOBCAN_APPLY_ENABLED` 未設定なら強制 dry-run（Step 2-9 で route に配線）。
3. staffCode allowlist（Step 2-9）。
4. 書き込み関数は dry-run 分岐の内側のみ（`runDay` は dryRun 時に `executeDayPlan` を呼ばない）。
5. 削除は自タグ限定（`planJobcanDayUpsert` の不変条件 + `executeJobcanDayPlan` の再照合）。

### 4.2 多層防御・TOCTOU

- **events.list 正規化（`toExistingEvent`）:** `managedBy` / `shiftId` は
  `extendedProperties.private` から **verbatim**（trim / case 変換せず、null → undefined のみ）で渡す。
  大文字化・空白で self を誤認して二重 create するのを防ぐ。
- **時刻は "HH:MM" 厳密（`fmtISO`）:** 秒形式（"09:00:00"）だと slotKey が不一致になり、
  毎回 delete + recreate の永久チャーンになる。ISO → JST で秒を落として "HH:MM" にする。
- **existing は当日スコープ:** `runJobcanReconcile` が日ごとにバケツ化し、
  当日分の existing だけを `planJobcanDayUpsert` に渡す（cross-date 誤掴み防止）。
- **レンジ外の日に `planJobcanDayUpsert` を呼ばない（最重要運用ガード）:**
  反復は **entries に在る日だけ**。カレンダー側の日を合成しない。
  部分取込ファイルで未収録日を「空」と誤認して当日自タグをマス削除する事故を防ぐ。
- **delete 直前の TOCTOU 再照合（`verifyOwnership`）:** delete 前に `events.get` で
  `managedBy === "jobcan-sync"` かつ `shiftId === dayKey` を厳密再確認。
  不一致は消さず `skippedMismatch` に計上 / 404 は冪等 skip して `skippedGone` に計上 / それ以外は throw。
  呼び出し側が異常兆候（付け替え・競合）を検知できるよう件数を返す。

### 4.3 空日削除（reconcileRemovals）

- 既定 false（安全側）。true のときだけ、`reconcileRemovedDays` が
  **レンジ内かつ自タグ（jobcan-sync & shiftId=dayKey）を含む欠番日**だけを空日削除する。
  レンジ外・自タグ無しの日は絶対に触らない。空日削除は `planJobcanDayUpsert(ctx, [], existing)` で表現。

---

## 5. 未決事項

- 論点1 の email 統一の最終形（OAuth コールバックで email を保存し Slack 橋渡しを外す）は **未決**。
  現状は Slack 橋渡しで実現しており、切替時期は決まっていない。
- `JsonFileStaffDirectory.read()` の値レベル型検査（`{A0187: 123}` のように値が
  string 保証されないケース）と、email 形式チェックのみで制御文字（NUL 等）を通す点は
  申し送り事項（別タスク候補）。calendarId 利用（Google Calendar 書込）側での再検証が望ましい。

---

## 参照

- [requirements.md](./requirements.md) — 目的・利用者・安全要件（WHAT / WHY）
- [plan.md](./plan.md) — ステップ一覧と進行状況（WHEN / STEPS）
</content>
