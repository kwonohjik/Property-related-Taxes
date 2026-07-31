#!/usr/bin/env bash
#
# check-workflow-runner.sh — GitHub 호스팅 러너 사용 차단 체크.
#
# 정책 project_ci_self_hosted_runner (루트 CLAUDE.md "CI는 self-hosted 러너에서 돈다"):
#   무료 계정 + 비공개 저장소는 Actions 월 2,000분이다. 종전 CI는 변경 1건당 2회 ×
#   10.4~14.4분(2026-07 실측)이라 약 83건이면 소진했고, 소진 후에는 3~13초 만에 거부되어
#   **과금도 신호도 없는** 상태가 됐다(7월 실패 723건).
#   → 개발자 Mac을 러너로 등록해 해결했다. GitHub은 **self-hosted 실행에 분을 과금하지 않는다**.
#   `runs-on: ubuntu-latest`로 워크플로를 추가하면 그 순간 다시 과금이 시작된다.
#
# ## 예외 — 스케줄 워크플로만 GitHub 호스팅 허용
#
#   `schedule:` 트리거가 있는 워크플로는 **Mac이 꺼져 있어도 떠야** 한다:
#     · supabase-keepalive — 밀리면 Supabase가 pause되어 세율 로드가 fallback으로 떨어진다
#     · matrix-update      — 분기 1회 행정구역 갱신
#   합쳐 월 10여 분이라 한도에 영향이 없다. self-hosted로 옮기면 Mac이 꺼진 동안 누락된다.
#
#   → 규칙은 **"schedule 트리거가 있으면 허용"**이다. 별도 화이트리스트를 두지 않는다 —
#     목록은 낡지만 이 조건은 파일 자체가 스스로 증명한다.
#
# 사용법: scripts/check-workflow-runner.sh [워크플로 디렉터리]   # 기본 .github/workflows
#
# 하드블록: .husky/pre-push (pre-push가 진짜 게이트 — CI는 머지를 차단하지 않는다).
set -euo pipefail

DIR="${1:-.github/workflows}"

[ -d "$DIR" ] || { echo "✓ 워크플로 디렉터리 없음 ($DIR) — 검사 생략"; exit 0; }

violations=""

for f in "$DIR"/*.yml "$DIR"/*.yaml; do
  [ -e "$f" ] || continue

  # GitHub 호스팅 러너 라벨. 주석(`#`)으로 시작하는 줄은 제외 — 정책 설명문에 예시가 들어간다.
  hosted=$(grep -nE '^[[:space:]]*runs-on:[[:space:]]*(ubuntu|macos|windows)-' "$f" 2>/dev/null || true)
  [ -n "$hosted" ] || continue

  # `schedule:` 트리거가 있으면 허용 (Mac 전원과 무관하게 떠야 하는 워크플로).
  if grep -qE '^[[:space:]]*schedule:' "$f" 2>/dev/null; then
    continue
  fi

  violations+="$(printf '%s\n' "$hosted" | sed "s|^|${f}:|")"$'\n'
done

if [ -n "$violations" ]; then
  count=$(printf '%s' "$violations" | grep -c . || true)
  echo "✗ GitHub 호스팅 러너 ${count}건 (금지 — 'runs-on: self-hosted' 사용):"
  printf '%s' "$violations"
  echo
  echo "  무료 한도(월 2,000분)를 소진하면 CI가 3초 만에 거부되어 신호가 사라진다."
  echo "  GitHub은 self-hosted 실행에 분을 과금하지 않는다 — 러너: ~/actions-runner/svc.sh status"
  echo "  Mac 전원과 무관하게 떠야 하는 워크플로라면 'schedule:' 트리거를 두면 허용된다."
  exit 1
fi

echo "✓ GitHub 호스팅 러너 0건 ($DIR — schedule 워크플로는 예외)"
