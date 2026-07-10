#!/usr/bin/env bash
#
# check-tone-classes.sh — 동적 톤 클래스 문자열 보간 차단 체크.
#
# 정책 feedback_tailwind_static_tone_mapping (계획 docs/02-design/features/ui-color-tone-tokenization.plan.md §7):
#   Tailwind v4 JIT는 빌드 타임 정규식 스캔으로 class를 추출 → `bg-${tone}-50` 같은 동적 보간은
#   스캔 실패 → production purge 누락 → 런타임 색 미적용(dev에선 정상, prod만 silent failure).
#   톤은 tones.ts `TONE`(canonical) 또는 로컬 `Record<Tone, string>` 정적 매핑에서만 가져올 것.
#
# 대상: `{bg,border,text,ring,from,to,via}-${var}-{shade}` 형태의 동적 톤 보간만(주석 제외).
#   · 정적 리터럴(`bg-amber-50`)은 대상 아님 — 오직 `${}` 보간.
#   · testid(`crypto-${item.id}`) 등은 뒤에 `-{숫자}`(shade)가 없어 미포함.
#   · 공식서식(gray/neutral 정적)도 동적 보간이 없으므로 자연 제외 — 별도 화이트리스트 불필요.
#
# grep 기반 — className·cn()/clsx 인자·template literal 안까지 포착(ESLint className-AST가 놓치는 지점).
#
# 사용법: scripts/check-tone-classes.sh [경로...]   # 기본 범위: app components
#
# 하드블록: .husky/pre-push (pre-push가 진짜 게이트 — CI는 비차단). P2에서 현 트리 0건 → 0 유지.
set -euo pipefail

# {prefix}-${...}-{shade} 형태만. ${} 내부는 임의 표현식([^}]* — 식별자·함수호출·삼항 모두 포착),
# 뒤에 반드시 -숫자(shade)가 와야 톤 클래스로 간주(testid `crypto-${id}`는 -숫자 없어 자동 제외).
PATTERN='(bg|border|text|ring|from|to|via)-\$\{[^}]*\}-[0-9]'

PATHS=("$@")
if [ ${#PATHS[@]} -eq 0 ]; then
  PATHS=(app components)
fi

# 주석 라인(JSDoc ` * ...` · `//` · `/*`) 제외 — 정책 설명문에 금지 예시가 들어감.
matches=$(grep -rEn "$PATTERN" "${PATHS[@]}" --include='*.tsx' --include='*.ts' 2>/dev/null \
  | grep -vE ':[0-9]+:[[:space:]]*(\*|//|/\*)' \
  || true)

if [ -n "$matches" ]; then
  count=$(printf '%s\n' "$matches" | wc -l | tr -d ' ')
  echo "✗ 동적 톤 클래스 보간 ${count}건 (금지 — tones.ts TONE 또는 정적 Record<Tone> 사용):"
  printf '%s\n' "$matches"
  exit 1
fi

echo "✓ 동적 톤 클래스 0건 (${PATHS[*]})"
