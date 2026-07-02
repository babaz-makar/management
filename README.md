# management

複数の独立したアプリを **1つのリポジトリ** で管理する **モノレポ (monorepo)** です。

> **設計方針**: 「branch ごとに別アプリ」ではなく **「フォルダ (`apps/*`) ごとに別アプリ」** で分離します。
> 各アプリは Vercel 上で **別プロジェクト** として独立してデプロイ・本番運用できます。
> `main` は 1 本のまま、通常の Git ワークフロー (ブランチ → PR → merge) がそのまま使えます。

---

## ディレクトリ構成

```
management/
├── apps/                # デプロイ対象のアプリ (1 フォルダ = 1 アプリ)
│   └── web/             # サンプル: Next.js アプリ
├── packages/            # 複数アプリで共有するライブラリ・設定 (任意)
├── pnpm-workspace.yaml  # ワークスペース定義
├── turbo.json           # ビルドパイプライン / キャッシュ設定
└── package.json         # ルート (スクリプトと turbo のみ)
```

## 使用ツール

| ツール | 役割 |
| --- | --- |
| [pnpm workspaces](https://pnpm.io/workspaces) | 依存管理・ワークスペース (`apps/*`, `packages/*`) |
| [Turborepo](https://turborepo.dev/) | ビルド/開発タスクの実行・キャッシュ (Vercel 製) |
| Next.js | 各 Web アプリ |

---

## セットアップ

```bash
# pnpm を有効化 (未導入の場合)
corepack enable pnpm

# 依存インストール (ルートで 1 回)
pnpm install

# 全アプリを開発起動
pnpm dev

# 特定アプリだけ起動
pnpm --filter web dev
```

---

## 新しいアプリを追加する手順

1. `apps/<アプリ名>/` フォルダを作成する
   - 例: `apps/admin`, `apps/lp`, `apps/api`
   - 各アプリの `package.json` の `name` は **ユニーク** にする
2. `pnpm install` を実行 (ワークスペースに自動認識される)
3. Vercel で **新規プロジェクト** を作成し、このリポジトリを接続
   - **Root Directory** に `apps/<アプリ名>` を指定 ← ここが肝
   - これでアプリごとに別ドメイン・別本番環境になる

> ⚠️ 1 つの Vercel プロジェクトの Production Branch は原則 `main` 1 本。
> 「アプリの分離」は **branch ではなく Root Directory (フォルダ)** で行うのが Vercel の正しい使い方です。

---

## Vercel デプロイ構成 (イメージ)

| Vercel プロジェクト | Root Directory | ドメイン例 |
| --- | --- | --- |
| management-web | `apps/web` | web.example.com |
| management-admin | `apps/admin` | admin.example.com |
| management-lp | `apps/lp` | example.com |

すべて同じ `babaz-makar/management` リポジトリ・同じ `main` ブランチを参照しつつ、
Root Directory が違うので **互いに干渉せず独立してデプロイ** されます。

---

## Git ワークフロー

- `main`: 常にデプロイ可能な状態を保つ
- 機能開発: `feat/<内容>` ブランチを切って PR → `main` に merge
- Vercel が PR ごとに **Preview デプロイ** を自動生成 (レビュー用)

> branch は「開発の単位」であって「アプリの単位」ではありません。
> アプリを増やすときは branch ではなく `apps/` にフォルダを足してください。
