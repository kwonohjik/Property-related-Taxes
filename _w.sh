#!/usr/bin/env bash
# THROWAWAY — 체크 등록 대기 후 감시. 머지는 하지 않는다(결과 확인 후 수동).
set -uo pipefail
PR="$1"
for _ in $(seq 1 40); do
  out="$(gh pr checks "$PR" 2>&1)"
  case "$out" in
    *"no checks reported"*) sleep 10 ;;
    *) break ;;
  esac
done
gh pr checks "$PR" --watch --fail-fast
echo "WATCH_EXIT=$?"
