/**
 * 조특법 §97의3 — 장기일반민간임대주택등 양도소득세 과세특례 (Phase 2 본격 구현)
 *
 * 효과: 임대기간 중 발생 양도소득에 대해 장기보유특별공제율 70% 적용 (§95② 대체).
 *       세액감면이 아님 — STEP 4(장특공제) 단계에서 반영.
 *
 * 요건 (law.go.kr 2026-06-11 현행 검증):
 * - 본문: 민간건설임대 중 공공지원/장기일반민간임대를 2027.12.31까지 등록.
 *         단, 2020.7.11 이후 단기민간임대 → 장기일반 변경 신고분 제외 (① 괄호).
 * - ①1호: 10년 이상 계속 임대 (령 §97의3② — 등록 10년+ + 등록기간 중 통산 10년+ 임대)
 * - ①2호 (령 §97의3③):
 *   1. 임대료등 증가율 5% 이하 (1년 내 재증액 금지·전월세 전환 민특법 §44④ 준용)
 *   2. 국민주택규모 이하 (다가구는 가구당 전용면적)
 *   3. 임대개시일부터 10년 이상 임대
 *   4. 주택+부속토지 기준시가 합계가 임대개시일 당시 6억(수도권 밖 3억) 이하
 * - ②: §97의4와 중복 적용 불가
 * - 70% 적용 범위: 임대기간 중 발생 양도차익 한정 — 기준시가 안분 (령 §97의3⑤)
 *
 * ⚠️ R-1 (계획서 §7): 2020.12.29 개정 전 8년 등록분 경과규정(8년 50%)은 부칙 원문 미확보로
 *    미구현 — 현행 10년 70%만 적용. 8년 케이스는 불적용 사유로 안내.
 */

import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { checkReductionPeriod } from "./period-check";
import {
  calcRentalGainRatio,
  calculateEffectiveRentalPeriod,
  validateRentIncrease,
  DEFAULT_JEONSE_CONVERSION_RATE,
} from "./rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97IneligibleReason, Rental97Result } from "./types";

/** 령 §97의3③4호 — 임대개시일 당시 기준시가 한도 */
const OFFICIAL_PRICE_LIMIT_CAPITAL = 600_000_000;
const OFFICIAL_PRICE_LIMIT_NON_CAPITAL = 300_000_000;

/** §97의3 장특공제율 특례 (①항 본문 — 100분의 70) */
export const RENTAL_97_3_OVERRIDE_RATE = 0.7;

/** §97의3 의무임대기간 (①1호·령 §97의3③3호 — 10년) */
export const RENTAL_97_3_MANDATORY_YEARS = 10;

export function evaluateRental973(input: Rental97EvaluationInput): Rental97Result {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.RENTAL_97_3;
  const reasons: Rental97IneligibleReason[] = [];

  // 0) 시한 — 등록 ~2027.12.31 (period-check 기존 로직 재사용)
  const period = checkReductionPeriod("rental_97_3", input);
  if (!period.inPeriod) {
    reasons.push({
      code: "OUT_OF_PERIOD",
      message: period.failReason ?? "등록 시한(2027.12.31) 외",
      legalBasis,
    });
  }

  // 1) 필수 입력
  if (!input.registrationDate) {
    reasons.push({ code: "MISSING_REGISTRATION_DATE", message: "임대사업자 등록일이 입력되지 않았습니다.", legalBasis });
  }
  if (!input.rentalStartDate) {
    reasons.push({ code: "MISSING_RENTAL_START", message: "임대개시일이 입력되지 않았습니다.", legalBasis });
  }
  if (!input.isTaxRegistered) {
    reasons.push({
      code: "TAX_REGISTRATION_REQUIRED",
      message: "세무서 사업자등록(소득세법 §168)이 확인되지 않았습니다 — 등록·임대 개시 인정 요건 (조특령 §97의3④).",
      legalBasis: "조특령 §97의3④",
    });
  }

  // 2) 본문 괄호 — 2020.7.11 이후 단기→장기 변경 신고분 제외
  if (input.isConvertedFromShortTerm) {
    reasons.push({
      code: "CONVERTED_FROM_SHORT_TERM",
      message: "2020.7.11 이후 단기민간임대주택을 장기일반민간임대주택으로 변경 신고한 주택은 적용이 제외됩니다 (§97의3① 괄호).",
      legalBasis,
    });
  }

  // 3) 령 §97의3③2호 — 국민주택규모
  if (input.isNationalHousingScale !== true) {
    reasons.push({
      code: "NOT_NATIONAL_HOUSING_SCALE",
      message: "국민주택규모(전용 85㎡, 수도권 외 읍·면 100㎡) 이하 요건이 확인되지 않았습니다 (조특령 §97의3③2호).",
      legalBasis: "조특령 §97의3③2호",
    });
  }

  // 4) 령 §97의3③4호 — 임대개시일 당시 기준시가 6억/3억 한도
  if (input.officialPriceAtStart === undefined || input.officialPriceAtStart <= 0) {
    reasons.push({
      code: "MISSING_OFFICIAL_PRICE",
      message: "임대개시일 당시 주택과 부수토지의 기준시가 합계가 입력되지 않았습니다 (조특령 §97의3③4호 한도 검증).",
      legalBasis: "조특령 §97의3③4호",
    });
  } else {
    const limit = input.region === "non_capital" ? OFFICIAL_PRICE_LIMIT_NON_CAPITAL : OFFICIAL_PRICE_LIMIT_CAPITAL;
    if (input.officialPriceAtStart > limit) {
      reasons.push({
        code: "OFFICIAL_PRICE_EXCEEDED",
        message: `임대개시일 당시 기준시가 합계가 한도(${limit === OFFICIAL_PRICE_LIMIT_CAPITAL ? "6억" : "3억"}원)를 초과합니다 (조특령 §97의3③4호).`,
        legalBasis: "조특령 §97의3③4호",
      });
    }
  }

  // 5) 임대료 증액 제한 (령 §97의3③1호)
  if (input.rentHistory && input.rentHistory.length >= 2) {
    const validation = validateRentIncrease(
      input.rentHistory,
      input.jeonseConversionRate ?? DEFAULT_JEONSE_CONVERSION_RATE,
    );
    if (!validation.isAllValid) {
      reasons.push({
        code: "RENT_INCREASE_VIOLATED",
        message: `임대료(환산보증금) 증액 5% 제한 위반 계약 ${validation.violations.length}건이 확인되었습니다 (조특령 §97의3③1호).`,
        legalBasis: "조특령 §97의3③1호",
      });
    }
  } else if (input.rentIncreaseViolated === true) {
    reasons.push({
      code: "RENT_INCREASE_VIOLATED",
      message: "임대료 증액 5% 제한 위반 이력이 신고되었습니다 (조특령 §97의3③1호).",
      legalBasis: "조특령 §97의3③1호",
    });
  }

  // 6) 10년 이상 임대 (①1호·령 ③3호)
  let eligibleRentalYears = 0;
  if (input.rentalStartDate) {
    eligibleRentalYears = calculateEffectiveRentalPeriod(
      input.rentalStartDate,
      input.transferDate,
      input.vacancyPeriods ?? [],
    );
    if (eligibleRentalYears < RENTAL_97_3_MANDATORY_YEARS) {
      reasons.push({
        code: "RENTAL_PERIOD_SHORT",
        message:
          `임대기간 ${eligibleRentalYears}년 — 10년 이상 계속 임대 요건 미달 (§97의3①1호). ` +
          `2020.12.29 개정 전 등록분의 구법(8년) 경과규정 해당 여부는 부칙 확인이 필요합니다.`,
        legalBasis,
      });
    }
  }

  // 7) 임대기간 분 양도차익 안분 (령 §97의3⑤ — 기준시가 비례)
  let rentalGainRatio = 1;
  if (input.rentalStartDate && input.acquisitionDate) {
    const ratio = calcRentalGainRatio({
      rentalStartDate: input.rentalStartDate,
      acquisitionDate: input.acquisitionDate,
      stdPriceAtAcquisition: input.stdPriceAtAcquisition,
      stdPriceAtRentalStart: input.stdPriceAtRentalStart ?? input.officialPriceAtStart,
      stdPriceAtTransfer: input.stdPriceAtTransfer,
    });
    if (ratio === null) {
      reasons.push({
        code: "MISSING_PRORATION_PRICES",
        message:
          "임대개시일이 취득일보다 늦어 임대기간 분 양도차익 안분(조특령 §97의3⑤)이 필요하지만 " +
          "취득시·임대개시시·양도시 기준시가 3점이 모두 입력되지 않았습니다. 자동 안분은 수행하지 않습니다.",
        legalBasis: "조특령 §97의3⑤",
      });
    } else {
      rentalGainRatio = ratio;
    }
  }

  if (reasons.length > 0) {
    return {
      id: "rental_97_3",
      isEligible: false,
      ineligibleReasons: reasons,
      legalBasis,
      effectCategory: "long_term_holding_special",
    };
  }

  return {
    id: "rental_97_3",
    isEligible: true,
    legalBasis,
    effectCategory: "long_term_holding_special",
    overrideRate: RENTAL_97_3_OVERRIDE_RATE,
    rentalGainRatio,
    eligibleRentalYears,
  };
}
