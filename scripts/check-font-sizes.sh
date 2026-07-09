#!/usr/bin/env bash
#
# check-font-sizes.sh — 임의 크기 폰트 클래스(text-[Npx/rem/em]) 사용 차단 체크.
#
# 라벨 타이포그래피 표준(계획 docs/02-design/features/ui-label-typography-standardization.plan.md §3·§5.2):
#   · 온-스케일(12/14/16/18/24) = 내장 text-xs/sm/base/lg/2xl 정본
#   · 오프스케일(11/10)         = 커스텀 text-caption/text-micro
#   · 임의 크기 폰트(text-[Npx]·[Nrem]·[Nem]) = 금지
#
# grep 기반 — className 속성뿐 아니라 cn()/clsx 인자·template literal 안의 arbitrary 크기도 포착
# (ESLint className-AST는 이들을 놓침 — 계획 F3).
#
# 사용법:
#   scripts/check-font-sizes.sh [경로...]     # 기본 범위: app components
#
# 상태: P0 골격(수동 실행·마이그레이션 진행률 추적용).
#       P5에서 .husky/pre-push 에 편입해 하드블록(pre-push가 진짜 게이트 — CI는 비차단).
set -euo pipefail

# 폰트 크기 arbitrary만 대상(font-mono·색상 등 다른 arbitrary는 제외).
PATTERN='text-\[[0-9.]+(px|rem|em)\]'

PATHS=("$@")
if [ ${#PATHS[@]} -eq 0 ]; then
  PATHS=(app components)
fi

matches=$(grep -rEn "$PATTERN" "${PATHS[@]}" --include='*.tsx' --include='*.ts' 2>/dev/null || true)

if [ -n "$matches" ]; then
  count=$(printf '%s\n' "$matches" | wc -l | tr -d ' ')
  echo "✗ 임의 크기 폰트 클래스 ${count}건 (금지 — 정본 클래스 / text-caption / text-micro 사용):"
  printf '%s\n' "$matches"
  exit 1
fi

echo "✓ 임의 크기 폰트 클래스 0건 (${PATHS[*]})"
