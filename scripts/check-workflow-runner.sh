#!/usr/bin/env bash
#
# check-workflow-runner.sh — self-hosted 러너 사용 차단 체크.
#
# ## 방향이 2026-08-04에 뒤집혔다 (저장소 public 전환)
#
# 종전(2026-07-31~08-04)에는 **GitHub 호스팅을 차단**했다. 비공개 저장소의 Actions 무료
# 한도(월 2,000분)를 상시 초과했기 때문이다 — 변경 1건당 2회 × 10.4~14.4분이라 약 83건이면
# 소진했고, 소진 후에는 3~13초 만에 거부되어 과금도 신호도 없었다(7월 실패 723건).
#
# 저장소가 public이 되면서 두 전제가 동시에 뒤집혔다:
#   1. public 저장소는 **GitHub 호스팅 러너가 무료**다 — 한도 문제 자체가 사라졌다.
#   2. public에서 self-hosted는 **fork PR이 개발자 Mac에서 임의 코드를 실행**할 수 있다.
#      GitHub이 명시적으로 권장하지 않는 조합이라, 이제 막아야 할 쪽은 self-hosted다.
#
# ⚠️ 저장소를 다시 비공개로 되돌리면 1번 근거가 사라진다. 그때는 사용량을 먼저 확인하고
#    이 스크립트의 방향도 함께 되돌릴 것(양쪽 근거가 전부 저장소 공개 여부에 달려 있다).
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

  # 주석(`#`)으로 시작하는 줄은 제외 — 정책 설명문에 예시가 들어간다.
  # `runs-on: [self-hosted, ...]` 배열 형태도 잡는다.
  selfhosted=$(grep -nE '^[[:space:]]*runs-on:[[:space:]]*(self-hosted|\[.*self-hosted)' "$f" 2>/dev/null || true)
  [ -n "$selfhosted" ] || continue

  violations+="$(printf '%s\n' "$selfhosted" | sed "s|^|${f}:|")"$'\n'
done

if [ -n "$violations" ]; then
  count=$(printf '%s' "$violations" | grep -c . || true)
  echo "✗ self-hosted 러너 ${count}건 (금지 — 'runs-on: ubuntu-latest' 사용):"
  printf '%s' "$violations"
  echo
  echo "  이 저장소는 public이다 — 호스팅 러너는 무료이고, self-hosted는 fork PR이"
  echo "  개발자 Mac에서 임의 코드를 실행할 수 있어 위험하다."
  echo "  저장소를 비공개로 되돌렸다면 이 스크립트의 방향도 함께 되돌릴 것(주석 참조)."
  exit 1
fi

echo "✓ self-hosted 러너 0건 ($DIR)"
