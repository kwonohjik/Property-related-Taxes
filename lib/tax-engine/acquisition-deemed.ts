/**
 * 취득세 간주취득 판정 모듈
 *
 * 지방세법 §7의2 — 간주취득 3종:
 * 1. 과점주주 (법인 주식 취득으로 인한 간주취득)
 * 2. 토지 지목변경
 * 3. 건물 개수(改修)
 */

import { ACQUISITION } from "./legal-codes";
import type { DeemedAcquisitionInput, DeemedMajorShareholderResult } from "./types/acquisition.types";

// ============================================================
// 간주취득 결과 타입
// ============================================================

export interface DeemedLandCategoryResult {
  isSubjectToTax: boolean;
  deemedTaxBase: number;   // 변경 후 시가표준액 - 변경 전 시가표준액
  prevStandardValue: number;
  newStandardValue: number;
  legalBasis: string;
  warnings: string[];
}

export interface DeemedRenovationResult {
  isSubjectToTax: boolean;
  deemedTaxBase: number;   // 개수 후 시가표준액 - 개수 전 시가표준액
  prevStandardValue: number;
  newStandardValue: number;
  legalBasis: string;
  warnings: string[];
}

// ============================================================
// 1. 과점주주 간주취득 (지방세법 §7의2 ①)
// ============================================================

/**
 * 과점주주 간주취득 판정
 *
 * 과점주주 = 주주 1인 + 특수관계인 지분 합계 50% 초과
 *
 * 판정 기준:
 * - 취득 전 비과점주주 → 취득 후 과점주주: 전체 지분율 기준 간주취득
 * - 취득 전 과점주주 → 지분율 증가: 증가분 지분율 기준 간주취득
 * - 상장법인 주식: 간주취득 비과세 (지방세법 §9①)
 */
export function assessMajorShareholder(
  input: NonNullable<DeemedAcquisitionInput["majorShareholder"]>
): DeemedMajorShareholderResult {
  const warnings: string[] = [];
  const { corporateAssetValue, prevShareRatio, newShareRatio, isListed } = input;

  // 상장법인은 과점주주 간주취득 비과세
  if (isListed) {
    return {
      isSubjectToTax: false,
      deemedTaxBase: 0,
      prevShareRatio,
      newShareRatio,
      taxableRatio: 0,
      legalBasis: ACQUISITION.DEEMED_ACQUISITION,
      warnings: [`상장법인 주식 취득은 과점주주 간주취득 과세 대상에서 제외됩니다 (${ACQUISITION.NON_TAXABLE}).`],
    };
  }

  const MAJORITY_THRESHOLD = 0.5; // 과점주주 기준: 지분 합계 50% 초과

  const wasOverThreshold = prevShareRatio > MAJORITY_THRESHOLD;
  const isOverThreshold = newShareRatio > MAJORITY_THRESHOLD;

  // Case 1: 취득 후에도 50% 이하 → 과점주주 아님
  if (!isOverThreshold) {
    return {
      isSubjectToTax: false,
      deemedTaxBase: 0,
      prevShareRatio,
      newShareRatio,
      taxableRatio: 0,
      legalBasis: ACQUISITION.DEEMED_ACQUISITION,
      warnings: ["취득 후 지분율 50% 이하 — 과점주주 해당 없음."],
    };
  }

  let taxableRatio: number;

  if (!wasOverThreshold) {
    // Case 2: 비과점주주 → 과점주주 (최초 과점주주 취득): 취득 후 전체 지분율 기준
    taxableRatio = newShareRatio;
    warnings.push("최초 과점주주 취득: 취득 후 지분율 전체를 과세 기준으로 적용합니다.");
  } else {
    // Case 3: 과점주주 → 지분율 증가: 증가분만 과세
    taxableRatio = newShareRatio - prevShareRatio;
    if (taxableRatio <= 0) {
      return {
        isSubjectToTax: false,
        deemedTaxBase: 0,
        prevShareRatio,
        newShareRatio,
        taxableRatio: 0,
        legalBasis: ACQUISITION.DEEMED_ACQUISITION,
        warnings: ["지분율 증가 없음 — 간주취득 과세 대상 아님."],
      };
    }
    warnings.push("과점주주 지분율 증가: 증가분 지분율만 과세 기준으로 적용합니다.");
  }

  // 간주취득 과세표준 = 법인 보유 과세대상 자산 시가표준액 × 과세 지분율
  const deemedTaxBase = Math.floor(corporateAssetValue * taxableRatio);

  return {
    isSubjectToTax: true,
    deemedTaxBase,
    prevShareRatio,
    newShareRatio,
    taxableRatio,
    legalBasis: ACQUISITION.DEEMED_ACQUISITION,
    warnings,
  };
}

// ============================================================
// 2. 토지 지목변경 간주취득 (지방세법 §7의2 ②)
// ============================================================

/**
 * 토지 지목변경 간주취득 판정
 *
 * 지목변경으로 시가표준액이 증가한 경우:
 *   간주취득 과세표준 = 변경 후 시가표준액 - 변경 전 시가표준액
 *
 * 시가표준액이 감소하거나 동일한 경우: 과세 없음
 */
export function assessLandCategoryChange(
  input: NonNullable<DeemedAcquisitionInput["landCategory"]>
): DeemedLandCategoryResult {
  const warnings: string[] = [];
  const { prevCategory, newCategory, prevStandardValue, newStandardValue } = input;

  const diff = newStandardValue - prevStandardValue;

  if (diff <= 0) {
    warnings.push(
      `지목변경 후 시가표준액(${newStandardValue.toLocaleString()}원)이 변경 전(${prevStandardValue.toLocaleString()}원) 이하 — 간주취득 과세 없음.`
    );
    return {
      isSubjectToTax: false,
      deemedTaxBase: 0,
      prevStandardValue,
      newStandardValue,
      legalBasis: ACQUISITION.DEEMED_ACQUISITION,
      warnings,
    };
  }

  warnings.push(`지목변경: ${prevCategory} → ${newCategory} (시가표준액 증가분 ${diff.toLocaleString()}원 과세)`);

  return {
    isSubjectToTax: true,
    deemedTaxBase: diff,
    prevStandardValue,
    newStandardValue,
    legalBasis: ACQUISITION.DEEMED_ACQUISITION,
    warnings,
  };
}

// ============================================================
// 3. 건물 개수(改修) 간주취득 (지방세법 §7의2 ③)
// ============================================================

/**
 * 건물 개수(改修) 간주취득 판정
 *
 * 건물의 구조 변경·용도 변경·대수선으로 시가표준액이 증가한 경우:
 *   간주취득 과세표준 = 개수 후 시가표준액 - 개수 전 시가표준액
 *
 * 적용 대상 개수 유형:
 * - structural_change: 건물 구조 변경 (목조→철근콘크리트 등)
 * - use_change: 용도 변경 (창고→주택 등)
 * - major_repair: 대수선 (주요 구조부 수선)
 */
export function assessBuildingRenovation(
  input: NonNullable<DeemedAcquisitionInput["renovation"]>
): DeemedRenovationResult {
  const warnings: string[] = [];
  const { renovationType, prevStandardValue, newStandardValue } = input;

  const diff = newStandardValue - prevStandardValue;

  if (diff <= 0) {
    warnings.push(
      `개수 후 시가표준액(${newStandardValue.toLocaleString()}원)이 개수 전(${prevStandardValue.toLocaleString()}원) 이하 — 간주취득 과세 없음.`
    );
    return {
      isSubjectToTax: false,
      deemedTaxBase: 0,
      prevStandardValue,
      newStandardValue,
      legalBasis: ACQUISITION.DEEMED_ACQUISITION,
      warnings,
    };
  }

  const renovationTypeLabel =
    renovationType === "structural_change" ? "구조 변경" :
    renovationType === "use_change" ? "용도 변경" : "대수선";

  warnings.push(`건물 개수(${renovationTypeLabel}): 시가표준액 증가분 ${diff.toLocaleString()}원 간주취득 과세`);

  return {
    isSubjectToTax: true,
    deemedTaxBase: diff,
    prevStandardValue,
    newStandardValue,
    legalBasis: ACQUISITION.DEEMED_ACQUISITION,
    warnings,
  };
}

// ============================================================
// 통합 간주취득 판정
// ============================================================

export interface DeemedAcquisitionResult {
  type: "major_shareholder" | "land_category" | "renovation" | null;
  isSubjectToTax: boolean;
  deemedTaxBase: number;
  detail: DeemedMajorShareholderResult | DeemedLandCategoryResult | DeemedRenovationResult | null;
  legalBasis: string;
  warnings: string[];
}

/**
 * 간주취득 종합 판정 — 3가지 유형 중 해당 유형 처리
 */
export function assessDeemedAcquisition(
  input: DeemedAcquisitionInput
): DeemedAcquisitionResult {
  if (input.majorShareholder) {
    const result = assessMajorShareholder(input.majorShareholder);
    return {
      type: "major_shareholder",
      isSubjectToTax: result.isSubjectToTax,
      deemedTaxBase: result.deemedTaxBase,
      detail: result,
      legalBasis: result.legalBasis,
      warnings: result.warnings,
    };
  }

  if (input.landCategory) {
    const result = assessLandCategoryChange(input.landCategory);
    return {
      type: "land_category",
      isSubjectToTax: result.isSubjectToTax,
      deemedTaxBase: result.deemedTaxBase,
      detail: result,
      legalBasis: result.legalBasis,
      warnings: result.warnings,
    };
  }

  if (input.renovation) {
    const result = assessBuildingRenovation(input.renovation);
    return {
      type: "renovation",
      isSubjectToTax: result.isSubjectToTax,
      deemedTaxBase: result.deemedTaxBase,
      detail: result,
      legalBasis: result.legalBasis,
      warnings: result.warnings,
    };
  }

  return {
    type: null,
    isSubjectToTax: false,
    deemedTaxBase: 0,
    detail: null,
    legalBasis: ACQUISITION.DEEMED_ACQUISITION,
    warnings: ["간주취득 입력 데이터 없음."],
  };
}
