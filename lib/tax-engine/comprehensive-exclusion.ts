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

export function validateRentalExclusion(
  input: RentalExclusionInput,
): ExclusionValidationResult {
  const failReasons: string[] = [];

  if (!input.rentalRegistrationDate) {
    failReasons.push(COMPREHENSIVE_EXCL.NO_RENTAL_REGISTRATION);
  }

  if (input.area > COMPREHENSIVE_EXCL_CONST.AREA_LIMIT_NATIONAL_HOUSING) {
    failReasons.push(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
  }

  const priceLimit = getPriceLimit(input.registrationType, input.location);
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

  if (failReasons.length > 0) {
    return { isExcluded: false, reason: failReasons[0], failReasons };
  }

  return {
    isExcluded: true,
    reason: getRentalExclusionLegalCode(input.registrationType),
  };
}

function getPriceLimit(
  registrationType: RentalExclusionInput["registrationType"],
  location: "metro" | "non_metro",
): number {
  if (registrationType === "public_support") {
    return location === "metro"
      ? COMPREHENSIVE_EXCL_CONST.PUBLIC_SUPPORT_PRICE_METRO
      : COMPREHENSIVE_EXCL_CONST.PUBLIC_SUPPORT_PRICE_NON_METRO;
  }
  return location === "metro"
    ? COMPREHENSIVE_EXCL_CONST.RENTAL_PRICE_METRO
    : COMPREHENSIVE_EXCL_CONST.RENTAL_PRICE_NON_METRO;
}

function getRentalExclusionLegalCode(
  registrationType: RentalExclusionInput["registrationType"],
): string {
  switch (registrationType) {
    case "private_construction":   return COMPREHENSIVE_EXCL.PRIVATE_CONSTRUCTION_RENTAL;
    case "private_purchase_long":  return COMPREHENSIVE_EXCL.PRIVATE_PURCHASE_RENTAL_LONG;
    case "private_purchase_short": return COMPREHENSIVE_EXCL.PRIVATE_PURCHASE_RENTAL_SHORT;
    case "public_support":         return COMPREHENSIVE_EXCL.PUBLIC_SUPPORT_RENTAL;
    case "public_construction":    return COMPREHENSIVE_EXCL.PUBLIC_CONSTRUCTION_RENTAL;
    case "public_purchase":        return COMPREHENSIVE_EXCL.PUBLIC_PURCHASE_RENTAL;
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
    "public_support_rental",
    "public_construction_rental",
    "public_purchase_rental",
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
