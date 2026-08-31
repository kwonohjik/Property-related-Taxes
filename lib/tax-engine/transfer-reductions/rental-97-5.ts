/**
 * 조특법 §97의5 — 장기일반민간임대주택등 양도소득세 감면 (Phase 2 본격 구현)
 *
 * 효과: 임대기간 중 발생한 양도소득에 대한 양도소득세 100% 감면 (산출세액 단계).
 *
 * 요건 (law.go.kr 2026-06-11 현행 검증):
 * - ①1호: 2018.12.31까지 민간매입임대주택·공공매입임대주택 취득(2018.12.31까지 매매계약+계약금 포함)
 *          + 취득일로부터 3개월 이내에 공공지원/장기일반민간임대주택등으로 등록
 * - ①2호: 10년 이상 계속하여 장기일반민간임대주택등으로 임대 (령 §97의5① — 등록 10년+ 계속 임대.
 *          공실 6개월 이내·수용·재개발 등 중단 기간은 계속 임대 간주)
 * - ①3호: 임대기간 중 §97의3①2호 요건(임대료 증액 5% 제한 등) 준수
 * - ②: §97의3·§97의4와 중복 적용 불가
 * - 감면 범위: 임대기간 중 발생 양도소득 한정 — 기준시가 안분 (령 §97의5②)
 * - 전용면적 요건: 본조·시행령 모두 없음 (R-2 확정 — 국민주택규모 요건은 §97의3 전용)
 * - §133 종합한도: §97의5는 §133 열거 대상 아님 — 한도 미적용
 */

import { addMonths } from "date-fns";
import { applyRate } from "../tax-utils";
import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { checkReductionPeriod } from "./period-check";
import {
  calcRentalGainRatio,
  calculateEffectiveRentalPeriod,
  RENTAL_VACANCY_GRACE_MONTHS_97_5,
  validateRentIncrease,
  DEFAULT_JEONSE_CONVERSION_RATE,
} from "./rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97IneligibleReason, Rental97Result } from "./types";

export const RENTAL_97_5_MANDATORY_YEARS = 10;
/** §97의5①1호 — 취득일로부터 등록까지 허용 개월 */
export const RENTAL_97_5_REGISTRATION_MONTHS = 3;

export function evaluateRental975(input: Rental97EvaluationInput): Rental97Result {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.RENTAL_97_5;
  const reasons: Rental97IneligibleReason[] = [];

  // 0) 시한 — 취득(계약) ~2018.12.31
  const period = checkReductionPeriod("rental_97_5", input);
  if (!period.inPeriod) {
    reasons.push({
      code: "OUT_OF_PERIOD",
      message: period.failReason ?? "취득·계약 시한(2018.12.31) 외",
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
  if (!input.acquisitionDate) {
    reasons.push({ code: "MISSING_ACQUISITION_DATE", message: "취득일이 입력되지 않았습니다 (3개월 내 등록 검증).", legalBasis });
  }
  if (!input.isTaxRegistered) {
    reasons.push({
      code: "TAX_REGISTRATION_REQUIRED",
      message: "세무서 사업자등록(소득세법 §168)이 확인되지 않았습니다 (조특령 §97의5③).",
      legalBasis: "조특령 §97의5③",
    });
  }

  // 2) ①1호 — 취득일로부터 3개월 이내 등록
  if (input.acquisitionDate && input.registrationDate) {
    const deadline = addMonths(input.acquisitionDate, RENTAL_97_5_REGISTRATION_MONTHS);
    if (input.registrationDate.getTime() > deadline.getTime()) {
      reasons.push({
        code: "REGISTRATION_AFTER_3_MONTHS",
        message: "취득일로부터 3개월 이내에 장기일반민간임대주택등으로 등록하지 않았습니다 (§97의5①1호).",
        legalBasis,
      });
    }
  }

  // 3) ①3호 — 임대료 증액 제한 (§97의3①2호 준용)
  if (input.rentHistory && input.rentHistory.length >= 2) {
    const validation = validateRentIncrease(
      input.rentHistory,
      input.jeonseConversionRate ?? DEFAULT_JEONSE_CONVERSION_RATE,
    );
    if (!validation.isAllValid) {
      reasons.push({
        code: "RENT_INCREASE_VIOLATED",
        message: `임대료(환산보증금) 증액 5% 제한 위반 계약 ${validation.violations.length}건 (§97의5①3호 — §97의3①2호 준용).`,
        legalBasis,
      });
    }
  } else if (input.rentIncreaseViolated === true) {
    reasons.push({
      code: "RENT_INCREASE_VIOLATED",
      message: "임대료 증액 5% 제한 위반 이력이 신고되었습니다 (§97의5①3호).",
      legalBasis,
    });
  }

  // 4) ①2호 — 10년 이상 계속 임대
  let eligibleRentalYears = 0;
  if (input.rentalStartDate) {
    /**
     * 조특령 §97의5③ — 「…사업자등록과 임대사업자등록을 하고 장기일반민간임대주택등으로
     * **등록하여 임대하는 날부터** 임대를 개시한 것으로 본다」 (D2-02 — §97의3과 같은 구조)
     *
     * 법 §97의5①2호는 「장기일반민간임대주택등으로 **등록 후** 10년 이상 계속하여 …
     * 임대한 후 양도할 것」이고, 조특령 §97의5①은 「10년 이상 계속하여 등록하고,
     * 그 **등록한 기간 동안** 계속하여 10년 이상 임대한 경우로 한다」이다.
     * ⇒ 등록 이전 임대기간은 산입하지 않는다.
     */
    const effectiveStart =
      input.registrationDate !== undefined &&
      input.registrationDate.getTime() > input.rentalStartDate.getTime()
        ? input.registrationDate
        : input.rentalStartDate;

    eligibleRentalYears = calculateEffectiveRentalPeriod(
      effectiveStart,
      input.transferDate,
      input.vacancyPeriods ?? [],
      RENTAL_VACANCY_GRACE_MONTHS_97_5,
    );
    if (eligibleRentalYears < RENTAL_97_5_MANDATORY_YEARS) {
      reasons.push({
        code: "RENTAL_PERIOD_SHORT",
        message: `임대기간 ${eligibleRentalYears}년 — 10년 이상 계속 임대 요건 미달 (§97의5①2호).`,
        legalBasis,
      });
    }
  }

  // 5) 임대기간 분 양도소득 안분 (령 §97의5②)
  let rentalGainRatio = 1;
  if (input.rentalStartDate && input.acquisitionDate) {
    const ratio = calcRentalGainRatio({
      rentalStartDate: input.rentalStartDate,
      acquisitionDate: input.acquisitionDate,
      // 조특령 §97의5② — 분자의 감수는 **취득당시** 기준시가다(§97의3의 임대개시일이 아니다).
      numeratorBase: "acquisition",
      rentalContinuesToTransfer: input.rentalContinuesToTransfer !== false,
      stdPriceAtRentalEnd: input.stdPriceAtRentalEnd,
      stdPriceAtAcquisition: input.stdPriceAtAcquisition,
      stdPriceAtRentalStart: input.stdPriceAtRentalStart ?? input.officialPriceAtStart,
      stdPriceAtTransfer: input.stdPriceAtTransfer,
    });
    if (ratio === null) {
      reasons.push({
        code: "MISSING_PRORATION_PRICES",
        message:
          "임대개시일이 취득일보다 늦어 임대기간 분 양도소득 안분(조특령 §97의5②)이 필요하지만 " +
          "기준시가 3점이 모두 입력되지 않았습니다. 자동 안분은 수행하지 않습니다.",
        legalBasis: "조특령 §97의5②",
      });
    } else {
      rentalGainRatio = ratio;
    }
  }

  // 6) 산출세액 컨텍스트
  if (input.calculatedTax === undefined || input.calculatedTax < 0) {
    reasons.push({ code: "MISSING_CALCULATED_TAX", message: "산출세액 컨텍스트가 전달되지 않았습니다.", legalBasis });
  }

  if (reasons.length > 0) {
    return {
      id: "rental_97_5",
      isEligible: false,
      ineligibleReasons: reasons,
      legalBasis,
      effectCategory: "tax_amount",
    };
  }

  const reductionAmount = applyRate(applyRate(input.calculatedTax!, rentalGainRatio), 1.0);

  return {
    id: "rental_97_5",
    isEligible: true,
    legalBasis,
    effectCategory: "tax_amount",
    reductionRate: 1.0,
    reductionAmount,
    rentalGainRatio,
    isFullExemption: true,
  };
}
