/**
 * 조특법 §97의4 — 장기임대주택 장기보유특별공제 추가율 (R-3 확정·활성)
 *
 * 효과: §95② 보유기간별 공제율에 임대기간별 추가율을 "가산" (§97의3의 대체와 다름).
 *       단, §95① 단서(미등기 양도 등) 해당 시 적용 배제 (§97의4① 단서).
 *
 * 요건 (law.go.kr 2026-06-11 현행 검증):
 * - ①: 민간건설·민간매입·공공건설·공공매입임대주택 중 소령 §167의3①2호가목·다목 장기임대주택을
 *       6년 이상 임대 후 양도 (비거주자 포함)
 * - 령 §97의4②: 임대기간 계산은 령 §97⑤1호·3호·5호 준용 — 사업자등록+임대사업자등록(또는
 *   공공주택사업자 지정)하고 임대하는 날부터 개시
 *
 * R-3 확정 (2026-06-11): 추가공제율 표 — 6~7년 2% / 7~8년 4% / 8~9년 6% / 9~10년 8% / 10년↑ 10%.
 *   매핑 감사 문서(transfer-reduction-mapping-audit.md §4.1) 기재값 = 사용자(세무 전문가) 제공값
 *   일치 확인 → metadata.isFullyImplemented = true (UI 활성).
 *   ⚠️ 법 본문 내장 표가 법제처 API 응답 누락(별표 NOT_FOUND)으로 KoreanLaw 원문 직접 인용은
 *   추후 보강 — followup.plan.md §R-3.
 */

import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { checkReductionPeriod } from "./period-check";
import {
  calculateEffectiveRentalPeriod,
  RENTAL_VACANCY_GRACE_MONTHS_97,
  validateRentIncrease,
  DEFAULT_JEONSE_CONVERSION_RATE,
} from "./rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97IneligibleReason, Rental97Result } from "./types";

/**
 * 임대기간별 추가공제율 표 (R-3 확정 — 사용자 제공 = 매핑 감사 기재값 일치).
 * [임대 연수 하한(이상), 추가율] — 6년 2% / 7년 4% / 8년 6% / 9년 8% / 10년 10%
 */
export const RENTAL_97_4_ADDITIONAL_RATE_TABLE: ReadonlyArray<readonly [number, number]> = [
  [10, 0.10],
  [9, 0.08],
  [8, 0.06],
  [7, 0.04],
  [6, 0.02],
] as const;

export const RENTAL_97_4_MANDATORY_YEARS = 6;

/** 임대 연수 → 추가공제율 (6년 미만 0) */
export function getRental974AdditionalRate(rentalYears: number): number {
  for (const [minYears, rate] of RENTAL_97_4_ADDITIONAL_RATE_TABLE) {
    if (rentalYears >= minYears) return rate;
  }
  return 0;
}

export function evaluateRental974(input: Rental97EvaluationInput): Rental97Result {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.RENTAL_97_4;
  const reasons: Rental97IneligibleReason[] = [];

  // 0) 시한 — 등록 2014.1.1~
  const period = checkReductionPeriod("rental_97_4", input);
  if (!period.inPeriod) {
    reasons.push({
      code: "OUT_OF_PERIOD",
      message: period.failReason ?? "임대 등록 시한(2014.1.1~) 외",
      legalBasis,
    });
  }

  // 1) 필수 입력
  if (!input.registrationDate) {
    reasons.push({ code: "MISSING_REGISTRATION_DATE", message: "임대사업자 등록일이 입력되지 않았습니다 (조특령 §97의4②).", legalBasis });
  }
  if (!input.rentalStartDate) {
    reasons.push({ code: "MISSING_RENTAL_START", message: "임대개시일이 입력되지 않았습니다.", legalBasis });
  }
  if (!input.isTaxRegistered) {
    reasons.push({
      code: "TAX_REGISTRATION_REQUIRED",
      message: "세무서 사업자등록(소득세법 §168)이 확인되지 않았습니다 (조특령 §97의4②).",
      legalBasis: "조특령 §97의4②",
    });
  }

  // 2) 임대료 증액 제한 (소령 §167의3①2호 장기임대주택 요건)
  if (input.rentHistory && input.rentHistory.length >= 2) {
    const validation = validateRentIncrease(
      input.rentHistory,
      input.jeonseConversionRate ?? DEFAULT_JEONSE_CONVERSION_RATE,
    );
    if (!validation.isAllValid) {
      reasons.push({
        code: "RENT_INCREASE_VIOLATED",
        message: `임대료(환산보증금) 증액 5% 제한 위반 계약 ${validation.violations.length}건.`,
        legalBasis,
      });
    }
  } else if (input.rentIncreaseViolated === true) {
    reasons.push({ code: "RENT_INCREASE_VIOLATED", message: "임대료 증액 5% 제한 위반 이력이 신고되었습니다.", legalBasis });
  }

  // 3) 6년 이상 임대 + 추가율
  let eligibleRentalYears = 0;
  if (input.rentalStartDate) {
    eligibleRentalYears = calculateEffectiveRentalPeriod(
      input.rentalStartDate,
      input.transferDate,
      input.vacancyPeriods ?? [],
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    if (eligibleRentalYears < RENTAL_97_4_MANDATORY_YEARS) {
      reasons.push({
        code: "RENTAL_PERIOD_SHORT",
        message: `임대기간 ${eligibleRentalYears}년 — 6년 이상 임대 요건 미달 (§97의4①).`,
        legalBasis,
      });
    }
  }

  if (reasons.length > 0) {
    return {
      id: "rental_97_4",
      isEligible: false,
      ineligibleReasons: reasons,
      legalBasis,
      effectCategory: "long_term_holding_additional",
    };
  }

  return {
    id: "rental_97_4",
    isEligible: true,
    legalBasis,
    effectCategory: "long_term_holding_additional",
    additionalRate: getRental974AdditionalRate(eligibleRentalYears),
    rentalGainRatio: 1, // §97의4는 임대기간 안분 규정 없음 — 전체 차익의 공제율에 가산
    eligibleRentalYears,
  };
}
