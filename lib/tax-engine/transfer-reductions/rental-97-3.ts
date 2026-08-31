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
 * - 70%/50% 적용 범위: 임대기간 중 발생 양도차익 한정 — 기준시가 안분 (령 §97의3⑤)
 *
 * R-1 (등록일별 공제율 — 2022 세법개정):
 * - 등록 ~2022.12.31: 8년 이상 임대 50% / 10년 이상 임대 70%
 * - 등록 2023.1.1~  : 10년 이상 임대 70%만 (8년 유형 50% 폐지)
 * - 현행 §97의3① 본문은 10년 70% 단일 (law.go.kr 2026-06-11 확인). 8년 50%는 경과규정.
 * ⚠️ 출처: 사용자(세무 전문가) 제공 + 2022 세법개정 부칙. KoreanLaw 연혁 본문·부칙 직접조회는
 *    도구 미지원(efYd·연혁 MST NOT_FOUND)으로 부칙 조항 직접 인용은 추후 보강 — followup.plan.md §R-1.
 */

import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { checkReductionPeriod } from "./period-check";
import {
  calcRentalGainRatio,
  calculateEffectiveRentalPeriod,
  RENTAL_VACANCY_GRACE_MONTHS_97,
  checkRental973Clause24,
  validateRentIncrease,
  DEFAULT_JEONSE_CONVERSION_RATE,
} from "./rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97IneligibleReason, Rental97Result } from "./types";

/** §97의3 장특공제율 특례 — 10년 이상 임대 (①항 본문 — 100분의 70) */
export const RENTAL_97_3_OVERRIDE_RATE = 0.7;

/** R-1: 2022.12.31 이전 등록분 8년 이상 임대 경과규정 특례율 (100분의 50) */
export const RENTAL_97_3_OVERRIDE_RATE_8YEAR = 0.5;

/** §97의3 의무임대기간 — 10년 (①1호·령 §97의3③3호. 70% 기준) */
export const RENTAL_97_3_MANDATORY_YEARS = 10;

/** R-1: 2022.12.31 이전 등록분 8년 50% 경과규정 최소 임대기간 */
export const RENTAL_97_3_MANDATORY_YEARS_8YEAR = 8;

/** R-1: 8년 50% 경과규정 적용 등록일 상한 — 이 날짜 미만(=~2022.12.31) 등록만. 2023.1.1~ 등록은 10년 70%만 */
export const RENTAL_97_3_PRE_2023_REG_CUTOFF = new Date("2023-01-01");

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

  // 3·4) 령 §97의3③2호(국민주택규모)·4호(기준시가 6억/3억) — §97의5와 공용 (CA-01)
  reasons.push(...checkRental973Clause24(input, ""));

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

  // 6) 임대기간 + 등록일별 공제율 (R-1: 2022.12.31 이전 등록분 8년 50% 경과규정)
  //    · 등록 ~2022.12.31: 8년↑ 50% / 10년↑ 70%
  //    · 등록 2023.1.1~  : 10년↑ 70%만 (8년 유형 폐지)
  let eligibleRentalYears = 0;
  let overrideRate = RENTAL_97_3_OVERRIDE_RATE; // 10년 70% 기본
  if (input.rentalStartDate) {
    /**
     * 조특령 §97의3④ — 「…사업자등록과 임대사업자등록을 하고 장기일반민간임대주택등으로
     * **등록하여 임대하는 날부터** 임대를 개시한 것으로 본다」 (D2-02)
     *
     * ⇒ 임대개시일이 등록일보다 앞설 수 없다. 종전에는 입력된 `rentalStartDate`를 그대로 써서
     *   등록 이전 기간까지 10년 요건에 산입했다(등록 1년차에 70% 통과).
     *
     * 같은 조 ②가 「장기일반민간임대주택등으로 **10년 이상 계속하여 등록**되어 있고,
     * 그 **등록 기간 동안** 통산하여 10년 이상 임대한 경우」로 정하므로 기산점 클램프가 곧
     * 등록기간 요건이 된다 — 등록 후 10년이 지나지 않았으면 임대기간도 10년이 될 수 없다.
     *
     * ⚠️ ②의 「**계속하여** 등록」(중도 말소·재등록 없음)까지는 검증하지 않는다 —
     *    등록 말소 구간 입력 필드가 없다(`vacancyPeriods`는 공실이지 말소가 아니다).
     *    없는 입력을 추정해 판정하지 않는다.
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
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    const isPre2023Registration =
      input.registrationDate !== undefined &&
      input.registrationDate.getTime() < RENTAL_97_3_PRE_2023_REG_CUTOFF.getTime();

    if (eligibleRentalYears >= RENTAL_97_3_MANDATORY_YEARS) {
      overrideRate = RENTAL_97_3_OVERRIDE_RATE; // 10년↑ → 70% (등록일 무관)
    } else if (isPre2023Registration && eligibleRentalYears >= RENTAL_97_3_MANDATORY_YEARS_8YEAR) {
      overrideRate = RENTAL_97_3_OVERRIDE_RATE_8YEAR; // 2022.12.31 이전 등록 + 8~10년 → 50%
    } else {
      reasons.push({
        code: "RENTAL_PERIOD_SHORT",
        message: isPre2023Registration
          ? `임대기간 ${eligibleRentalYears}년 — 2022.12.31 이전 등록분은 8년 이상(50%) 또는 10년 이상(70%) 임대 요건 미달 (§97의3①1호).`
          : `임대기간 ${eligibleRentalYears}년 — 2023.1.1 이후 등록분은 10년 이상 계속 임대 요건 미달 (§97의3①1호). 8년 50% 경과규정은 2022.12.31 이전 등록분에 한합니다.`,
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
      // 조특령 §97의3⑤ — 분자의 감수 C = 실제 임대기간 **개시일**의 기준시가
      numeratorBase: "rental_start",
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
    overrideRate, // 동적: 10년↑ 0.7 / (등록 ~2022.12.31) 8~10년 0.5
    rentalGainRatio,
    eligibleRentalYears,
  };
}
