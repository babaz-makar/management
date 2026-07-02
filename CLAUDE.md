# CLAUDE.md — management リポジトリ運用ルール

このリポジトリは **4つの機能を並行開発し、本アプリ（単一 Next.js）へ共有パッケージ単位で結合する**ための機能インキュベーターです。
各 Claude Code セッションはこのルールに従ってください。

---

## ブランチモデル（重要）

| ブランチ | 役割 | 自動push |
| --- | --- | --- |
| `main` | 統合ブランチ。常に `pnpm build` が通る状態を保つ。**直接 push 禁止**（PR経由でmerge） | ❌ しない |
| `feature-a` | `packages/feature-a` 専用の開発ブランチ | ✅ する |
| `feature-b` | `packages/feature-b` 専用の開発ブランチ | ✅ する |
| `feature-c` | `packages/feature-c` 専用の開発ブランチ | ✅ する |
| `feature-d` | `packages/feature-d` 専用の開発ブランチ | ✅ する |

> ⚠️ 「機能ごとに1ブランチ（mini branch）」です。1つのセッションは **1機能・1ブランチ**だけを担当します。

---

## 各セッションの担当スコープ

1. 自分の担当ブランチ（例 `feature-a`）を **必ずチェックアウトしてから**作業を始める
2. 触ってよいのは **自分の機能フォルダのみ**
   - `packages/feature-a/` （担当機能の実装）
   - `apps/web/`（プレビュー確認のためだけ。他機能の表示を壊さない）
3. **`main` には直接コミット・push しない**。統合はオーナーが PR で行う
4. 他機能のフォルダ（`packages/feature-b` 等）は編集しない

---

## 自動 push の仕組み

- Claude Code の **Stop フック**（`.claude/hooks/auto-push.sh`）が、応答の区切りごとに自動実行される
- 挙動: 現在のブランチが `feature-*` のときだけ、変更を `chore(auto): <branch> WIP sync` としてコミットし、`origin/<branch>` に push する
- `main` やその他のブランチでは **何もしない**（安全装置）
- WIP コミットが増えるので、`main` へ統合する際は **squash merge** で履歴を1つにまとめる想定

---

## 複数セッションの起動方法（衝突回避）

git のブランチはリポジトリ全体の状態なので、**1つの作業ディレクトリで4ブランチを同時に扱えません**。
機能ごとに **git worktree** で作業ディレクトリを分けてください（推奨）。

```bash
# main のあるディレクトリで一度だけ実行
git fetch origin
git worktree add ../kanri-feature-a feature-a
git worktree add ../kanri-feature-b feature-b
git worktree add ../kanri-feature-c feature-c
git worktree add ../kanri-feature-d feature-d
```

各 worktree で `pnpm install` → Claude Code を起動し、それぞれが担当機能を開発します。
（worktree の代わりに、リポジトリを4つ clone しても構いません）

---

## 機能パッケージの開発規約（本アプリへ結合しやすく保つ）

1. **外部依存は react / react-dom のみ**に抑える。追加が必要なら `package.json` に明記
2. パッケージ内の import は **相対パス**（`./`, `../`）で完結させる
3. 公開するものは **`src/index.ts`（バレル）に集約**する
4. 作業を終える前に、リポジトリルートで `pnpm build` が通ることを確認する

## 本アプリへの結合（オーナー作業）

`packages/feature-x/src/` を本アプリの `src/features/feature-x/` にコピーし、`import { FeatureX } from "@/features/feature-x"` で使う。
詳細は [README.md](./README.md) を参照。
