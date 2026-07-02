#!/usr/bin/env bash
# 自動 push フック（Stop フックから呼ばれる）
# 現在のブランチが feature-* のときだけ、変更をコミットして origin/<branch> へ push する。
# main / その他のブランチでは何もしない。セッションを止めないよう常に exit 0。
set +e

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# git リポジトリでなければ何もしない
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
case "$branch" in
  feature-*) ;;                # 対象
  *) exit 0 ;;                 # main / その他は自動 push しない（安全装置）
esac

# 変更（追跡/未追跡いずれか）があればコミット
if ! git diff --quiet 2>/dev/null \
   || ! git diff --cached --quiet 2>/dev/null \
   || [ -n "$(git ls-files --others --exclude-standard 2>/dev/null)" ]; then
  git add -A
  git -c user.name="${GIT_AUTHOR_NAME:-claude-auto}" \
      -c user.email="${GIT_AUTHOR_EMAIL:-ai_div@sho-san.co.jp}" \
      commit -q -m "chore(auto): ${branch} WIP sync" >/dev/null 2>&1
fi

# 未 push のコミットがあれば push（無ければ何も起きない）
git push -u origin "$branch" >/dev/null 2>&1

exit 0
