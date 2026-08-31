/**
 * 조특법 §97① — 장기임대주택 양도소득세 감면 (본문 50% + 단서 100%) (Phase 2 본격 구현)
 *
 * 요건 (law.go.kr 2026-06-11 현행 검증 — plan §2.1):
 * - ①1호: 1986.1.1~2000.12.31 신축 국민주택 (또는 ①2호: 1985.12.31 이전 신축 공동주택으로
 *   1986.1.1 현재 미입주) 을 2000.12.31 이전 임대개시 + 5년 이상 임대 후 양도
 * - 본문: 양도소득세의 50% 감면 (산출세액 단계)
 * - 단서 (100% 면제):
 *   (a) 건설임대주택으로 5년 이상 임대
 *   (b) 매입임대주택 중 1995.1.1 이후 취득·임대 개시 (취득 당시 입주 사실 없음) 5년 이상
 *   (c) 10년 이상 임대
 * - §97②: 해당 임대주택은 소법 §89①3호 소유주택 비포함 (본 엔진 범위 외 — 안내만)
 *
 * 단순화: rental_97_main = 본문(50%), rental_97_proviso = 단서(100%) — 별도 ID (UI 라디오 분리).
 */

import { applyRate } from "../tax-utils";
import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { checkReductionPeriod } from "./period-check";
import {
  calculateEffectiveRentalPeriod,
  RENTAL_VACANCY_GRACE_MONTHS_97,
} from "./rental-97-shared-helpers";
import type { Rental97EvaluationInput, Rental97IneligibleReason, Rental97Result } from "./types";

const CONSTRUCTION_YEAR_FROM = 1986;
const CONSTRUCTION_YEAR_TO = 2000;
const MANDATORY_YEARS_BASE = 5;
const MANDATORY_YEARS_PROVISO_C = 10;
/** 단서 (b) — 매입임대 1995.1.1 이후 취득 요건 */
const PURCHASE_ACQ_FROM = new Date("1995-01-01");

export function evaluateRental97Main(input: Rental97EvaluationInput): Rental97Result {
  const isProviso = input.id === "rental_97_proviso";
  const legalBasis = isProviso
    ? TRANSFER_REDUCTION_ARTICLE.RENTAL_97_PROVISO
    : TRANSFER_REDUCTION_ARTICLE.RENTAL_97_MAIN;
  const reasons: Rental97IneligibleReason[] = [];

  // 0) 시한 — 임대개시 ~2000.12.31
  const period = checkReductionPeriod(isProviso ? "rental_97_proviso" : "rental_97_main", input);
  if (!period.inPeriod) {
    reasons.push({
      code: "OUT_OF_PERIOD",
      message: period.failReason ?? "임대개시 시한(2000.12.31) 외",
      legalBasis,
    });
  }

  // 1) 필수 입력
  if (!input.rentalStartDate) {
    reasons.push({ code: "MISSING_RENTAL_START", message: "임대개시일이 입력되지 않았습니다.", legalBasis });
  }

  // 2) ①1호 — 1986~2000 신축 국민주택
  if (input.constructionYear === undefined) {
    reasons.push({ code: "MISSING_CONSTRUCTION_YEAR", message: "신축 연도가 입력되지 않았습니다 (§97①1호 — 1986.1.1~2000.12.31 신축).", legalBasis });
  } else if (input.constructionYear < CONSTRUCTION_YEAR_FROM || input.constructionYear > CONSTRUCTION_YEAR_TO) {
    reasons.push({
      code: "CONSTRUCTION_YEAR_OUT",
      message: `신축 연도 ${input.constructionYear}년 — 1986.1.1~2000.12.31 신축 요건 외 (§97①1호. 1985.12.31 이전 신축 미입주 공동주택(2호)은 세무사 확인 필요).`,
      legalBasis,
    });
  }
  if (input.isNationalHousing !== true) {
    reasons.push({
      code: "NOT_NATIONAL_HOUSING",
      message: "국민주택 요건이 확인되지 않았습니다 (§97①).",
      legalBasis,
    });
  }

  // 3) 임대기간
  let eligibleRentalYears = 0;
  if (input.rentalStartDate) {
    eligibleRentalYears = calculateEffectiveRentalPeriod(
      input.rentalStartDate,
      input.transferDate,
      input.vacancyPeriods ?? [],
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
  }

  if (!isProviso) {
    // 본문 — 5년 이상
    if (eligibleRentalYears < MANDATORY_YEARS_BASE) {
      reasons.push({
        code: "RENTAL_PERIOD_SHORT",
        message: `임대기간 ${eligibleRentalYears}년 — 5년 이상 임대 요건 미달 (§97① 본문).`,
        legalBasis,
      });
    }
  } else {
    // 단서 — (a)/(b)/(c) 분기
    if (!input.provisoCase) {
      reasons.push({
        code: "MISSING_PROVISO_CASE",
        message: "단서 적용 유형(건설임대/매입임대/10년 이상)이 선택되지 않았습니다 (§97① 단서).",
        legalBasis,
      });
    } else if (input.provisoCase === "c_10years") {
      if (eligibleRentalYears < MANDATORY_YEARS_PROVISO_C) {
        reasons.push({
          code: "RENTAL_PERIOD_SHORT",
          message: `임대기간 ${eligibleRentalYears}년 — 10년 이상 임대 요건 미달 (§97① 단서 다목).`,
          legalBasis,
        });
      }
    } else {
      // (a) 건설임대 5년+ / (b) 매입임대 5년+ (1995.1.1 이후 취득)
      if (eligibleRentalYears < MANDATORY_YEARS_BASE) {
        reasons.push({
          code: "RENTAL_PERIOD_SHORT",
          message: `임대기간 ${eligibleRentalYears}년 — 5년 이상 임대 요건 미달 (§97① 단서).`,
          legalBasis,
        });
      }
      if (input.provisoCase === "b_purchase") {
        if (!input.acquisitionDate) {
          reasons.push({ code: "MISSING_ACQUISITION_DATE", message: "취득일이 입력되지 않았습니다 (단서 나목 — 1995.1.1 이후 취득 검증).", legalBasis });
        } else if (input.acquisitionDate.getTime() < PURCHASE_ACQ_FROM.getTime()) {
          reasons.push({
            code: "PURCHASE_BEFORE_1995",
            message: "매입임대주택 단서 적용은 1995.1.1 이후 취득분에 한합니다 (§97① 단서 나목).",
            legalBasis,
          });
        }
      }
    }
  }

  // 4) 산출세액 컨텍스트
  if (input.calculatedTax === undefined || input.calculatedTax < 0) {
    reasons.push({ code: "MISSING_CALCULATED_TAX", message: "산출세액 컨텍스트가 전달되지 않았습니다.", legalBasis });
  }

  if (reasons.length > 0) {
    return {
      id: input.id,
      isEligible: false,
      ineligibleReasons: reasons,
      legalBasis,
      effectCategory: "tax_amount",
    };
  }

  const rate = isProviso ? 1.0 : 0.5;
  return {
    id: input.id,
    isEligible: true,
    legalBasis,
    effectCategory: "tax_amount",
    reductionRate: rate,
    reductionAmount: applyRate(input.calculatedTax!, rate),
    rentalGainRatio: 1, // §97은 임대기간 안분 없음 (주택 전체 소득 대상)
    isFullExemption: isProviso,
  };
}
