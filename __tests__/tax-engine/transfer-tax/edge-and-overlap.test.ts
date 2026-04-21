/**
 * 양도소득세 — 중과 유예 경계·장기보유공제 회귀·중복배제 (T-40~T-45, T-LTH-*) 테스트
 *
 * 공통 세율·기본 입력은 ../_helpers/mock-rates 에서 import.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { HouseInfo } from "@/lib/tax-engine/multi-house-surcharge";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land";
import type { RentalReductionInput } from "@/lib/tax-engine/rental-housing-reduction";
import type { NewHousingReductionInput } from "@/lib/tax-engine/new-housing-reduction";
import type { TaxRateKey } from "@/lib/tax-engine/types";
import { makeMockRates, baseTransferInput as baseInput, LONG_TERM_RENTAL_RULES_MOCK } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

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
// T-LTH-PRSL: 분양권 양도 — 장기보유특별공제 배제 (소득세법 §95② 단서)
// ============================================================

describe("T-LTH-PRSL: 분양권 양도 — 장기보유특별공제 배제", () => {
  it("propertyType='presale_right' + 보유 5년 → longTermHoldingDeduction = 0", () => {
    const result = calculateTransferTax(
      baseInput({
        propertyType: "presale_right",
        acquisitionDate: new Date("2019-01-01"),
        transferDate: new Date("2024-01-02"),
        transferPrice: 600_000_000,
        acquisitionPrice: 300_000_000,
        isOneHousehold: false,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
      }),
      mockRates,
    );
    expect(result.longTermHoldingDeduction).toBe(0);
    expect(result.longTermHoldingRate).toBe(0);
  });
});

// ============================================================
// T-LTH-SUCC: 조합원입주권 + 승계조합원 — 장기보유특별공제 배제
// ============================================================

describe("T-LTH-SUCC: 조합원입주권 승계취득 — 장기보유특별공제 배제", () => {
  it("right_to_move_in + isSuccessorRightToMoveIn=true + 보유 5년 → 공제 0", () => {
    const result = calculateTransferTax(
      baseInput({
        propertyType: "right_to_move_in",
        isSuccessorRightToMoveIn: true,
        acquisitionDate: new Date("2019-01-01"),
        transferDate: new Date("2024-01-02"),
        transferPrice: 600_000_000,
        acquisitionPrice: 300_000_000,
        isOneHousehold: false,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
      }),
      mockRates,
    );
    expect(result.longTermHoldingDeduction).toBe(0);
    expect(result.longTermHoldingRate).toBe(0);
  });
});

// ============================================================
// T-LTH-ORIG: 조합원입주권 + 원조합원 — 장기보유특별공제 정상 적용
// ============================================================

describe("T-LTH-ORIG: 조합원입주권 원조합원 — 장기보유특별공제 정상 적용", () => {
  it("right_to_move_in + isSuccessorRightToMoveIn=false + 보유 5년 → 10%", () => {
    const result = calculateTransferTax(
      baseInput({
        propertyType: "right_to_move_in",
        isSuccessorRightToMoveIn: false,
        acquisitionDate: new Date("2019-01-01"),
        transferDate: new Date("2024-01-02"),
        transferPrice: 600_000_000,
        acquisitionPrice: 300_000_000,
        isOneHousehold: false,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
      }),
      mockRates,
    );
    expect(result.longTermHoldingRate).toBe(0.10);
  });
});

// ============================================================
// T-LTH-3Y-EDGE: 보유 2년 11개월 — 장기보유특별공제 배제 (3년 미만)
// ============================================================

describe("T-LTH-3Y-EDGE: 토지 보유 2년 11개월 — 장특공제 배제", () => {
  it("propertyType='land' + 보유 2년 11개월 → longTermHoldingDeduction = 0", () => {
    const result = calculateTransferTax(
      baseInput({
        propertyType: "land",
        acquisitionDate: new Date("2021-01-01"),
        transferDate: new Date("2023-12-02"),
        transferPrice: 600_000_000,
        acquisitionPrice: 300_000_000,
        isOneHousehold: false,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
      }),
      mockRates,
    );
    expect(result.longTermHoldingDeduction).toBe(0);
    expect(result.longTermHoldingRate).toBe(0);
  });
});

// ============================================================
// T-LTH-3Y-ENTRY: 토지 보유 3년 — 장기보유특별공제 6% 적용
// ============================================================

describe("T-LTH-3Y-ENTRY: 토지 보유 3년 — 장특공제 6% 적용", () => {
  it("propertyType='land' + 보유 3년 → longTermHoldingRate = 0.06", () => {
    const result = calculateTransferTax(
      baseInput({
        propertyType: "land",
        acquisitionDate: new Date("2021-01-01"),
        transferDate: new Date("2024-01-02"),
        transferPrice: 600_000_000,
        acquisitionPrice: 300_000_000,
        isOneHousehold: false,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
      }),
      mockRates,
    );
    expect(result.longTermHoldingRate).toBe(0.06);
  });
});

// ============================================================
// T-44: 12억 경계 안분 정수 연산 (P0-1 회귀)
// ============================================================

// T-45용: 신축주택 감면 mock 생성 — reductionRate만 달라지는 구조를 팩토리로 통합
function makeNewHousingMatrixMock(reductionRate: number) {
  return {
    "transfer:deduction:new_housing_matrix": {
      taxType: "transfer",
      category: "deduction",
      subCategory: "new_housing_matrix",
      rateTable: null,
      deductionRules: {
        type: "new_housing_matrix",
        articles: [
          {
            code: "99-2",
            article: "§99 ②",
            acquisitionPeriod: { start: "2009-02-12", end: "2010-02-11" },
            region: "nationwide",
            maxAcquisitionPrice: 600_000_000,
            maxArea: 85,
            requiresFirstSale: false,
            requiresUnsoldCertificate: false,
            reductionScope: "tax_amount",
            reductionRate,
            fiveYearWindowRule: false,
            isExcludedFromHouseCount: false,
            isExcludedFromMultiHouseSurcharge: false,
          },
        ],
      },
      specialRules: null,
      effectiveDate: "2009-02-12",
      isActive: true,
    },
  };
}

// T-45에서 사용: 장기임대 100% 감면 (공공건설임대 — §97)
const LONG_TERM_RENTAL_100_RULES_MOCK = {
  "transfer:deduction:long_term_rental_v2": {
    taxType: "transfer",
    category: "deduction",
    subCategory: "long_term_rental_v2",
    rateTable: null,
    deductionRules: {
      type: "long_term_rental_v2",
      subTypes: [
        {
          code: "public_construction",
          lawArticle: "97",
          tiers: [
            { mandatoryYears: 5, reductionRate: 1.0, longTermDeductionRate: 0 },
          ],
          maxOfficialPrice: { capital: 300_000_000, non_capital: 300_000_000 },
          rentIncreaseLimit: 0.05,
        },
      ],
    },
    specialRules: null,
  },
};

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

// ============================================================
// T-45: 감면 중복배제 — 장기임대 + 신축 동시 해당 시 납세자 유리 1건 선택
// (조특법 §127 ②)
// ============================================================

describe("T-45: 감면 중복배제 — 장기임대 + 신축 동시 해당 (조특법 §127②)", () => {
  it("T-45a: 장기임대 50% vs 신축 80% → 80%(신축) 선택", () => {
    // 장기임대: long_term_private 8년 → 50%
    // 신축: §99② 80% (tax_amount 방식)
    const rentalDetails: RentalReductionInput = {
      isRegisteredLandlord: true,
      isTaxRegistered: true,
      registrationDate: new Date("2009-03-01"),
      rentalHousingType: "long_term_private",
      propertyType: "non_apartment",
      region: "non_capital",
      officialPriceAtStart: 200_000_000,
      rentalStartDate: new Date("2009-03-01"),
      transferDate: new Date("2024-06-01"),  // 15년+ → 8년 의무 충족
      vacancyPeriods: [],
      rentHistory: [],
      calculatedTax: 0,
    };

    const newHousingDetails: NewHousingReductionInput = {
      acquisitionDate: new Date("2009-06-01"),
      transferDate: new Date("2024-06-01"),
      region: "non_metropolitan",
      acquisitionPrice: 400_000_000,
      exclusiveAreaSquareMeters: 84,
      isFirstSale: false,
      hasUnsoldCertificate: false,
      totalCapitalGain: 0,
      calculatedTax: 0,
    };

    const rates = makeMockRates({
      ...LONG_TERM_RENTAL_RULES_MOCK,
      ...makeNewHousingMatrixMock(0.8),
    } as Partial<Record<TaxRateKey, object>>);

    const input = baseInput({
      transferPrice: 600_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2009-06-01"),
      transferDate: new Date("2024-06-01"),
      isOneHousehold: false,
      householdHousingCount: 3,
      reductions: [],
      rentalReductionDetails: rentalDetails,
      newHousingDetails,
    });

    const result = calculateTransferTax(input, rates);
    expect(result.isExempt).toBe(false);
    expect(result.calculatedTax).toBeGreaterThan(0);

    // 두 감면 모두 자격 충족
    expect(result.rentalReductionDetail).toBeDefined();
    expect(result.rentalReductionDetail?.isEligible).toBe(true);
    expect(result.rentalReductionDetail?.reductionRate).toBe(0.5);

    expect(result.newHousingReductionDetail).toBeDefined();
    expect(result.newHousingReductionDetail?.isEligible).toBe(true);
    expect(result.newHousingReductionDetail?.reductionRate).toBe(0.8);

    // 조특법 §127② 중복배제: 80%(신축) 선택
    const expectedReduction = Math.floor(result.calculatedTax * 0.8);
    expect(result.reductionAmount).toBe(expectedReduction);
    expect(result.reductionType).toBe("신축주택");
  });

  it("T-45b: 장기임대 100%(공공건설) vs 신축 50% → 100%(장기임대) 선택", () => {
    // 장기임대: public_construction 5년 → 100%
    // 신축: §99⑤ 50%
    const rentalDetails: RentalReductionInput = {
      isRegisteredLandlord: true,
      isTaxRegistered: true,
      registrationDate: new Date("2013-01-01"),
      rentalHousingType: "public_construction",
      propertyType: "non_apartment",
      region: "capital",
      officialPriceAtStart: 250_000_000,
      rentalStartDate: new Date("2013-04-01"),
      transferDate: new Date("2024-06-01"),  // 11년+ → 5년 의무 충족
      vacancyPeriods: [],
      rentHistory: [],
      calculatedTax: 0,
    };

    const newHousingDetails: NewHousingReductionInput = {
      acquisitionDate: new Date("2009-06-01"),
      transferDate: new Date("2024-06-01"),
      region: "non_metropolitan",
      acquisitionPrice: 400_000_000,
      exclusiveAreaSquareMeters: 84,
      isFirstSale: false,
      hasUnsoldCertificate: false,
      totalCapitalGain: 0,
      calculatedTax: 0,
    };

    const rates = makeMockRates({
      ...LONG_TERM_RENTAL_100_RULES_MOCK,
      ...makeNewHousingMatrixMock(0.5),
    } as Partial<Record<TaxRateKey, object>>);

    const input = baseInput({
      transferPrice: 600_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2013-06-01"),
      transferDate: new Date("2024-06-01"),
      isOneHousehold: false,
      householdHousingCount: 3,
      reductions: [],
      rentalReductionDetails: rentalDetails,
      newHousingDetails,
    });

    const result = calculateTransferTax(input, rates);
    expect(result.isExempt).toBe(false);
    expect(result.calculatedTax).toBeGreaterThan(0);

    // 두 감면 모두 자격 충족
    expect(result.rentalReductionDetail).toBeDefined();
    expect(result.rentalReductionDetail?.isEligible).toBe(true);
    expect(result.rentalReductionDetail?.reductionRate).toBe(1.0);

    expect(result.newHousingReductionDetail).toBeDefined();
    expect(result.newHousingReductionDetail?.isEligible).toBe(true);
    expect(result.newHousingReductionDetail?.reductionRate).toBe(0.5);

    // 조특법 §127② 중복배제: 100%(장기임대) 선택
    // 주의: 장기임대 100%는 연간한도(§133) 적용 가능 — 한도 적용 후 금액이 산출세액보다 클 수도 있음
    // 한도 적용 전 금액: calculatedTax × 1.0 = calculatedTax
    // 한도 적용 후: 1억 초과 시 1억 + (초과분 × 50%)
    // 어느 쪽이든 신축 50%보다 크므로 장기임대 선택
    expect(result.reductionAmount).toBeGreaterThan(Math.floor(result.calculatedTax * 0.5));
    expect(result.reductionType).toBe("장기임대주택");
  });
});

// ============================================================
// T-17: §114조의2 신축·증축 가산세
// ============================================================
