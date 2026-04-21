/**
 * 양도소득세 — 장기임대·신축 감면 + 1세대1주택 비과세 (T-27~T-39) 테스트
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
// T-37: 1세대1주택 보유 2년 + 거주 2년 → 일반·특례 모두 미적용 (3년 미만)
// ============================================================

describe("T-37: 1세대1주택 보유 2년 → 장기보유특별공제 전부 미적용 (3년 미만)", () => {
  it("보유 2년, 거주 2년 → 공제율 0% (일반·특례 모두 3년 이상 요건 미충족)", () => {
    // 보유 2년 < 3년 → 1세대1주택 특례·일반 공제 모두 미적용 (소득세법 §95②)
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
    expect(result.longTermHoldingRate).toBe(0);
    expect(result.longTermHoldingDeduction).toBe(0);
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
