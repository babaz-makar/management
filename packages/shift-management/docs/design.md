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
- **現状の実装（事実）:** exceljs 4.4.0 を **apps/web に導入済み**（Step 2-7）。
  `apps/web/lib/jobcan-xlsx.ts` の `xlsxToRows` が server 専用で xlsx → `string[][]` 変換を行う
  （クライアント非混入を build で確認）。パーサー `parseJobcanSheet` はライブラリ非依存の
  `string[][]` 入力で完成しており、exceljs には触れない。

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
- **現状の実装（事実）:** 結線済み（Step 2-7）。`parseJobcanFileName` が `staffCodeInName` を返し、
  `parseJobcanSheet` がシート内 staffCode を返す。取込オーケストレーション（`jobcan-import.ts`）が
  両者を突合し、不一致ファイルを throw で当該ファイルのみ取込中止（他ファイルは継続）にする。

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
- **実装（事実）:** `resolveRefreshTokenByEmail` / `lookupSlackUserIdByEmail` /
  `interpretSlackLookupResponse` を実装済み。`users_not_found` のみ null、
  `invalid_auth` / `ratelimited` 等は throw（「見つからない」と「呼べなかった」を混同させない）。
  複数人版 `reconcileJobcanForAllStaff`（`jobcan-reconcile-all.ts`）が一人の失敗を他人へ波及させないよう隔離する。

### Step 2-7 — 取込オーケストレーション + `/api` ルート + 共有シークレット認証 + exceljs 導入

- **取込オーケストレーション（`jobcan-import.ts` / `jobcan-reconcile-all.ts`・packages・純ロジック）:**
  複数 xlsx を行列化済み rows で受け取り（exceljs 非依存）、ファイル単位でパース + staffCode 突合（論点4）を行う。
  隔離を全レイヤで対称化する（parse / ファイル名突合＝ファイル単位、名簿 get＝`directory_error`、
  トークン解決＝`resolve_error`、reconcile 本体＝`reconcile_error` を per-staff）。集約は
  `${staffCode}::${sourceMonth}`（同一人物の複数月まとめを許容・別人別月の混入はゼロ）。
  1入力の失敗で全バッチが全損しない二重防御を持つ。`reconcileError` / `warning` / `directory_error` /
  `reconcile_error` は **固定文言**（生 `err.message` を転写しない＝将来の DB 実装で接続文字列が漏れる芽を断つ）。
  サマリの件数フィールドは `staffMonthCount`（人×月件数）。
- **本番 `/api/jobcan/import`（`apps/web`・route handler）:** POST・既定 dry-run の薄い殻。
  - **共有シークレット認証（`verifyImportAuth`）を全経路の最前段に置く**（dry-run でも必須）。
    Bearer `JOBCAN_IMPORT_SECRET` を `crypto.timingSafeEqual`（定数時間比較・バイト長を先に判定）で照合。
    **secret 未設定は fail-closed で全拒否**（500 server misconfigured）、不一致は 401。
  - `validateUploadLimits`（50件 / 1ファイル 5MB / 合計 20MB）を arrayBuffer 展開の**前**に file.size で判定（DoS 抑止）。
  - `resolveDryRun`（M-4 二重ゲート）で `JOBCAN_APPLY_ENABLED`（`"true"`/`"1"`）× apply が揃った時だけ本反映。
    それ以外（undefined・未知値・型違い）は必ず dry-run へ倒す（フェイルオープンしない）。
  - `missingImportEnvVars` で必須 env 欠落を名前だけ返す（値＝秘密は返さない）。
  - `sanitizeFileName` で改行・制御文字を除去し長さ制限（Slack サマリの偽行注入・偽装を封じる）。
  - `xlsxToRows`（`apps/web/lib/jobcan-xlsx.ts`）で xlsx→`string[][]` 変換。`coerceCellText` の縫い目で
    マージセル時に exceljs `cell.text` が null 参照で throw する既知問題を吸収する。
- **exceljs 導入（論点2の実行）:** exceljs **4.4.0** を `apps/web/package.json` のみに追加（server 専用 import・
  クライアント非混入を build で確認）。規約例外の条件（4.4.0 ピン留め・apps/web 限定・design 追記）を満たす。

### Step 2-8 — 管理画面 + BFF 中継 + 名簿 API

- **画面（`apps/web/app/jobcan/`）:** `/jobcan`（取込 UI・dry-run 最小プレビュー・段階的 apply 確認・
  「まだ変更していません」明示）と `/jobcan/staff`（名簿・Slack 在籍確認・似名警告）。text 描画のみ
  （`dangerouslySetInnerHTML` は使わない）。OS ダークモードでも `color-scheme: light` 固定で可読。
  apply ボタンは dry-run 成功後（`phase === "reviewed"`）のみ描画し、ファイル差し替えで計画を破棄する
  （古い計画で apply させない）。apply 可否はサーバーの `result.dryRun` で駆動する。
- **画面認証 = Vercel Deployment Protection（infra 主ゲート・コード側画面認証なし＝社長判断）。**
- **BFF 中継（`/api/jobcan/import-ui`）:** ブラウザは secret を持てないため、中継が **同一プロセス内で
  import ルートの POST を直接呼び**（二重 fetch・自オリジン絶対 URL 推定を回避）、サーバー内で Authorization を付与する。
  `checkContentLength` で arrayBuffer 先読みの前に早期サイズ拒否する（認証通過後のメモリ枯渇 DoS 抑止）。
  認証・上限・dry-run ゲートの単一の権威は import ルートに残し、殻ではロジックを再実装しない。
- **名簿 API:** `/api/staff`（GET list / POST set / DELETE。別 email での上書きは 409）、
  `/api/staff/slack-check`（POST body で email を受け `{ present }` のみ返す＝slack_user_id は返さない。
  lookup が throw したら 502 で「確認できなかった」を present:false と誤認させない）。
  純ロジック `describeImportReason`（reason→日本語）/ `findSimilarStaffNames`（似名警告）/ `checkContentLength`。
- **PII 前提:** これらのレスポンスは Deployment Protection 下の管理画面向け。warnings 等が staff email を含み得るが、
  保護（infra 層）が主ゲートである前提で許容する。公開エンドポイント化・認証方式変更の際は PII マスクを再検討する。

### Step 2-9 — staffCode allowlist（第二関門）+ slack-check の POST 化

- **allowlist（`jobcan-import-safeguards.ts`）:** `parseStaffAllowlist(env) → Set<string> | null`。
  未設定・空・空白のみは **null（制限なし＝名簿全員許可）**。カンマ／空白区切りで分割し、各要素を
  `^[A-Z]\d{4}$` で検証、1つでも不正なら **throw（fail-loud）**。生 env 値（秘密相当）は例外に載せない。
  `isStaffAllowed` は null なら常に許可。`reconcileJobcanForAllStaff` の入口で `not_allowlisted` として隔離する。
  **位置づけ:** 名簿（第一関門・`email_not_registered` skip）に足す **env 絞り込みの第二関門**（社長判断）。
  allowlist は減算専用で、既存ガード（二重ゲート・削除の自タグ限定・per-staff 隔離・取り違え検出）は不変。
  - **重要な運用注意:** allowlist はキルスイッチではない。**空にしても全拒否でなく全許可** になる。
    反映を止める唯一のスイッチは `JOBCAN_APPLY_ENABLED` を外すこと（[operations.md](./operations.md) 3.1）。
    連続区切り（`A0187,,B0002`）は throw せず畳む（安全側）。
- **slack-check の POST 化:** email を URL クエリから外し JSON body で受ける（アクセスログに PII を残さない）。

### staffCode 書式の統一方針（`^[A-Z]\d{4}$`）

- **確定方針:** staffCode の正規表現は **`^[A-Z]\d{4}$`（大文字英字1 + 数字4桁）に統一する。** 小文字は弾く（社長判断・論点2-5）。
- **理由:** 名簿（`staff-directory.ts`）・allowlist・共有判定（`staff-code.ts`）・UI バリデーションは既に大文字限定。
  一方でパーサ（`parsers/jobcan-sheet.ts` / `logic/jobcan-filename.ts`）は当初 `^[A-Za-z]\d{4}$`（小文字許容）で、
  `a0187` がパースは通るのに名簿 get で throw する非対称があった。書式を1つに揃えて事故面を無くす。
- **実装（事実）:** 名簿・allowlist・`staff-code.ts` は `^[A-Z]\d{4}$` で確定済み。パーサ側も同じ大文字限定へ統一する
  （その前提で本書・[operations.md](./operations.md) を記述する）。実データは大文字（A0187）で来るため実害には当たっていない。

---

## 4. ガード（防御を設計に落とす）

### 4.1 誤爆防止5層（[requirements.md](./requirements.md) 4.3 の実装方針）

1. 既定 dry-run（`JobcanReconcileOptions.dryRun`）。
2. `JOBCAN_APPLY_ENABLED` 未設定なら強制 dry-run（`resolveDryRun` の二重ゲート・route に配線済み）。
3. staffCode allowlist（第一関門＝名簿 `email_not_registered` skip、第二関門＝env `parseStaffAllowlist` / `isStaffAllowed`。実装済み）。
4. 書き込み関数は dry-run 分岐の内側のみ（`runDay` は dryRun 時に `executeDayPlan` を呼ばない）。
5. 削除は自タグ限定（`planJobcanDayUpsert` の不変条件 + `executeJobcanDayPlan` の再照合）。

> **運用注意:** allowlist（層3の第二関門）は空にすると全拒否でなく **全許可** になる。反映を止める唯一のスイッチは
> `JOBCAN_APPLY_ENABLED` を外すこと（層2）。詳細は [operations.md](./operations.md) 3.1。

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
- [operations.md](./operations.md) — デプロイ・運用手順（環境変数・安全設計・運用注意）
</content>
