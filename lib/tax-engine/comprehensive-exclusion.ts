/**
 * 종합부동산세 합산배제 판정 모듈 (T-05)
 * 종합부동산세법 §8②, 시행령 §3(임대주택)·§4(기타)
 */

import { addYears } from "date-fns";
import {
  COMPREHENSIVE_EXCL,
  COMPREHENSIVE_EXCL_CONST,
} from "./legal-codes";
import type {
  AggregationExclusionResult,
  ExclusionResult,
  ExclusionValidationResult,
  PropertyForExclusion,
  RentalExclusionInput,
  OtherExclusionInput,
  ExclusionType,
} from "./types/comprehensive.types";

// ============================================================
// 임대주택 합산배제 요건 판정 (시행령 §3)
// ============================================================

/**
 * 임대유형별 의무임대기간 (시행령 §3① 각 호 나목, 2026.2.27 시행본 실측)
 *
 * - 장기일반·공공지원민간임대(§3①7·8호): 10년
 * - 건설·매입·2005 이전 구법(§3①1·2·3호): 5년
 * - 공공건설/공공매입: §3①1·2호 5년 (단 §3⑦8호 임대의무기간 종료일까지 계속임대 간주 — 별도 사후관리)
 *
 * - 단기민간임대주택(§2⑥의2, 6년·§3①10·11호): 6년 (건설 10호·매입 11호)
 */
const MANDATORY_PERIOD_BY_TYPE: Record<
  RentalExclusionInput["registrationType"],
  number
> = {
  private_construction:        COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,      // 5 — §3①1호
  private_purchase_short:      COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,      // 5 — §3①2호 (구법)
  private_purchase_long:       COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_LONG,       // 10 — §3①8호
  public_support_construction: COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_LONG,       // 10 — §3①7호
  public_support_purchase:     COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_LONG,       // 10 — §3①8호 (공공지원)
  public_construction:         COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,      // 5 — §3①1호
  public_purchase:             COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,      // 5 — §3①2호
  existing_rental:             COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT,      // 5 — §3①3호 (2005년 이전)
  private_short_term_6y_construction: COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT_TERM_6Y, // 6 — §3①10호
  private_short_term_6y_purchase:     COMPREHENSIVE_EXCL_CONST.MANDATORY_PERIOD_SHORT_TERM_6Y, // 6 — §3①11호
};

export function validateRentalExclusion(
  input: RentalExclusionInput,
): ExclusionValidationResult {
  const failReasons: string[] = [];

  if (!input.rentalRegistrationDate) {
    failReasons.push(COMPREHENSIVE_EXCL.NO_RENTAL_REGISTRATION);
  }

  const areaLimit = getAreaLimit(input);
  if (input.area > areaLimit) {
    failReasons.push(
      areaLimit === COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_AREA_CONSTRUCTION
        ? COMPREHENSIVE_EXCL.AREA_EXCEEDED_149
        : COMPREHENSIVE_EXCL.AREA_EXCEEDED,
    );
  }

  const priceLimit = getPriceLimit(input);
  if (input.assessedValue > priceLimit) {
    failReasons.push(COMPREHENSIVE_EXCL.PRICE_EXCEEDED);
  }

  if (!input.isInitialContract && input.previousRent !== undefined) {
    const increaseRate = (input.currentRent - input.previousRent) / input.previousRent;
    if (increaseRate > COMPREHENSIVE_EXCL_CONST.RENT_INCREASE_RATE_LIMIT) {
      failReasons.push(COMPREHENSIVE_EXCL.RENT_INCREASE_EXCEEDED);
    }
  }

  if (input.assessmentDate < input.rentalStartDate) {
    failReasons.push(COMPREHENSIVE_EXCL.RENTAL_NOT_STARTED);
  }

  // 의무임대기간 — 등록 말소 확인 시 즉시 차단 (시행령 §3① 계속임대 위반 확정)
  // ※ "현재까지 N년 미달"은 거부 사유 아님 — 장래 의무이므로 경고만(아래 warnings)
  if (
    input.registrationRevokedDate &&
    input.registrationRevokedDate <= input.assessmentDate
  ) {
    failReasons.push(COMPREHENSIVE_EXCL.MANDATORY_PERIOD_NOT_MET);
  }

  if (failReasons.length > 0) {
    return { isExcluded: false, reason: failReasons[0], failReasons };
  }

  // 배제 성립 — 경과 연수가 의무기간 미달이면 사후 추징 위험 경고 (배제는 유지)
  const warnings: string[] = [];
  if (input.actualRentalYears !== undefined) {
    const requiredYears = MANDATORY_PERIOD_BY_TYPE[input.registrationType];
    if (requiredYears > 0 && input.actualRentalYears < requiredYears) {
      warnings.push(
        `의무임대기간(${requiredYears}년) 미충족 — 현재 ${input.actualRentalYears}년 경과. ` +
          `의무기간 충족 전 등록 말소 시 합산배제 세액이 소급 추징됩니다 (시행령 §3①).`,
      );
    }
  }

  return {
    isExcluded: true,
    reason: getRentalExclusionLegalCode(input.registrationType),
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * 전용면적 상한 (㎡)
 *
 * 종부세 시행령 §3① 각 호 기준:
 * - 건설임대 (1·7·10호): 149㎡ 이하
 * - 매입임대 (2·8·11호): 면적제한 없음 (Infinity)
 * - 기존임대 (3호, 2005 이전): 읍면 100㎡ / 그외 85㎡
 */
function getAreaLimit(input: RentalExclusionInput): number {
  switch (input.registrationType) {
    // 건설임대 — 149㎡ (§3①1·7·10호)
    case "private_construction":
    case "public_construction":
    case "public_support_construction":
    case "private_short_term_6y_construction":
      return COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_AREA_CONSTRUCTION; // 149

    // 매입임대 — 면적제한 없음 (§3①2·8·11호)
    case "private_purchase_long":
    case "private_purchase_short":
    case "public_purchase":
    case "public_support_purchase":
    case "private_short_term_6y_purchase":
      return Infinity;

    // 기존임대 (§3①3호, 2005년 이전) — 읍면 100㎡ / 그외 85㎡
    case "existing_rental":
      return input.isEupMyeonArea
        ? COMPREHENSIVE_EXCL_CONST.AREA_LIMIT_RURAL          // 100
        : COMPREHENSIVE_EXCL_CONST.AREA_LIMIT_NATIONAL_HOUSING; // 85
  }
}

function getPriceLimit(input: RentalExclusionInput): number {
  const metro = input.location === "metro";
  const over30 = input.isThirtyPlusUnits === true; // 30호 이상 tier (§3①1·2·7·8호)
  switch (input.registrationType) {
    // 단기건설 (§3①10호) — 6억, 수도권·호수 무관
    case "private_short_term_6y_construction":
      return COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_PRICE_CONSTRUCTION; // 6억
    // 단기매입 (§3①11호) — 4억/2억, 호수 무관
    case "private_short_term_6y_purchase":
      return metro
        ? COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_PRICE_PURCHASE_METRO // 4억
        : COMPREHENSIVE_EXCL_CONST.SHORT_TERM_6Y_PRICE_PURCHASE_NON_METRO; // 2억
    // 기존임대 (§3①3호) — 3억, 수도권·호수 무관
    case "existing_rental":
      return COMPREHENSIVE_EXCL_CONST.EXISTING_RENTAL_PRICE; // 3억
    // 장기 건설임대 (§3①1·7호) — 30호미만 9억 / 30호이상 12억, 수도권 무관
    case "private_construction":
    case "public_construction":
    case "public_support_construction":
      return over30
        ? COMPREHENSIVE_EXCL_CONST.BUILT_RENTAL_PRICE_OVER30 // 12억
        : COMPREHENSIVE_EXCL_CONST.BUILT_RENTAL_PRICE_UNDER30; // 9억
    // 매입임대 (§3①2·8호) — 30호미만 6억/3억 / 30호이상 9억/6억
    case "private_purchase_long":
    case "private_purchase_short":
    case "public_purchase":
    case "public_support_purchase":
      if (over30)
        return metro
          ? COMPREHENSIVE_EXCL_CONST.PURCHASE_PRICE_OVER30_METRO // 9억
          : COMPREHENSIVE_EXCL_CONST.PURCHASE_PRICE_OVER30_NON_METRO; // 6억
      return metro
        ? COMPREHENSIVE_EXCL_CONST.RENTAL_PRICE_METRO // 6억
        : COMPREHENSIVE_EXCL_CONST.RENTAL_PRICE_NON_METRO; // 3억
  }
}

function getRentalExclusionLegalCode(
  registrationType: RentalExclusionInput["registrationType"],
): string {
  switch (registrationType) {
    case "private_construction":        return COMPREHENSIVE_EXCL.PRIVATE_CONSTRUCTION_RENTAL;
    case "private_purchase_long":       return COMPREHENSIVE_EXCL.PRIVATE_PURCHASE_RENTAL_LONG;
    case "private_purchase_short":      return COMPREHENSIVE_EXCL.PRIVATE_PURCHASE_RENTAL_SHORT;
    case "public_support_construction": return COMPREHENSIVE_EXCL.PUBLIC_SUPPORT_CONSTRUCTION_RENTAL;
    case "public_support_purchase":     return COMPREHENSIVE_EXCL.PUBLIC_SUPPORT_PURCHASE_RENTAL;
    case "public_construction":         return COMPREHENSIVE_EXCL.PUBLIC_CONSTRUCTION_RENTAL;
    case "public_purchase":             return COMPREHENSIVE_EXCL.PUBLIC_PURCHASE_RENTAL;
    case "existing_rental":             return COMPREHENSIVE_EXCL.EXISTING_RENTAL;
    case "private_short_term_6y_construction": return COMPREHENSIVE_EXCL.PRIVATE_SHORT_TERM_RENTAL_6Y_CONSTRUCTION;
    case "private_short_term_6y_purchase":     return COMPREHENSIVE_EXCL.PRIVATE_SHORT_TERM_RENTAL_6Y_PURCHASE;
  }
}

// ============================================================
// 기타 합산배제 주택 요건 판정 (시행령 §4)
// ============================================================

export function validateOtherExclusion(
  prop: PropertyForExclusion,
  type: ExclusionType,
  info: OtherExclusionInput,
  assessmentDate: Date,
): ExclusionValidationResult {
  switch (type) {
    case "unsold_housing": {
      if (!info.isFirstSale) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.UNSOLD_NOT_FIRST_SALE };
      }
      if (!info.recruitmentNoticeDate || !info.acquisitionDate) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.UNSOLD_BEFORE_NOTICE };
      }
      const acquisitionDate = new Date(info.acquisitionDate);
      const noticeDate = new Date(info.recruitmentNoticeDate);
      if (acquisitionDate < noticeDate) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.UNSOLD_BEFORE_NOTICE };
      }
      const exclusionEndDate = addYears(
        acquisitionDate,
        COMPREHENSIVE_EXCL_CONST.UNSOLD_EXCLUSION_YEARS,
      );
      if (assessmentDate > exclusionEndDate) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.UNSOLD_PERIOD_EXPIRED };
      }
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.UNSOLD_HOUSING };
    }

    case "daycare_housing": {
      if (!info.hasDaycarePermit || !info.isActuallyUsedAsDaycare) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.NOT_APPLIED };
      }
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.DAYCARE_HOUSING };
    }

    case "employee_housing": {
      if (!info.isProvidedToEmployee) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.NOT_APPLIED };
      }
      if (
        info.rentalFeeRate !== undefined &&
        info.rentalFeeRate > COMPREHENSIVE_EXCL_CONST.EMPLOYEE_HOUSING_RENT_RATE_LIMIT
      ) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.NOT_APPLIED };
      }
      if (prop.area !== undefined && prop.area > COMPREHENSIVE_EXCL_CONST.AREA_LIMIT_NATIONAL_HOUSING) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.AREA_EXCEEDED };
      }
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.EMPLOYEE_HOUSING };
    }

    case "developer_unsold":
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.DEVELOPER_UNSOLD };

    case "cultural_heritage":
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.CULTURAL_HERITAGE };

    case "religious":
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.RELIGIOUS_HOUSING };

    case "senior_welfare":
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.SENIOR_WELFARE_HOUSING };

    default:
      return { isExcluded: false, reason: COMPREHENSIVE_EXCL.NOT_APPLIED };
  }
}

// ============================================================
// 합산배제 일괄 판정 (T-05)
// ============================================================

export function applyAggregationExclusion(
  properties: PropertyForExclusion[],
  assessmentDate: Date,
): AggregationExclusionResult {
  const rentalTypes: ExclusionType[] = [
    "private_construction_rental",
    "private_purchase_rental_long",
    "private_purchase_rental_short",
    "public_support_construction_rental",
    "public_support_purchase_rental",
    "public_construction_rental",
    "public_purchase_rental",
    "existing_rental",
    "private_short_term_rental_6y_construction",
    "private_short_term_rental_6y_purchase",
  ];

  const results: ExclusionResult[] = properties.map((prop) => {
    if (prop.exclusionType === "none") {
      return {
        propertyId: prop.propertyId,
        isExcluded: false,
        excludedValue: 0,
        exclusionType: "none" as const,
        reason: COMPREHENSIVE_EXCL.NOT_APPLIED,
      };
    }

    let validationResult: ExclusionValidationResult;

    if (rentalTypes.includes(prop.exclusionType)) {
      if (!prop.rentalInfo) {
        validationResult = {
          isExcluded: false,
          reason: COMPREHENSIVE_EXCL.NO_RENTAL_REGISTRATION,
        };
      } else {
        validationResult = validateRentalExclusion({
          ...prop.rentalInfo,
          assessmentDate,
        });
      }
    } else {
      if (!prop.otherInfo) {
        validationResult = {
          isExcluded: false,
          reason: COMPREHENSIVE_EXCL.NOT_APPLIED,
        };
      } else {
        validationResult = validateOtherExclusion(
          prop,
          prop.exclusionType,
          prop.otherInfo,
          assessmentDate,
        );
      }
    }

    return {
      propertyId: prop.propertyId,
      isExcluded: validationResult.isExcluded,
      excludedValue: validationResult.isExcluded ? prop.assessedValue : 0,
      exclusionType: prop.exclusionType,
      reason: validationResult.reason,
      failReasons: validationResult.failReasons,
      warnings: validationResult.warnings,
    };
  });

  const { totalExcludedValue, excludedCount } = results.reduce(
    (acc, r) =>
      r.isExcluded
        ? { totalExcludedValue: acc.totalExcludedValue + r.excludedValue, excludedCount: acc.excludedCount + 1 }
        : acc,
    { totalExcludedValue: 0, excludedCount: 0 },
  );

  return {
    propertyResults: results,
    totalExcludedValue,
    excludedCount,
    includedCount: results.length - excludedCount,
  };
}
