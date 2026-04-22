/**
 * 다주택 중과세 전담 순수 엔진 (Layer 2) — 메인 오케스트레이터
 *
 * DB 직접 호출 없음. 모든 규칙 데이터는 매개변수로 주입.
 *
 * 법적 근거:
 *   소득세법 §104 (세율), §152 (1세대 범위),
 *   소령 §167-3 (주택 수 산정), §167-3 ① 2호 (3주택+ 중과 배제 14가지),
 *   §167-10 (2주택 중과 배제 10가지),
 *   §155 ⑤ (혼인합가), §155 ⑦ (동거봉양), §167-11 (분양권 포함)
 *
 * 내부 헬퍼는 ./multi-house-surcharge-helpers.ts 로 분리.
 * 인구감소지역 상수는 ./data/population-decline-areas.ts 로 분리.
 */

import type { SurchargeSpecialRulesData } from "./schemas/rate-table.schema";
import { MULTI_HOUSE } from "./legal-codes";

// ============================================================
// 타입 정의 — 공개 타입은 ./types/multi-house-surcharge.types 로 분리
// ============================================================

import type {
  RentalHousingType,
  HouseInfo,
  PresaleRight,
  MultiHouseSurchargeInput,
  ExcludedHouse,
  ExclusionReason,
  MultiHouseSurchargeResult,
  HouseCountExclusionRules,
  RegulatedAreaDesignation,
  RegulatedAreaInfo,
  RegulatedAreaHistory,
  TaxSimulationInput,
  TaxScenario,
  MultiHouseTaxSimulation,
} from "./types/multi-house-surcharge.types";

// 하위 호환: "./multi-house-surcharge"에서 직접 타입을 import하던 기존 소비자들을 위해 재수출
export type {
  RentalHousingType,
  HouseInfo,
  PresaleRight,
  MultiHouseSurchargeInput,
  ExcludedHouse,
  ExclusionReason,
  MultiHouseSurchargeResult,
  HouseCountExclusionRules,
  RegulatedAreaDesignation,
  RegulatedAreaInfo,
  RegulatedAreaHistory,
  TaxSimulationInput,
  TaxScenario,
  MultiHouseTaxSimulation,
};

// ============================================================
// 헬퍼·상수 re-export (하위 호환)
// ============================================================

export {
  classifyRegionCriteriaByCode,
  isLongTermRentalHousingExempt,
  getRentalTypeLabel,
  isSmallNewHouseSpecial,
  isTaxIncentiveRentalHousingExempt,
  countEffectiveHouses,
  isGroupExcludable,
  getGroupExcludeReason,
  determineSurchargeExclusion,
} from "./multi-house-surcharge-helpers";

export {
  POPULATION_DECLINE_AREA_CODES,
  POPULATION_INTEREST_AREA_CODES,
  classifyPopulationDeclineArea,
} from "./data/population-decline-areas";

// ============================================================
// Step 1: 조정대상지역 시점 판단
// ============================================================

export function isRegulatedAreaAtDate(
  regionCode: string,
  referenceDate: Date,
  history: RegulatedAreaHistory,
): boolean {
  const region = history.regions.find((r) => r.code === regionCode);
  if (!region) return false;

  for (const designation of region.designations) {
    const designated = new Date(designation.designatedDate);
    const released = designation.releasedDate ? new Date(designation.releasedDate) : null;

    if (referenceDate >= designated && (!released || referenceDate <= released)) {
      return true;
    }
  }
  return false;
}

// ============================================================
// 메인 함수: determineMultiHouseSurcharge
// ============================================================

import {
  countEffectiveHouses,
  isGroupExcludable,
  getGroupExcludeReason,
  determineSurchargeExclusion,
} from "./multi-house-surcharge-helpers";

/**
 * 다주택 중과세 판정 메인 함수.
 *
 * @param input              세대 보유 주택 정보 + 양도 정보
 * @param houseCountRules    주택 수 산정 배제 규칙 (DB: transfer:special:house_count_exclusion)
 * @param regulatedAreaHistory  조정대상지역 이력, null 허용
 * @param suspensionRules    중과세 유예 규칙, null 허용
 * @param isRegulatedFallback   regionCode 미제공 시 사용할 조정대상지역 여부 플래그
 */
export function determineMultiHouseSurcharge(
  input: MultiHouseSurchargeInput,
  houseCountRules: HouseCountExclusionRules,
  regulatedAreaHistory: RegulatedAreaHistory | null,
  suspensionRules: SurchargeSpecialRulesData | null,
  isRegulatedFallback: boolean,
): MultiHouseSurchargeResult {
  const warnings: string[] = [];

  // Step 1: 주택 수 산정
  const { count: effectiveHouseCount, excluded: excludedHouses } = countEffectiveHouses(
    input.houses,
    input.transferDate,
    input.presaleRights,
    houseCountRules,
  );

  const rawHouseCount = input.houses.length + input.presaleRights.length;

  // Step 2: 조정대상지역 판단
  const sellingHouse = input.houses.find((h) => h.id === input.sellingHouseId);
  let isRegulatedAtTransfer = isRegulatedFallback;

  if (sellingHouse?.regionCode && regulatedAreaHistory) {
    isRegulatedAtTransfer = isRegulatedAreaAtDate(
      sellingHouse.regionCode,
      input.transferDate,
      regulatedAreaHistory,
    );
  } else if (sellingHouse && !sellingHouse.regionCode) {
    warnings.push("양도 주택의 regionCode 미제공 — isRegulatedArea 플래그 사용");
  }

  // Step 3: 1주택 이하 → 중과 없음
  if (effectiveHouseCount <= 1) {
    return {
      effectiveHouseCount,
      rawHouseCount,
      excludedHouses,
      isRegulatedAtTransfer,
      surchargeApplicable: false,
      surchargeType: "none",
      isSurchargeSuspended: false,
      exclusionReasons: [],
      warnings,
    };
  }

  // Step 4: 비조정지역 → 중과 없음
  if (!isRegulatedAtTransfer) {
    return {
      effectiveHouseCount,
      rawHouseCount,
      excludedHouses,
      isRegulatedAtTransfer,
      surchargeApplicable: false,
      surchargeType: "none",
      isSurchargeSuspended: false,
      exclusionReasons: [],
      warnings,
    };
  }

  // Step 5: 3주택+ → ⑩번 "배제 후 유일한 1주택" 판정
  if (effectiveHouseCount >= 3) {
    const excludedHouseIds = new Set(excludedHouses.map((e) => e.houseId));
    const otherEffectiveHouses = input.houses.filter(
      (h) => h.id !== input.sellingHouseId && !excludedHouseIds.has(h.id),
    );

    const perHouseExclusion = otherEffectiveHouses.map((h) => ({
      houseId: h.id,
      reason: isGroupExcludable(h, input.transferDate)
        ? getGroupExcludeReason(h, input.transferDate)
        : null,
    }));

    const remainingGeneralCount = perHouseExclusion.filter((e) => e.reason === null).length;

    if (remainingGeneralCount === 0 && otherEffectiveHouses.length > 0) {
      const exclusionReasons: ExclusionReason[] = [
        {
          type: "only_one_remaining",
          detail: `양도 주택 외 다른 주택(${otherEffectiveHouses.length}채)이 모두 ①~⑨ 배제 항목에 해당하여 유일한 일반주택 (${MULTI_HOUSE.THREE_HOUSE_EXCLUSION_SOLE})`,
        },
      ];
      return {
        effectiveHouseCount,
        rawHouseCount,
        excludedHouses,
        isRegulatedAtTransfer,
        surchargeApplicable: false,
        surchargeType: "none",
        isSurchargeSuspended: false,
        exclusionReasons,
        warnings,
        onlyOneRemainingDetail: {
          totalEffective: effectiveHouseCount,
          otherHousesExcluded: perHouseExclusion.map((e) => ({
            houseId: e.houseId,
            reason: e.reason ?? "일반주택 (배제 불가)",
          })),
        },
      };
    }
  }

  // Step 6: 중과 배제 사유 및 유예 판단
  const { isExcluded, exclusionReasons, isSuspended } = determineSurchargeExclusion(
    input,
    effectiveHouseCount,
    isRegulatedAtTransfer,
    suspensionRules,
    regulatedAreaHistory,
    new Set(excludedHouses.map((e) => e.houseId)),
  );

  if (isExcluded) {
    return {
      effectiveHouseCount,
      rawHouseCount,
      excludedHouses,
      isRegulatedAtTransfer,
      surchargeApplicable: false,
      surchargeType: "none",
      isSurchargeSuspended: false,
      exclusionReasons,
      warnings,
    };
  }

  // Step 7: 중과세 유형 결정
  const surchargeType: "multi_house_2" | "multi_house_3plus" =
    effectiveHouseCount >= 3 ? "multi_house_3plus" : "multi_house_2";

  return {
    effectiveHouseCount,
    rawHouseCount,
    excludedHouses,
    isRegulatedAtTransfer,
    surchargeApplicable: !isSuspended,
    surchargeType,
    isSurchargeSuspended: isSuspended,
    exclusionReasons,
    warnings,
  };
}

// ============================================================
// 세금 시뮬레이션 — 기본세율 vs 중과세율 비교
// ============================================================

const BASIC_TAX_BRACKETS: ReadonlyArray<{
  min: number; max: number; rate: number; deduction: number;
}> = [
  { min: 0,              max: 14_000_000,    rate: 0.06, deduction: 0 },
  { min: 14_000_000,     max: 50_000_000,    rate: 0.15, deduction: 1_260_000 },
  { min: 50_000_000,     max: 88_000_000,    rate: 0.24, deduction: 5_760_000 },
  { min: 88_000_000,     max: 150_000_000,   rate: 0.35, deduction: 15_440_000 },
  { min: 150_000_000,    max: 300_000_000,   rate: 0.38, deduction: 19_940_000 },
  { min: 300_000_000,    max: 500_000_000,   rate: 0.40, deduction: 25_940_000 },
  { min: 500_000_000,    max: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { min: 1_000_000_000,  max: Infinity,      rate: 0.45, deduction: 65_940_000 },
];

const SURCHARGE_ADDON_RATES: Record<"multi_house_2" | "multi_house_3plus", number> = {
  multi_house_2: 0.20,
  multi_house_3plus: 0.30,
};

function calcLtscGeneral(holdingYears: number): number {
  if (holdingYears < 3) return 0;
  return Math.min(Math.floor(holdingYears) * 0.02, 0.30);
}

function calcSimTax(taxableIncome: number, addonRate: number): number {
  if (taxableIncome <= 0) return 0;
  const bracket = BASIC_TAX_BRACKETS.find(
    (b) => taxableIncome >= b.min && taxableIncome < b.max,
  ) ?? BASIC_TAX_BRACKETS[BASIC_TAX_BRACKETS.length - 1];
  return Math.max(
    0,
    Math.floor(taxableIncome * (bracket.rate + addonRate) - bracket.deduction),
  );
}

/**
 * 다주택 중과세 적용 시 기본세율 대비 추가 세부담 시뮬레이션.
 *
 * 기본세율 시나리오: 장기보유특별공제 적용 (3년 이상 보유 시 연 2%, 최대 30%)
 * 중과세율 시나리오: 장기보유특별공제 0%, 기본세율 + 20%p(2주택) / +30%p(3주택+) 가산
 */
export function buildMultiHouseTaxSimulation(
  input: TaxSimulationInput,
): MultiHouseTaxSimulation {
  const capitalGain = Math.max(0, input.salePrice - input.acquisitionPrice - input.expenses);

  const ltscRate = calcLtscGeneral(input.holdingYears);
  const ltscAmount = Math.floor(capitalGain * ltscRate);
  const basicTaxableIncome = Math.max(0, capitalGain - ltscAmount);
  const basicTax = calcSimTax(basicTaxableIncome, 0);
  const basicEffectiveRate =
    basicTaxableIncome > 0 ? ((basicTax / basicTaxableIncome) * 100).toFixed(1) + "%" : "0%";

  const heavyTaxableIncome = capitalGain;
  const addonRate = SURCHARGE_ADDON_RATES[input.surchargeType];
  const heavyTax = calcSimTax(heavyTaxableIncome, addonRate);
  const heavyEffectiveRate =
    heavyTaxableIncome > 0 ? ((heavyTax / heavyTaxableIncome) * 100).toFixed(1) + "%" : "0%";

  const additionalTax = Math.max(0, heavyTax - basicTax);
  const additionalTaxFormatted = (additionalTax / 10_000).toFixed(0) + "만원";

  return {
    capitalGain,
    holdingYears: input.holdingYears,
    basicScenario: {
      label: "기본세율 (일반 양도)",
      ltscAmount,
      taxableIncome: basicTaxableIncome,
      tax: basicTax,
      effectiveRate: basicEffectiveRate,
    },
    heavyScenario: {
      label: `중과세율 (${input.surchargeType === "multi_house_2" ? "2주택 +20%p" : "3주택+ +30%p"})`,
      ltscAmount: 0,
      taxableIncome: heavyTaxableIncome,
      tax: heavyTax,
      effectiveRate: heavyEffectiveRate,
    },
    additionalTax,
    additionalTaxFormatted,
  };
}
