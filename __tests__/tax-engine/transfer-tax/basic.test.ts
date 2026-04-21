/**
 * 양도소득세 — 기본 계산·장기보유공제·누진세율·경계값 (T-01~T-22) 테스트
 *
 * 공통 세율·기본 입력은 ../_helpers/mock-rates 에서 import.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { HouseInfo } from "@/lib/tax-engine/multi-house-surcharge";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land";
import type { RentalReductionInput } from "@/lib/tax-engine/rental-housing-reduction";
import type { NewHousingReductionInput } from "@/lib/tax-engine/new-housing-reduction";
import { makeMockRates, baseTransferInput as baseInput } from "../_helpers/mock-rates";

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
// T-16: 단기보유 특례세율 (소득세법 §104①2~3호)
// ============================================================

describe("T-16: 단기보유 특례세율", () => {
  it("주택 1년~2년 미만 보유 → 60% 단일세율 (taxBase=50M → 30M)", () => {
    // 취득 2023-01-01, 양도 2024-05-01 → 보유 약 1년 3개월 → 60% 적용
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 450_000_000,
      acquisitionDate: new Date("2023-01-01"),
      transferDate: new Date("2024-05-01"),
      isOneHousehold: false,
      householdHousingCount: 2,
      annualBasicDeductionUsed: 2_500_000,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.taxBase).toBe(50_000_000);
    expect(result.appliedRate).toBeCloseTo(0.60);
    expect(result.calculatedTax).toBe(30_000_000);
  });

  it("주택 1년 미만 보유 → 70% 단일세율", () => {
    // 취득 2024-01-01, 양도 2024-10-01 → 보유 약 9개월 → 70% 적용
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 450_000_000,
      acquisitionDate: new Date("2024-01-01"),
      transferDate: new Date("2024-10-01"),
      isOneHousehold: false,
      householdHousingCount: 1,
      annualBasicDeductionUsed: 2_500_000,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.appliedRate).toBeCloseTo(0.70);
    expect(result.calculatedTax).toBe(Math.floor(result.taxBase * 0.70));
  });

  it("건물 1년~2년 미만 보유 → 40% 단일세율", () => {
    // 주택 이외 건물, 1년~2년 → 40% 적용
    const input = baseInput({
      propertyType: "building",
      transferPrice: 500_000_000,
      acquisitionPrice: 450_000_000,
      acquisitionDate: new Date("2023-01-01"),
      transferDate: new Date("2024-05-01"),
      isOneHousehold: false,
      householdHousingCount: 0,
      annualBasicDeductionUsed: 2_500_000,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.taxBase).toBe(50_000_000);
    expect(result.appliedRate).toBeCloseTo(0.40);
    expect(result.calculatedTax).toBe(20_000_000);
  });

  it("건물 1년 미만 보유 → 50% 단일세율", () => {
    const input = baseInput({
      propertyType: "building",
      transferPrice: 500_000_000,
      acquisitionPrice: 450_000_000,
      acquisitionDate: new Date("2024-01-01"),
      transferDate: new Date("2024-10-01"),
      isOneHousehold: false,
      householdHousingCount: 0,
      annualBasicDeductionUsed: 2_500_000,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.appliedRate).toBeCloseTo(0.50);
    expect(result.calculatedTax).toBe(Math.floor(result.taxBase * 0.50));
  });

  it("누진세율 15% 구간 — 건물 2년 이상 보유 (단기 적용 제외)", () => {
    // 2년 이상 보유한 건물: 일반 누진세율 적용 (단기 특례세율 미적용)
    // 취득 2021-01-01, 양도 2024-05-01 → 3년 4개월 보유
    // 차익 = 500M - 450M = 50M, LTHD = 3년×2% = 6% → 3,000,000
    // taxBase = 50,000,000 - 3,000,000 = 47,000,000 (기본공제 소진)
    // 47,000,000 × 15% - 1,260,000 = 7,050,000 - 1,260,000 = 5,790,000
    const input = baseInput({
      propertyType: "building",
      transferPrice: 500_000_000,
      acquisitionPrice: 450_000_000,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-05-01"),
      isOneHousehold: false,
      householdHousingCount: 0,
      annualBasicDeductionUsed: 2_500_000,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.appliedRate).toBeCloseTo(0.15);
    expect(result.calculatedTax).toBe(5_790_000);
  });
});

// ============================================================
// T-INH-RATE-LONG: 상속 — 단기보유 단일세율 판정에 피상속인 취득일 통산
// ============================================================

describe("T-INH-RATE-LONG: 상속 자산 — 피상속인 취득일 보유기간 통산 (단기 단일세율 미적용)", () => {
  it("상속개시일 6개월 전 양도지만 피상속인 취득일 5년 전 → 누진세율 적용", () => {
    // 상속개시일(취득일) 2023-07-01, 양도일 2024-01-01 → 상속 후 6개월
    //   기존 로직이라면: 보유 6개월 < 12개월 → 70% 단일세율
    // 피상속인 취득일 2019-01-01 → 통산 보유 5년 → 단기 미적용, 누진세율
    const input = baseInput({
      propertyType: "housing",
      transferPrice: 600_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2023-07-01"),
      transferDate: new Date("2024-01-01"),
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: new Date("2019-01-01"),
      isOneHousehold: false,
      householdHousingCount: 2,
      annualBasicDeductionUsed: 2_500_000,
    });
    const result = calculateTransferTax(input, mockRates);
    // 단기 단일세율(0.70/0.60)이 아닌 누진세율 적용 확인
    expect(result.appliedRate).not.toBe(0.70);
    expect(result.appliedRate).not.toBe(0.60);
    expect(result.appliedRate).toBeLessThanOrEqual(0.45);
  });
});

// ============================================================
// T-GIFT-RATE-LONG: 증여 — 단기보유 단일세율 판정에 증여자 취득일 통산
// ============================================================

describe("T-GIFT-RATE-LONG: 증여 자산 — 증여자 취득일 보유기간 통산 (단기 단일세율 미적용)", () => {
  it("증여일 6개월 전 양도지만 증여자 취득일 5년 전 → 누진세율 적용", () => {
    const input = baseInput({
      propertyType: "land",
      transferPrice: 600_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2023-07-01"),
      transferDate: new Date("2024-01-01"),
      acquisitionCause: "gift",
      donorAcquisitionDate: new Date("2019-01-01"),
      isOneHousehold: false,
      householdHousingCount: 0,
      annualBasicDeductionUsed: 2_500_000,
    });
    const result = calculateTransferTax(input, mockRates);
    // 토지 단기 단일세율(0.50/0.40) 미적용 확인
    expect(result.appliedRate).not.toBe(0.50);
    expect(result.appliedRate).not.toBe(0.40);
    expect(result.appliedRate).toBeLessThanOrEqual(0.45);
  });
});

// ============================================================
// T-INH-LTHD-UNCHANGED: 상속 — LTHD 보유기간은 상속개시일 기산 유지 (회귀)
// ============================================================

describe("T-INH-LTHD-UNCHANGED: 상속 자산의 LTHD 보유기간은 상속개시일 기산 유지", () => {
  it("상속개시일 6개월 전 + 피상속인 취득일 10년 전 → LTHD = 0 (3년 미만)", () => {
    const input = baseInput({
      propertyType: "land",
      transferPrice: 600_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2023-07-01"),
      transferDate: new Date("2024-01-01"),
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: new Date("2014-01-01"),
      isOneHousehold: false,
      householdHousingCount: 0,
      annualBasicDeductionUsed: 2_500_000,
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.longTermHoldingDeduction).toBe(0);
    expect(result.longTermHoldingRate).toBe(0);
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

describe("T-18: 지방소득세 = 결정세액 × 10% (원 미만 절사)", () => {
  it("localIncomeTax = floor(determinedTax × 0.10) (지방세법 §103의3)", () => {
    const input = baseInput({
      transferPrice: 400_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"),
      isOneHousehold: false,
      householdHousingCount: 1,
    });
    const result = calculateTransferTax(input, mockRates);
    // 지방세법 §103의3: 원 미만 절사 (천원 절사 규정 없음)
    const expectedLocalTax = Math.floor(result.determinedTax * 0.1);
    expect(result.localIncomeTax).toBe(expectedLocalTax);
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
// T-21: 과세표준 원 단위 계산 (소득세법 §92 — 절사 규정 없음)
// ============================================================

describe("T-21: 과세표준 원 단위 계산 검증", () => {
  it("taxBase는 절사 없이 양도소득금액 - 기본공제와 정확히 일치함", () => {
    const input = baseInput({
      transferPrice: 352_501_500,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-01-02"),
      isOneHousehold: false,
      householdHousingCount: 1,
      annualBasicDeductionUsed: 0,
    });
    const result = calculateTransferTax(input, mockRates);
    const rawBase = result.taxableGain - result.longTermHoldingDeduction - result.basicDeduction;
    // 소득세법 §92: 과세표준 절사 규정 없음 → 원 단위 그대로
    expect(result.taxBase).toBe(Math.max(0, rawBase));
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
