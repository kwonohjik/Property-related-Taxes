#!/usr/bin/env bash
#
# ship.sh — 브랜치 → 커밋 → 푸시 → PR → 머지 → 정리를 한 번에.
#
# 수시 수정(fix-test-merge) 사이클의 수동 단계를 없앤다.
# 진짜 게이트(시간 소요)는 git push 시 husky pre-push(tsc + 전체 test)뿐이며,
# master에 브랜치 보호가 없어 CI는 머지를 차단하지 않는다(머지 후 기록용 실행).
#
# 사용법:
#   scripts/ship.sh <branch> "<commit message>"          # 즉시 머지 + 브랜치 삭제 + master 동기화
#   scripts/ship.sh <branch> "<commit message>" --auto   # CI 통과 후 자동 머지(감독 불필요)
#
# 전제: master에서 작업 변경분을 들고 실행하거나, 이미 <branch>에 있는 상태.
#       repo 설정 deleteBranchOnMerge=true(원격 자동삭제) + allowAutoMerge=true(--auto) 적용됨.
#
set -euo pipefail

BRANCH="${1:?사용법: scripts/ship.sh <branch> \"<commit message>\" [--auto]}"
MSG="${2:?커밋 메시지가 필요합니다}"
MODE="${3:-}"

CUR="$(git branch --show-current)"

# 1) 브랜치 준비 — master/main이면 새로 분기(작업 변경분 그대로 가져감)
if [ "$CUR" = "master" ] || [ "$CUR" = "main" ]; then
  git checkout -b "$BRANCH"
elif [ "$CUR" != "$BRANCH" ]; then
  echo "✗ 현재 브랜치($CUR)가 master도 '$BRANCH'도 아닙니다. 중단." >&2
  exit 1
fi

# 2) 변경분 커밋 (pre-commit: lint-staged의 eslint --fix가 변경 파일 lint)
# git diff는 tracked 변경만 봐서 신규(untracked) 파일을 놓친다 → git status --porcelain
# (untracked·staged·modified 모두 감지, .gitignore 파일은 제외).
if [ -z "$(git status --porcelain)" ]; then
  echo "✗ 커밋할 변경이 없습니다." >&2
  exit 1
fi
git add -A
git commit -m "$MSG"

# 3) 푸시 — 여기서 husky pre-push(tsc + 전체 test)가 진짜 게이트
git push -u origin "$BRANCH"

# 4) PR 생성(이미 있으면 무시)
gh pr create --fill --base master 2>/dev/null || echo "ℹ PR 이미 존재 — 재사용"

# 5) 머지 + 정리
if [ "$MODE" = "--auto" ]; then
  gh pr merge "$BRANCH" --auto --merge --delete-branch
  echo "✅ auto-merge 예약 완료 — CI 통과 시 머지 + 원격/로컬 브랜치 삭제. 다음 작업 진행 가능."
else
  gh pr merge "$BRANCH" --merge --delete-branch
  git checkout master
  git pull --ff-only
  # gh --delete-branch는 체크아웃 중이던 로컬 브랜치를 못 지움 → master 이동 후 명시 삭제 + prune
  git branch -d "$BRANCH" 2>/dev/null || git branch -D "$BRANCH" 2>/dev/null || true
  git fetch -p --quiet
  echo "✅ 머지 + 원격/로컬 브랜치 삭제 + master 동기화 완료."
fi
