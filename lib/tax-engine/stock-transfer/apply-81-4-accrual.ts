/**
 * 소칙 §81④ 1호 월할 가산 — 공유 헬퍼 (sibling)
 *
 * 시행규칙 §81④ 1호(동일 사업연도 취득·양도/취득·상장):
 *   보정 기준시가 = 직전사업연도 기준시가
 *     + (직전사업연도 기준시가 − 전전사업연도 기준시가) × (보유월수 ÷ 직전사업연도 월수)
 *   ※ 1개월 미만의 월수는 1개월로 본다.
 *
 * 두 적용 경로 공용 (dual-truth 제거):
 *   - §165⑤ 후단 준용 (취득 후 상장): 보유월수 종점 = 상장일. `stock-valuation-post-listing.ts`
 *   - §165⑨ 본체 (양도·취득 기준시가 동일): 보유월수 종점 = 양도일. `stock-valuation-unlisted.ts`
 *
 * 산식·절상 본체는 동일 — 차이는 보유월수 종점(상장일/양도일)뿐이라 `to` 인자로 일반화.
 */

import { differenceInMonths, addMonths } from "date-fns";

/**
 * §81④ 보유월수 — 취득일부터 종점(상장일 또는 양도일)까지의 개월수.
 * "1개월 미만의 월수는 1개월로 본다"(소칙 §81④ 본문) → 끝수 절상, 최소 1개월.
 */
export function calcAccrualMonths(acquisitionDate: Date, to: Date): number {
  const fullMonths = differenceInMonths(to, acquisitionDate);
  const hasRemainder = addMonths(acquisitionDate, fullMonths) < to;
  return Math.max(1, fullMonths + (hasRemainder ? 1 : 0));
}

/**
 * §81④ 1호 보정 평가액 — 직전·전전 사업연도 기준시가 차액을 보유월수로 안분.
 *
 * 분수 전체 단일 floor 1회 — 음수 상승률(전전 > 직전)도 방향 일관.
 *
 * @param prior            취득일 직전 사업연도 기준시가 (= 양도·취득 동일 기준시가)
 * @param prePrior         취득일 전전 사업연도 기준시가
 * @param holdingMonths    보유월수 (calcAccrualMonths, 절상)
 * @param priorBizYearMonths 직전 사업연도 월수 (1~12, 0 이하면 12)
 * @returns { adjusted } — 보정된 양도(또는 상장일) 기준시가
 */
export function apply81_4Accrual(
  prior: number,
  prePrior: number,
  holdingMonths: number,
  priorBizYearMonths: number,
): { adjusted: number } {
  const d = priorBizYearMonths > 0 ? priorBizYearMonths : 12;
  const adjusted = Math.floor((prior * d + (prior - prePrior) * holdingMonths) / d);
  return { adjusted };
}
