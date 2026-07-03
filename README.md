# management

複数のツールを個別に開発し、最終的に**本アプリ（単一 Next.js）へ「共有パッケージ」単位で結合する**ためのモノレポ（機能インキュベーター）です。

> **設計方針**
> - 各ツールは `packages/{ツール名}` として **react のみに依存する自己完結パッケージ** にする
> - `apps/web` は **プレビュー / 動作確認用のホストアプリ**
> - 本アプリへは `packages/{ツール名}/src/` を **フォルダごとコピー** すれば結合できる形にしてある
> - 「ツールの分離」は **フォルダ（パッケージ）＋ ツールごとのブランチ** で行う

---

## ディレクトリ構成

```
management/
├── apps/
│   └── web/                      # プレビュー用ホスト
├── packages/
│   ├── _template/                # ← 新しいツールのお手本。コピーして使う
│   │   ├── src/index.ts          #    公開API (バレル)
│   │   ├── src/ToolTemplate.tsx  #    実装本体 (外部依存は react のみ)
│   │   └── package.json          #    @management/tool-template
│   └── {ツール名}/               # 各ツール (例: @management/photo-picker)
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## 使用ツール

| ツール | 役割 |
| --- | --- |
| [pnpm workspaces](https://pnpm.io/workspaces) | ワークスペース (`apps/*`, `packages/*`) と依存管理 |
| [Turborepo](https://turborepo.dev/) | ビルド/開発タスクの実行・キャッシュ |
| Next.js | プレビュー用ホストアプリ (`apps/web`) |

---

## セットアップ

```bash
corepack enable pnpm    # 未導入なら
pnpm install            # ルートで1回
pnpm dev                # apps/web が起動
```

運用ルール（ブランチモデル・担当スコープ・ツール初期化手順）は **[CLAUDE.md](./CLAUDE.md)** を参照してください。

---

## 新しいツールを作る（概要）

```bash
git fetch origin
git checkout -b feature/{ツール名} origin/main   # ツール専用ブランチ
cp -r packages/_template packages/{ツール名}      # お手本をコピー
# package.json の name を @management/{ツール名} に、index.ts / コンポーネントをリネーム
pnpm install
```

詳細は [CLAUDE.md](./CLAUDE.md) を参照。

---

## ツールの開発ルール（結合しやすさを保つため）

本アプリへ「そのままコピー」できるよう、各 `packages/{ツール名}` は次を守ります。

1. **外部依存は react（と必要なら react-dom）のみ**に抑える
   - 他の npm パッケージが必要なら、そのツールの `package.json` に明記し、結合時に本アプリへも追加する
2. **パッケージ内の import は相対パス**にする（`./`, `../`）
   - コピー後もパスが壊れない
3. **公開するものは `src/index.ts`（バレル）に集約**する
   - 本アプリからは `index.ts` 経由でのみ使う想定
4. 複数ツールで共有するコードが出てきたら `packages/shared` を作ってそこに置く

---

## 本アプリ（単一 Next.js）への結合手順

例として `photo-picker` を結合する場合：

1. `packages/photo-picker/src/` を本アプリの `src/features/photo-picker/` に**フォルダごとコピー**
   ```bash
   cp -r packages/photo-picker/src /path/to/main-app/src/features/photo-picker
   ```
2. 本アプリ側で import する
   ```tsx
   import { PhotoPicker } from "@/features/photo-picker"; // = src/features/photo-picker/index.ts
   ```
3. そのツールが追加の npm 依存を持っていれば、本アプリに `pnpm add` する

> パッケージ内が相対 import で完結しているので、コピー後に書き換えるのは**呼び出し側の import パスだけ**です。
> `@management/{ツール名}` という名前はこのモノレポ内でのみ使われ、本アプリには持ち込まれません。

---

## Git ワークフロー

- `main`: 常に `pnpm build` が通る状態を保つ。**直接 push 禁止**（PR経由でmerge）
- ツール開発: `feature/{ツール名}` ブランチで開発 → 完成したら PR → `main` に squash merge
- 変更を書くたびに、Stop フックが自動で `feature/*` ブランチへ commit & push する
