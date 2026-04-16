/**
 * 재산세 주택 범위 판정 모듈 (P2-13~16)
 *
 * 지방세법 §105 (주택의 정의), 시행령 §105 (겸용·부속토지)
 *
 * 기능:
 * - classifyMixedUseBuilding(): 겸용주택 판정 (주거 > 비주거 → 전체 주택)
 * - handleExcessAttachedLand(): 부속토지 한도 초과 분리 (도시 10배/비도시 5배)
 * - classifyOfficetel(): 오피스텔 주거용/업무용 구분
 * - calculateHouseScope(): 최종 주택 범위 통합 집계
 */

import { PROPERTY } from "./legal-codes";
import type { HouseInput } from "./types/property-object.types";

// ============================================================
// 출력 타입
// ============================================================

/** 겸용주택 판정 결과 */
export interface MixedUseBuildingResult {
  /** 전체 주택 / 주거 부분만 주택 / 주택 아님 */
  classification: "full_house" | "partial_house" | "not_house";
  /** 주택 비율 (0~1): full_house=1, not_house=0, partial_house=주거/전체 */
  housePortion: number;
  legalBasis: string;
  reason: string;
}

/** 부속토지 한도 계산 결과 */
export interface AttachedLandResult {
  /** 주택분으로 인정되는 부속토지 면적 (m²) */
  attachedLandArea: number;
  /** 종합합산 전환 초과 면적 (m²) */
  excessLandArea: number;
  /** 적용 배율 (도시 10배 / 비도시 5배) */
  multiplier: number;
  legalBasis: string;
}

/** 오피스텔 분류 결과 */
export interface OfficetelClassificationResult {
  /** 주거용 여부 */
  isResidential: boolean;
  /** 건물 유형 (house | building) */
  objectType: "house" | "building";
  legalBasis: string;
  warnings: string[];
}

/** 주택 범위 최종 집계 결과 */
export interface HouseScopeResult {
  /** 주택 해당 여부 */
  isHouse: boolean;
  /** 겸용 분류 */
  mixedUseClassification: "full_house" | "partial_house" | "not_house";
  /** 주택 비율 */
  housePortion: number;
  /** 인정 부속토지 면적 (m²) */
  taxableAttachedLandArea: number;
  /** 종합합산 전환 초과 면적 (m²) */
  excessLandArea: number;
  /**
   * 주택분 과세 가액 (원)
   * = 건물 공시가격 × housePortion + 부속토지 공시가격 × (인정면적/전체면적)
   * (공시가격 정보가 있을 때만 설정)
   */
  totalHouseValue?: number;
  legalBasis: string[];
  warnings: string[];
}

// ============================================================
// P2-13: classifyMixedUseBuilding — 겸용주택 판정
// ============================================================

/**
 * 겸용주택 판정 (지방세법 시행령 §105)
 *
 * ① 주거 면적 > 비주거 면적 → 전체를 주택으로 간주
 * ② 주거 면적 ≤ 비주거 면적 → 주거 부분만 주택 (면적 비례 안분)
 * ③ 주거 면적 = 0 → 주택 아님
 */
export function classifyMixedUseBuilding(input: {
  residentialArea: number;
  nonResidentialArea: number;
}): MixedUseBuildingResult {
  const { residentialArea, nonResidentialArea } = input;
  const total = residentialArea + nonResidentialArea;

  if (total <= 0 || residentialArea <= 0) {
    return {
      classification: "not_house",
      housePortion: 0,
      legalBasis: PROPERTY.HOUSE_MIXED_USE,
      reason: "주거 사용 면적이 없어 주택으로 분류하지 않습니다.",
    };
  }

  // 주거 > 비주거 → 전체 주택
  if (residentialArea > nonResidentialArea) {
    return {
      classification: "full_house",
      housePortion: 1,
      legalBasis: PROPERTY.HOUSE_MIXED_USE,
      reason: `주거(${residentialArea}m²) > 비주거(${nonResidentialArea}m²) → 전체를 주택으로 봅니다.`,
    };
  }

  // 주거 ≤ 비주거 → 주거 부분만 주택
  const housePortion = residentialArea / total;
  return {
    classification: "partial_house",
    housePortion,
    legalBasis: PROPERTY.HOUSE_MIXED_USE,
    reason: `주거(${residentialArea}m²) ≤ 비주거(${nonResidentialArea}m²) → 주거 부분(${(housePortion * 100).toFixed(1)}%)만 주택으로 봅니다.`,
  };
}

// ============================================================
// P2-14: handleExcessAttachedLand — 부속토지 한도 초과 분리
// ============================================================

/**
 * 주택 부속토지 한도 계산 (지방세법 시행령 §105①)
 *
 * - 도시지역: 건물 바닥면적의 5배 이내 → 주택분 (지방세법 시행령 §105①1호)
 * - 비도시지역: 건물 바닥면적의 10배 이내 → 주택분 (지방세법 시행령 §105①2호)
 * - 한도 초과분 → 종합합산 토지로 전환
 */
export function handleExcessAttachedLand(input: {
  buildingFloorArea: number;
  attachedLandArea: number;
  isUrbanArea: boolean;
}): AttachedLandResult {
  const multiplier = input.isUrbanArea ? 5 : 10;
  const limit = input.buildingFloorArea * multiplier;
  const attachedLandArea = Math.min(input.attachedLandArea, limit);
  const excessLandArea = Math.max(0, input.attachedLandArea - limit);

  return {
    attachedLandArea,
    excessLandArea,
    multiplier,
    legalBasis: PROPERTY.HOUSE_ATTACHED_LAND_LIMIT,
  };
}

// ============================================================
// P2-15: classifyOfficetel — 오피스텔 주거용/업무용 구분
// ============================================================

/**
 * 오피스텔 재산세 과세 분류 (지방세법 시행령 §119의2)
 *
 * 주거용 오피스텔 (다음 요건 중 하나):
 * - 주민등록 전입 신고 (사실상 주거 사용)
 * - 주거용으로 신고·등록
 *
 * 업무용 → 건축물분 재산세 + 부속토지 별도합산
 */
export function classifyOfficetel(input: {
  isOfficetelResidential: boolean;
  hasResidenceRegistration?: boolean;
}): OfficetelClassificationResult {
  const warnings: string[] = [];

  const isResidential =
    input.isOfficetelResidential ||
    (input.hasResidenceRegistration ?? false);

  if (!input.isOfficetelResidential && !input.hasResidenceRegistration) {
    warnings.push(
      "오피스텔 사용 용도(주거용/업무용)가 명확하지 않습니다. " +
      "주민등록 전입 여부 또는 주거용 신고 여부를 확인하세요.",
    );
  }

  return {
    isResidential,
    objectType: isResidential ? "house" : "building",
    legalBasis: PROPERTY.HOUSE_OFFICETEL,
    warnings,
  };
}

// ============================================================
// P2-16: calculateHouseScope — 주택 범위 통합 집계
// ============================================================

/**
 * 주택 범위 최종 집계 (P2-13~15 통합)
 *
 * 입력 HouseInput을 받아 겸용·부속토지·오피스텔 판정을 순서대로 적용합니다.
 *
 * @param input HouseInput
 * @param buildingPublicPrice 건물 공시가격 (원, 옵션)
 * @param landPublicPrice 토지 공시가격 (원, 옵션)
 * @returns HouseScopeResult
 */
export function calculateHouseScope(
  input: HouseInput,
  buildingPublicPrice?: number,
  landPublicPrice?: number,
): HouseScopeResult {
  const warnings: string[] = [];
  const legalBasis: string[] = [];

  // ── 오피스텔 처리 ──
  if (input.structureType === "officetel_residential") {
    const officetelResult = classifyOfficetel({
      isOfficetelResidential: input.isOfficetelResidential ?? false,
    });
    warnings.push(...officetelResult.warnings);
    legalBasis.push(officetelResult.legalBasis);

    if (!officetelResult.isResidential) {
      return {
        isHouse: false,
        mixedUseClassification: "not_house",
        housePortion: 0,
        taxableAttachedLandArea: 0,
        excessLandArea: input.attachedLandArea,
        legalBasis,
        warnings,
      };
    }
    // 주거용 오피스텔 → 이하 주택 처리 계속
  }

  // ── 겸용주택 판정 ──
  let housePortion = 1;
  let mixedUseClassification: "full_house" | "partial_house" | "not_house" = "full_house";

  if (
    input.residentialArea !== undefined &&
    input.nonResidentialArea !== undefined
  ) {
    const mixedResult = classifyMixedUseBuilding({
      residentialArea: input.residentialArea,
      nonResidentialArea: input.nonResidentialArea,
    });
    housePortion = mixedResult.housePortion;
    mixedUseClassification = mixedResult.classification;
    legalBasis.push(mixedResult.legalBasis);

    if (mixedUseClassification === "not_house") {
      return {
        isHouse: false,
        mixedUseClassification,
        housePortion: 0,
        taxableAttachedLandArea: 0,
        excessLandArea: input.attachedLandArea,
        legalBasis,
        warnings,
      };
    }
  }

  // ── 부속토지 한도 계산 ──
  // 겸용주택에서 주택 부분에 해당하는 건물 면적만 기준
  const effectiveFloorArea = input.buildingFloorArea * housePortion;
  const attachedResult = handleExcessAttachedLand({
    buildingFloorArea: effectiveFloorArea,
    attachedLandArea: input.attachedLandArea,
    isUrbanArea: input.isUrbanArea,
  });
  legalBasis.push(attachedResult.legalBasis);

  if (attachedResult.excessLandArea > 0) {
    warnings.push(
      `부속토지 ${input.attachedLandArea}m² 중 ${attachedResult.attachedLandArea}m²는 주택분, ` +
      `${attachedResult.excessLandArea}m²는 종합합산 토지로 전환됩니다.`,
    );
  }

  // ── 과세 가액 계산 (공시가격 입력 시) ──
  let totalHouseValue: number | undefined;
  if (buildingPublicPrice !== undefined && landPublicPrice !== undefined) {
    const houseBuilding = Math.floor(buildingPublicPrice * housePortion);
    const landRatio =
      input.attachedLandArea > 0
        ? attachedResult.attachedLandArea / input.attachedLandArea
        : 1;
    const houseLand = Math.floor(landPublicPrice * landRatio);
    totalHouseValue = houseBuilding + houseLand;
  }

  return {
    isHouse: true,
    mixedUseClassification,
    housePortion,
    taxableAttachedLandArea: attachedResult.attachedLandArea,
    excessLandArea: attachedResult.excessLandArea,
    totalHouseValue,
    legalBasis: [...new Set(legalBasis)],
    warnings,
  };
}
