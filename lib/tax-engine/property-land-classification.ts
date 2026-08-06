/**
 * 재산세 토지 3분류 판정 모듈 (P2-09~11)
 *
 * # 🔴 현재 **도달 불가**다 — 배선 전에 아래를 읽을 것 (2026-08-06 실측)
 *
 * 이 모듈을 import하는 프로덕션 파일은 `property-object.ts` 하나뿐인데, 그 진입점
 * `determinePropertyTaxObject`는 **호출처가 0건**이다. 즉 사용자 계산에 도달하지 않는다.
 * API 경로(`app/api/calc/property/route.ts` → `property-tax.ts`)가 실제로 타는 분리과세는
 * **`separate-taxation.ts`**다.
 *
 * 테스트가 초록이라 살아 있어 보이지만 아니다. 도달 불가는
 * `__tests__/lib/property-dead-classifier-reachability.test.ts`가 고정한다 — 누군가 배선하면
 * 그 테스트가 깨지며 아래 두 결함을 이름으로 지목한다.
 *
 * ## 배선하면 물려받는 결함 2건
 *
 * 살아 있는 경로는 2026-08-06에 이 둘을 정정했으나 **여기에는 그대로 남아 있다**:
 *
 * 1. **면적 한도 없음** — 「지방세법 시행령」 §102①1호는 분리과세 공장용지를
 *    "공장입지기준면적 **범위의** 토지"로 한정한다(시행규칙 §50 [별표6]). 그런데
 *    `classifySeparateTaxationLand`는 `isIndustrialDistrict`·`isCattleFarmland` 플래그만 보고
 *    **한도 없이 전량** 분리과세한다. 초과분은 종합합산 누진(0.2~0.5%) 대상이라
 *    **납세자에게 유리한 방향**의 오류가 된다. 목장용지(§102①3호 가축별 기준면적 표)도 같다.
 * 2. **소재지 배타 분기 미적용** — §102①1호는 §101①1호 **각 목**(가.읍·면지역 나.산업단지
 *    다.공업지역)으로 한정하고, §101①1호 **본문**은 그 밖의 시지역 공장용지를
 *    **별도합산**(바닥면적 × §101② 배율)으로 정한다. 두 조문은 배타 분기인데 여기서는
 *    `isIndustrialDistrict` 하나로 뭉뚱그린다.
 *
 * ⇒ 정정 참조: `separate-taxation.ts`의 `classifyStandard`·`judgeFactoryAreaLimit`,
 *   설계: `docs/02-design/features/property-separate-taxation-factory-limit.plan.md`
 *
 * ---
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
import { getZoneAreaMultiplier } from "./local-tax-zone-multiplier";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
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
// 용도지역별 별도합산 배율 — 「지방세법 시행령」 제101조 제2항 [표]
// 정본은 `local-tax-zone-multiplier.ts`. 여기서 재선언 금지.
// (종전 사본은 관리지역을 5배로 두어 법정 7배와 어긋났다.)
// ============================================================

/** §101② 표에서 적용배율을 조회한다. 미등재 용도지역은 추정하지 않고 차단한다. */
function getZoningMultiplier(district: ZoningDistrictType): number {
  const resolved = getZoneAreaMultiplier(district);
  if (!resolved) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `별도합산 기준면적 산정: 용도지역 "${district}"은 「지방세법 시행령」 제101조 제2항 ` +
        `적용배율표에 대응 항목이 없습니다. 세분된 용도지역(전용주거·일반주거·준주거 등)을 선택하세요.`,
    );
  }
  return resolved.multiplier;
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
  // 🔴 「기준면적 이내」는 **사용자 선언**이지 계산이 아니다. §102①3호는 가축별 기준면적 표
  //    (한우 7.5㎡/마리 등 9종 × 축사·부대시설·초지·사료밭)로 한도를 정한다 — 미구현.
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
  // 🔴 배선 전 확인 — 모듈 헤더의 「결함 2건」. 여기에는 §102①1호 **면적 한도**가 없고
  //    §101①1호(별도합산)와의 **소재지 배타 분기**도 없다. 살아 있는 경로는
  //    `separate-taxation.ts` `judgeFactoryAreaLimit`가 둘 다 처리한다.
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
