#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  법령 조문 자동 검증 — 주 1회 실행 래퍼 스크립트
#
#  crontab에 등록되어 매주 월요일 오전 9시에 실행됨.
#  결과는 logs/legal-verify.log 에 누적 (최근 30일분 보관).
# ─────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$PROJECT_DIR/logs/legal-verify.log"
MAX_LINES=5000   # 로그 보관 한도 (초과 시 앞부분 삭제)

# PATH에 npm/node 경로 추가 (cron 환경은 PATH가 좁음)
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$PROJECT_DIR"

echo "" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"
echo "실행: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

# .env.local 존재 여부 확인
if [[ ! -f ".env.local" ]]; then
  echo "[ERROR] .env.local 파일 없음 — KOREAN_LAW_OC 미설정" >> "$LOG_FILE"
  exit 1
fi

# 검증 실행 (종료 코드 보존)
set +e
npm run verify:legal >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
set -e

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "[OK] 모든 법령 인용 검증 통과" >> "$LOG_FILE"
else
  echo "[WARN] 검증 실패/오류 발생 — 로그 확인 필요" >> "$LOG_FILE"
fi

# 로그 크기 제한 (MAX_LINES 초과 시 앞부분 제거)
if [[ $(wc -l < "$LOG_FILE") -gt $MAX_LINES ]]; then
  tail -n $MAX_LINES "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi

exit $EXIT_CODE
