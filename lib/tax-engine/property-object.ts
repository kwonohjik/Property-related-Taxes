/**
 * 재산세 과세대상 판정 통합 진입점 (P2-21~23)
 *
 * 지방세법 §105 (과세대상 5종 열거주의)
 * 지방세법 §106 (토지 3분류)
 * 지방세법 §107 (납세의무자)
 * 지방세법 §109 (비과세)
 *
 * 기능:
 * - isPropertyTaxObject(): 재산세 과세대상 여부 (5종 열거주의)
 * - classifyBuilding(): 건축물 4종 분류 (일반·골프·고급·공장)
 * - determinePropertyTaxObject(): 5단계 통합 판정 진입점
 *
 * 판정 순서 (우선순위 엄수):
 *   1단계: 과세대상 여부 (§105 열거주의)
 *   2단계: 납세의무자 확정 (§107)
 *   3단계: 비과세·감면 확인 (§109)
 *   4단계: 물건 유형별 세부 판정 (토지 3분류 / 주택 범위 / 건축물 분류)
 *   5단계: 최종 공시가격 조정 (겸용주택·부속토지 초과 분리)
 */

import { PROPERTY } from "./legal-codes";
import {
  checkPropertyTaxExemption,
  checkPropertyTaxReduction,
} from "./property-exemption";
import { classifyLand } from "./property-land-classification";
import { calculateHouseScope } from "./property-house-scope";
import { determineTaxpayer } from "./property-taxpayer";
import type {
  PropertyObjectInput,
  PropertyObjectResult,
  PropertyTaxObjectType,
} from "./types/property-object.types";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";

// ============================================================
// P2-21: isPropertyTaxObject — 과세대상 5종 열거주의 확인
// ============================================================

/**
 * 재산세 과세대상 5종 여부 확인 (지방세법 §105)
 *
 * 취득세·등록세와 달리 재산세는 열거주의 적용:
 * 토지, 건축물, 주택, 선박, 항공기만 과세.
 * 차량·기계장비·광업권·어업권·회원권·입목 등은 재산세 비과세.
 *
 * @param objectType 물건 유형
 * @returns 과세대상 여부
 */
export function isPropertyTaxObject(objectType: PropertyTaxObjectType): boolean {
  const TAXABLE_TYPES: PropertyTaxObjectType[] = [
    "land",
    "building",
    "house",
    "vessel",
    "aircraft",
  ];
  return TAXABLE_TYPES.includes(objectType);
}

// ============================================================
// P2-22: classifyBuilding — 건축물 4종 분류
// ============================================================

/**
 * 건축물 유형 분류 (지방세법 §111①1호)
 *
 * - golf_course: 골프장 (§111①1호 가목) — 4%
 * - luxury: 고급오락장·고급별장 (§111①1호 나목) — 4%
 * - factory: 공장 (§111①1호 다목) — 0.5%
 * - general: 그 외 일반 건축물 (§111①1호 라목) — 0.25%
 *
 * 주택은 별도 세율 체계(§111①2호)를 따르므로 이 함수 대상 아님.
 */
export function classifyBuilding(
  buildingType: "general" | "golf_course" | "luxury" | "factory" | undefined,
): "general" | "golf_course" | "luxury" | "factory" {
  return buildingType ?? "general";
}

// ============================================================
// P2-23: determinePropertyTaxObject — 통합 판정 진입점
// ============================================================

/**
 * 재산세 과세대상 통합 판정 (5단계)
 *
 * @param input PropertyObjectInput
 * @returns PropertyObjectResult
 */
export function determinePropertyTaxObject(
  input: PropertyObjectInput,
): PropertyObjectResult {
  const warnings: string[] = [];
  const legalBasis: string[] = [PROPERTY.TAXABLE_OBJECT_LIST];

  // ── 1단계: 과세대상 여부 ──
  if (!isPropertyTaxObject(input.objectType)) {
    return {
      isSubjectToTax: false,
      objectType: input.objectType,
      taxpayer: {
        type: "registered_owner",
        name: input.registeredOwner,
        legalBasis: PROPERTY.TAXPAYER_PRINCIPLE,
      },
      adjustedPublicPrice: 0,
      assessmentDate: input.assessmentDate ?? getAssessmentDate(),
      warnings: [`${input.objectType}는 재산세 과세대상(§105 열거주의)에 해당하지 않습니다.`],
      legalBasis,
    };
  }

  // ── 2단계: 납세의무자 확정 ──
  const taxpayerResult = determineTaxpayer({
    registeredOwner: input.registeredOwner,
    actualOwner: input.actualOwner,
    ownerType: input.ownerType,
    isTrust: input.isTrust,
    trustType: input.trustType,
    isInheritanceUnregistered: input.isInheritanceUnregistered,
    heirs: input.heirs,
    coOwnershipShares: input.coOwnershipShares,
  });
  warnings.push(...taxpayerResult.warnings);
  legalBasis.push(taxpayerResult.legalBasis);

  // ── 3단계: 비과세·감면 확인 ──
  const exemptionResult = checkPropertyTaxExemption({
    ownerType: input.ownerType,
    landUse: input.landInfo?.landUse,
    isTemporaryBuilding: false,
    isReligiousNonprofitUse: false,
  });

  let reductionRate = 0;
  let reductionType: string | undefined;

  if (!exemptionResult.isExempt) {
    const reductionResult = checkPropertyTaxReduction({
      ownerType: input.ownerType,
      objectType:
        input.objectType === "house" ? "house"
        : input.objectType === "building" ? "building"
        : "land",
    });
    if (reductionResult.hasReduction) {
      reductionRate = reductionResult.reductionRate;
      reductionType = reductionResult.reductionType;
      legalBasis.push(reductionResult.legalBasis);
    }
  }

  if (exemptionResult.isExempt) {
    legalBasis.push(exemptionResult.legalBasis);
    return {
      isSubjectToTax: false,
      objectType: input.objectType,
      taxpayer: {
        type: taxpayerResult.type,
        name: taxpayerResult.name,
        legalBasis: taxpayerResult.legalBasis,
      },
      exemption: {
        isExempt: true,
        exemptionType: exemptionResult.exemptionType,
        reason: exemptionResult.reason,
      },
      adjustedPublicPrice: 0,
      assessmentDate: input.assessmentDate ?? getAssessmentDate(),
      warnings,
      legalBasis: [...new Set(legalBasis)],
    };
  }

  const assessmentDate = input.assessmentDate ?? getAssessmentDate();

  // ── 4단계: 물건 유형별 세부 판정 ──

  // 토지 3분류
  if (input.objectType === "land") {
    if (!input.landInfo) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "토지 과세 판정에는 landInfo가 필요합니다.",
      );
    }
    const landResult = classifyLand(input.landInfo);
    warnings.push(...landResult.warnings);
    legalBasis.push(...landResult.legalBasis);

    return {
      isSubjectToTax: true,
      objectType: "land",
      taxpayer: {
        type: taxpayerResult.type,
        name: taxpayerResult.name,
        legalBasis: taxpayerResult.legalBasis,
      },
      exemption: {
        isExempt: false,
        reductionRate,
        reason: reductionType ? `감면 유형: ${reductionType}` : "감면 없음",
      },
      landClassification: {
        primary: landResult.primary,
        separateTaxationType: landResult.separateTaxationType,
        separateTaxationRate: landResult.separateTaxationRate,
        separateAggregateArea: landResult.separateAggregateArea,
        generalAggregateArea: landResult.generalAggregateArea,
      },
      adjustedPublicPrice: input.publicPrice,
      assessmentDate,
      warnings,
      legalBasis: [...new Set(legalBasis)],
    };
  }

  // 주택 범위 판정
  if (input.objectType === "house") {
    if (!input.houseInfo) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "주택 과세 판정에는 houseInfo가 필요합니다.",
      );
    }
    const houseResult = calculateHouseScope(input.houseInfo);
    warnings.push(...houseResult.warnings);
    legalBasis.push(...houseResult.legalBasis);

    if (!houseResult.isHouse) {
      // 겸용·오피스텔 처리로 주택 아님 → 건축물로 재분류
      return {
        isSubjectToTax: true,
        objectType: "building",
        taxpayer: {
          type: taxpayerResult.type,
          name: taxpayerResult.name,
          legalBasis: taxpayerResult.legalBasis,
        },
        exemption: { isExempt: false, reductionRate, reason: "감면 없음" },
        buildingClassification: "general",
        adjustedPublicPrice: input.publicPrice,
        assessmentDate,
        warnings,
        legalBasis: [...new Set(legalBasis)],
      };
    }

    // 겸용주택 면적 비례로 공시가격 조정
    const adjustedPublicPrice = Math.floor(
      input.publicPrice * houseResult.housePortion,
    );

    return {
      isSubjectToTax: true,
      objectType: "house",
      taxpayer: {
        type: taxpayerResult.type,
        name: taxpayerResult.name,
        legalBasis: taxpayerResult.legalBasis,
      },
      exemption: { isExempt: false, reductionRate, reason: "감면 없음" },
      houseScope: {
        totalHouseValue: houseResult.totalHouseValue ?? adjustedPublicPrice,
        excessLandArea: houseResult.excessLandArea,
        excessLandValue: 0, // 별도 토지 공시가격 입력 없을 시 0
        mixedUseClassification: houseResult.mixedUseClassification,
      },
      adjustedPublicPrice,
      assessmentDate,
      warnings,
      legalBasis: [...new Set(legalBasis)],
    };
  }

  // 건축물 분류
  if (input.objectType === "building") {
    const buildingClassification = classifyBuilding(
      input.buildingInfo?.buildingType,
    );
    legalBasis.push(PROPERTY.TAX_RATE);

    return {
      isSubjectToTax: true,
      objectType: "building",
      taxpayer: {
        type: taxpayerResult.type,
        name: taxpayerResult.name,
        legalBasis: taxpayerResult.legalBasis,
      },
      exemption: { isExempt: false, reductionRate, reason: "감면 없음" },
      buildingClassification,
      adjustedPublicPrice: input.publicPrice,
      assessmentDate,
      warnings,
      legalBasis: [...new Set(legalBasis)],
    };
  }

  // 선박·항공기 (세율 0.3%, 별도 세부 분류 없음)
  return {
    isSubjectToTax: true,
    objectType: input.objectType,
    taxpayer: {
      type: taxpayerResult.type,
      name: taxpayerResult.name,
      legalBasis: taxpayerResult.legalBasis,
    },
    exemption: { isExempt: false, reductionRate, reason: "감면 없음" },
    adjustedPublicPrice: input.publicPrice,
    assessmentDate,
    warnings,
    legalBasis: [...new Set(legalBasis)],
  };
}

// ============================================================
// 내부 유틸
// ============================================================

/**
 * 과세기준일 산출 (해당 연도 6월 1일)
 */
function getAssessmentDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 5, 1); // month index 5 = June
}
