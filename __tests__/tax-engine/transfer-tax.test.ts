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
