# management

4つの機能を開発し、最終的に**本アプリ（単一 Next.js）へ「共有パッケージ」単位で結合する**ためのモノレポ（機能インキュベーター）です。

> **設計方針**
> - 各機能は `packages/feature-*` として **react のみに依存する自己完結パッケージ** にする
> - `apps/web` は **プレビュー / 動作確認用のホストアプリ**（4機能を import して表示するだけ）
> - 本アプリへは `packages/feature-x/src/` を **フォルダごとコピー** すれば結合できる形にしてある
> - 「機能の分離」は **branch ではなくフォルダ（パッケージ）** で行う

---

## ディレクトリ構成

```
management/
├── apps/
│   └── web/                      # プレビュー用ホスト。4機能を import して確認するだけ
│       ├── src/app/page.tsx      # FeatureA〜D を並べて表示
│       └── next.config.ts        # transpilePackages に4機能を登録
├── packages/
│   ├── feature-a/                # ← 本アプリへ移植する単位
│   │   ├── src/index.ts          #    公開API (バレル)
│   │   ├── src/FeatureA.tsx      #    実装本体 (外部依存は react のみ)
│   │   └── package.json          #    @management/feature-a
│   ├── feature-b/                # @management/feature-b
│   ├── feature-c/                # @management/feature-c
│   └── feature-d/                # @management/feature-d
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

> `feature-a`〜`feature-d` は仮名です。実際の機能名が決まったらフォルダ名・`package.json` の `name`・コンポーネント名をリネームしてください。

## 使用ツール

| ツール | 役割 |
| --- | --- |
| [pnpm workspaces](https://pnpm.io/workspaces) | ワークスペース (`apps/*`, `packages/*`) と依存管理 |
| [Turborepo](https://turborepo.dev/) | ビルド/開発タスクの実行・キャッシュ |
| Next.js | プレビュー用ホストアプリ (`apps/web`) |

---

## セットアップ

### 担当者（初心者）向け: GitHub Codespaces（推奨・ターミナル不要）
ブラウザだけで開発できます。パソコンへのインストール不要。
→ **[docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md)** を参照。

要点:
- GitHub の「Code → Codespaces → New with options」で**自分の担当ブランチ**を選んで作成
- `.devcontainer/devcontainer.json` が起動時に自動で `pnpm install` と Claude Code 拡張の導入まで行う
- Claude Code に日本語で頼むと、コードもgitも自動。書いたものは自分のブランチへ自動push

### ローカルで動かす場合
```bash
corepack enable pnpm    # 未導入なら
pnpm install            # ルートで1回
pnpm dev                # apps/web が起動し4機能をプレビュー
```

各機能を開発するときは `packages/feature-x/src/` を編集すれば、`apps/web` にホットリロードで反映されます。

---

## 機能の開発ルール（結合しやすさを保つため）

本アプリへ「そのままコピー」できるよう、各 `packages/feature-*` は次を守ります。

1. **外部依存は react（と必要なら react-dom）のみ**に抑える
   - 他の npm パッケージが必要なら、その機能の `package.json` に明記し、結合時に本アプリへも追加する
2. **パッケージ内の import は相対パス**にする（`./`, `../`）
   - コピー後もパスが壊れない
3. **公開するものは `src/index.ts`（バレル）に集約**する
   - 本アプリからは `index.ts` 経由でのみ使う想定
4. 機能をまたぐ共有コードが出てきたら `packages/shared` を作ってそこに置く

---

## 本アプリ（単一 Next.js）への結合手順

例として `feature-a` を結合する場合：

1. `packages/feature-a/src/` を本アプリの `src/features/feature-a/` に**フォルダごとコピー**
   ```bash
   cp -r packages/feature-a/src /path/to/main-app/src/features/feature-a
   ```
2. 本アプリ側で import する
   ```tsx
   import { FeatureA } from "@/features/feature-a"; // = src/features/feature-a/index.ts
   ```
3. その機能が追加の npm 依存を持っていれば、本アプリに `pnpm add` する
4. 4機能ぶん 1〜3 を繰り返す

> パッケージ内が相対 import で完結しているので、コピー後に書き換えるのは**呼び出し側の import パスだけ**です。
> `@management/feature-x` という名前はこのモノレポ内でのみ使われ、本アプリには持ち込まれません。

### 補足: git subtree で履歴ごと移す場合
コピーではなく履歴を残して移したいときは、本アプリ側で:
```bash
git subtree add --prefix=src/features/feature-a \
  https://github.com/babaz-makar/management.git main --squash
```
（ただし単一アプリへは単純コピーの方が扱いやすいことが多いです）

---

## デプロイ（Vercel）

このリポジトリ自体は `apps/web`（プレビュー）を Vercel に接続すれば、push ごとに 4機能をまとめて確認できます。

- Vercel で新規プロジェクト作成 → このリポジトリを接続
- **Root Directory** に `apps/web` を指定
- `main` → 本番 / その他ブランチ・PR → Preview URL 自動生成

> 本番運用は結合先の本アプリ側で行う想定なので、このリポジトリの Vercel 連携は
> 「4機能のプレビュー環境」として使うのがおすすめです。

## Git ワークフロー

- `main`: 常に `pnpm build` が通る状態を保つ
- 機能開発: `feat/feature-a-xxx` のようにブランチを切って PR → merge
- branch は「開発・レビューの単位」。機能を増やすときは branch ではなく `packages/` にフォルダを足す
