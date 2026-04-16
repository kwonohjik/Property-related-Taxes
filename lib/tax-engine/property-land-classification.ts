/**
 * 재산세 토지 3분류 판정 모듈 (P2-09~11)
 *
 * 지방세법 §106 기반 판정 순서 (우선순위 엄수):
 *   1단계: 비과세 여부 (§109) — property-exemption.ts에서 선행 판정
 *   2단계: 분리과세 (§106②) — 자경농지·골프장 등 9종
 *   3단계: 별도합산 (§106①2호) — 영업용 건물 부속토지 (용도지역 배율)
 *   4단계: 종합합산 (§106①1호) — 나머지 전부 (default)
 *
 * split 결과: 별도합산 인정분 + 초과분 종합합산 (면적·가액 안분)
 */

import { PROPERTY } from "./legal-codes";
import type {
  LandInput,
  LandClassification,
  ZoningDistrictType,
  SeparateTaxationLandType,
} from "./types/property-object.types";

// ============================================================
// 출력 타입
// ============================================================

export interface SeparateTaxationResult {
  isSeparate: boolean;
  subtype?: SeparateTaxationLandType;
  /** 분리과세 세율 (0.0007 | 0.002 | 0.04) */
  rate: number;
  legalBasis: string;
  reason: string;
}

export interface SeparateAggregateResult {
  isSeparateAggregate: boolean;
  /** 별도합산 인정 면적 (m²) */
  recognizedArea: number;
  /** 종합합산 전환 초과 면적 (m²) */
  excessArea: number;
  /** 적용 배율 */
  multiplier: number;
  legalBasis: string;
}

export interface LandClassificationResult {
  /** 1차 분류 */
  primary: LandClassification;
  /** 분리과세 세부 유형 */
  separateTaxationType?: SeparateTaxationLandType;
  /** 분리과세 세율 */
  separateTaxationRate?: number;
  /** 별도합산 인정 면적 (split 시) */
  separateAggregateArea?: number;
  /** 종합합산 전환 면적 (split 시) */
  generalAggregateArea?: number;
  legalBasis: string[];
  warnings: string[];
}

// ============================================================
// 내부 상수 — 용도지역별 별도합산 배율 (지방세법 시행령 §102의3)
// ============================================================

const ZONING_MULTIPLIER: Record<ZoningDistrictType, number> = {
  commercial:       3,  // 상업지역 3배
  industrial:       4,  // 공업지역 4배
  residential:      5,  // 주거지역 5배
  green:            7,  // 녹지지역 7배
  management:       5,  // 관리지역 5배
  agricultural:     7,  // 농림지역 7배
  nature_preserve:  7,  // 자연환경보전지역 7배
};

function getZoningMultiplier(district: ZoningDistrictType): number {
  return ZONING_MULTIPLIER[district] ?? 5;
}

// ============================================================
// P2-09: classifySeparateTaxationLand — 분리과세 9종 판정
// ============================================================

/**
 * 분리과세 대상 토지 판정 (지방세법 §106②)
 *
 * 9종 subtype 중 해당하는 첫 번째 항목 반환.
 * 판정 우선순위: 고율(4%) → 저율(0.07%) → 일반(0.2%)
 */
export function classifySeparateTaxationLand(
  input: LandInput,
): SeparateTaxationResult {

  // ── 고율 4% ──

  // 회원제 골프장 (§106②3호)
  if (input.isMemberGolf || input.landUse === "golf_course") {
    return {
      isSeparate: true,
      subtype: "golf_course",
      rate: 0.04,
      legalBasis: PROPERTY.SEPARATE_HIGH_RATE,
      reason: "회원제 골프장 토지 — 분리과세 4%",
    };
  }

  // 고급오락장 부속토지 (§106②3호)
  if (input.isLuxuryEntertainment) {
    return {
      isSeparate: true,
      subtype: "luxury_entertainment_site",
      rate: 0.04,
      legalBasis: PROPERTY.SEPARATE_HIGH_RATE,
      reason: "고급오락장·고급별장 부속토지 — 분리과세 4%",
    };
  }

  // ── 저율 0.07% ──

  // 자경농지 (§106②1호): 농업인 + 직접 경작
  if (input.isFarmland && input.isSelfCultivated && input.isFarmer) {
    return {
      isSeparate: true,
      subtype: "farmland_self_cultivated",
      rate: 0.0007,
      legalBasis: PROPERTY.SEPARATE_LOW_RATE,
      reason: "농업인이 직접 경작하는 농지 — 분리과세 0.07%",
    };
  }

  // 목장용지 기준면적 이내 (§106②1호)
  if (input.isCattleFarmland) {
    return {
      isSeparate: true,
      subtype: "cattle_farmland",
      rate: 0.0007,
      legalBasis: PROPERTY.SEPARATE_LOW_RATE,
      reason: "목장용지 (기준면적 이내) — 분리과세 0.07%",
    };
  }

  // 보전산지·임업후계림 (§106②1호)
  if (input.isProtectedForest) {
    return {
      isSeparate: true,
      subtype: "forest_protected",
      rate: 0.0007,
      legalBasis: PROPERTY.SEPARATE_LOW_RATE,
      reason: "보전산지·임업후계림 — 분리과세 0.07%",
    };
  }

  // ── 일반 0.2% ──

  // 공장용지 (산업단지·지정 공업지역, §106②2호)
  if (input.isIndustrialDistrict && input.landUse === "factory") {
    return {
      isSeparate: true,
      subtype: "factory_site_industrial",
      rate: 0.002,
      legalBasis: PROPERTY.SEPARATE_GENERAL_RATE,
      reason: "산업단지·지정 공업지역 공장용지 — 분리과세 0.2%",
    };
  }

  // 관광단지 (§106②2호)
  if (input.isTourismSite) {
    return {
      isSeparate: true,
      subtype: "tourism_site",
      rate: 0.002,
      legalBasis: PROPERTY.SEPARATE_GENERAL_RATE,
      reason: "관광단지 내 토지 — 분리과세 0.2%",
    };
  }

  // 분리과세 비해당
  return {
    isSeparate: false,
    rate: 0,
    legalBasis: "",
    reason: "",
  };
}

// ============================================================
// P2-10: classifySeparateAggregate — 별도합산 기준면적 판정
// ============================================================

/**
 * 별도합산 대상 토지 및 기준면적 계산 (지방세법 §106①2호)
 *
 * 영업용 건축물의 부속토지로서 건축물 바닥면적 × 용도지역 배율 이내
 * 초과 면적은 종합합산으로 전환
 *
 * 별도합산 적용 조건:
 * - 영업용 건축물 부속토지일 것 (buildingFloorArea > 0)
 * - 분리과세 미해당일 것 (classifySeparateTaxationLand 후 호출)
 */
export function classifySeparateAggregate(
  input: LandInput,
): SeparateAggregateResult {
  const floorArea = input.buildingFloorArea ?? 0;

  // 건축물이 없으면 별도합산 불가 → 종합합산
  if (floorArea <= 0) {
    return {
      isSeparateAggregate: false,
      recognizedArea: 0,
      excessArea: input.landArea,
      multiplier: 0,
      legalBasis: PROPERTY.SEPARATE_AGGREGATE,
    };
  }

  const multiplier = getZoningMultiplier(input.zoningDistrict);
  const baseArea = floorArea * multiplier;
  const recognizedArea = Math.min(input.landArea, baseArea);
  const excessArea = Math.max(0, input.landArea - baseArea);

  return {
    isSeparateAggregate: recognizedArea > 0,
    recognizedArea,
    excessArea,
    multiplier,
    legalBasis: PROPERTY.SEPARATE_AGGREGATE,
  };
}

// ============================================================
// P2-11: classifyLand — 4단계 오케스트레이터
// ============================================================

/**
 * 토지 재산세 분류 최종 판정 (지방세법 §106)
 *
 * 판정 순서 (우선순위 엄수):
 *   1. 분리과세 여부 확인
 *   2. 별도합산 여부 확인 (split 포함)
 *   3. 나머지 → 종합합산 (default)
 *
 * ※ 비과세(§109)는 이 함수 호출 전에 property-object.ts에서 먼저 처리
 *
 * @param input LandInput
 * @returns LandClassificationResult
 */
export function classifyLand(input: LandInput): LandClassificationResult {
  const warnings: string[] = [];
  const legalBasis: string[] = [PROPERTY.LAND_CLASSIFICATION];

  // ── 2단계: 분리과세 확인 ──
  const separateResult = classifySeparateTaxationLand(input);
  if (separateResult.isSeparate) {
    legalBasis.push(separateResult.legalBasis);
    return {
      primary: "separate_taxation",
      separateTaxationType: separateResult.subtype,
      separateTaxationRate: separateResult.rate,
      legalBasis,
      warnings,
    };
  }

  // ── 3단계: 별도합산 확인 ──
  const aggregateResult = classifySeparateAggregate(input);
  if (aggregateResult.isSeparateAggregate) {
    legalBasis.push(aggregateResult.legalBasis);

    if (aggregateResult.excessArea > 0) {
      // split: 별도합산(인정분) + 종합합산(초과분)
      warnings.push(
        `토지 면적 ${input.landArea}m² 중 ${aggregateResult.recognizedArea}m²는 별도합산, ` +
        `${aggregateResult.excessArea}m²는 종합합산 과세 대상입니다.`,
      );
      legalBasis.push(PROPERTY.GENERAL_AGGREGATE);
      return {
        primary: "split",
        separateAggregateArea: aggregateResult.recognizedArea,
        generalAggregateArea: aggregateResult.excessArea,
        legalBasis,
        warnings,
      };
    }

    return {
      primary: "separate_aggregate",
      legalBasis,
      warnings,
    };
  }

  // ── 4단계: 종합합산 (default) ──
  legalBasis.push(PROPERTY.GENERAL_AGGREGATE);
  return {
    primary: "general_aggregate",
    legalBasis,
    warnings,
  };
}
