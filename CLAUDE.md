# CLAUDE.md — management リポジトリ運用ルール

このリポジトリは **複数のツールを個別に開発し、本アプリ（単一 Next.js）へ共有パッケージ単位で結合する**ための機能インキュベーターです。
各 Claude Code セッションはこのルールに従ってください。

---

## ブランチモデル（重要）

| ブランチ | 役割 | 自動push |
| --- | --- | --- |
| `main` | 統合ブランチ。常に `pnpm build` が通る状態を保つ。**直接 push 禁止**（PR経由でmerge） | ❌ しない |
| `feature/{ツール名}` | そのツール専用の開発ブランチ（例 `feature/photo-picker`） | ✅ する |

> ⚠️ 「ツールごとに1ブランチ」です。1つのセッションは **1ツール・1ブランチ**だけを担当します。

---

## 各セッションの担当スコープ

1. 自分の担当ブランチ（例 `feature/{ツール名}`）を **必ずチェックアウトしてから**作業を始める
2. 触ってよいのは **自分のツールフォルダのみ**
   - `packages/{ツール名}/` （担当ツールの実装）
   - `apps/web/`（プレビュー確認のためだけ。他ツールの表示を壊さない）
3. **`main` には直接コミット・push しない**。統合はオーナーが PR で行う
4. 他ツールのフォルダは編集しない

---

## 新しいツールの初期化手順

1. 担当ブランチを作ってチェックアウト
   ```bash
   git fetch origin
   git checkout -b feature/{ツール名} origin/main
   ```
2. お手本パッケージ `packages/_template` をコピーして自分のツール名にリネーム
   ```bash
   cp -r packages/_template packages/{ツール名}
   ```
3. `packages/{ツール名}/package.json` の `name` を `@management/{ツール名}` に変更
4. `src/index.ts` / コンポーネント名を自分のツールに合わせてリネーム・実装
5. ルートで `pnpm install` → 開発開始

---

## 自動 push の仕組み

- Claude Code の **Stop フック**（`.claude/hooks/auto-push.sh`）が、応答の区切りごとに自動実行される
- 挙動: 現在のブランチが `feature/*`（または `feature-*`）のときだけ、変更を `chore(auto): <branch> WIP sync` としてコミットし、`origin/<branch>` に push する
- `main` やその他のブランチでは **何もしない**（安全装置）
- WIP コミットが増えるので、`main` へ統合する際は **squash merge** で履歴を1つにまとめる想定

---

## 複数ツールを並行開発するとき

git のブランチはリポジトリ全体の状態なので、1つの作業フォルダで複数ブランチを同時には扱えません。
基本は **ツール（担当者）ごとに別々の clone** を用意してください。

```bash
# 例: このフォルダの隣に clone する
git clone https://github.com/babaz-makar/management.git management-{ツール名}
cd management-{ツール名}
pnpm install
```

（1人で複数ツールを持つ場合は `git worktree` でフォルダを分けても構いません）

---

## ツールパッケージの開発規約（本アプリへ結合しやすく保つ）

1. **外部依存は react / react-dom のみ**に抑える。追加が必要なら `package.json` に明記
2. パッケージ内の import は **相対パス**（`./`, `../`）で完結させる
3. 公開するものは **`src/index.ts`（バレル）に集約**する
4. 作業を終える前に、リポジトリルートで `pnpm build` が通ることを確認する

## 本アプリへの結合（オーナー作業）

`packages/{ツール名}/src/` を本アプリの `src/features/{ツール名}/` にコピーし、`import { XXX } from "@/features/{ツール名}"` で使う。
詳細は [README.md](./README.md) を参照。
