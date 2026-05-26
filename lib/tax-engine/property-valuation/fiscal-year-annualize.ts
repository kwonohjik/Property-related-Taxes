/**
 * §17의3② 1년 미만 사업연도 연환산 (순수 함수)
 *
 * 법령: 상증규 §17의3② (KoreanLaw 검증 2026-05-26)
 *   "영 §56① 계산식에 따라 1주당 최근 3년간 순손익액 가중평균액을 계산할 때
 *    사업연도가 1년 미만인 경우에는 1년으로 계산한 가액으로 한다."
 *
 * 적용 순서 (§56④→⑤→§17의3⑤ 환산주식수→1주당→§17의3② 연환산→§56① 가중평균):
 *   연환산은 1주당 순손익액 산출 후·가중평균 직전에 적용.
 *
 * 환산 방법: 월할(1주당 × 12 / 개월수). 개월수 = differenceInCalendarMonths(end,start)+1.
 *   ⚠️ §17의3②은 §56⑤의 "1개월 미만 1개월" 절상 규정 없음 → 절상 미적용(floorToOne:false).
 *   해석례 미발견(KoreanLaw 2회 검색) → 본칙 적용, 추정 인용 안 함.
 *
 * 설계: docs/02-design/features/inheritance-unlisted-fiscal-year-under-1year.design.md
 */

import { differenceInCalendarMonths } from "date-fns";
import { safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils";

/**
 * 사업연도 개월수.
 * @param floorToOne §56⑤ "1개월 미만 1개월" 절상 (default true — capital-increase 호환).
 *                   §17의3② 환산은 floorToOne:false (절상 없음).
 * @example monthsBetween(2023-07-01, 2023-12-31) = 5 + 1 = 6
 */
export function monthsBetween(
  start: Date,
  end: Date,
  opts: { floorToOne?: boolean } = {},
): number {
  if (end < start) return 0;
  const m = differenceInCalendarMonths(end, start) + 1;
  return opts.floorToOne === false ? m : Math.max(m, 1);
}

/**
 * §17의3② 환산용 사업연도 개월수 (절상 없음). 시작일·종료일 미입력 시 12개월.
 */
export function fiscalYearMonths(startDate?: Date, endDate?: Date): number {
  if (!startDate || !endDate) return 12;
  return monthsBetween(startDate, endDate, { floorToOne: false });
}

/**
 * §17의3② 1주당 순손익액 1년 환산.
 * 사업연도 개월수 < 12 → perShare × 12 / 개월수. 12개월 이상·불명 → 무변환.
 * 음수(결손)도 동일 환산 (이후 §56① 가중평균 단계에서 음수→0 가드).
 */
export function annualizePerShareNetIncome(
  perShare: number,
  startDate?: Date,
  endDate?: Date,
): number {
  const months = fiscalYearMonths(startDate, endDate);
  if (months >= 12 || months <= 0) return perShare;
  return safeMultiplyThenDivide(perShare, 12, months);
}
