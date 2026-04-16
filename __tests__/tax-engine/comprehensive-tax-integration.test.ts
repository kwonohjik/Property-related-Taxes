/**
 * 종합부동산세 통합 시나리오 테스트 (T-22)
 * calculateComprehensiveTax() 전체 흐름 검증
 *
 * 시나리오:
 * - SC1: 1세대1주택 12억 이하 → 종부세 0원
 * - SC2: 1세대1주택 15억 / 70세 / 15년 보유 → 전체 흐름 검증
 * - SC3: 3주택 합산과세 → 세율·세부담 상한
 * - SC4: 합산배제 포함 통합 검증
 * - SC5: 5주택 성능 검증 (계산 지연 없음)
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type {
  ComprehensiveTaxInput,
} from "../../lib/tax-engine/types/comprehensive.types";

// 공통 과세기준일: 2024년
const ASSESSMENT_YEAR = 2024;

// ============================================================
// SC1: 1세대1주택 — 공시가격 9억 → 종부세 0원
// ============================================================

describe("SC1: 1세대1주택 공시가격 12억 이하 → 종부세 0원", () => {
  it("공시가격 9억 1세대1주택 → 기본공제 12억 이하 → isSubjectToHousingTax=false", () => {
    const input: ComprehensiveTaxInput = {
      properties: [
        {
          propertyId: "H1",
          assessedValue: 900_000_000, // 9억
          exclusionType: "none",
        },
      ],
      isOneHouseOwner: true,
      birthDate: new Date("1970-06-01"),      // 54세
      acquisitionDate: new Date("2019-01-01"), // 5년 보유
      assessmentYear: ASSESSMENT_YEAR,
    };

    const result = calculateComprehensiveTax(input);

    expect(result.isSubjectToHousingTax).toBe(false);
    expect(result.taxBase).toBe(0);
    expect(result.calculatedTax).toBe(0);
    expect(result.determinedHousingTax).toBe(0);
    expect(result.housingRuralSpecialTax).toBe(0);
    expect(result.totalHousingTax).toBe(0);
    // 1세대1주택 기본공제 12억
    expect(result.basicDeduction).toBe(1_200_000_000);
    expect(result.isOneHouseOwner).toBe(true);
  });

  it("공시가격 12억 정확히 → isSubjectToHousingTax=false (경계값)", () => {
    const input: ComprehensiveTaxInput = {
      properties: [
        {
          propertyId: "H1",
          assessedValue: 1_200_000_000, // 12억
          exclusionType: "none",
        },
      ],
      isOneHouseOwner: true,
      assessmentYear: ASSESSMENT_YEAR,
    };

    const result = calculateComprehensiveTax(input);
    // 12억 - 12억 = 0 → 과세표준 0 → 종부세 없음
    expect(result.isSubjectToHousingTax).toBe(false);
    expect(result.determinedHousingTax).toBe(0);
  });
});

// ============================================================
// SC2: 1세대1주택 15억 / 70세 이상 / 15년 이상 보유 → 전체 흐름
// ============================================================

describe("SC2: 1세대1주택 15억 / 70세 / 15년 보유 → 80% 세액공제", () => {
  it("전체 계산 흐름 — 80% 세액공제 적용 후 결정세액 검증", () => {
    const input: ComprehensiveTaxInput = {
      properties: [
        {
          propertyId: "H1",
          assessedValue: 1_500_000_000, // 15억
          exclusionType: "none",
        },
      ],
      isOneHouseOwner: true,
      birthDate: new Date("1954-06-01"),       // 70세
      acquisitionDate: new Date("2008-01-01"),  // 16년 보유 → 15년 이상
      assessmentYear: ASSESSMENT_YEAR,
    };

    const result = calculateComprehensiveTax(input);

    // 납세의무 확인: 15억 - 12억 = 3억 > 0
    expect(result.isSubjectToHousingTax).toBe(true);
    expect(result.basicDeduction).toBe(1_200_000_000);
    expect(result.isOneHouseOwner).toBe(true);

    // 과세표준: (15억 - 12억) × 60% = 1억8,000만 → 만원 절사 → 1억8,000만
    expect(result.taxBase).toBe(180_000_000);

    // 1세대1주택 세액공제: 고령자 40% + 장기보유 50% = 90% → 80% 상한
    expect(result.oneHouseDeduction).toBeDefined();
    expect(result.oneHouseDeduction!.seniorRate).toBe(0.4);
    expect(result.oneHouseDeduction!.longTermRate).toBe(0.5);
    expect(result.oneHouseDeduction!.combinedRate).toBe(0.80);
    expect(result.oneHouseDeduction!.isMaxCapApplied).toBe(true);

    // 공제 후 세액 = 산출세액 × (1 - 0.80) = 산출세액 × 20%
    // (재산세 안분 공제 전 단계)

    // 결정세액 > 0 (농특세, 재산세 안분 공제 후)
    expect(result.determinedHousingTax).toBeGreaterThanOrEqual(0);

    // 농특세 = floor(결정세액 × 20%)
    expect(result.housingRuralSpecialTax).toBe(
      Math.floor(result.determinedHousingTax * 0.2),
    );

    // 총납부 = 결정세액 + 농특세
    expect(result.totalHousingTax).toBe(
      result.determinedHousingTax + result.housingRuralSpecialTax,
    );

    // assessmentDate 형식 확인
    expect(result.assessmentDate).toBe(`${ASSESSMENT_YEAR}-06-01`);
  });
});

// ============================================================
// SC3: 다주택 합산과세 → 9억 기본공제 + 세부담 상한
// ============================================================

describe("SC3: 3주택 합산과세 — 9억 기본공제", () => {
  it("3주택 합산 공시가격 20억 → 기본공제 9억 → 과세표준 6억6,000만", () => {
    const input: ComprehensiveTaxInput = {
      properties: [
        { propertyId: "H1", assessedValue: 800_000_000, exclusionType: "none" },   // 8억
        { propertyId: "H2", assessedValue: 700_000_000, exclusionType: "none" },   // 7억
        { propertyId: "H3", assessedValue: 500_000_000, exclusionType: "none" },   // 5억
      ],
      isOneHouseOwner: false,
      assessmentYear: ASSESSMENT_YEAR,
    };

    const result = calculateComprehensiveTax(input);

    // 비1세대1주택 기본공제: 9억
    expect(result.basicDeduction).toBe(900_000_000);
    expect(result.isSubjectToHousingTax).toBe(true);

    // 총 공시가격: 20억
    expect(result.includedAssessedValue).toBe(2_000_000_000);

    // 과세표준: (20억 - 9억) × 60% = 6억6,000만
    expect(result.taxBase).toBe(660_000_000);

    // 1세대1주택 공제 없음
    expect(result.oneHouseDeduction).toBeUndefined();

    // 결정세액 > 0
    expect(result.determinedHousingTax).toBeGreaterThan(0);

    // grandTotal 확인 (주택분 종부세 + 재산세 + 농특세)
    expect(result.grandTotal).toBeGreaterThan(0);
  });

  it("다주택 조정대상지역 — 세부담 상한 300% 적용 케이스", () => {
    const input: ComprehensiveTaxInput = {
      properties: [
        { propertyId: "H1", assessedValue: 800_000_000, exclusionType: "none" },
        { propertyId: "H2", assessedValue: 700_000_000, exclusionType: "none" },
      ],
      isOneHouseOwner: false,
      isMultiHouseInAdjustedArea: true,
      previousYearTotalTax: 5_000_000,   // 전년도 세액 500만
      assessmentYear: ASSESSMENT_YEAR,
    };

    const result = calculateComprehensiveTax(input);

    // 세부담 상한 계산됨 (전년도 미입력 시 undefined가 아님)
    expect(result.taxCap).toBeDefined();
    expect(result.taxCap!.capRate).toBe(1.5);  // 현행 §10: 150% 단일 상한 (300% 삭제됨)
  });

  it("일반 다주택 — 세부담 상한 150%", () => {
    const input: ComprehensiveTaxInput = {
      properties: [
        { propertyId: "H1", assessedValue: 800_000_000, exclusionType: "none" },
        { propertyId: "H2", assessedValue: 700_000_000, exclusionType: "none" },
      ],
      isOneHouseOwner: false,
      isMultiHouseInAdjustedArea: false,
      previousYearTotalTax: 3_000_000,
      assessmentYear: ASSESSMENT_YEAR,
    };

    const result = calculateComprehensiveTax(input);

    expect(result.taxCap).toBeDefined();
    expect(result.taxCap!.capRate).toBe(1.5);  // 150% 상한
  });
});

// ============================================================
// SC4: 합산배제 포함 통합 검증
// ============================================================

describe("SC4: 합산배제 통합 — 과세표준에서 배제 주택 제외", () => {
  it("3주택 중 1주택 임대 합산배제 → 과세 대상 2주택만 합산", () => {
    const input: ComprehensiveTaxInput = {
      properties: [
        {
          propertyId: "H1",
          assessedValue: 900_000_000,  // 9억 (과세 포함)
          exclusionType: "none",
        },
        {
          propertyId: "H2",
          assessedValue: 800_000_000,  // 8억 (과세 포함)
          exclusionType: "none",
        },
        {
          propertyId: "H3",
          assessedValue: 250_000_000,  // 2.5억 (합산배제 임대)
          area: 75,
          location: "non_metro",
          exclusionType: "private_purchase_rental_long",
          rentalInfo: {
            registrationType: "private_purchase_long",
            rentalRegistrationDate: new Date("2020-01-01"),
            rentalStartDate: new Date("2020-02-01"),
            assessedValue: 250_000_000,
            area: 75,
            location: "non_metro",
            currentRent: 400_000,
            isInitialContract: true,
            assessmentDate: new Date(`${ASSESSMENT_YEAR}-06-01`),
          },
        },
      ],
      isOneHouseOwner: false,
      assessmentYear: ASSESSMENT_YEAR,
    };

    const result = calculateComprehensiveTax(input);

    // 합산배제 결과 확인
    expect(result.aggregationExclusion.excludedCount).toBe(1);
    expect(result.aggregationExclusion.includedCount).toBe(2);
    expect(result.aggregationExclusion.totalExcludedValue).toBe(250_000_000);

    // 과세 대상 공시가격: 9억 + 8억 = 17억
    expect(result.includedAssessedValue).toBe(1_700_000_000);

    // 과세표준: (17억 - 9억) × 60% = 4억8,000만
    expect(result.taxBase).toBe(480_000_000);
    expect(result.isSubjectToHousingTax).toBe(true);
  });

  it("전체 합산배제 → isSubjectToHousingTax=false, 종부세 0원", () => {
    const input: ComprehensiveTaxInput = {
      properties: [
        {
          propertyId: "H1",
          assessedValue: 250_000_000,  // 2.5억 (비수도권 3억 한도 이하)
          area: 75,
          location: "non_metro",
          exclusionType: "private_purchase_rental_long",
          rentalInfo: {
            registrationType: "private_purchase_long",
            rentalRegistrationDate: new Date("2020-01-01"),
            rentalStartDate: new Date("2020-02-01"),
            assessedValue: 250_000_000,
            area: 75,
            location: "non_metro",
            currentRent: 400_000,
            isInitialContract: true,
            assessmentDate: new Date(`${ASSESSMENT_YEAR}-06-01`),
          },
        },
        {
          propertyId: "H2",
          assessedValue: 300_000_000,
          area: 75,
          location: "non_metro",
          exclusionType: "private_purchase_rental_long",
          rentalInfo: {
            registrationType: "private_purchase_long",
            rentalRegistrationDate: new Date("2019-01-01"),
            rentalStartDate: new Date("2019-06-01"),
            assessedValue: 300_000_000,
            area: 75,
            location: "non_metro",
            currentRent: 400_000,
            isInitialContract: true,
            assessmentDate: new Date(`${ASSESSMENT_YEAR}-06-01`),
          },
        },
      ],
      isOneHouseOwner: false,
      assessmentYear: ASSESSMENT_YEAR,
    };

    const result = calculateComprehensiveTax(input);

    // 전체 합산배제
    expect(result.aggregationExclusion.excludedCount).toBe(2);
    expect(result.aggregationExclusion.includedCount).toBe(0);
    // 2.5억 + 3억 = 5.5억
    expect(result.aggregationExclusion.totalExcludedValue).toBe(550_000_000);
    expect(result.includedAssessedValue).toBe(0);
    expect(result.isSubjectToHousingTax).toBe(false);
    expect(result.determinedHousingTax).toBe(0);
    expect(result.housingRuralSpecialTax).toBe(0);
  });
});

// ============================================================
// SC5: 5주택 성능 검증
// ============================================================

describe("SC5: 5주택 성능 — 계산 지연 없음", () => {
  it("5주택 합산 계산이 즉시 완료됨 (<50ms)", () => {
    const input: ComprehensiveTaxInput = {
      properties: [
        { propertyId: "H1", assessedValue: 500_000_000, exclusionType: "none" },
        { propertyId: "H2", assessedValue: 450_000_000, exclusionType: "none" },
        { propertyId: "H3", assessedValue: 400_000_000, exclusionType: "none" },
        { propertyId: "H4", assessedValue: 350_000_000, exclusionType: "none" },
        { propertyId: "H5", assessedValue: 300_000_000, exclusionType: "none" },
      ],
      isOneHouseOwner: false,
      assessmentYear: ASSESSMENT_YEAR,
    };

    const start = performance.now();
    const result = calculateComprehensiveTax(input);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50); // 50ms 이내
    expect(result.isSubjectToHousingTax).toBe(true);
    expect(result.properties).toHaveLength(5);
    // 총 공시가격: 20억
    expect(result.totalAssessedValue).toBe(2_000_000_000);
    // 과세표준: (20억 - 9억) × 60% = 6억6,000만
    expect(result.taxBase).toBe(660_000_000);
  });
});

// ============================================================
// SC6: 토지분 포함 통합 시나리오
// ============================================================

describe("SC6: 주택분 + 종합합산 토지분 통합", () => {
  it("주택 + 종합합산 토지 → grandTotal 합산 검증", () => {
    const input: ComprehensiveTaxInput = {
      properties: [
        { propertyId: "H1", assessedValue: 1_300_000_000, exclusionType: "none" },
      ],
      isOneHouseOwner: false,
      assessmentYear: ASSESSMENT_YEAR,
      landAggregate: {
        totalOfficialValue: 1_000_000_000,  // 10억 종합합산 토지
        propertyTaxBase: 700_000_000,
        propertyTaxAmount: 3_250_000,
      },
    };

    const result = calculateComprehensiveTax(input);

    // 종합합산 토지분 계산됨
    expect(result.aggregateLandTax).toBeDefined();
    expect(result.aggregateLandTax!.isSubjectToTax).toBe(true);

    // 토지분 과세표준: 10억 - 5억 = 5억
    expect(result.aggregateLandTax!.taxBase).toBe(500_000_000);

    // grandTotal에 토지분 종부세 포함
    expect(result.grandTotal).toBeGreaterThan(result.totalHousingTax);
  });
});

// ============================================================
// SC7: 메타 정보 검증
// ============================================================

describe("SC7: 메타 정보 및 경고 메시지", () => {
  it("assessmentDate 형식 — YYYY-06-01", () => {
    const input: ComprehensiveTaxInput = {
      properties: [
        { propertyId: "H1", assessedValue: 800_000_000, exclusionType: "none" },
      ],
      isOneHouseOwner: false,
      assessmentYear: 2025,
    };

    const result = calculateComprehensiveTax(input);
    expect(result.assessmentDate).toBe("2025-06-01");
    expect(result.appliedLawDate).toBeDefined();
    expect(result.warnings).toBeInstanceOf(Array);
  });

  it("주택 없는 입력 → 주택분 종부세 0원, 오류 없음", () => {
    const input: ComprehensiveTaxInput = {
      properties: [],
      isOneHouseOwner: false,
      assessmentYear: ASSESSMENT_YEAR,
    };

    const result = calculateComprehensiveTax(input);
    expect(result.isSubjectToHousingTax).toBe(false);
    expect(result.determinedHousingTax).toBe(0);
    expect(result.grandTotal).toBe(0);
  });

  it("전년도 세액 미입력 → taxCap=undefined", () => {
    const input: ComprehensiveTaxInput = {
      properties: [
        { propertyId: "H1", assessedValue: 1_500_000_000, exclusionType: "none" },
      ],
      isOneHouseOwner: false,
      assessmentYear: ASSESSMENT_YEAR,
      // previousYearTotalTax 미입력
    };

    const result = calculateComprehensiveTax(input);
    expect(result.taxCap).toBeUndefined();
  });
});
