/**
 * Phase 4 모듈 — 유상증자·감자 순손익액 조정 (별지 부표3 6쪽 라. 산출)
 *
 * 법령: 상증령 §56 ⑤ + 상증규 §17의3 ⑥ → §17 (10%) (KoreanLaw 검증 2026-05-22)
 *
 * §56⑤ 본문:
 *   "유상증자 또는 유상감자를 한 사업연도와 그 이전 사업연도의 순손익액은 §4항에 따라
 *    계산한 금액에 제1호에 따른 금액을 더하고 제2호에 따른 금액을 뺀 금액으로 한다."
 *   - 1호 유상증자 = 1주당 납입금액 × 증가 주식수 × 재정경제부령으로 정하는 율
 *   - 2호 유상감자 = 1주당 금액 × 감소 주식수 × 동 율
 *
 * §56⑤ 후단:
 *   "유상증자 또는 유상감자를 한 사업연도의 순손익액은 사업연도 개시일부터 유상증자 또는
 *    유상감자를 한 날까지의 기간에 대하여 월할로 계산하며, 1개월 미만은 1개월로 하여 계산한다."
 *
 * §17의3⑥: 위 "재정경제부령으로 정하는 율" = §17 (= 10%)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 */

import { differenceInCalendarMonths } from "date-fns";
import type { UnlistedCapitalChange } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

/**
 * 사업연도별 유상증자·감자 순손익액 조정액 산정
 *
 * @param capitalChanges 평가기준일 이전 3년 이내 자본 변동 (paid_in/capital_reduction만 §56⑤ 대상)
 * @param fiscalYearEndDates [1년전, 2년전, 3년전] 사업연도 종료일
 * @param rate 이자율 (기본 0.10 — 상증규 §17 via §17의3⑥)
 * @returns 사업연도별 라.유상증자·감자 반영액 [1년전, 2년전, 3년전]
 *
 * @example PDF 사례 1 (p1534)
 *   2021.6.30. 유상증자 50,000주 @ 액면가 5,000원
 *   사업연도: 2021/2020/2019 (12월 결산)
 *   2021 사업연도 (1.1.~6.30. = 6개월): 50,000 × 5,000 × 10% × 6/12 = 12,500,000
 *   2020 사업연도 (증자 이전, 1년 full): 50,000 × 5,000 × 10% = 25,000,000
 *   2019 사업연도 (증자 이전, 1년 full): 25,000,000
 *
 * @example PDF 사례 5 (p1539)
 *   2021.6.30. 유상증자 10,000주 @ 액면가 5,000원
 *   2021: 10,000 × 5,000 × 10% × 6/12 = 2,500,000
 *   2020: 10,000 × 5,000 × 10% = 5,000,000
 *   2019: 5,000,000
 */
export function calcCapitalIncreaseAdjustment(
  capitalChanges: UnlistedCapitalChange[],
  fiscalYearEndDates: [Date, Date, Date],
  rate: number = 0.10,
): [number, number, number] {
  const adjustments: [number, number, number] = [0, 0, 0];

  for (const change of capitalChanges) {
    // §56⑤은 유상증자(paid_in)와 유상감자(capital_reduction)만 적용. 무상증자(free_issue)는 미적용
    if (change.changeType !== "paid_in" && change.changeType !== "capital_reduction") {
      continue;
    }

    const pricePerShare = change.pricePerShare ?? 0;
    const sharesIssued = change.sharesIssued ?? 0;
    if (pricePerShare <= 0 || sharesIssued <= 0) continue;

    const sign = change.changeType === "capital_reduction" ? -1 : 1;
    const annualAmount = pricePerShare * sharesIssued * rate * sign;

    for (let yearIdx = 0; yearIdx < 3; yearIdx++) {
      const fiscalYearEndDate = fiscalYearEndDates[yearIdx];
      // 사업연도 시작일 = 종료일 1년 전 + 1일 (12월 결산 가정 시 1.1.~12.31.)
      const fiscalYearStartDate = new Date(fiscalYearEndDate);
      fiscalYearStartDate.setFullYear(fiscalYearStartDate.getFullYear() - 1);
      fiscalYearStartDate.setDate(fiscalYearStartDate.getDate() + 1);

      if (
        change.changeDate >= fiscalYearStartDate &&
        change.changeDate <= fiscalYearEndDate
      ) {
        // 해당 사업연도 내 → §56⑤ 후단 월할 (1개월 미만 1개월)
        const monthsDiff = monthsWithMinOne(fiscalYearStartDate, change.changeDate);
        adjustments[yearIdx] += (annualAmount * monthsDiff) / 12;
      } else if (change.changeDate > fiscalYearEndDate) {
        // 그 이전 사업연도 → 1년 full 가산 (§56⑤ 본문 "그 이전 사업연도")
        adjustments[yearIdx] += annualAmount;
      }
      // changeDate < fiscalYearStartDate: 사업연도 이후 증자 — 본 사업연도에 영향 없음
    }
  }

  return [
    Math.floor(adjustments[0]),
    Math.floor(adjustments[1]),
    Math.floor(adjustments[2]),
  ];
}

/**
 * §56⑤ 후단 "1개월 미만은 1개월" 규칙 적용 월할 계산
 *
 * @example 2021.1.1. → 2021.6.30. = 6개월
 *   (사업연도 개시일 1.1.부터 유상증자일 6.30.까지 = 1·2·3·4·5·6월 = 6개월)
 */
function monthsWithMinOne(start: Date, end: Date): number {
  if (end < start) return 0;
  const monthDiff = differenceInCalendarMonths(end, start) + 1;
  return Math.max(monthDiff, 1);
}
