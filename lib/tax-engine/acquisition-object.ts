/**
 * 취득세 과세 대상 판정 모듈
 *
 * 지방세법 §6(취득의 정의), §7(과세 대상 물건), §9(비과세)
 * - 과세 대상 8종 해당 여부 확인
 * - 비과세·면제 사유 판정
 */

import { ACQUISITION } from "./legal-codes";
import type {
  PropertyObjectType,
  AcquisitionCause,
  AcquirerType,
  AcquisitionExemptionType,
} from "./types/acquisition.types";

// ============================================================
// 과세 대상 판정 결과 타입
// ============================================================

export interface TaxableObjectResult {
  isTaxable: boolean;
  isExempt: boolean;
  exemptionType?: AcquisitionExemptionType;
  warnings: string[];
  legalBasis: string;
}

// ============================================================
// 과세 대상 판정 (지방세법 §7 열거주의)
// ============================================================

/**
 * 과세 대상 물건 8종 확인 — 지방세법 §7
 * 열거주의: 나열된 물건에만 과세, 목록 외 물건은 과세 불가
 */
export function isTaxableObject(propertyType: PropertyObjectType): boolean {
  const taxableObjects: PropertyObjectType[] = [
    "housing",       // 주택 (지방세법 §7①1 — 부동산)
    "land",          // 토지 (지방세법 §7①1 — 부동산)
    "land_farmland", // 농지 (지방세법 §7①1 — 부동산)
    "building",      // 건물 비주거용 (지방세법 §7①1 — 부동산)
    "vehicle",       // 차량 (지방세법 §7①2)
    "machinery",     // 기계장비 (지방세법 §7①3)
    "aircraft",      // 항공기 (지방세법 §7①4)
    "vessel",        // 선박 (지방세법 §7①5)
    "mining_right",  // 광업권 (지방세법 §7①6)
    "fishing_right", // 어업권 (지방세법 §7①6)
    "membership",    // 회원권 (지방세법 §7①7)
    "standing_tree", // 입목 (지방세법 §7①8)
  ];
  return taxableObjects.includes(propertyType);
}

// ============================================================
// 비과세 판정 (지방세법 §9)
// ============================================================

interface ExemptionCheckInput {
  propertyType: PropertyObjectType;
  acquisitionCause: AcquisitionCause;
  acquiredBy: AcquirerType;
  /** 묘지 여부 */
  isCemetery?: boolean;
  /** 신탁 위탁자 반환 여부 */
  isTrustReturn?: boolean;
  /** 임시건축물 (1년 내 철거 예정) 여부 */
  isTemporaryBuilding?: boolean;
  /** 자경농지 여부 */
  isSelfCultivatedFarmland?: boolean;
  /** 종교·비영리 법인 용도 취득 여부 */
  isReligiousNonprofit?: boolean;
}

/**
 * 비과세 사유 판정 — 지방세법 §9
 *
 * 비과세 우선 확인: 과세 대상이라도 비과세 사유 해당 시 취득세 없음
 */
export function checkExemption(input: ExemptionCheckInput): {
  isExempt: boolean;
  exemptionType?: AcquisitionExemptionType;
  legalBasis: string;
} {
  // ① 국가·지방자치단체 취득 (§9①1)
  if (input.acquiredBy === "government") {
    return {
      isExempt: true,
      exemptionType: "government_acquisition",
      legalBasis: ACQUISITION.NON_TAXABLE,
    };
  }

  // ② 신탁법상 위탁자 반환 (§9①2)
  if (input.isTrustReturn) {
    return {
      isExempt: true,
      exemptionType: "trust_return",
      legalBasis: ACQUISITION.NON_TAXABLE,
    };
  }

  // ③ 묘지 취득 (§9①3)
  if (input.isCemetery) {
    return {
      isExempt: true,
      exemptionType: "cemetery",
      legalBasis: ACQUISITION.NON_TAXABLE,
    };
  }

  // ④ 종교·비영리법인 용도 취득 (§9①4)
  if (input.isReligiousNonprofit && input.acquiredBy === "nonprofit") {
    return {
      isExempt: true,
      exemptionType: "religious_nonprofit",
      legalBasis: ACQUISITION.NON_TAXABLE,
    };
  }

  // ⑤ 임시건축물 (1년 내 철거 예정) (§9①5)
  if (input.isTemporaryBuilding && (input.propertyType === "building" || input.propertyType === "housing")) {
    return {
      isExempt: true,
      exemptionType: "temporary_building",
      legalBasis: ACQUISITION.NON_TAXABLE,
    };
  }

  // ⑥ 자경농지 (§9①6)
  if (input.isSelfCultivatedFarmland && input.propertyType === "land_farmland") {
    return {
      isExempt: true,
      exemptionType: "self_cultivated_farmland",
      legalBasis: ACQUISITION.NON_TAXABLE,
    };
  }

  return { isExempt: false, legalBasis: ACQUISITION.NON_TAXABLE };
}

// ============================================================
// 메인 과세 대상 판정 함수
// ============================================================

/**
 * 취득세 과세 대상 종합 판정
 *
 * 판정 순서:
 * 1. 열거주의 과세 대상 8종 해당 여부
 * 2. 비과세·면제 사유 해당 여부
 */
export function determineTaxableObject(
  input: ExemptionCheckInput
): TaxableObjectResult {
  const warnings: string[] = [];

  // Step 1: 과세 대상 8종 해당 여부
  if (!isTaxableObject(input.propertyType)) {
    return {
      isTaxable: false,
      isExempt: false,
      warnings: [`${input.propertyType}은 지방세법 §7 과세 대상 물건에 해당하지 않습니다.`],
      legalBasis: ACQUISITION.TAXABLE_OBJECTS,
    };
  }

  // Step 2: 비과세 사유 확인
  const exemption = checkExemption(input);
  if (exemption.isExempt) {
    return {
      isTaxable: true,
      isExempt: true,
      exemptionType: exemption.exemptionType,
      warnings,
      legalBasis: exemption.legalBasis,
    };
  }

  return {
    isTaxable: true,
    isExempt: false,
    warnings,
    legalBasis: ACQUISITION.TAXABLE_OBJECTS,
  };
}

// ============================================================
// 취득 해당 여부 판단 보조 함수 (지방세법 §6)
// ============================================================

/**
 * 취득으로 보지 않는 경우 — 지방세법 §6 제1호 단서
 *
 * 이 케이스는 입력 단계에서 acquisitionCause로 필터링하거나,
 * 별도 비과세 판정 흐름에서 처리함.
 */
export function isNonAcquisition(
  acquisitionCause: AcquisitionCause
): boolean {
  // 현재 types에 없으나 향후 확장 가능한 비취득 케이스
  // (환매권 행사·법인 합병·협의분할 등은 별도 입력으로 처리)
  return false;
}

/**
 * 부동산 유형 여부 확인
 */
export function isRealEstate(propertyType: PropertyObjectType): boolean {
  return ["housing", "land", "land_farmland", "building"].includes(propertyType);
}

/**
 * 주택 유형 여부 확인
 */
export function isHousing(propertyType: PropertyObjectType): boolean {
  return propertyType === "housing";
}

/**
 * 농지 유형 여부 확인
 */
export function isFarmland(propertyType: PropertyObjectType): boolean {
  return propertyType === "land_farmland";
}

/**
 * 사치성 재산 여부 판단 (지방세법 §13①)
 * - 골프장, 고급주택, 별장, 고급선박, 고급오락장
 * - 실제 판단은 물건의 면적·가액·용도에 따라 다름 → 외부 입력으로 처리
 */
export function isLuxuryProperty(
  propertyType: PropertyObjectType,
  /** 골프장·별장·고급오락장 등 사치성 용도 여부 (외부에서 입력) */
  isLuxuryUse: boolean
): boolean {
  if (isLuxuryUse) return true;
  if (propertyType === "membership") return true; // 회원권은 사치성 중과 대상
  return false;
}
