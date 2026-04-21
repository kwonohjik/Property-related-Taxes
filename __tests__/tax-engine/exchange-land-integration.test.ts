/**
 * 환지된 토지 다필지 분리 계산 통합 테스트 (EX-1)
 *
 * 교재: 양도·상속·증여세 이론 및 계산실무 (2023) §6편 §3장 사례06
 * 경기 파주시 교하동 581번지 — 전체 파이프라인 원단위 앵커
 *
 * PDF 정답:
 *   합계 양도차익 422,038,174 / 산출세액 91,372,154 / 지방소득세 9,137,215
 */

import { describe, it, expect } from "vitest";
import {
  calculateTransferTax,
  type TransferTaxInput,
} from "@/lib/tax-engine/transfer-tax";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TaxRateKey } from "@/lib/tax-engine/types";

// ── Mock 세율 (교재 계산에 적용된 2023년 기준) ──
function makeMockRates(): TaxRatesMap {
  const base: Record<string, object> = {
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
    "transfer:deduction:long_term_holding": {
      taxType: "transfer",
      category: "deduction",
      subCategory: "long_term_holding",
      rateTable: null,
      deductionRules: {
        type: "long_term_holding",
        general: { ratePerYear: 0.02, maxRate: 0.30, minHoldingYears: 3 },
        oneHouseSpecial: {
          holdingRatePerYear: 0.04, holdingMaxRate: 0.40,
          residenceRatePerYear: 0.04, residenceMaxRate: 0.40,
          combinedMaxRate: 0.80, minHoldingYears: 3,
        },
        exclusions: ["surcharge_applied", "unregistered"],
      },
      specialRules: null,
    },
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
        non_business_land: { additionalRate: 0.10 },
        unregistered: { flatRate: 0.70, excludeDeductions: true, excludeBasicDeduction: true },
      },
      deductionRules: null,
      specialRules: {
        surcharge_suspended: false,
        suspended_types: [],
        suspended_until: "2020-01-01",
      },
    },
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
  };
  const map = new Map<TaxRateKey, object>();
  for (const [key, value] of Object.entries(base)) {
    map.set(key as TaxRateKey, value);
  }
  return map as TaxRatesMap;
}

const mockRates = makeMockRates();

// ── EX-1 기본 입력 ──
const EX1_INPUT: TransferTaxInput = {
  propertyType: "land",
  transferPrice: 525_000_000,
  transferDate: new Date("2023-02-15"),
  // 단필지 필드는 parcels 사용으로 대체 (더미값 설정)
  acquisitionPrice: 0,
  acquisitionDate: new Date("1996-02-18"),
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [],
  annualBasicDeductionUsed: 0,
  // 다필지 목록
  parcels: [
    {
      id: "parcel-1",
      acquisitionDate: new Date("1996-02-18"),
      acquisitionMethod: "estimated",
      acquisitionArea: 490,
      transferArea: 396.8,
      standardPricePerSqmAtAcq: 80_200,
      standardPricePerSqmAtTransfer: 709_500,
      isUnregistered: false,
    },
    {
      id: "parcel-2",
      acquisitionDate: new Date("2007-04-27"),
      acquisitionMethod: "actual",
      acquisitionArea: 32.2,
      transferArea: 32.2,
      acquisitionPrice: 34_000_000,
      expenses: 0,
      isUnregistered: false,
    },
  ],
};

// ============================================================
// EX-1: PDF 원단위 앵커
// ============================================================

describe("EX-1: 파주시 교하동 581번지 다필지 전체 파이프라인", () => {
  const result = calculateTransferTax(EX1_INPUT, mockRates);

  it("비과세 아님 (isExempt=false)", () => {
    expect(result.isExempt).toBe(false);
  });

  it("합계 양도차익 = 422,038,174", () => {
    expect(result.transferGain).toBe(422_038_174);
  });

  it("합계 장기보유특별공제 = 126,611,451", () => {
    expect(result.longTermHoldingDeduction).toBe(126_611_451);
  });

  it("합계 양도소득금액 = 295,426,723", () => {
    // transferIncome = 422,038,174 - 126,611,451 = 295,426,723
    const transferIncome = result.transferGain - result.longTermHoldingDeduction;
    expect(transferIncome).toBe(295_426_723);
  });

  it("기본공제 = 2,500,000", () => {
    expect(result.basicDeduction).toBe(2_500_000);
  });

  it("과세표준 = 292,926,723", () => {
    expect(result.taxBase).toBe(292_926_723);
  });

  it("산출세액 = 91,372,154", () => {
    expect(result.calculatedTax).toBe(91_372_154);
  });

  it("결정세액 = 91,372,154 (감면 없음)", () => {
    expect(result.determinedTax).toBe(91_372_154);
  });

  it("지방소득세 = 9,137,215", () => {
    expect(result.localIncomeTax).toBe(9_137_215);
  });

  it("총 납부세액 = 100,509,369", () => {
    expect(result.totalTax).toBe(91_372_154 + 9_137_215);
  });

  it("필지별 결과 2개 포함", () => {
    expect(result.parcelDetails).toHaveLength(2);
  });

  it("토지1 양도차익 = 416,632,579", () => {
    expect(result.parcelDetails![0].transferGain).toBe(416_632_579);
  });

  it("토지2 양도차익 = 5,405,595", () => {
    expect(result.parcelDetails![1].transferGain).toBe(5_405_595);
  });
});

// ============================================================
// EX-2: parcels 미제공 시 기존 단필지 흐름 회귀 없음
// ============================================================

describe("EX-2: parcels 미제공 시 기존 단필지 동작 보장", () => {
  it("parcels 없는 토지 단건 계산이 정상 동작한다", () => {
    const singleInput: TransferTaxInput = {
      propertyType: "land",
      transferPrice: 100_000_000,
      transferDate: new Date("2023-01-01"),
      acquisitionPrice: 50_000_000,
      acquisitionDate: new Date("2010-01-01"),
      expenses: 0,
      useEstimatedAcquisition: false,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      isOneHousehold: false,
      reductions: [],
      annualBasicDeductionUsed: 0,
    };
    const result = calculateTransferTax(singleInput, mockRates);
    expect(result.isExempt).toBe(false);
    // 양도차익 = 50,000,000 (단필지 경로)
    expect(result.transferGain).toBe(50_000_000);
    // parcelDetails 없음
    expect(result.parcelDetails).toBeUndefined();
  });
});
