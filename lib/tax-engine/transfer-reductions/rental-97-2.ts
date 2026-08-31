/**
 * 조특법 §97의2 — 신축임대주택 양도소득세 감면 특례 (Phase 2 본격 구현)
 *
 * 효과: 양도소득세 면제 (100% — 산출세액 단계. F-1 확정: ① "양도소득세를 면제한다").
 *
 * 요건 (law.go.kr 2026-06-11 현행 검증):
 * - ①: 국민주택(부속토지 건물 연면적 2배 이내 포함)을 5년 이상 임대 후 양도
 * - ①1호 (건설임대): (가) 1999.8.20~2001.12.31 신축 / (나) 1999.8.19 이전 신축 공동주택으로
 *   1999.8.20 현재 미입주
 * - ①2호 (매입임대): 1999.8.20 이후 취득 + 임대 개시 — 1999.8.20~2001.12.31 매매계약·계약금
 *   지급분만 해당 (취득 당시 미입주 주택만)
 * - ②: §97②~④ 준용 (주택수 제외 등 — 본 엔진 범위 외)
 */

import { applyRate } from "../tax-utils";
import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { checkReductionPeriod } from "./period-check";
import {
  calculateEffectiveRentalPeriod,
  RENTAL_VACANCY_GRACE_MONTHS_97,
} from "./rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97IneligibleReason, Rental97Result } from "./types";

const MANDATORY_YEARS = 5;

export function evaluateRental972(input: Rental97EvaluationInput): Rental97Result {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.RENTAL_97_2;
  const reasons: Rental97IneligibleReason[] = [];

  // 0) 시한 — 매매계약(1999.8.20~2001.12.31), 건설임대는 사용승인일 fallback (period-check 기존 로직)
  const period = checkReductionPeriod("rental_97_2", input);
  if (!period.inPeriod) {
    reasons.push({
      code: "OUT_OF_PERIOD",
      message: period.failReason ?? "신축·취득 시한(1999.8.20~2001.12.31) 외",
      legalBasis,
    });
  }

  // 1) 필수 입력
  if (!input.rentalStartDate) {
    reasons.push({ code: "MISSING_RENTAL_START", message: "임대개시일이 입력되지 않았습니다.", legalBasis });
  }
  if (!input.rental972Type) {
    reasons.push({
      code: "MISSING_972_TYPE",
      message: "건설임대(1호) / 매입임대(2호) 유형이 선택되지 않았습니다 (§97의2①).",
      legalBasis,
    });
  }
  if (input.isNationalHousing !== true) {
    reasons.push({
      code: "NOT_NATIONAL_HOUSING",
      message: "국민주택 요건이 확인되지 않았습니다 (§97의2① — 부속토지는 건물 연면적 2배 이내 포함).",
      legalBasis,
    });
  }

  // 주체 요건 — 조특령 §97의2① 「1호 이상의 신축임대주택을 포함하여 2호 이상의 임대주택을
  // 5년 이상 임대하는 거주자」 (D1-02).
  // ⚠️ §97의 5호 요건과 숫자·구성이 다르다 — §97 필드를 재사용하지 않는다.
  if (input.hasNewRentalPlus2Units !== true) {
    reasons.push({
      code: "BELOW_MIN_2_UNITS_WITH_NEW",
      message:
        input.hasNewRentalPlus2Units === false
          ? "신축임대주택 1호 이상을 포함한 2호 이상 임대에 해당하지 않습니다 — §97의2①의 「대통령령으로 정하는 거주자」가 아닙니다 (조특령 §97의2①)."
          : "신축임대주택 1호 이상을 포함한 2호 이상 임대 여부가 확인되지 않았습니다 (조특령 §97의2①).",
      legalBasis: "조특령 §97의2①",
    });
  }

  // 2) 5년 이상 임대
  let eligibleRentalYears = 0;
  if (input.rentalStartDate) {
    eligibleRentalYears = calculateEffectiveRentalPeriod(
      input.rentalStartDate,
      input.transferDate,
      input.vacancyPeriods ?? [],
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    if (eligibleRentalYears < MANDATORY_YEARS) {
      reasons.push({
        code: "RENTAL_PERIOD_SHORT",
        message: `임대기간 ${eligibleRentalYears}년 — 5년 이상 임대 요건 미달 (§97의2①).`,
        legalBasis,
      });
    }
  }

  // 3) 산출세액 컨텍스트
  if (input.calculatedTax === undefined || input.calculatedTax < 0) {
    reasons.push({ code: "MISSING_CALCULATED_TAX", message: "산출세액 컨텍스트가 전달되지 않았습니다.", legalBasis });
  }

  if (reasons.length > 0) {
    return {
      id: "rental_97_2",
      isEligible: false,
      ineligibleReasons: reasons,
      legalBasis,
      effectCategory: "tax_amount",
    };
  }

  return {
    id: "rental_97_2",
    isEligible: true,
    legalBasis,
    effectCategory: "tax_amount",
    reductionRate: 1.0,
    reductionAmount: applyRate(input.calculatedTax!, 1.0),
    rentalGainRatio: 1, // §97의2는 임대기간 안분 없음
    isFullExemption: true,
  };
}
