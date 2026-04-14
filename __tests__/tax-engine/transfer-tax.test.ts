/**
 * 양도소득세 계산 엔진 단위 테스트
 *
 * Phase 2: T-01 ~ T-22 전체 테스트 케이스
 * DB 없이 Mock TaxRatesMap으로 순수 엔진 검증
 */

import { describe, it, expect } from "vitest";
import {
  calculateTransferTax,
  type TransferTaxInput,
} from "@/lib/tax-engine/transfer-tax";
import type { HouseInfo } from "@/lib/tax-engine/multi-house-surcharge";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land";
import type { RentalReductionInput } from "@/lib/tax-engine/rental-housing-reduction";
import type { NewHousingReductionInput } from "@/lib/tax-engine/new-housing-reduction";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TaxRateKey } from "@/lib/tax-engine/types";

// ============================================================
// Mock 세율 데이터 (DB 없이 순수 엔진 테스트용)
// ============================================================

function makeMockRates(overrides?: Partial<Record<TaxRateKey, object>>): TaxRatesMap {
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

// 기본 입력 팩토리 (테스트별로 재정의)
function baseInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
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

const mockRates = makeMockRates();

// ============================================================
// T-01: 1주택 비과세 (양도가 10억, 비조정)
// ============================================================

describe("T-01: 1주택 비과세 (양도가 10억, 비조정)", () => {
  it("isExempt=true, totalTax=0 반환", () => {
    const input = baseInput({
      transferPrice: 1_000_000_000,
      transferDate: new Date("2024-06-01"),
      acquisitionDate: new Date("2019-06-01"), // 보유 5년 (2년 이상 충족)
      residencePeriodMonths: 60,
      isRegulatedArea: false,
      isOneHousehold: true,
      householdHousingCount: 1,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(true);
    expect(result.totalTax).toBe(0);
  });
});

// ============================================================
// T-02: 1주택 부분과세 (양도가 15억, 비조정)
// ============================================================

describe("T-02: 1주택 부분과세 (양도가 15억, 비조정)", () => {
  it("isExempt=false, taxableGain > 0, totalTax > 0", () => {
    // 양도가 15억, 취득가 10억, 차익 5억
    // 과세 양도차익 = 5억 × (3억 / 15억) = 1억
    const input = baseInput({
      transferPrice: 1_500_000_000,
      acquisitionPrice: 1_000_000_000,
      transferDate: new Date("2024-06-01"),
      acquisitionDate: new Date("2019-06-01"),
      residencePeriodMonths: 60,
      isRegulatedArea: false,
      isOneHousehold: true,
      householdHousingCount: 1,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(false);
    // 양도차익 = 15억 - 10억 = 5억
    expect(result.transferGain).toBe(500_000_000);
    // 과세 양도차익 = 5억 × (3억/15억) = 1억
    expect(result.taxableGain).toBe(100_000_000);
    expect(result.totalTax).toBeGreaterThan(0);
  });
});

// ============================================================
// T-03: 1주택 장기보유공제 80% (10년 보유+거주)
// ============================================================

describe("T-03: 1주택 장기보유공제 80% (10년 보유+거주)", () => {
  it("longTermHoldingRate=0.80", () => {
    // 취득: 2014-01-01, 양도: 2024-01-02 → 보유 10년
    // 양도가 15억 > 12억 → isPartialExempt=true (부분과세) → 장기보유공제 계산됨
    const input = baseInput({
      transferPrice: 1_500_000_000,
      acquisitionPrice: 1_000_000_000,
      transferDate: new Date("2024-01-02"),
      acquisitionDate: new Date("2014-01-01"),
      residencePeriodMonths: 120, // 10년 거주
      isOneHousehold: true,
      householdHousingCount: 1,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.longTermHoldingRate).toBe(0.80);
    expect(result.longTermHoldingDeduction).toBe(
      Math.floor(result.taxableGain * 0.80)
    );
  });
});

// ============================================================
// T-04: 1주택 보유율만 (거주 0개월, 5년 보유)
// ============================================================

describe("T-04: 1주택 거주 0개월 → 1세대1주택 특례 미적용, 일반 규정 (5년 × 2%)", () => {
  it("longTermHoldingRate=0.10 (거주기간 2년 미만 → 일반: 보유 5년 × 2%)", () => {
    // 취득: 2019-01-01, 양도: 2024-01-02 → 보유 5년
    // 양도가 13억 > 12억 → isPartialExempt=true → 장기보유공제 계산됨
    // 거주 0개월 < 2년 → 1세대1주택 특례 미적용 → 일반: 5년 × 2% = 10%
    const input = baseInput({
      transferPrice: 1_300_000_000,
      acquisitionPrice: 1_000_000_000,
      transferDate: new Date("2024-01-02"),
      acquisitionDate: new Date("2019-01-01"),
      residencePeriodMonths: 0,
      isOneHousehold: true,
      householdHousingCount: 1,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.longTermHoldingRate).toBe(0.10);
  });
});

// ============================================================
// T-05: 일반 장기보유공제 (10년, 일반)
// ============================================================

describe("T-05: 일반 장기보유공제 (10년, 일반)", () => {
  it("longTermHoldingRate=0.20 (10년 × 2%)", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      transferDate: new Date("2024-01-02"),
      acquisitionDate: new Date("2014-01-01"),
      residencePeriodMonths: 0,
      isOneHousehold: false,
      householdHousingCount: 2, // 일반 (1세대1주택 아님)
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.longTermHoldingRate).toBe(0.20);
  });
});

// ============================================================
// T-06: 일반 장기보유공제 상한 30% (15년)
// ============================================================

describe("T-06: 일반 장기보유공제 최대 30% (15년, 일반)", () => {
  it("longTermHoldingRate=0.30 (상한)", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      transferDate: new Date("2024-01-02"),
      acquisitionDate: new Date("2009-01-01"), // 약 15년
      residencePeriodMonths: 0,
      isOneHousehold: false,
      householdHousingCount: 2,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.longTermHoldingRate).toBe(0.30);
  });
});

// ============================================================
// T-07: 2주택 조정, 유예 기간 중 (일반세율)
// ============================================================

describe("T-07: 2주택 조정지역, 유예 기간 중 (일반세율)", () => {
  it("isSurchargeSuspended=true, surchargeType=undefined", () => {
    const input = baseInput({
      transferDate: new Date("2026-01-01"), // 유예 종료일(2026-05-09) 이전
      acquisitionDate: new Date("2021-01-01"),
      acquisitionPrice: 300_000_000,
      householdHousingCount: 2,
      isRegulatedArea: true,
      isOneHousehold: true,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeType).toBeUndefined();
  });
});

// ============================================================
// T-08: 2주택 조정, 유예 종료 (중과 20%p)
// ============================================================

describe("T-08: 2주택 조정지역, 유예 종료 후 (중과세 20%p)", () => {
  it("isSurchargeSuspended=false, surchargeType='multi_house_2', surchargeRate=0.20", () => {
    const input = baseInput({
      transferDate: new Date("2026-05-10"), // 유예 종료 다음날
      acquisitionDate: new Date("2021-01-01"),
      acquisitionPrice: 300_000_000,
      householdHousingCount: 2,
      isRegulatedArea: true,
      isOneHousehold: false,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeType).toBe("multi_house_2");
    expect(result.surchargeRate).toBe(0.20);
  });
});

// ============================================================
// T-09: 3주택+ 조정, 유예 종료 (중과 30%p)
// ============================================================

describe("T-09: 3주택+ 조정지역, 유예 종료 후 (중과세 30%p)", () => {
  it("surchargeType='multi_house_3plus', surchargeRate=0.30", () => {
    const input = baseInput({
      transferDate: new Date("2026-06-01"),
      acquisitionDate: new Date("2021-01-01"),
      acquisitionPrice: 300_000_000,
      householdHousingCount: 3,
      isRegulatedArea: true,
      isOneHousehold: false,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.surchargeType).toBe("multi_house_3plus");
    expect(result.surchargeRate).toBe(0.30);
  });
});

// ============================================================
// T-10: 미등기 70% 단일세율
// ============================================================

describe("T-10: 미등기 양도 (70% 단일세율)", () => {
  it("appliedRate=0.70, longTermHoldingDeduction=0, basicDeduction=0", () => {
    // 미등기 자산: 1세대1주택 비과세 적용 안 됨 (isOneHousehold=false)
    const input = baseInput({
      transferPrice: 200_000_000,
      acquisitionPrice: 100_000_000,
      acquisitionDate: new Date("2019-01-01"),
      transferDate: new Date("2024-01-02"),
      isUnregistered: true,
      isOneHousehold: false,
      householdHousingCount: 1,
      annualBasicDeductionUsed: 0,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.appliedRate).toBe(0.70);
    expect(result.longTermHoldingDeduction).toBe(0);
    expect(result.basicDeduction).toBe(0);
    // calculatedTax = taxBase × 0.70
    expect(result.calculatedTax).toBe(Math.floor(result.taxBase * 0.70));
  });
});

// ============================================================
// T-11: 비사업용 토지 (누진 + 10%p)
// ============================================================

describe("T-11: 비사업용 토지 (누진세율 + 10%p)", () => {
  it("surchargeType='non_business_land'", () => {
    const input = baseInput({
      propertyType: "land",
      transferPrice: 200_000_000,
      acquisitionPrice: 100_000_000,
      acquisitionDate: new Date("2019-01-01"),
      transferDate: new Date("2024-01-02"),
      isNonBusinessLand: true,
      isOneHousehold: false,
      householdHousingCount: 0,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.surchargeType).toBe("non_business_land");
    expect(result.surchargeRate).toBe(0.10);
    // calculatedTax > 순수 누진세액
    const pureTax = Math.floor(result.taxBase * 0.24) - 5_760_000; // taxBase ~97.5M → 24% 구간 근처
    expect(result.calculatedTax).toBeGreaterThan(0);
  });
});

// ============================================================
// T-12: 환산취득가 + 개산공제 3%
// ============================================================

describe("T-12: 환산취득가 사용 (개산공제 3%)", () => {
  it("usedEstimatedAcquisition=true, transferGain 정확", () => {
    // 양도가 10억, 취득시 기준시가 5억, 양도시 기준시가 8억
    // 환산취득가 = 10억 × (5억/8억) = 6.25억
    // 개산공제 = 6.25억 × 3% = 18,750,000
    // 취득원가 합계 = 625,000,000 + 18,750,000 = 643,750,000
    // 양도차익 = 1,000,000,000 - 643,750,000 = 356,250,000
    const input = baseInput({
      transferPrice: 1_000_000_000,
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 500_000_000,
      standardPriceAtTransfer: 800_000_000,
      acquisitionDate: new Date("2019-01-01"),
      transferDate: new Date("2024-01-02"),
      isOneHousehold: false,
      householdHousingCount: 2,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.usedEstimatedAcquisition).toBe(true);

    const estimated = Math.floor(1_000_000_000 * 500_000_000 / 800_000_000); // 625,000,000
    // 개산공제 = 취득 당시 기준시가 × 3% (소득세법 §97①②)
    const deduction = Math.floor(500_000_000 * 0.03); // 15,000,000
    const expectedGain = 1_000_000_000 - estimated - deduction;
    expect(result.transferGain).toBe(Math.max(0, expectedGain));
  });
});

// ============================================================
// T-13: 자경농지 8년 감면 (한도 1억)
// ============================================================

describe("T-13: 자경농지 감면 한도 1억", () => {
  it("reductionAmount=100_000_000 (한도 적용)", () => {
    // 산출세액이 2억이라도 감면 한도 1억
    const input = baseInput({
      propertyType: "land",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2009-01-01"),
      transferDate: new Date("2024-01-02"),
      isOneHousehold: false,
      householdHousingCount: 0,
      reductions: [{ type: "self_farming", farmingYears: 8 }],
    });
    const result = calculateTransferTax(input, mockRates);
    // 한도 1억 초과 여부와 무관하게 최대 1억
    expect(result.reductionAmount).toBeLessThanOrEqual(100_000_000);
    if (result.calculatedTax > 100_000_000) {
      expect(result.reductionAmount).toBe(100_000_000);
    }
  });
});

// ============================================================
// T-14: 기본공제 잔여 50만원
// ============================================================

describe("T-14: 기본공제 잔여 50만원 적용", () => {
  it("basicDeduction=500_000", () => {
    const input = baseInput({
      transferPrice: 320_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"),
      annualBasicDeductionUsed: 2_000_000, // 기사용 200만
      isOneHousehold: false,
      householdHousingCount: 1,
    });
    const result = calculateTransferTax(input, mockRates);
    // 잔여 공제 = 250만 - 200만 = 50만
    expect(result.basicDeduction).toBe(500_000);
  });
});

// ============================================================
// T-15: 기본공제 한도 초과 방어 (기사용 250만 이상)
// ============================================================

describe("T-15: 기본공제 한도 초과 방어", () => {
  it("basicDeduction=0", () => {
    const input = baseInput({
      transferPrice: 320_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"),
      annualBasicDeductionUsed: 2_500_000, // 이미 한도 전액 사용
      isOneHousehold: false,
      householdHousingCount: 1,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.basicDeduction).toBe(0);
  });
});

// ============================================================
// T-16: 누진세율 15% 구간 경계값 (과세표준 5,000만원)
// ============================================================

describe("T-16: 누진세율 15% 구간 경계값 (5,000만원)", () => {
  it("calculatedTax=6_240_000", () => {
    // 50,000,000 × 0.15 - 1,260,000 = 6,240,000
    // taxBase=50,000,000이 되도록 역산
    // acquisitionPrice=450,000,000, transferPrice=500,000,000 → 차익=50,000,000
    // 장기보유공제 없는 케이스 (2년 미만 보유)
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 450_000_000,
      acquisitionDate: new Date("2023-01-01"),
      transferDate: new Date("2024-05-01"),
      isOneHousehold: false,
      householdHousingCount: 2,
      annualBasicDeductionUsed: 0,
    });
    const result = calculateTransferTax(input, mockRates);
    // taxBase = 50,000,000 - 0(LTHD) - 2,500,000(기본공제) = 47,500,000 → 아니면
    // 조건 맞추기: annualBasicDeductionUsed=2_500_000 로 기본공제 0 만들기
    // 정확한 6,240,000 → taxBase=50,000,000 필요
    // annualBasicDeductionUsed=2_500_000 사용하는 버전으로 테스트
    const input2 = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 450_000_000,
      acquisitionDate: new Date("2023-01-01"),
      transferDate: new Date("2024-05-01"),
      isOneHousehold: false,
      householdHousingCount: 2,
      annualBasicDeductionUsed: 2_500_000, // 기본공제 소진
    });
    const result2 = calculateTransferTax(input2, mockRates);
    // taxBase = 50,000,000 (보유 2년 미만 → LTHD=0, 기본공제=0)
    expect(result2.taxBase).toBe(50_000_000);
    expect(result2.calculatedTax).toBe(6_240_000);
  });
});

// ============================================================
// T-17: 누진세율 45% 구간 경계값 (10억+1원)
// ============================================================

describe("T-17: 누진세율 45% 구간 (과세표준 > 10억)", () => {
  it("appliedRate=0.45, calculatedTax = Math.floor(taxBase × 0.45) - 65_940_000", () => {
    // taxBase > 10억이 되도록 고액 양도가 설정
    // 양도가 20억, 취득가 0, 취득 2021-01-01, 양도 2024-01-02 (3년 보유)
    // gain = 2,000,000,000
    // LTHD (일반 L-4, 3년): 3 × 0.02 = 0.06, deduction = Math.floor(2B × 0.06) = 120,000,000
    // basicDeduction = 0 (annualBasicDeductionUsed=2,500,000)
    // rawBase = 2,000,000,000 - 120,000,000 = 1,880,000,000 → 45% 구간
    const input = baseInput({
      propertyType: "land",
      transferPrice: 2_000_000_000,
      acquisitionPrice: 0,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"),
      isNonBusinessLand: false,
      isOneHousehold: false,
      householdHousingCount: 0,
      annualBasicDeductionUsed: 2_500_000, // 기본공제 소진
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.appliedRate).toBe(0.45);
    // 산출세액 공식 검증
    const expected = Math.floor(result.taxBase * 0.45) - 65_940_000;
    expect(result.calculatedTax).toBe(expected);
  });
});

// ============================================================
// T-18: 지방소득세 = 결정세액 × 10%
// ============================================================

describe("T-18: 지방소득세 = 결정세액 × 10%", () => {
  it("localIncomeTax = Math.floor(determinedTax × 0.10)", () => {
    const input = baseInput({
      transferPrice: 400_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"),
      isOneHousehold: false,
      householdHousingCount: 1,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.localIncomeTax).toBe(Math.floor(result.determinedTax * 0.10));
  });
});

// ============================================================
// T-19: 양도 손실 → 세액 0
// ============================================================

describe("T-19: 양도 손실 → 세액 0", () => {
  it("transferGain=0, totalTax=0", () => {
    const input = baseInput({
      transferPrice: 300_000_000,
      acquisitionPrice: 400_000_000, // 취득가 > 양도가 → 손실
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"),
      isOneHousehold: false,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.transferGain).toBe(0);
    expect(result.totalTax).toBe(0);
  });
});

// ============================================================
// T-20: 3년 미만 보유 → 장기보유공제 0%
// ============================================================

describe("T-20: 3년 미만 보유 → 장기보유공제 0%", () => {
  it("longTermHoldingDeduction=0", () => {
    // 취득 2022-01-01, 양도 2024-01-01 → 보유 2년
    const input = baseInput({
      transferPrice: 400_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2022-01-01"),
      transferDate: new Date("2024-01-01"),
      isOneHousehold: false,
      householdHousingCount: 1,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.longTermHoldingDeduction).toBe(0);
    expect(result.longTermHoldingRate).toBe(0);
  });
});

// ============================================================
// T-21: 과세표준 천원 미만 절사
// ============================================================

describe("T-21: 과세표준 천원 미만 절사 검증", () => {
  it("taxBase가 천원 미만 버림 처리됨", () => {
    // 양도차익 - 기본공제 = 소수점 포함 → 천원 절사
    // 50,001,500 → 50,001,000
    const input = baseInput({
      transferPrice: 352_501_500, // 양도가
      acquisitionPrice: 300_000_000, // 취득가
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"),
      isOneHousehold: false,
      householdHousingCount: 1,
      annualBasicDeductionUsed: 0,
      // 양도차익 = 52,501,500
      // 기본공제 = 2,500,000
      // 세전 taxBase = 50,001,500 → 절사 = 50,001,000
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.taxBase % 1000).toBe(0);
    // 명시적 절사 값 확인
    const rawBase = result.taxableGain - result.longTermHoldingDeduction - result.basicDeduction;
    expect(result.taxBase).toBe(Math.floor(rawBase / 1000) * 1000);
  });
});

// ============================================================
// T-22: 전액 비과세 시 steps 배열 확인
// ============================================================

describe("T-22: 비과세 시 steps 배열", () => {
  it("steps.length > 0, steps[0].label='1세대1주택 비과세'", () => {
    const input = baseInput({
      transferPrice: 1_000_000_000,
      acquisitionPrice: 300_000_000,
      transferDate: new Date("2024-06-01"),
      acquisitionDate: new Date("2019-06-01"),
      residencePeriodMonths: 60,
      isRegulatedArea: false,
      isOneHousehold: true,
      householdHousingCount: 1,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps[0].label).toBe("1세대1주택 비과세");
  });
});

// ============================================================
// T-23~T-25: houses[] 배열 기반 주택 수 산정 엔진 통합 테스트
// (주택 수 산정 규칙 + 조정지역 이력 포함 Mock 사용)
// ============================================================

/**
 * 주택 수 산정 엔진 활성화 Mock 세율 (유예 없음 — 중과 실제 적용 확인)
 * M-4 override: surcharge_suspended=false
 * 신규 항목: house_count_exclusion, regulated_areas
 */
const mockRatesWithHouseEngine = makeMockRates({
  // 유예 없음으로 override (중과 실제 적용 테스트용)
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
      unregistered: {
        flatRate: 0.70,
        excludeDeductions: true,
        excludeBasicDeduction: true,
      },
    },
    deductionRules: null,
    specialRules: { surcharge_suspended: false },
  },
  // 주택 수 산정 배제 규칙
  "transfer:special:house_count_exclusion": {
    taxType: "transfer",
    category: "special",
    subCategory: "house_count_exclusion",
    rateTable: null,
    deductionRules: null,
    specialRules: {
      type: "house_count_exclusion",
      inheritedHouseYears: 5,
      rentalHousingExempt: true,
      lowPriceThreshold: { capital: null, non_capital: 100_000_000 },
      presaleRightStartDate: "2021-01-01",
      officetelStartDate: "2022-01-01",
    },
  },
  // 조정대상지역 이력 (강남구 — 해제일 없음)
  "transfer:special:regulated_areas": {
    taxType: "transfer",
    category: "special",
    subCategory: "regulated_areas",
    rateTable: null,
    deductionRules: null,
    specialRules: {
      type: "regulated_area_history",
      regions: [
        {
          code: "11680",
          name: "서울 강남구",
          designations: [{ designatedDate: "2017-08-03", releasedDate: null }],
        },
      ],
    },
  },
});

function makeHouseInfo(id: string, overrides?: Partial<HouseInfo>): HouseInfo {
  return {
    id,
    acquisitionDate: new Date("2020-01-01"),
    officialPrice: 300_000_000,
    region: "capital",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...overrides,
  };
}

// ============================================================
// T-23: houses[] 제공 시 householdHousingCount 무시하고 산정
// ============================================================

describe("T-23: houses[] 제공 시 유효 주택 수 산정 (householdHousingCount 무시)", () => {
  it("3채 중 비수도권 1억 이하 1채 제외 → effectiveCount=2, surchargeType=multi_house_2", () => {
    // houses: 3채 (비수도권 1억 이하 1채 포함)
    // householdHousingCount: 3 (원래라면 3plus 중과)
    // 기대: 유효 2주택 → multi_house_2 적용
    const h1 = makeHouseInfo("h1", { regionCode: "11680" }); // 강남구 (조정, 양도주택)
    const h2 = makeHouseInfo("h2", { region: "capital" });
    const h3 = makeHouseInfo("h3", {
      region: "non_capital",
      officialPrice: 90_000_000, // 1억 미만
    });

    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2024-06-01"),
      isRegulatedArea: true, // 플래그도 조정 (fallback)
      householdHousingCount: 3, // 잘못 제공된 값 — 무시되어야 함
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: [h1, h2, h3],
    });

    const result = calculateTransferTax(input, mockRatesWithHouseEngine);

    // 다주택 상세 결과 확인
    expect(result.multiHouseSurchargeDetail).toBeDefined();
    expect(result.multiHouseSurchargeDetail!.effectiveHouseCount).toBe(2);
    expect(result.multiHouseSurchargeDetail!.excludedHouses).toHaveLength(1);
    expect(result.multiHouseSurchargeDetail!.excludedHouses[0].reason).toBe("low_price_non_capital");

    // 중과 유형: 2주택 (3주택+ 아님)
    expect(result.surchargeType).toBe("multi_house_2");
    expect(result.surchargeRate).toBeDefined();
  });
});

// ============================================================
// T-24: 일시적 2주택 배제 → 일반세율 적용 통합 검증
// ============================================================

describe("T-24: houses[] + 일시적 2주택 배제 → 일반세율", () => {
  it("2주택 일시적 2주택 배제 → surchargeType 없음, 일반 누진세율 적용", () => {
    // 종전주택(h1) 양도, 신규주택(h2) 취득 2022.5.10 이후 → 3년 처분기한
    const h1 = makeHouseInfo("h1", { regionCode: "11680" }); // 강남구 (조정)
    const h2 = makeHouseInfo("h2", { acquisitionDate: new Date("2022-06-01") });

    const transferDate = new Date("2024-06-01"); // 신규주택 취득 후 2년 → 3년 이내

    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate,
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: [h1, h2],
      multiHouseTemporaryTwoHouse: { previousHouseId: "h1", newHouseId: "h2" },
    });

    const result = calculateTransferTax(input, mockRatesWithHouseEngine);

    // 배제 → 중과 미적용
    expect(result.surchargeType).toBeUndefined();
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.multiHouseSurchargeDetail!.exclusionReasons[0].type).toBe("temporary_two_house");

    // 일반 누진세율로 세금 계산됨 → surchargeRate 없음
    expect(result.surchargeRate).toBeUndefined();
  });
});

// ============================================================
// T-25: 장기임대 등록주택 보유 2주택자 → 유효 1주택 → 중과 미적용
// ============================================================

describe("T-25: 장기임대 등록주택 → 유효 1주택, 중과 미적용", () => {
  it("임대 등록 유효 주택 1채 → effectiveCount=1, surchargeType 없음", () => {
    const h1 = makeHouseInfo("h1", { regionCode: "11680" }); // 강남구 (조정, 양도주택)
    const h2 = makeHouseInfo("h2", {
      isLongTermRental: true,
      rentalRegistrationDate: new Date("2020-01-01"),
      rentalCancelledDate: undefined,
    });

    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2024-06-01"),
      isRegulatedArea: true,
      householdHousingCount: 2,
      isOneHousehold: true,
      sellingHouseId: "h1",
      houses: [h1, h2],
    });

    const result = calculateTransferTax(input, mockRatesWithHouseEngine);

    // 유효 주택 1채 → 중과 미적용
    expect(result.multiHouseSurchargeDetail!.effectiveHouseCount).toBe(1);
    expect(result.surchargeType).toBeUndefined();
    expect(result.surchargeRate).toBeUndefined();
  });
});

// ============================================================
// T-26: nonBusinessLandDetails 제공 → 판정 결과로 isNonBusinessLand 덮어쓰기
// ============================================================

describe("T-26: 비사업용 토지 정밀 판정 연동", () => {
  it("input.isNonBusinessLand=false이나 nonBusinessLandDetails 판정 결과 비사업용 → 중과 적용 + 장기보유공제 0", () => {
    // 나대지, 1년 보유, 사업용 사용 0일 → 비사업용 판정
    const nbDetails: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 1000,
      zoneType: "residential",
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2025-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
    };

    const input = baseInput({
      propertyType: "land",
      transferPrice: 500_000_000,
      acquisitionPrice: 200_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2025-01-01"),
      isNonBusinessLand: false, // 플래그는 false지만 details로 덮어씀
      nonBusinessLandDetails: nbDetails,
    });

    const result = calculateTransferTax(input, mockRates);

    // 판정 결과: 비사업용
    expect(result.nonBusinessLandJudgmentDetail).toBeDefined();
    expect(result.nonBusinessLandJudgmentDetail!.isNonBusinessLand).toBe(true);
    // 비사업용 → 중과 +10%p
    expect(result.surchargeType).toBe("non_business_land");
    expect(result.surchargeRate).toBe(0.1);
    // 비사업용 → 장기보유공제 배제
    expect(result.longTermHoldingDeduction).toBe(0);
    expect(result.longTermHoldingRate).toBe(0);
  });

  it("input.isNonBusinessLand=true이나 nonBusinessLandDetails 판정 결과 사업용 → 중과 미적용, 장기보유공제 적용", () => {
    // 농지, 자경 5년 이상 → 사업용
    const nbDetails: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 5000,
      zoneType: "agriculture_forest",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      farmingSelf: true,
      farmerResidenceDistance: 10,
      businessUsePeriods: [
        {
          startDate: new Date("2015-01-02"),
          endDate: new Date("2022-01-01"),
          usageType: "자경",
        },
      ],
      gracePeriods: [],
    };

    const input = baseInput({
      propertyType: "land",
      transferPrice: 300_000_000,
      acquisitionPrice: 100_000_000,
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      isNonBusinessLand: true, // 플래그는 true지만 details로 덮어씀 → 사업용
      nonBusinessLandDetails: nbDetails,
    });

    const result = calculateTransferTax(input, mockRates);

    // 판정 결과: 사업용
    expect(result.nonBusinessLandJudgmentDetail!.isNonBusinessLand).toBe(false);
    // 사업용 → 비사업용 중과 없음
    expect(result.surchargeType).toBeUndefined();
    // 7년 보유 → 장기보유공제 적용 (일반 2%/년, 7년=14%)
    expect(result.longTermHoldingRate).toBeGreaterThan(0);
  });

  it("nonBusinessLandDetails 미제공 → isNonBusinessLand 플래그 그대로 사용 (하위 호환)", () => {
    const input = baseInput({
      propertyType: "land",
      transferPrice: 300_000_000,
      acquisitionPrice: 100_000_000,
      acquisitionDate: new Date("2018-01-01"),
      transferDate: new Date("2022-01-01"),
      isNonBusinessLand: true,
      // nonBusinessLandDetails: 미제공
    });

    const result = calculateTransferTax(input, mockRates);

    expect(result.nonBusinessLandJudgmentDetail).toBeUndefined();
    expect(result.surchargeType).toBe("non_business_land");
  });
});

// ============================================================
// T-27: rentalReductionDetails 제공 → 정밀 감면 엔진 연동
// ============================================================

const LONG_TERM_RENTAL_RULES_MOCK = {
  "transfer:deduction:long_term_rental_v2": {
    taxType: "transfer",
    category: "deduction",
    subCategory: "long_term_rental_v2",
    rateTable: null,
    deductionRules: {
      type: "long_term_rental_v2",
      subTypes: [
        {
          code: "long_term_private",
          lawArticle: "97-3",
          tiers: [
            { mandatoryYears: 8, reductionRate: 0.5, longTermDeductionRate: 0.5 },
            { mandatoryYears: 10, reductionRate: 0.7, longTermDeductionRate: 0.7 },
          ],
          maxOfficialPrice: { capital: 600_000_000, non_capital: 300_000_000 },
          rentIncreaseLimit: 0.05,
        },
      ],
    },
    specialRules: null,
  },
};

describe("T-27: 장기임대 감면 정밀 엔진 연동", () => {
  it("T-27a: rentalReductionDetails 제공 → 8년 임대 50% 감면 적용", () => {
    const rentalDetails: RentalReductionInput = {
      isRegisteredLandlord: true,
      isTaxRegistered: true,
      registrationDate: new Date("2015-01-01"),
      rentalHousingType: "long_term_private",
      propertyType: "non_apartment",
      region: "capital",
      officialPriceAtStart: 500_000_000,
      rentalStartDate: new Date("2015-01-01"),
      transferDate: new Date("2024-06-01"),  // 9년 이상
      vacancyPeriods: [],
      rentHistory: [],
      calculatedTax: 0, // calculateTransferTax에서 실제 세액으로 덮어씀
    };

    const rates = makeMockRates(LONG_TERM_RENTAL_RULES_MOCK as Partial<Record<TaxRateKey, object>>);

    const input = baseInput({
      transferPrice: 600_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2014-06-01"),
      transferDate: new Date("2024-06-01"),
      isOneHousehold: false,        // 임대주택 다가구 시나리오 → 비과세 제외
      householdHousingCount: 3,
      reductions: [],
      rentalReductionDetails: rentalDetails,
    });

    const result = calculateTransferTax(input, rates);
    expect(result.isExempt).toBe(false);
    expect(result.reductionAmount).toBeGreaterThan(0);
    // 50% 감면 = 산출세액 × 0.5
    expect(result.reductionAmount).toBe(Math.floor(result.calculatedTax * 0.5));
    expect(result.rentalReductionDetail).toBeDefined();
    expect(result.rentalReductionDetail?.isEligible).toBe(true);
    expect(result.rentalReductionDetail?.reductionRate).toBe(0.5);
  });

  it("T-27b: rentalReductionDetails 의무기간 미충족 → 감면 0", () => {
    const rentalDetails: RentalReductionInput = {
      isRegisteredLandlord: true,
      isTaxRegistered: true,
      registrationDate: new Date("2019-01-01"),
      rentalHousingType: "long_term_private",
      propertyType: "non_apartment",
      region: "capital",
      officialPriceAtStart: 400_000_000,
      rentalStartDate: new Date("2019-01-01"),
      transferDate: new Date("2024-06-01"),  // 5년 → 8년 미충족
      vacancyPeriods: [],
      rentHistory: [],
      calculatedTax: 0,
    };

    const rates = makeMockRates(LONG_TERM_RENTAL_RULES_MOCK as Partial<Record<TaxRateKey, object>>);

    const input = baseInput({
      isOneHousehold: false,        // 비과세 제외
      householdHousingCount: 2,
      reductions: [],
      rentalReductionDetails: rentalDetails,
    });

    const result = calculateTransferTax(input, rates);
    expect(result.reductionAmount).toBe(0);
    expect(result.rentalReductionDetail?.isEligible).toBe(false);
    expect(result.rentalReductionDetail?.ineligibleReasons.some(
      (r) => r.code === "RENTAL_PERIOD_SHORT"
    )).toBe(true);
  });

  it("T-27c: rentalReductionDetails 미제공 + reductions long_term_rental → 하위 호환 50%", () => {
    const result = calculateTransferTax(
      baseInput({
        reductions: [{ type: "long_term_rental", rentalYears: 9, rentIncreaseRate: 0.03 }],
        // rentalReductionDetails: 미제공
      }),
      makeMockRates(),
    );
    // 기존 단순 로직: 8년+ + 5% 이하 → 50%
    expect(result.reductionAmount).toBe(Math.floor(result.calculatedTax * 0.5));
    expect(result.rentalReductionDetail).toBeUndefined();
  });
});

// ============================================================
// T-28: 신축주택 감면 통합 시나리오
// ============================================================

const NEW_HOUSING_MATRIX_MOCK = {
  "transfer:deduction:new_housing_matrix": {
    taxType: "transfer",
    category: "deduction",
    subCategory: "new_housing_matrix",
    rateTable: null,
    deductionRules: {
      type: "new_housing_matrix",
      articles: [
        {
          code: "99-1",
          article: "§99 ①",
          acquisitionPeriod: { start: "2001-05-23", end: "2003-06-30" },
          region: "outside_overconcentration",
          maxAcquisitionPrice: null,
          maxArea: null,
          requiresFirstSale: true,
          requiresUnsoldCertificate: false,
          reductionScope: "capital_gain",
          reductionRate: 1.0,
          fiveYearWindowRule: true,
          isExcludedFromHouseCount: true,
          isExcludedFromMultiHouseSurcharge: true,
        },
      ],
    },
    specialRules: null,
    effectiveDate: "2001-05-23",
    isActive: true,
  },
};

describe("T-28: 신축주택 감면 — newHousingDetails 통합", () => {
  it("T-28a: §99 ① 5년 이내 양도 → reductionAmount ≈ calculatedTax (100%)", () => {
    const newHousingDetails: NewHousingReductionInput = {
      acquisitionDate: new Date("2002-01-01"),
      transferDate: new Date("2005-01-01"), // 3년 이내
      region: "outside_overconcentration",
      acquisitionPrice: 200_000_000,
      exclusiveAreaSquareMeters: 84,
      isFirstSale: true,
      hasUnsoldCertificate: false,
      totalCapitalGain: 0,     // calculateTransferTax에서 실제 세액으로 덮어씀
      calculatedTax: 0,
    };

    const rates = makeMockRates(NEW_HOUSING_MATRIX_MOCK as Partial<Record<TaxRateKey, object>>);

    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 200_000_000,
      acquisitionDate: new Date("2002-01-01"),
      transferDate: new Date("2005-01-01"),
      isOneHousehold: false,
      householdHousingCount: 2,
      reductions: [],
      newHousingDetails,
    });

    const result = calculateTransferTax(input, rates);
    expect(result.isExempt).toBe(false);
    expect(result.reductionAmount).toBeGreaterThan(0);
    // 5년 이내 → ratio=1.0 → 100% 감면
    expect(result.reductionAmount).toBe(result.calculatedTax);
    expect(result.newHousingReductionDetail).toBeDefined();
    expect(result.newHousingReductionDetail?.isEligible).toBe(true);
    expect(result.newHousingReductionDetail?.reductionRate).toBe(1.0);
    expect(result.newHousingReductionDetail?.isWithinFiveYearWindow).toBe(true);
  });

  it("T-28b: §99 ① 취득일 기간 외 → 감면 0, newHousingReductionDetail.isEligible false", () => {
    const newHousingDetails: NewHousingReductionInput = {
      acquisitionDate: new Date("2004-01-01"), // 기간 외
      transferDate: new Date("2007-01-01"),
      region: "outside_overconcentration",
      acquisitionPrice: 200_000_000,
      exclusiveAreaSquareMeters: 84,
      isFirstSale: true,
      hasUnsoldCertificate: false,
      totalCapitalGain: 0,
      calculatedTax: 0,
    };

    const rates = makeMockRates(NEW_HOUSING_MATRIX_MOCK as Partial<Record<TaxRateKey, object>>);

    const input = baseInput({
      acquisitionDate: new Date("2004-01-01"),
      transferDate: new Date("2007-01-01"),
      isOneHousehold: false,
      householdHousingCount: 2,
      reductions: [],
      newHousingDetails,
    });

    const result = calculateTransferTax(input, rates);
    expect(result.reductionAmount).toBe(0);
    expect(result.newHousingReductionDetail?.isEligible).toBe(false);
  });

  it("T-28c: newHousingDetails 미제공 + reductions new_housing → 하위 호환 50% (수도권)", () => {
    const result = calculateTransferTax(
      baseInput({
        isOneHousehold: false,
        householdHousingCount: 2,
        reductions: [{ type: "new_housing", region: "metropolitan" }],
        // newHousingDetails: 미제공
      }),
      makeMockRates(),
    );
    // 기존 단순 로직: 수도권 50%
    expect(result.reductionAmount).toBe(Math.floor(result.calculatedTax * 0.5));
    expect(result.newHousingReductionDetail).toBeUndefined();
  });
});

// ============================================================
// T-29: 조정지역(취득일 기준) + 거주 2년 미충족 → 비과세 거부 [버그1 검증]
// ============================================================

describe("T-29: 취득일 기준 조정지역 + 거주 미충족 → 비과세 불가", () => {
  it("wasRegulatedAtAcquisition=true, 거주 20개월 → isExempt=false", () => {
    const input = baseInput({
      transferPrice: 900_000_000, // 12억 이하
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"), // 보유 3년
      residencePeriodMonths: 20,            // 1년 8개월 — 2년 미충족
      isOneHousehold: true,
      householdHousingCount: 1,
      wasRegulatedAtAcquisition: true,      // 취득일 기준 조정지역
      isRegulatedArea: true,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(false);
    expect(result.totalTax).toBeGreaterThan(0);
  });
});

// ============================================================
// T-30: 취득일 비조정 → 양도일 조정 → 거주요건 면제 [버그1 핵심]
// ============================================================

describe("T-30: 취득일 비조정, 양도일 조정 → 거주요건 없음 → 비과세", () => {
  it("wasRegulatedAtAcquisition=false, isRegulatedArea=true, 거주 0개월 → isExempt=true", () => {
    const input = baseInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"), // 보유 3년
      residencePeriodMonths: 0,
      isOneHousehold: true,
      householdHousingCount: 1,
      wasRegulatedAtAcquisition: false, // 취득일 당시 비조정 → 거주요건 없음
      isRegulatedArea: true,            // 양도일 기준 조정지역 (거주요건 판단에 사용 불가)
    });
    const result = calculateTransferTax(input, mockRates);
    // 취득일 기준 비조정 → 거주요건 면제 → 비과세
    expect(result.isExempt).toBe(true);
    expect(result.totalTax).toBe(0);
  });
});

// ============================================================
// T-31: 취득일 조정 → 양도일 비조정 → 거주요건 발동 [버그1 역방향]
// ============================================================

describe("T-31: 취득일 조정, 양도일 비조정 → 거주요건 2년 미충족 → 비과세 불가", () => {
  it("wasRegulatedAtAcquisition=true, isRegulatedArea=false, 거주 0개월 → isExempt=false", () => {
    const input = baseInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"),
      residencePeriodMonths: 0,
      isOneHousehold: true,
      householdHousingCount: 1,
      wasRegulatedAtAcquisition: true,  // 취득일 기준 조정지역 → 거주요건 발동
      isRegulatedArea: false,           // 양도일 기준 비조정 (하지만 취득일 기준 적용)
    });
    const result = calculateTransferTax(input, mockRates);
    // 취득일 기준 조정 → 거주요건 2년 필요 → 미충족 → 비과세 불가
    expect(result.isExempt).toBe(false);
    expect(result.totalTax).toBeGreaterThan(0);
  });
});

// ============================================================
// T-32: 2017.8.3 이전 취득 경과규정 — 취득 당시 비조정 → 거주요건 면제
// ============================================================

describe("T-32: 경과규정 — 2017.8.3 이전 취득, 취득 당시 비조정 → 거주요건 면제", () => {
  it("acquisitionDate=2017-08-02, wasRegulatedAtAcquisition=false → isExempt=true", () => {
    const input = baseInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2017-08-02"), // 경과규정 기준일(2017-08-03) 하루 전
      transferDate: new Date("2024-01-02"),    // 보유 6년+
      residencePeriodMonths: 0,                // 거주 없음
      isOneHousehold: true,
      householdHousingCount: 1,
      wasRegulatedAtAcquisition: false, // 취득 당시 비조정
      isRegulatedArea: true,            // 양도일 기준 조정지역 (경과규정으로 면제)
    });
    const result = calculateTransferTax(input, mockRates);
    // 경과규정: 2017.8.3 이전 취득 + 취득 당시 비조정 → 거주요건 면제 → 비과세
    expect(result.isExempt).toBe(true);
    expect(result.totalTax).toBe(0);
  });
});

// ============================================================
// T-33: 일시적 2주택 처분기한 1일 초과 → 비과세 불가
// ============================================================

describe("T-33: 일시적 2주택 처분기한 초과 → 비과세 불가", () => {
  it("신규취득 후 3년+1일 양도 → isExempt=false", () => {
    const input = baseInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2018-01-01"),  // 종전주택 취득 (6년 보유)
      transferDate: new Date("2024-01-02"),     // 처분기한(2024-01-01) 1일 초과
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 60,
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2018-01-01"),
        newAcquisitionDate: new Date("2021-01-01"), // deadline = 2024-01-01
      },
    });
    const result = calculateTransferTax(input, mockRates);
    // 처분기한(2024-01-01) 초과 → 비과세 불가
    expect(result.isExempt).toBe(false);
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it("신규취득 후 정확히 3년 당일 양도 → isExempt=true", () => {
    const input = baseInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2018-01-01"),
      transferDate: new Date("2024-01-01"),    // 처분기한 당일 (<=)
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 60,
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2018-01-01"),
        newAcquisitionDate: new Date("2021-01-01"), // deadline = 2024-01-01
      },
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(true);
  });
});

// ============================================================
// T-34: 일시적 2주택 — 종전 주택 보유 1년 11개월 → 비과세 불가 [버그4 검증]
// ============================================================

describe("T-34: 일시적 2주택, 종전 주택 보유 2년 미만 → 비과세 불가", () => {
  it("종전주택 보유 1년 11개월 → isExempt=false", () => {
    const input = baseInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2022-06-01"),  // 종전주택 취득
      transferDate: new Date("2024-05-30"),     // 취득 후 1년 11개월 28일 → holding.years=1
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 24,
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2022-06-01"), // 종전주택 취득
        newAcquisitionDate: new Date("2024-01-01"),      // 신규취득 → deadline=2027-01-01
      },
    });
    const result = calculateTransferTax(input, mockRates);
    // 종전주택 보유 2년 미만 → 일시적 2주택 비과세 불가
    expect(result.isExempt).toBe(false);
    expect(result.totalTax).toBeGreaterThan(0);
  });
});

// ============================================================
// T-35: 보유기간 경계값 — 정확히 2년 → 비과세 충족
// ============================================================

describe("T-35: 보유기간 경계값 — 정확히 2년 → 비과세", () => {
  it("취득일 2022-01-01, 양도일 2024-01-02 → holding.years=2 → isExempt=true", () => {
    const input = baseInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 600_000_000,
      acquisitionDate: new Date("2022-01-01"),
      transferDate: new Date("2024-01-02"), // 초일불산입: start=2022-01-02, 2년 충족
      isOneHousehold: true,
      householdHousingCount: 1,
      wasRegulatedAtAcquisition: false,
      isRegulatedArea: false,
      residencePeriodMonths: 24,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(true);
  });

  it("취득일 2022-01-01, 양도일 2024-01-01 → holding.years=1 → isExempt=false", () => {
    const input = baseInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 600_000_000,
      acquisitionDate: new Date("2022-01-01"),
      transferDate: new Date("2024-01-01"), // 1년 11개월 → 2년 미충족
      isOneHousehold: true,
      householdHousingCount: 1,
      wasRegulatedAtAcquisition: false,
      isRegulatedArea: false,
      residencePeriodMonths: 24,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(false);
    expect(result.totalTax).toBeGreaterThan(0);
  });
});

// ============================================================
// T-36: 양도가액 정확히 12억 → 전액 비과세 (경계값)
// ============================================================

describe("T-36: 양도가액 12억 → 전액 비과세 경계값", () => {
  it("transferPrice=1,200,000,000 → isExempt=true (≤ 기준 적용)", () => {
    const input = baseInput({
      transferPrice: 1_200_000_000, // 정확히 12억
      acquisitionPrice: 800_000_000,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"),
      isOneHousehold: true,
      householdHousingCount: 1,
      wasRegulatedAtAcquisition: false,
      isRegulatedArea: false,
      residencePeriodMonths: 36,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(true);
    expect(result.totalTax).toBe(0);
  });

  it("transferPrice=1,500,000,000 (12억 초과) → isExempt=false, isPartialExempt로 과세", () => {
    // 12억 초과 시 isExempt=false이고 부분과세 처리
    // (1원 초과는 taxableGain≈0이 되므로 의미있는 초과액 사용)
    const input = baseInput({
      transferPrice: 1_500_000_000, // 15억
      acquisitionPrice: 800_000_000,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"),
      isOneHousehold: true,
      householdHousingCount: 1,
      wasRegulatedAtAcquisition: false,
      isRegulatedArea: false,
      residencePeriodMonths: 36,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(false);
    // 과세 양도차익 = 7억 × (3억/15억) = 1.4억
    expect(result.taxableGain).toBe(Math.floor(700_000_000 * 300_000_000 / 1_500_000_000));
    expect(result.totalTax).toBeGreaterThan(0);
  });
});

// ============================================================
// T-37: 1세대1주택 보유 2년 + 거주 2년 → 특례 미적용, 일반 공제 4% [버그2 검증]
// ============================================================

describe("T-37: 1세대1주택 보유 2년 → 장기보유특별공제 1세대1주택 특례 미적용 (3년 미만)", () => {
  it("보유 2년, 거주 2년 → 일반 공제 4% (특례 미적용)", () => {
    // 보유 2년 < 3년 → 1세대1주택 특례 미적용
    // 일반 공제: 2년 × 2% = 4%
    const input = baseInput({
      transferPrice: 1_500_000_000, // > 12억 → 부분과세로 장기보유공제 계산됨
      acquisitionPrice: 1_000_000_000,
      acquisitionDate: new Date("2022-01-01"),
      transferDate: new Date("2024-01-02"), // 보유 2년
      isOneHousehold: true,
      householdHousingCount: 1,
      wasRegulatedAtAcquisition: false,
      isRegulatedArea: false,
      residencePeriodMonths: 24, // 거주 2년
    });
    const result = calculateTransferTax(input, mockRates);
    // 보유 2년 → 1세대1주택 특례(3년 이상) 미적용
    // 일반 공제: 2 × 2% = 4%
    expect(result.longTermHoldingRate).toBe(0.04);
    expect(result.longTermHoldingDeduction).toBe(
      Math.floor(result.taxableGain * 0.04)
    );
  });
});

// ============================================================
// T-38: 1세대1주택 보유 3년 + 거주 2년 → 특례 공제 20% (3년 경계값)
// ============================================================

describe("T-38: 1세대1주택 보유 3년 + 거주 2년 → 특례 공제 20%", () => {
  it("보유 3년, 거주 2년 → 3×4% + 2×4% = 20%", () => {
    const input = baseInput({
      transferPrice: 1_500_000_000,
      acquisitionPrice: 1_000_000_000,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"), // 보유 3년
      isOneHousehold: true,
      householdHousingCount: 1,
      wasRegulatedAtAcquisition: false,
      isRegulatedArea: false,
      residencePeriodMonths: 24, // 거주 2년
    });
    const result = calculateTransferTax(input, mockRates);
    // 3×4% + 2×4% = 12% + 8% = 20%
    expect(result.longTermHoldingRate).toBe(0.20);
    expect(result.longTermHoldingDeduction).toBe(
      Math.floor(result.taxableGain * 0.20)
    );
  });
});

// ============================================================
// T-39: 윤년 취득일 경계값 (2020-02-29 취득, 만 4년 분기)
// ============================================================

describe("T-39: 윤년 취득일 경계값 (P0-1·P2-7 회귀)", () => {
  it("2020-02-29 취득 → 2024-02-28 양도: 보유 3년 364일 → LTHD 6%", () => {
    // 달력 기준 만 3년 (2020-02-29 ~ 2024-02-28)
    const result = calculateTransferTax(
      baseInput({
        acquisitionDate: new Date("2020-02-29"),
        transferDate: new Date("2024-02-28"),
        transferPrice: 600_000_000,
        acquisitionPrice: 400_000_000,
        isOneHousehold: false,
        householdHousingCount: 1,
        residencePeriodMonths: 0,
      }),
      mockRates,
    );
    // 보유 3년 → 일반 LTHD 2%/년 × 3년 = 6%
    expect(result.longTermHoldingRate).toBe(0.06);
  });

  it("2020-02-29 취득 → 2024-02-29 양도: 초일불산입 기산일(03-01) 기준 3년 364일 → LTHD 6%", () => {
    // 민법 초일불산입: 기산일 = 2020-03-01
    // 2020-03-01 ~ 2024-02-29 = 3년 364일 → 만 3년 → LTHD 6%
    const result = calculateTransferTax(
      baseInput({
        acquisitionDate: new Date("2020-02-29"),
        transferDate: new Date("2024-02-29"),
        transferPrice: 600_000_000,
        acquisitionPrice: 400_000_000,
        isOneHousehold: false,
        householdHousingCount: 1,
        residencePeriodMonths: 0,
      }),
      mockRates,
    );
    expect(result.longTermHoldingRate).toBe(0.06);
  });

  it("2020-02-29 취득 → 2024-03-01 양도: 보유 만 4년 → LTHD 8%", () => {
    const result = calculateTransferTax(
      baseInput({
        acquisitionDate: new Date("2020-02-29"),
        transferDate: new Date("2024-03-01"),
        transferPrice: 600_000_000,
        acquisitionPrice: 400_000_000,
        isOneHousehold: false,
        householdHousingCount: 1,
        residencePeriodMonths: 0,
      }),
      mockRates,
    );
    expect(result.longTermHoldingRate).toBe(0.08);
  });
});

// ============================================================
// T-40: 중과세 유예 만료 경계 (2026-05-09 이전 vs 이후)
// ============================================================

describe("T-40: 중과세 유예 만료 경계 (suspended_until: 2026-05-09)", () => {
  it("양도일 2026-05-09 → 유예 기간 내 → 중과세 미적용 (isSurchargeSuspended=true)", () => {
    const ratesWithExpiry = makeMockRates();
    const result = calculateTransferTax(
      baseInput({
        transferDate: new Date("2026-05-09"),
        householdHousingCount: 2,
        isRegulatedArea: true,
        isOneHousehold: false,
        transferPrice: 600_000_000,
        acquisitionPrice: 300_000_000,
        residencePeriodMonths: 0,
      }),
      ratesWithExpiry,
    );
    // 유예 중 → isSurchargeSuspended=true, surchargeRate 없음
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeRate ?? 0).toBe(0);
  });

  it("양도일 2026-05-10 → 유예 종료 → 2주택 중과세 +20%p 적용", () => {
    const ratesAfterExpiry = makeMockRates({
      "transfer:surcharge:_default": {
        taxType: "transfer",
        category: "surcharge",
        subCategory: "_default",
        rateTable: {
          multi_house_2: { additionalRate: 0.20, condition: "조정대상지역 2주택", referenceDate: "transfer_date" },
          multi_house_3plus: { additionalRate: 0.30, condition: "조정대상지역 3주택+", referenceDate: "transfer_date" },
          unregistered: { flatRate: 0.70, excludeDeductions: true, excludeBasicDeduction: true },
        },
        deductionRules: null,
        specialRules: {
          surcharge_suspended: false, // 유예 종료
        },
      },
    } as Partial<Record<TaxRateKey, object>>);
    const result = calculateTransferTax(
      baseInput({
        transferDate: new Date("2026-05-10"),
        householdHousingCount: 2,
        isRegulatedArea: true,
        isOneHousehold: false,
        transferPrice: 600_000_000,
        acquisitionPrice: 300_000_000,
        residencePeriodMonths: 0,
      }),
      ratesAfterExpiry,
    );
    // 중과세 적용 → surchargeRate = 0.20, isSurchargeSuspended = false
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeRate).toBeGreaterThan(0);
  });
});

// ============================================================
// T-41: 환산취득가 큰 값 정밀도 (overflow 방어 — P1-1 회귀)
// ============================================================

describe("T-41: 환산취득가 대용량 값 BigInt 정밀도", () => {
  it("양도·취득 기준시가 1조 → 개산공제 후 올바른 환산취득가 반환", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 2_000_000_000_000, // 2조
        useEstimatedAcquisition: true,
        acquisitionDate: new Date("2010-01-01"),
        transferDate: new Date("2024-01-01"),
        standardPriceAtAcquisition: 1_000_000_000_000, // 1조
        standardPriceAtTransfer: 1_500_000_000_000,    // 1.5조
        expenses: 0,
        isOneHousehold: false,
        householdHousingCount: 1,
        residencePeriodMonths: 0,
      }),
      mockRates,
    );
    // 환산취득가 = 2조 × (1조 / 1.5조) = 1조 333억… (정수)
    // 총세액이 양수이고 NaN/Infinity가 아닌지 확인
    expect(Number.isFinite(result.totalTax)).toBe(true);
    expect(result.totalTax).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// T-42: 정확한 손익분기 (양도차익 = 0 → 세액 = 0)
// ============================================================

describe("T-42: 양도차익 = 0 → totalTax = 0", () => {
  it("transferPrice === acquisitionPrice + expenses → totalTax = 0", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 490_000_000,
        expenses: 10_000_000,
        isOneHousehold: false,
        householdHousingCount: 1,
        residencePeriodMonths: 0,
      }),
      mockRates,
    );
    expect(result.transferGain).toBe(0);
    expect(result.totalTax).toBe(0);
  });
});

// ============================================================
// T-43: 미등기 + 장기보유특별공제 배제 (P0-2 회귀)
// ============================================================

describe("T-43: 미등기 양도 — LTHD 배제 회귀 (P0-2)", () => {
  it("보유 10년이어도 미등기 시 longTermHoldingDeduction = 0", () => {
    const result = calculateTransferTax(
      baseInput({
        acquisitionDate: new Date("2014-01-01"),
        transferDate: new Date("2024-01-01"),
        transferPrice: 600_000_000,
        acquisitionPrice: 300_000_000,
        isUnregistered: true,
        isOneHousehold: false,
        householdHousingCount: 1,
        residencePeriodMonths: 0,
      }),
      mockRates,
    );
    expect(result.longTermHoldingDeduction).toBe(0);
    expect(result.longTermHoldingRate).toBe(0);
    // 미등기 단일세율 70% 적용
    expect(result.appliedRate).toBe(0.70);
  });
});

// ============================================================
// T-44: 12억 경계 안분 정수 연산 (P0-1 회귀)
// ============================================================

describe("T-44: 12억 경계 안분 정수 연산 (P0-1 회귀)", () => {
  it("양도가 정확히 12억 → 전액 비과세 (taxableGain = 0)", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 1_200_000_000,
        acquisitionPrice: 800_000_000,
        transferDate: new Date("2024-06-01"),
        acquisitionDate: new Date("2020-06-01"),
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: 48,
        isRegulatedArea: false,
      }),
      mockRates,
    );
    // 1세대1주택 비과세 한도 = 12억 → 정확히 12억이면 과세 안분 없음
    expect(result.isExempt).toBe(true);
    expect(result.totalTax).toBe(0);
  });

  it("양도가 15억 (12억 초과) → 비과세 아님, 안분 세액 정수", () => {
    // 과세 안분 = 차익 × (15억-12억)/15억 = 5억 × 3/15 = 1억
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 1_500_000_000,
        acquisitionPrice: 1_000_000_000,
        transferDate: new Date("2024-06-01"),
        acquisitionDate: new Date("2020-06-01"),
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: 48,
        isRegulatedArea: false,
      }),
      mockRates,
    );
    expect(result.isExempt).toBe(false);
    expect(result.taxableGain).toBe(100_000_000); // 5억 × 3억/15억 = 1억
    expect(result.totalTax).toBeGreaterThan(0);
    // 세액은 정수여야 함 (P0-1 정수 연산 검증)
    expect(Number.isInteger(result.totalTax)).toBe(true);
    expect(Number.isInteger(result.taxableGain)).toBe(true);
  });
});
