#!/usr/bin/env bash
# select-test-scope.sh 판정 회귀 테스트.
# 좁히기 오판정은 회귀 안전망을 뚫는 방향이므로, "전체로 가야 하는" 케이스를 특히 두껍게 검증한다.
set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0; FAIL=0
check() { # check <기대> <설명> <<< 파일목록
  local want="$1" desc="$2" got
  got="$(./scripts/select-test-scope.sh --stdin)"
  if [ "$got" = "$want" ]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    printf '  ✗ %s\n     기대=%s 실제=%s\n' "$desc" "$want" "$got"
  fi
}

echo "▶ select-test-scope 판정 테스트"

# ── 좁히기 허용 ──────────────────────────────────────────────
check test:transfer "양도세 UI+API변환+테스트 (PR #837 실제 변경분)" <<'EOF'
__tests__/calc/transfer-split-acq-stdprice-gate.test.ts
components/calc/transfer/CompanionAcqPurchaseBlock.tsx
docs/02-design/features/transfer-separate-acq-date-per-part-completion.plan.md
e2e/split-mode-gating.spec.ts
lib/calc/transfer-tax-api.ts
EOF

check test:transfer "양도세 엔진 테스트만" <<'EOF'
__tests__/tax-engine/transfer-tax/split-acq-axis-predo.anchor.test.ts
EOF

check test:acquisition "취득세 UI" <<'EOF'
components/calc/acquisition/Step2.tsx
EOF

check none "문서만" <<'EOF'
docs/02-design/features/foo.plan.md
README.md
EOF

check none "E2E spec만 (vitest 미실행)" <<'EOF'
e2e/split-mode-gating.spec.ts
EOF

# ── 전체로 가야 하는 케이스 (안전망) ─────────────────────────
check test "엔진 공유 — lib/tax-engine/**는 무조건 전체" <<'EOF'
lib/tax-engine/transfer-tax-split-gain.ts
EOF

check test "타입 공유" <<'EOF'
lib/tax-engine/types/transfer.types.ts
EOF

check test "Zod 스키마(lib/api)" <<'EOF'
lib/api/transfer-tax-schema.ts
EOF

check test "zustand store 공유" <<'EOF'
lib/stores/calc-wizard-asset.ts
EOF

check test "두 세목 동시 변경" <<'EOF'
components/calc/transfer/Foo.tsx
components/calc/gift/Bar.tsx
EOF

check test "설정 파일" <<'EOF'
package.json
EOF

check test "훅·스크립트 자체" <<'EOF'
scripts/select-test-scope.sh
EOF

check test "미분류 신규 경로 (기본값=전체)" <<'EOF'
lib/kiwoom/client.ts
EOF

check test "세목 경로 + 공유 경로 혼합" <<'EOF'
components/calc/transfer/Foo.tsx
lib/tax-engine/transfer-tax-helpers.ts
EOF

echo "  통과 $PASS · 실패 $FAIL"
[ "$FAIL" -eq 0 ]
