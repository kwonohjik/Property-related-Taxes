/**
 * 취득세 중과세 판정 통합 오케스트레이터 (Phase 1 리팩터)
 *
 * [P1-7] acquisition-surcharge/ 모듈 분할 후 통합 진입점
 *
 * 판단 순서 (8단계 흐름):
 * 1. [P1-0] 입력 일관성 검증
 * 2. [P1-6.5] §13의2④ 지정 전 계약 보호 → isRegulatedArea 재정의
 * 3. [P1-6] 부담부증여 배우자/직계존비속 → 전체 무상 처리
 * 4. [P1-4] 시가표준액 저가 주택 중과 배제 (수도권 1억 / 비수도권 2억)
 * 5. [P1-1/§13⑦] 사치성 재산 중과 (단독/다주택중복/대도시법인중복)
 * 6. [P1-3] 무상취득(증여) 중과 (§13의2② 3분기 흐름)
 * 7. [P1-5] 일시적 2주택 배제
 * 8. [P1-2] 다주택 중과 (§13의2① — 법인/조정/비조정 × 주택 수)
 * 9. 생애최초 감면 (중과 미적용 시에만)
 *
 * 지방세법 §13⑤·§13의2·시행령 §28의2~§28의6
 */

import { ACQUISITION, ACQUISITION_CONST } from "../legal-codes";
import type { SurchargeDecision } from "../types/acquisition.types";

import {
  validateInputConsistency,
  isExemptFromSurcharge_LowValue,
  resolveRegulatedAreaStatus,
} from "./exclusion";
import {
  assessMultiHouseSurcharge,
  assessGiftSurcharge,
  assessTemporaryTwoHouse,
  SURCHARGE_RATES,
} from "./multi-house";
import {
  calcLuxurySurchargeRate,
  isVillaLuxurySurchargeApplicable,
  type LuxuryPropertyType,
} from "./luxury";
import {
  isBurdenedGiftExcluded,
  resolveEffectiveCause,
  getBurdenedGiftExclusionMessage,
  assessCorpHouseSurcharge,
} from "./corp-house";

// ============================================================
// 통합 입력 타입 (SurchargeCheckInput 확장)
// ============================================================

export interface SurchargeCheckInput {
  // ── 기본 물건/취득자 정보 ──
  propertyType: string;
  acquisitionCause: string;
  acquisitionValue: number;
  acquiredBy: string;

  // ── 주택 중과 기본 입력 ──
  /** 취득 후 주택 수 (취득 대상 포함) */
  houseCountAfter?: number;
  /** 잔금일 기준 조정대상지역 여부 (§13의2④ 보호 전 원래 값) */
  isRegulatedArea?: boolean;
  /** 사치성 재산 여부 */
  isLuxuryProperty?: boolean;
  /** 사치성 재산 유형 (별장 폐지 판단 포함) */
  luxuryType?: LuxuryPropertyType;
  /** 기본세율 (사치성·§13⑦ 계산용) */
  basicRate?: number;

  // ── [P1-0] 입력 일관성 검증 ──
  /** 잔금일 (별장 폐지 판단용) */
  balanceDate?: string;

  // ── [P1-3/v4 M4] 무상취득 단서 ──
  /** 증여자 관계 (수증자 관점) — 단서 배제 여부 판단 */
  giftorRelation?:
    | "spouse"
    | "lineal_ascendant"
    | "lineal_ascendant_spouse"
    | "lineal_descendant"
    | "lineal_descendant_step"
    | "other";
  /** 증여자가 무상취득 직전 1세대 1주택자인지 */
  giftorIs1HHHolder?: boolean;
  /** 세율특례 사유 (divorce_division 시 단서 배제) */
  specialRateType?: string;

  // ── [P1-4] 시가표준액 저가 배제 ──
  /** 전체 주택 시가표준액 (지분/부속토지 취득 시 전체 주택 기준) */
  wholeHouseStandardValue?: number;
  /** 수도권 여부 (1억/2억 한도 결정) */
  isMetropolitanRegion?: boolean;
  /** 정비구역(재개발·재건축·소규모정비) 소재 여부 */
  isUrbanRegenerationArea?: boolean;

  // ── [P1-5] 일시적 2주택 ──
  /** 일시적 2주택 (종전 주택 처분 예정) */
  isTemporaryTwoHouse?: boolean;
  /** 종전 주택 소재 지역 */
  previousHouseRegion?: "regulated" | "non_regulated";
  /** 신규 주택 소재 지역 */
  newHouseRegion?: "regulated" | "non_regulated";

  // ── [P1-6] 부담부증여 관계 ──
  /** 부담부증여 시 증여자 관계 (배우자·직계존비속 간 → 전체 무상 처리) */
  giftRelation?: "spouse_or_lineal" | "other";

  // ── [P1-6.5] §13의2④ 지정 전 계약 보호 ──
  /** 계약일이 조정지역 지정고시일 이전인지 */
  contractDateBeforeRegulation?: boolean;
  /** 계약금 지급 증빙 보유 여부 */
  hasContractDepositProof?: boolean;

  // ── [§13⑦] 사치성 + 대도시 법인 중복 ──
  /** 대도시 법인 중과(§13②) 적용 여부 */
  isCorpMetroSurcharge?: boolean;

  // ── 생애최초 감면 ──
  isFirstHome?: boolean;
  isMetropolitan?: boolean;
  acquisitionTax?: number;
}

// ============================================================
// 확장된 SurchargeDecision 타입
// ============================================================

export interface ExtendedSurchargeDecision extends SurchargeDecision {
  /** 적용된 분기 식별자 */
  appliedBranch?: "luxury_solo" | "luxury_multi" | "luxury_corp" | "corp_housing" | "multi_house_8" | "multi_house_12" | "gift_12" | "basic" | "villa_abolished";
  /** 일시적 2주택 처분기한 (YYYY-MM-DD) */
  temporaryTwoHouseDeadlineDate?: string;
  /** 일시적 2주택 처분기한 연수 */
  temporaryTwoHouseDeadlineYears?: number;
  /** §13의2④ 지정 전 계약 보호 적용 여부 */
  preRegulationContractApplied?: boolean;
  /** 무상취득 단서 배제 사유 */
  giftExclusionReason?: string;
}

// ============================================================
// 메인 assessSurcharge 함수 (Phase 1 리팩터)
// ============================================================

/**
 * 취득세 중과세 종합 판정 — Phase 1 리팩터
 *
 * 이전 getSurchargeRateForLuxury(basicRate × 5) 공식 폐지 → calcLuxurySurchargeRate로 교체.
 *
 * 중과 판단 순서:
 * 1. 입력 일관성 검증 (P1-0)
 * 2. §13의2④ 지정 전 계약 보호 → isRegulatedArea 재정의 (P1-6.5)
 * 3. 부담부증여 배우자/직계존비속 → 취득 원인 재정의 (P1-6)
 * 4. 시가표준액 저가 배제 (P1-4)
 * 5. 사치성 중과 (P1-1) — 별장 폐지 포함, §13⑦ 포함
 * 6. 증여 중과 (P1-3) — 3분기 흐름
 * 7. 일시적 2주택 배제 (P1-5)
 * 8. 다주택 중과 (P1-2) — §13의2①
 * 9. 생애최초 감면
 */
export function assessSurcharge(input: SurchargeCheckInput): ExtendedSurchargeDecision {
  const warnings: string[] = [];
  const exceptions: string[] = [];

  const isHousing = input.propertyType === "housing";

  // ── 1단계: 입력 일관성 검증 (P1-0) ──
  const validation = validateInputConsistency({
    acquiredBy: input.acquiredBy,
    giftRelation: input.giftRelation,
    isFirstHome: input.isFirstHome,
    acquisitionCause: input.acquisitionCause,
    encumbrance: undefined, // SurchargeCheckInput은 encumbrance 없음 (base에서 검증)
    isLuxuryProperty: input.isLuxuryProperty,
    luxuryType: input.luxuryType,
    balancePaymentDate: input.balanceDate,
  });

  if (!validation.isValid) {
    warnings.push(...validation.errors.map(e => `[입력 오류] ${e}`));
  }
  warnings.push(...validation.warnings);

  // ── 2단계: §13의2④ 지정 전 계약 보호 → isRegulatedArea 재정의 (P1-6.5) ──
  const effectiveIsRegulatedArea = resolveRegulatedAreaStatus(
    input.isRegulatedArea,
    {
      contractDateBeforeRegulation: input.contractDateBeforeRegulation,
      hasContractDepositProof: input.hasContractDepositProof,
    }
  );
  const preRegulationContractApplied =
    input.isRegulatedArea === true && effectiveIsRegulatedArea === false;

  if (preRegulationContractApplied) {
    exceptions.push(
      `조정대상지역 지정고시일 이전 계약 + 계약금 증빙 확인 → 비조정지역 취득으로 간주 (${ACQUISITION.PRE_REGULATION_CONTRACT})`
    );
  }

  // ── 3단계: 부담부증여 배우자/직계존비속 → 취득 원인 재정의 (P1-6) ──
  let effectiveCause = input.acquisitionCause;
  if (input.acquisitionCause === "burdened_gift") {
    const excluded = isBurdenedGiftExcluded(input.giftRelation);
    if (excluded) {
      effectiveCause = "gift"; // 전체 무상 처리
      exceptions.push(getBurdenedGiftExclusionMessage());
    }
  }

  // ── 4단계: 시가표준액 저가 주택 중과 배제 (P1-4) ──
  if (isHousing) {
    const stdValue = input.wholeHouseStandardValue ?? 0;
    // 저가 배제는 wholeHouseStandardValue가 입력된 경우에만 적용
    if (stdValue > 0) {
      const isMetro = input.isMetropolitanRegion ?? true;
      const isUrbanRegen = input.isUrbanRegenerationArea ?? false;
      if (isExemptFromSurcharge_LowValue(stdValue, isMetro, isUrbanRegen)) {
        const limit = isMetro ? "1억원" : "2억원";
        exceptions.push(
          `시가표준액 ${stdValue.toLocaleString()}원이 ${limit} 이하 — 중과 배제 (${ACQUISITION.SURCHARGE_EXCLUSION} 1호)`
        );
        // 생애최초 감면 처리 후 배제 결과 반환
        const firstHomeReduction = calcFirstHomeReduction(input, undefined);
        return {
          isSurcharged: false,
          appliedBranch: "basic",
          exceptions,
          warnings,
          firstHomeReduction,
          legalBasis: [ACQUISITION.SURCHARGE_EXCLUSION],
        };
      }
    }
  }

  // ── 5단계: 사치성 재산 중과 (P1-1, §13⑦) ──
  if (input.isLuxuryProperty) {
    // 별장 중과 폐지 시점 확인
    if (input.luxuryType === "villa" && !isVillaLuxurySurchargeApplicable(input.balanceDate)) {
      exceptions.push("별장 중과세율은 2023년 3월 14일 이후 폐지되었습니다 (지방세법 §13⑤ 개정). 기본세율 적용.");
      const firstHomeReduction = calcFirstHomeReduction(input, undefined);
      return {
        isSurcharged: false,
        appliedBranch: "villa_abolished",
        exceptions,
        warnings,
        firstHomeReduction,
        legalBasis: [ACQUISITION.LUXURY_SURCHARGE],
      };
    }

    // 사치성 + 다주택 중복 여부: 고급주택이면서 다주택 중과에도 해당 시
    let multiHouseRateForLuxury: number | undefined;
    if (isHousing && input.isLuxuryProperty) {
      const multiResult = assessMultiHouseSurcharge({
        acquiredBy: input.acquiredBy,
        isHousing,
        isRegulatedArea: effectiveIsRegulatedArea,
        houseCount: input.houseCountAfter ?? 1,
        isOnerousAcquisition: isOnerousForMultiHouseCheck(effectiveCause),
      });
      if (multiResult.isSurcharged) {
        multiHouseRateForLuxury = multiResult.surchargeRate;
      }
    }

    const luxuryResult = calcLuxurySurchargeRate({
      basicRate: input.basicRate ?? ACQUISITION_CONST.LUXURY_BASE_RATE,
      multiHouseRate: multiHouseRateForLuxury,
      isCorpMetroSurcharge: input.isCorpMetroSurcharge,
      isHousing,
      luxuryType: input.luxuryType,
      balanceDate: input.balanceDate,
    });

    const branch = luxuryResult.appliedBranch === "luxury_multi"
      ? "luxury_multi"
      : luxuryResult.appliedBranch === "luxury_corp"
      ? "luxury_corp"
      : "luxury_solo";

    warnings.push(luxuryResult.reason);

    return {
      isSurcharged: luxuryResult.isSurcharged,
      surchargeRate: luxuryResult.surchargeRate,
      surchargeReason: luxuryResult.reason,
      appliedBranch: branch as ExtendedSurchargeDecision["appliedBranch"],
      preRegulationContractApplied,
      exceptions,
      warnings,
      legalBasis: luxuryResult.legalBasis,
    };
  }

  // ── 6단계: 무상취득(증여) 중과 (P1-3 — §13의2②) ──
  // 증여 원인: gift 또는 부담부증여가 gift로 재정의된 경우
  if (isHousing && (effectiveCause === "gift" || effectiveCause === "donation")) {
    const stdValue = input.wholeHouseStandardValue
      ?? (input as { standardValue?: number }).standardValue
      ?? 0;

    const giftResult = assessGiftSurcharge({
      isHousing,
      isRegulatedArea: effectiveIsRegulatedArea,
      wholeStdValue: stdValue,
      giftorIs1HHHolder: input.giftorIs1HHHolder,
      giftorRelation: input.giftorRelation,
      specialRateType: input.specialRateType,
    });

    if (giftResult.exclusionReason) {
      exceptions.push(giftResult.exclusionReason);
    }

    if (giftResult.isSurcharged) {
      warnings.push(giftResult.reason);
    } else {
      exceptions.push(giftResult.reason);
    }

    const firstHomeReduction = giftResult.isSurcharged
      ? calcFirstHomeReduction(input, giftResult.surchargeRate)
      : calcFirstHomeReduction(input, undefined);

    return {
      isSurcharged: giftResult.isSurcharged,
      surchargeRate: giftResult.surchargeRate,
      surchargeReason: giftResult.isSurcharged ? giftResult.reason : undefined,
      appliedBranch: giftResult.appliedBranch as ExtendedSurchargeDecision["appliedBranch"],
      giftExclusionReason: giftResult.exclusionReason,
      preRegulationContractApplied,
      firstHomeReduction,
      exceptions,
      warnings,
      legalBasis: giftResult.legalBasis,
    };
  }

  // ── 7단계: 일시적 2주택 배제 (P1-5) ──
  const tempTwoHouseResult = assessTemporaryTwoHouse({
    houseCount: input.houseCountAfter ?? 1,
    isTemporaryTwoHouse: input.isTemporaryTwoHouse,
    balanceDate: input.balanceDate,
    previousHouseRegion: input.previousHouseRegion,
    newHouseRegion: input.newHouseRegion,
  });

  if (tempTwoHouseResult.isExcluded) {
    exceptions.push(`일시적 2주택 — 중과 배제 (${ACQUISITION.TEMP_2HOUSE_EXCLUSION})`);
    if (tempTwoHouseResult.warning) warnings.push(tempTwoHouseResult.warning);

    const firstHomeReduction = calcFirstHomeReduction(input, undefined);
    return {
      isSurcharged: false,
      appliedBranch: "basic",
      temporaryTwoHouseDeadlineDate: tempTwoHouseResult.disposalDeadlineDate,
      temporaryTwoHouseDeadlineYears: tempTwoHouseResult.disposalDeadlineYears,
      preRegulationContractApplied,
      firstHomeReduction,
      exceptions,
      warnings,
      legalBasis: [ACQUISITION.TEMP_2HOUSE_EXCLUSION],
    };
  }

  // ── 8단계: 다주택 중과 (P1-2 — §13의2①) ──
  const isOnerousForMulti = isOnerousForMultiHouseCheck(effectiveCause);

  if (isHousing) {
    const multiResult = assessMultiHouseSurcharge({
      acquiredBy: input.acquiredBy,
      isHousing,
      isRegulatedArea: effectiveIsRegulatedArea,
      houseCount: input.houseCountAfter ?? 1,
      isOnerousAcquisition: isOnerousForMulti,
    });

    if (multiResult.isSurcharged) {
      warnings.push(multiResult.reason);
      const firstHomeReduction = calcFirstHomeReduction(input, multiResult.surchargeRate);
      return {
        isSurcharged: true,
        surchargeRate: multiResult.surchargeRate,
        surchargeReason: multiResult.reason,
        appliedBranch: multiResult.appliedBranch as ExtendedSurchargeDecision["appliedBranch"],
        preRegulationContractApplied,
        firstHomeReduction,
        exceptions,
        warnings,
        legalBasis: multiResult.legalBasis,
      };
    }

    // 다주택 중과 미해당 — exceptions에 사유 추가
    exceptions.push(multiResult.reason);
  } else {
    exceptions.push("비주택 취득 — 다주택 중과 §13의2① 미적용");
  }

  // ── 9단계: 생애최초 감면 (중과 미적용 시) ──
  const firstHomeReduction = isHousing ? calcFirstHomeReduction(input, undefined) : undefined;

  return {
    isSurcharged: false,
    appliedBranch: "basic",
    preRegulationContractApplied,
    firstHomeReduction: firstHomeReduction ?? undefined,
    exceptions,
    warnings,
    legalBasis: [ACQUISITION.SURCHARGE],
  };
}

// ============================================================
// 중과 배제 확인 유틸 (기존 호환성 유지)
// ============================================================

/**
 * 공시가격 저가 주택 중과 배제 여부 (기존 API 호환 — 단일 인자)
 *
 * @deprecated 신규 코드에서는 isExemptFromSurcharge_LowValue(value, isMetro, isUrbanRegen) 사용 권장
 */
export function isExemptFromSurcharge_LowValueLegacy(
  standardValue: number,
  isInUrbanRegenerationArea = false
): boolean {
  // 구 API: 1억 기준, 정비구역 배제 옵션만
  const THRESHOLD = 100_000_000;
  if (isInUrbanRegenerationArea) return false;
  return standardValue <= THRESHOLD;
}

/**
 * 최종 적용 세율 결정
 */
export function resolveFinalRate(
  basicRate: number,
  surchargeDecision: { isSurcharged: boolean; surchargeRate?: number }
): number {
  if (surchargeDecision.isSurcharged && surchargeDecision.surchargeRate !== undefined) {
    return surchargeDecision.surchargeRate;
  }
  return basicRate;
}

// ============================================================
// 내부 헬퍼
// ============================================================

/** 다주택 중과 대상 유상취득 원인 여부 */
function isOnerousForMultiHouseCheck(cause: string): boolean {
  return ["purchase", "exchange", "auction", "in_kind_investment"].includes(cause);
}

/**
 * 생애최초 주택 감면 계산 (지방세특례제한법 §36의3)
 */
function calcFirstHomeReduction(
  input: Pick<SurchargeCheckInput,
    "isFirstHome" | "propertyType" | "acquisitionCause" | "acquisitionValue" | "acquisitionTax"
  >,
  surchargeRate: number | undefined
): ExtendedSurchargeDecision["firstHomeReduction"] {
  if (!input.isFirstHome) return undefined;

  const isOnerousHousing =
    input.propertyType === "housing" &&
    ["purchase", "auction", "exchange"].includes(input.acquisitionCause);

  if (!isOnerousHousing) return undefined;

  const priceLimit = ACQUISITION_CONST.FIRST_HOME_PRICE_LIMIT; // 12억

  if (input.acquisitionValue > priceLimit) {
    return {
      isEligible: false,
      reductionAmount: 0,
      maxReductionAmount: ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION,
      warnings: [
        `생애최초 감면 불가 — 취득가액(${input.acquisitionValue.toLocaleString()}이 한도(${priceLimit.toLocaleString()} 초과`,
      ],
    };
  }

  // 중과세가 적용되면 감면 불가
  if (surchargeRate && surchargeRate > 0.03) {
    return {
      isEligible: false,
      reductionAmount: 0,
      maxReductionAmount: ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION,
      warnings: [
        `생애최초 감면 불가 — 중과세율(${(surchargeRate * 100).toFixed(1)}%) 적용 대상 (${ACQUISITION.FIRST_HOME_REDUCTION} 제외 사유)`,
      ],
    };
  }

  const acquisitionTax = input.acquisitionTax ?? 0;
  const reductionAmount = Math.min(acquisitionTax, ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION);

  return {
    isEligible: true,
    reductionAmount,
    maxReductionAmount: ACQUISITION_CONST.FIRST_HOME_MAX_REDUCTION,
    warnings: [
      `생애최초 주택 취득 감면 적용 — 취득일로부터 3개월 내 전입신고 의무 (${ACQUISITION.FIRST_HOME_REDUCTION}②).`,
      "취득일로부터 3년 내 처분·임대·주거 외 사용 시 감면세액이 추징됩니다.",
    ],
  };
}
