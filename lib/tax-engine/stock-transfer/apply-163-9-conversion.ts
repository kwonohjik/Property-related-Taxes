/**
 * apply163_9Conversion — 환산취득가 합성 헬퍼 (sibling)
 *
 * 파일명은 historical naming(legacy §163⑨ 추정 인용 시점에 생성) 유지 — import 영향 회피.
 * 실제 산식 본칙은 D-2 정정으로 다음과 같이 확정:
 *   소득세법 §97① + 시행령 §176의2②1호: 주식 환산취득가
 *     = 양도가 × (취득시 기준시가 / 양도시 기준시가)
 *
 * 호출 분기:
 *   - 일반 상장 환산(시령 §176의2②1호 직접) — calcListedValuation 내부에서 적용됨 (별도)
 *   - 취득 후 상장(§165⑤ + §176의2②1호 합성) — stock-transfer-tax.ts에서 본 헬퍼 사용
 *
 * 본 헬퍼는 "1주당 취득기준시가 + 양도시 1주당 기준시가 → 총액 환산취득가" 변환 책임.
 * 입력값 누락 시 fallbackTotal 반환 (방어 처리).
 *
 * D-2 정정 (2026-05-19): §163⑨은 상속·증여 자산 평가가액 조항(상증법 §60~§66 준용)으로
 * 환산취득가와 무관. KoreanLaw MCP §176의2②1호 본문 확인 후 본 정정.
 *
 * 800줄 정책 회피로 stock-transfer-tax.ts에서 분리.
 */

import { safeMultiply } from "@/lib/tax-engine/tax-utils";

/**
 * 환산취득가 산식 (시령 §176의2②1호) — 1주당 기준시가 비율 × 양도가
 *
 * @param transferPrice — 양도가액 총액 (원)
 * @param acqStdPerShare — 취득시 1주당 기준시가 (§165⑤ 보정 후, 원)
 * @param transferStd — 양도시 1주당 기준시가 (양도일 직전 1개월 평균, 원)
 * @param fallbackTotal — transferStd 또는 acqStdPerShare가 0일 때 반환할 값.
 *        분모 미입력 방어에서는 **0**을 넘긴다(Q-1 차단 정본) — 「환산 미적용」이 아니라 차단이다.
 * @returns 총액 환산취득가 (floor 1회 적용, 원)
 */
export function apply163_9Conversion(
  transferPrice: number,
  acqStdPerShare: number,
  transferStd: number,
  fallbackTotal: number,
): number {
  if (transferStd <= 0 || acqStdPerShare <= 0) {
    return fallbackTotal;
  }
  // 총액 단위 floor 1회 — 1주당 비율 적용 (1주당 × 비율 → 총액 단위로 환산)
  // safeMultiply: 양도가 5조+ 케이스 BigInt 안전망. 일반 범위에서는 일반 곱셈과 동일.
  return Math.floor(safeMultiply(transferPrice, acqStdPerShare) / transferStd);
}

/**
 * 양도시 1주당 기준시가 해석 — `transferDatePriceAvg1Month`가 유일한 소스다.
 *
 * ## 종전에는 1주당 양도가로 자동 fallback했다. 없앴다 (2026-09-10)
 *
 * 같은 필드의 미입력을 두 경로가 **다르게** 처리하고 있었다:
 *
 *   일반 §176의2②1호 (`stock-valuation-listed.ts`) → 0-가드 → 취득가 0 + 사유 경고
 *   취득 후 상장 §165⑤ (여기)                      → 1주당 양도가 fallback → 환산 미적용
 *
 * CLAUDE.md 「자동 안분 fallback 금지」와 일관되는 **차단** 쪽으로 통일했다
 * (계획서 `docs/00-pm/stock-listed-conversion-unification.plan.md` Q-1).
 *
 * ⚠️ **무해한 변경이 아니다.** fallback 값은 `floor(양도가 × 취득기준 / floor(양도가 ÷ 주식수))`라
 *    주식수가 양도가를 나누어떨어뜨릴 때만 「환산 미적용」과 같아진다. 기존 픽스처 둘이
 *    모두 그 경우여서 수치로 드러나지 않았다 — anchor `PLD-0`이 그 함정을 막는다.
 *
 * 도달 경로는 ⑧ validate와 ⑫ Zod가 모두 막으므로 **엔진 직접 호출(외부 연동) 방어**로만 남는다.
 * anchor: `__tests__/calc/post-listing-denominator-blocked.anchor.test.ts` PLD-1·PLD-3
 */
export function resolveTransferStd(
  transferDatePriceAvg1Month: number | undefined,
): number {
  return transferDatePriceAvg1Month && transferDatePriceAvg1Month > 0
    ? transferDatePriceAvg1Month
    : 0;
}
