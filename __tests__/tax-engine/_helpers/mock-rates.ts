/**
 * 양도소득세 Mock 세율 데이터 (테스트용)
 *
 * transfer-tax.test.ts와 transfer-tax-aggregate.test.ts에서 공유.
 * DB 없이 순수 엔진 검증용.
 */

import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TaxRateKey } from "@/lib/tax-engine/types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

export function makeMockRates(
  overrides?: Partial<Record<TaxRateKey, object>>,
): TaxRatesMap {
  const base: Record<string, object> = {
    // M-1: 누진세율 (2024년 기준 8구간)
    "transfer:progressive_rate:_default": {
      taxType: "transfer",
      category: "progressive_rate",
      subCategory: "_default",
      rateTable: {
        brackets: [
          { min: 0, max: 14_000_000, rate: 0.06, deduction: 0 },
          { min: 14_000_001, max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
          { min: 50_000_001, max: 88_000_000, rate: 0.24, deduction: 5_760_000 },
          { min: 88_000_001, max: 150_000_000, rate: 0.35, deduction: 15_440_000 },
          { min: 150_000_001, max: 300_000_000, rate: 0.38, deduction: 19_940_000 },
          { min: 300_000_001, max: 500_000_000, rate: 0.40, deduction: 25_940_000 },
          { min: 500_000_001, max: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
          { min: 1_000_000_001, rate: 0.45, deduction: 65_940_000 },
        ],
      },
      deductionRules: null,
      specialRules: null,
    },

    // M-2: 장기보유특별공제
    "transfer:deduction:long_term_holding": {
      taxType: "transfer",
      category: "deduction",
      subCategory: "long_term_holding",
      rateTable: null,
      deductionRules: {
        type: "long_term_holding",
        general: {
          ratePerYear: 0.02,
          maxRate: 0.30,
          minHoldingYears: 3,
        },
        oneHouseSpecial: {
          holdingRatePerYear: 0.04,
          holdingMaxRate: 0.40,
          residenceRatePerYear: 0.04,
          residenceMaxRate: 0.40,
          combinedMaxRate: 0.80,
          minHoldingYears: 3,
        },
        exclusions: ["surcharge_applied", "unregistered"],
      },
      specialRules: null,
    },

    // M-3: 기본공제 (연 250만원)
    "transfer:deduction:basic": {
      taxType: "transfer",
      category: "deduction",
      subCategory: "basic",
      rateTable: null,
      deductionRules: {
        type: "basic_deduction",
        annualLimit: 2_500_000,
        excludeUnregistered: true,
      },
      specialRules: null,
    },

    // M-4: 중과세율 + 유예 정보
    "transfer:surcharge:_default": {
      taxType: "transfer",
      category: "surcharge",
      subCategory: "_default",
      rateTable: {
        multi_house_2: {
          additionalRate: 0.20,
          condition: "조정대상지역 2주택",
          referenceDate: "transfer_date",
        },
        multi_house_3plus: {
          additionalRate: 0.30,
          condition: "조정대상지역 3주택+",
          referenceDate: "transfer_date",
        },
        non_business_land: {
          additionalRate: 0.10,
        },
        unregistered: {
          flatRate: 0.70,
          excludeDeductions: true,
          excludeBasicDeduction: true,
        },
      },
      deductionRules: null,
      specialRules: {
        surcharge_suspended: true,
        suspended_types: ["multi_house_2", "multi_house_3plus"],
        suspended_until: "2026-05-09",
      },
    },

    // M-5: 1세대1주택 특례
    "transfer:special:one_house_exemption": {
      taxType: "transfer",
      category: "special",
      subCategory: "one_house_exemption",
      rateTable: null,
      deductionRules: null,
      specialRules: {
        one_house_exemption: {
          maxExemptPrice: 1_200_000_000,
          minHoldingYears: 2,
          regulatedAreaMinResidenceYears: 2,
          prePolicyDate: "2017-08-03",
          prePolicyExemptResidence: true,
        },
        temporary_two_house: {
          disposalDeadlineYears: 3,
          regulatedAreaDeadlineYears: 1,
          regulatedAreaRelaxDate: "2022-05-10",
          regulatedAreaRelaxDeadlineYears: 3,
        },
      },
    },

    // M-6: 자경농지 감면
    "transfer:deduction:self_farming": {
      taxType: "transfer",
      category: "deduction",
      subCategory: "self_farming",
      rateTable: null,
      deductionRules: {
        type: "self_farming",
        maxRate: 1.0,
        maxAmount: 100_000_000,
        periodYears: 5,
        cumulativeMax: 200_000_000,
        conditions: {
          minFarmingYears: 8,
          requiresProof: true,
          maxResidenceDistance: 30,
        },
      },
      specialRules: null,
    },

    ...overrides,
  };

  const map = new Map<TaxRateKey, object>();
  for (const [key, value] of Object.entries(base)) {
    map.set(key as TaxRateKey, value);
  }
  return map as TaxRatesMap;
}

/** 기본 단건 입력 팩토리 (테스트별로 재정의) */
export function baseTransferInput(
  overrides?: Partial<TransferTaxInput>,
): TransferTaxInput {
  return {
    propertyType: "housing",
    transferPrice: 500_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2019-06-01"),
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [],
    annualBasicDeductionUsed: 0,
    ...overrides,
  };
}
