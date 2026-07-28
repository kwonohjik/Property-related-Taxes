#!/usr/bin/env bash
# 변경 파일 경로로 pre-push 테스트 범위를 판정한다.
#
# 출력(stdout) 한 줄:
#   none              → 테스트 불필요 (문서·E2E spec만 변경)
#   test:transfer     → 해당 세목 스크립트만
#   test:acquisition | test:property | test:comprehensive | test:inheritance | test:gift
#   test              → 전체 (기본값 · 판정 불가 시)
#
# ⚠️ 설계 원칙 — **의심스러우면 전체**:
#   이 저장소는 "회귀 허용치 0"(__tests__/tax-engine/CLAUDE.md)이다. 좁히기는
#   **명백히 한 세목에만 속하는 경로**로 한정하고, 조금이라도 공유 가능성이 있으면 전체로 넘긴다.
#   특히 `lib/tax-engine/**`는 세목 간 공유·단방향 의존(종부세→재산세, 상속·증여 property-valuation
#   공유)이 있으므로 **무조건 전체**다. 좁히기는 UI·API변환·세목 테스트처럼 경계가 뚜렷한 층에만 적용.
#   (memory feedback_per_tax_test_scripts)

set -euo pipefail

FULL="test"

# ── 변경 파일 수집 ────────────────────────────────────────────────
# origin/master 기준 커밋분 + 워킹트리 미커밋분의 합집합.
# pre-push는 워킹트리를 검증하므로(memory feedback_prehook_working_tree_vs_committed)
# 양쪽을 모두 본다. 판정 불가 시 전체.
if [ "${1:-}" = "--stdin" ]; then
  # 테스트용: 변경 파일 목록을 stdin으로 받는다 (scripts/select-test-scope.test.sh)
  FILES="$(cat | sed '/^$/d' | sort -u)"
else
  BASE="$(git merge-base origin/master HEAD 2>/dev/null || true)"
  if [ -z "$BASE" ]; then
    echo "$FULL"; exit 0
  fi

  FILES="$(
    {
      git diff --name-only "$BASE"..HEAD 2>/dev/null || true
      git status --porcelain 2>/dev/null | sed 's/^...//' | sed 's/.* -> //' || true
    } | sed '/^$/d' | sort -u
  )"
fi

# 변경 없음 → 전체(안전측). 빈 diff로 게이트를 통과시키지 않는다.
if [ -z "$FILES" ]; then
  echo "$FULL"; exit 0
fi

# ── 분류 ──────────────────────────────────────────────────────────
# neutral : vitest 실행에 영향 없음 (문서·Playwright spec)
# 세목    : 그 세목 전용 경로
# 그 외   : 공유 → 전체
domain_of() {
  case "$1" in
    docs/*|*.md|e2e/*) echo "neutral" ;;

    components/calc/transfer/*|app/calc/transfer-tax/*|app/api/calc/transfer/*\
    |lib/calc/transfer-tax*|lib/calc/multi-transfer*\
    |__tests__/calc/transfer*|__tests__/tax-engine/transfer*|__tests__/tax-engine/transfer-tax/*)
      echo "test:transfer" ;;

    components/calc/acquisition/*|app/calc/acquisition-tax/*|app/api/calc/acquisition/*\
    |lib/calc/acquisition-tax*|__tests__/calc/acquisition*|__tests__/tax-engine/acquisition*)
      echo "test:acquisition" ;;

    components/calc/property/*|app/calc/property-tax/*|app/api/calc/property/*\
    |lib/calc/property-tax*|__tests__/calc/property-tax*|__tests__/tax-engine/property-tax*)
      echo "test:property" ;;

    components/calc/comprehensive/*|app/calc/comprehensive-tax/*|app/api/calc/comprehensive/*\
    |lib/calc/comprehensive-tax*|__tests__/calc/comprehensive*|__tests__/tax-engine/comprehensive*)
      echo "test:comprehensive" ;;

    components/calc/inheritance/*|app/calc/inheritance-tax/*|app/api/calc/inheritance/*\
    |lib/calc/inheritance-tax*|__tests__/calc/inheritance*|__tests__/tax-engine/inheritance*)
      echo "test:inheritance" ;;

    components/calc/gift/*|app/calc/gift-tax/*|app/api/calc/gift/*\
    |lib/calc/gift-tax*|__tests__/calc/gift*|__tests__/tax-engine/gift*)
      echo "test:gift" ;;

    # lib/tax-engine/** · lib/stores/** · lib/api/** · types/** · 설정파일 등 전부 공유
    *) echo "shared" ;;
  esac
}

PICK=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  d="$(domain_of "$f")"
  case "$d" in
    neutral) continue ;;
    shared)  echo "$FULL"; exit 0 ;;
    *)
      if [ -z "$PICK" ]; then
        PICK="$d"
      elif [ "$PICK" != "$d" ]; then
        # 두 세목 이상 동시 변경 → 전체
        echo "$FULL"; exit 0
      fi
      ;;
  esac
done <<EOF
$FILES
EOF

if [ -z "$PICK" ]; then
  echo "none"      # 문서·E2E spec만 변경
else
  echo "$PICK"
fi
