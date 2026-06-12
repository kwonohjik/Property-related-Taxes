#!/usr/bin/env bash
#
# wt-rm.sh — wt-new.sh로 만든 worktree 정리
#
#   심볼릭 링크(node_modules·.env.local)는 worktree 폴더와 함께 사라짐.
#   링크는 '링크 자체'만 지우므로 메인 repo의 실체는 안전.
#
# 사용법:
#   scripts/wt-rm.sh <name> [--force] [--delete-branch]
#     --force          미커밋 변경이 있어도 강제 제거
#     --delete-branch  연결된 브랜치도 삭제 (머지 완료분만 권장)
#
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

NAME="${1:-}"
if [[ -z "$NAME" ]]; then
  echo "usage: scripts/wt-rm.sh <name> [--force] [--delete-branch]" >&2
  exit 1
fi
shift

FORCE=""
DEL_BRANCH=""
for arg in "$@"; do
  case "$arg" in
    --force) FORCE="--force" ;;
    --delete-branch) DEL_BRANCH="1" ;;
    *) echo "✗ 알 수 없는 옵션: $arg" >&2; exit 1 ;;
  esac
done

WT_DIR="$REPO_ROOT/.claude/worktrees/$NAME"
if [[ ! -e "$WT_DIR" ]]; then
  echo "✗ worktree 없음: $WT_DIR" >&2
  exit 1
fi

BRANCH="$(git -C "$WT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

echo "▸ worktree remove: $WT_DIR"
git worktree remove $FORCE "$WT_DIR"
git worktree prune

if [[ -n "$DEL_BRANCH" && -n "$BRANCH" ]]; then
  echo "▸ branch delete: $BRANCH"
  git branch -D "$BRANCH"
fi

echo "✅ 제거 완료${BRANCH:+  (브랜치 $BRANCH${DEL_BRANCH:+ 삭제됨})}"
