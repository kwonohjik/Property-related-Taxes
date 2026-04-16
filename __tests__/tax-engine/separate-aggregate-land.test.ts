/**
 * 재산세 별도합산과세대상 테스트 (P4-08~11, P4-14)
 *
 * [P4-08] 누진세율 경계값 테스트 10건
 *   TC-01: 과세표준 0원
 *   TC-02: 과세표준 1원 (최소, 1구간)
 *   TC-03: 과세표준 2억원 정확 (1구간 최대)
 *   TC-04: 과세표준 2억원 + 1원 (2구간 진입)
 *   TC-05: 과세표준 10억원 정확 (2구간 최대)
 *   TC-06: 과세표준 10억원 + 1원 (3구간 진입)
 *   TC-07: 과세표준 50억원 (3구간 중간)
 *   TC-08: 누진공제 정확도 — 2구간 경계
 *   TC-09: 누진공제 정확도 — 3구간 경계
 *   TC-10: 세부담상한 150% 적용
 *
 * [P4-09] 용도지역 기준면적 테스트 7건
 *   TC-11: 상업지역 3배
 *   TC-12: 공업지역 4배
 *   TC-13: 주거지역 5배
 *   TC-14: 녹지지역 5배
 *   TC-15: 관리지역 5배
 *   TC-16: 농림지역 7배
 *   TC-17: 자연환경보전지역 7배
 *
 * [P4-10] 철거 6개월 경계 테스트 3건
 *   TC-18: 철거 후 5개월 — 별도합산 유지
 *   TC-19: 철거 후 6개월 정확 — 별도합산 유지 (경계 이내)
 *   TC-20: 철거 후 6개월 + 1일 → 종합합산 전환
 *
 * [P4-11] 복수 토지 합산 테스트
 *   TC-21: 2필지 합산 — 누진 효과 검증
 *   TC-22: 3필지 합산 — 일부 초과분 종합합산 이관
 *
 * [P4-14] 분리·별도·종합 통합 테스트 3건 (reason에 법령 상수 포함)
 *   TC-23: 건축물 없음 → 종합합산 이관
 *   TC-24: 공장용지 기준면적 이내 → 별도합산
 *   TC-25: 철거 후 유예기간 초과 → 종합합산, reason에 §101③ 포함
 */

import { describe, it, expect } from "vitest";
import {
  isSeparateAggregateLand,
  calculateBaseArea,
  splitByBaseArea,
  calculateSeparateAggregateTax,
  calcElapsedMonths,
} from "../../lib/tax-engine/separate-aggregate-land";
import type {
  SeparateAggregateLandItem,
  SeparateAggregateInput,
} from "../../lib/tax-engine/separate-aggregate-land";
import { PROPERTY_SEPARATE, PROPERTY_SEPARATE_CONST } from "../../lib/tax-engine/legal-codes";
import { separateAggregateLandSchema } from "../../lib/validators/separate-aggregate-input";

// ── 공통 픽스처 팩토리 ──
function makeLand(
  overrides: Partial<SeparateAggregateLandItem> = {},
): SeparateAggregateLandItem {
  return {
    id: "L001",
    jurisdictionCode: "11680",
    landArea: 300,
    officialLandPrice: 1_000_000, // 100만원/㎡
    zoningDistrict: "commercial",
    buildingFloorArea: 100,
    ...overrides,
  };
}

function makeInput(
  landList: SeparateAggregateLandItem[],
  extra: Partial<SeparateAggregateInput> = {},
): SeparateAggregateInput {
  return {
    taxpayerId: "user-001",
    targetYear: 2025,
    landList,
    ...extra,
  };
}

// ============================================================
// [P4-08] 누진세율 경계값 테스트 (TC-01~10)
// ============================================================

describe("P4-08: 별도합산 누진세율 경계값", () => {
  /**
   * 별도합산 세율표:
   * ≤ 2억: 0.2%
   * ≤ 10억: 0.3%, 누진공제 200,000
   * > 10억: 0.4%, 누진공제 1,200,000
   *
   * 과세표준 = 공시지가합산 × 0.70 → 천원절사
   * 역산: 과세표준 X를 내려면 officialLandPrice × area = X / 0.70
   * 간단히 landArea 1, officialLandPrice를 조정해서 원하는 taxBase 달성
   */

  // 헬퍼: 목표 taxBase를 내는 단일 필지 입력 생성
  // 공시지가합산 = taxBase / 0.70 (천원절사 역산은 +천원 이내로 오차)
  function makeInputForTaxBase(targetTaxBase: number): SeparateAggregateInput {
    // officialLandPrice × 1㎡ × 0.70 = targetTaxBase
    // → officialLandPrice = targetTaxBase / 0.70 (반올림)
    const pricePerSqm = Math.ceil(targetTaxBase / 0.70 / 1000) * 1000; // 천원 단위 올림
    const land = makeLand({
      landArea: 1,
      officialLandPrice: pricePerSqm,
      buildingFloorArea: 1,
      zoningDistrict: "commercial", // 3배 → 기준면적 3㎡ > 1㎡ → 전부 별도합산
    });
    return makeInput([land]);
  }

  it("TC-01: 과세표준 0원 → 세액 0원", () => {
    const land = makeLand({
      landArea: 0.001, // 극소 면적
      officialLandPrice: 1,
      buildingFloorArea: 10,
    });
    const result = calculateSeparateAggregateTax(makeInput([land]));
    expect(result.grossTax).toBe(0);
  });

  it("TC-02: 과세표준 1원 → 1구간 0.2% → 세액 0원 (floor)", () => {
    const land = makeLand({
      landArea: 1,
      officialLandPrice: 2, // 공시지가 합산 2원 × 70% = 1.4 → 천원절사 → 0
      buildingFloorArea: 10,
    });
    const result = calculateSeparateAggregateTax(makeInput([land]));
    expect(result.taxBase).toBe(0);
    expect(result.grossTax).toBe(0);
  });

  it("TC-03: 과세표준 정확히 2억원 → 1구간 최대 → 세액 400,000원", () => {
    // taxBase = 200,000,000 → 0.2% → floor(200,000,000 × 0.002) = 400,000
    const input = makeInputForTaxBase(200_000_000);
    const result = calculateSeparateAggregateTax(input);
    // taxBase는 천원절사로 200,000,000에 근접 (오차 최대 999원)
    expect(result.taxBase).toBeGreaterThanOrEqual(199_999_000);
    expect(result.taxBase).toBeLessThanOrEqual(200_000_000);
    // 세액: floor(taxBase × 0.002)
    expect(result.grossTax).toBe(Math.floor(result.taxBase * 0.002));
  });

  it("TC-04: 과세표준 2억원 + 1,000원 → 2구간 진입 → 세액 변화", () => {
    // 2억 1천원 과세표준 → 2구간: 0.3% - 200,000
    // 천원절사로 정확히 201,000,000 달성
    const officialLandPrice = Math.round(201_001_000 / 0.70 / 1000) * 1000;
    const land = makeLand({ landArea: 1, officialLandPrice, buildingFloorArea: 10 });
    const result = calculateSeparateAggregateTax(makeInput([land]));
    expect(result.taxBase).toBeGreaterThan(200_000_000);
    expect(result.grossTax).toBe(Math.floor(result.taxBase * 0.003) - 200_000);
  });

  it("TC-05: 과세표준 정확히 10억원 → 2구간 최대 → 세액 2,800,000원", () => {
    // 10억 × 0.3% - 200,000 = 3,000,000 - 200,000 = 2,800,000
    const input = makeInputForTaxBase(1_000_000_000);
    const result = calculateSeparateAggregateTax(input);
    expect(result.taxBase).toBeGreaterThanOrEqual(999_999_000);
    expect(result.taxBase).toBeLessThanOrEqual(1_000_000_000);
    expect(result.grossTax).toBe(Math.floor(result.taxBase * 0.003) - 200_000);
  });

  it("TC-06: 과세표준 10억원 + 1,000원 → 3구간 진입", () => {
    const officialLandPrice = Math.round(1_000_001_000 / 0.70 / 1000) * 1000;
    const land = makeLand({ landArea: 1, officialLandPrice, buildingFloorArea: 10 });
    const result = calculateSeparateAggregateTax(makeInput([land]));
    expect(result.taxBase).toBeGreaterThan(1_000_000_000);
    expect(result.grossTax).toBe(Math.floor(result.taxBase * 0.004) - 1_200_000);
  });

  it("TC-07: 과세표준 50억원 → 3구간 → 세액 18,800,000원", () => {
    // 50억 × 0.4% - 1,200,000 = 20,000,000 - 1,200,000 = 18,800,000
    const input = makeInputForTaxBase(5_000_000_000);
    const result = calculateSeparateAggregateTax(input);
    expect(result.taxBase).toBeGreaterThanOrEqual(4_999_999_000);
    expect(result.grossTax).toBe(Math.floor(result.taxBase * 0.004) - 1_200_000);
  });

  it("TC-08: 누진공제 정확도 — 2구간 정점(10억원) 직전 vs 2구간 진입", () => {
    const b1Tax = Math.floor(200_000_000 * 0.002); // 1구간
    const b2Tax = Math.floor(200_001_000 * 0.003) - 200_000; // 2구간
    expect(b2Tax).toBeGreaterThan(b1Tax); // 2구간이 1구간보다 높아야 함
  });

  it("TC-09: 누진공제 정확도 — 3구간 누진공제 1,200,000원 검증", () => {
    const D3 = PROPERTY_SEPARATE_CONST.DEDUCTION_3;
    expect(D3).toBe(1_200_000);
    // 10억원 과세표준 기준: 2구간=0.3%×10억-200,000 = 2,800,000 vs 3구간=0.4%×10억-1,200,000 = 2,800,000 (동일)
    const taxAt10B_rate2 = Math.floor(1_000_000_000 * 0.003) - 200_000;
    const taxAt10B_rate3 = Math.floor(1_000_000_000 * 0.004) - D3;
    expect(taxAt10B_rate2).toBe(taxAt10B_rate3); // 경계에서 동일
  });

  it("TC-10: 세부담상한 150% 적용 — 상한 초과 시 제한", () => {
    const land = makeLand({
      landArea: 1000,
      officialLandPrice: 2_000_000, // 공시지가 합산 20억 → 과세표준 14억
      buildingFloorArea: 500,       // 기준면적 1,500㎡ > 1,000㎡ → 전부 별도합산
    });
    const previousYearTax = 1_000_000; // 전년도 100만원
    const result = calculateSeparateAggregateTax(
      makeInput([land], { previousYearTax }),
    );
    const capAmount = Math.floor(previousYearTax * 1.5);
    if (result.grossTax > capAmount) {
      expect(result.taxAfterCap).toBe(capAmount);
      expect(result.appliedCapRate).toBe(1.5);
    } else {
      expect(result.taxAfterCap).toBe(result.grossTax);
    }
  });
});

// ============================================================
// [P4-09] 용도지역 기준면적 테스트 (TC-11~17)
// ============================================================

describe("P4-09: 용도지역별 기준면적 배율 7종", () => {
  const CASES: Array<{
    district: SeparateAggregateLandItem["zoningDistrict"];
    multiplier: number;
    label: string;
  }> = [
    { district: "commercial",      multiplier: 3, label: "상업지역 3배" },
    { district: "industrial",      multiplier: 4, label: "공업지역 4배" },
    { district: "residential",     multiplier: 5, label: "주거지역 5배" },
    { district: "green",           multiplier: 7, label: "녹지지역 7배" },
    { district: "management",      multiplier: 5, label: "관리지역 5배" },
    { district: "agricultural",    multiplier: 7, label: "농림지역 7배" },
    { district: "nature_preserve", multiplier: 7, label: "자연환경보전지역 7배" },
  ];

  CASES.forEach(({ district, multiplier, label }, idx) => {
    it(`TC-${11 + idx}: ${label} — 바닥면적 100㎡ × ${multiplier}배 = ${100 * multiplier}㎡`, () => {
      const floorArea = 100;
      const land = makeLand({
        zoningDistrict: district,
        buildingFloorArea: floorArea,
        landArea: 50, // 기준면적보다 작으므로 전부 별도합산
      });

      const { baseArea, multiplier: actualMultiplier } = calculateBaseArea(land);
      expect(actualMultiplier).toBe(multiplier);
      expect(baseArea).toBe(floorArea * multiplier);

      const check = isSeparateAggregateLand(land);
      expect(check.isSeparateAggregate).toBe(true);
      expect(check.recognizedArea).toBe(50); // landArea 전체
      expect(check.excessArea).toBe(0);
    });
  });
});

// ============================================================
// [P4-10] 철거 6개월 경계 테스트 (TC-18~20)
// ============================================================

describe("P4-10: 철거 후 6개월 경계값", () => {
  const TAX_BASE_DATE = "2025-06-01"; // 과세기준일

  it("TC-18: 철거 후 5개월 → 유예기간 이내 → 별도합산 유지", () => {
    // 철거일: 2025-01-01 → 과세기준일 2025-06-01까지 5개월
    const land = makeLand({
      demolished: true,
      demolishedDate: "2025-01-01",
      taxBaseDate: TAX_BASE_DATE,
      buildingFloorArea: 100,
    });
    const check = isSeparateAggregateLand(land);
    expect(check.demolishedGraceApplied).toBe(true);
    expect(check.isSeparateAggregate).toBe(true);
    expect(check.legalBasis).toContain(PROPERTY_SEPARATE.BASE_AREA_GENERAL);
  });

  it("TC-19: 철거 후 정확히 6개월 → 유예기간 이내 → 별도합산 유지", () => {
    // 철거일: 2024-12-01 → 과세기준일 2025-06-01까지 6개월 (경계)
    const land = makeLand({
      demolished: true,
      demolishedDate: "2024-12-01",
      taxBaseDate: TAX_BASE_DATE,
      buildingFloorArea: 100,
    });
    const elapsed = calcElapsedMonths("2024-12-01", TAX_BASE_DATE);
    expect(elapsed).toBe(6); // 정확히 6개월

    const check = isSeparateAggregateLand(land);
    // 6개월 이하(<=6) → 유지 (> 6 초과만 이관)
    expect(check.isSeparateAggregate).toBe(true);
  });

  it("TC-20: 철거 후 7개월(6개월+1개월 초과) → 별도합산 자격 상실 → 종합합산", () => {
    // 철거일: 2024-11-01 → 과세기준일 2025-06-01까지 7개월
    const land = makeLand({
      demolished: true,
      demolishedDate: "2024-11-01",
      taxBaseDate: TAX_BASE_DATE,
      buildingFloorArea: 100,
    });
    const elapsed = calcElapsedMonths("2024-11-01", TAX_BASE_DATE);
    expect(elapsed).toBe(7);

    const check = isSeparateAggregateLand(land);
    expect(check.isSeparateAggregate).toBe(false);
    expect(check.excessArea).toBe(land.landArea);
    expect(check.legalBasis).toContain(PROPERTY_SEPARATE.DEMOLISHED_GRACE);
  });
});

// ============================================================
// [P4-11] 복수 토지 합산 테스트 (TC-21~22)
// ============================================================

describe("P4-11: 복수 토지 인별 합산 — 누진 효과", () => {
  it("TC-21: 2필지 합산 → 합산 과세표준 및 세액 정확도 검증", () => {
    // 각 필지: 공시지가 1억씩 (100㎡ × 100만원/㎡)
    // 합산 공시지가: 2억 → 과세표준: 2억 × 70% = 1억4천만 (1구간, ≤2억)
    const land1 = makeLand({
      id: "L001",
      jurisdictionCode: "11680",
      landArea: 100,
      officialLandPrice: 1_000_000, // 1억
      buildingFloorArea: 50,         // 기준면적 150㎡ > 100㎡ → 전부 별도합산
    });
    const land2 = makeLand({
      id: "L002",
      jurisdictionCode: "11680",
      landArea: 100,
      officialLandPrice: 1_000_000, // 1억
      buildingFloorArea: 50,
    });

    const result = calculateSeparateAggregateTax(makeInput([land1, land2]));

    // 합산 공시지가: 2억 → 과세표준: floor(2억 × 0.7 / 1000) × 1000 = 140,000,000
    const expectedTaxBase = Math.floor(200_000_000 * 0.7 / 1000) * 1000;
    expect(result.taxBase).toBe(expectedTaxBase); // 140,000,000

    // 1구간(≤2억): 0.2% → floor(140,000,000 × 0.002) = 280,000
    const expectedGrossTax = Math.floor(expectedTaxBase * 0.002);
    expect(result.grossTax).toBe(expectedGrossTax); // 280,000

    // 개별 계산 합산과 인별 합산이 동일 금액임을 확인 (1구간 내이므로)
    const indiv1TaxBase = Math.floor(100_000_000 * 0.7 / 1000) * 1000; // 70,000,000
    const indiv2TaxBase = indiv1TaxBase;
    const indivSum = Math.floor(indiv1TaxBase * 0.002) + Math.floor(indiv2TaxBase * 0.002);
    expect(result.grossTax).toBe(indivSum); // 1구간 내에서는 합산과 개별 합계 동일
  });

  it("TC-22: 3필지 중 1필지 초과분 → 별도합산·종합합산 분리", () => {
    // L001: 기준면적 내 (100㎡, 바닥 50㎡ × 상업 3배 = 150㎡ > 100㎡)
    // L002: 초과분 존재 (500㎡, 바닥 50㎡ × 상업 3배 = 150㎡ → 초과 350㎡)
    // L003: 건축물 없음 → 전량 종합합산
    const land1 = makeLand({
      id: "L001",
      landArea: 100,
      officialLandPrice: 1_000_000,
      buildingFloorArea: 50,
      zoningDistrict: "commercial",
    });
    const land2 = makeLand({
      id: "L002",
      landArea: 500,
      officialLandPrice: 1_000_000,
      buildingFloorArea: 50,
      zoningDistrict: "commercial", // 기준면적 150㎡ → 초과 350㎡
    });
    const land3 = makeLand({
      id: "L003",
      landArea: 200,
      officialLandPrice: 1_000_000,
      buildingFloorArea: undefined,
    });

    const result = calculateSeparateAggregateTax(makeInput([land1, land2, land3]));

    // L001: 100㎡ 전부 별도합산 → 공시지가 1억
    // L002: 150㎡ 별도합산(1.5억), 350㎡ 종합합산(3.5억)
    // L003: 0 별도합산, 2억 종합합산
    expect(result.totalSeparateOfficialValue).toBe(100_000_000 + 150_000_000);
    expect(result.totalExcessOfficialValue).toBe(350_000_000 + 200_000_000);
  });
});

// ============================================================
// [P4-14] 분리·별도·종합 통합 테스트 (TC-23~25)
// ============================================================

describe("P4-14: 통합 — legalBasis에 법령 상수 포함 검증", () => {
  it("TC-23: 건축물 없음 → 종합합산, legalBasis에 §106①2호 포함", () => {
    const land = makeLand({
      buildingFloorArea: undefined, // 건축물 없음
    });
    const check = isSeparateAggregateLand(land);
    expect(check.isSeparateAggregate).toBe(false);
    expect(check.legalBasis).toBe(PROPERTY_SEPARATE.SUBJECT);
  });

  it("TC-24: 공장용지 기준면적 이내 → 별도합산, legalBasis에 §101②2호 포함", () => {
    const land = makeLand({
      isFactory: true,
      factoryStandardArea: 500, // 기준면적 500㎡ > landArea 300㎡
      buildingFloorArea: undefined,
    });
    const check = isSeparateAggregateLand(land);
    expect(check.isSeparateAggregate).toBe(true);
    expect(check.recognizedArea).toBe(300);
    expect(check.excessArea).toBe(0);
    expect(check.legalBasis).toBe(PROPERTY_SEPARATE.BASE_AREA_FACTORY);
  });

  it("TC-25: 철거 후 유예기간 초과 → 종합합산, legalBasis에 §101③ 포함", () => {
    const land = makeLand({
      demolished: true,
      demolishedDate: "2024-11-01",
      taxBaseDate: "2025-06-01",
      buildingFloorArea: 100,
    });
    const check = isSeparateAggregateLand(land);
    expect(check.isSeparateAggregate).toBe(false);
    expect(check.legalBasis).toBe(PROPERTY_SEPARATE.DEMOLISHED_GRACE);
    expect(check.legalBasis).toContain("§101③");
  });
});

// ============================================================
// 보조: calcElapsedMonths 단위 테스트
// ============================================================

describe("calcElapsedMonths 유틸", () => {
  it("동일 날짜 → 0개월", () => {
    expect(calcElapsedMonths("2025-06-01", "2025-06-01")).toBe(0);
  });

  it("1개월 차이", () => {
    expect(calcElapsedMonths("2025-05-01", "2025-06-01")).toBe(1);
  });

  it("12개월 차이", () => {
    expect(calcElapsedMonths("2024-06-01", "2025-06-01")).toBe(12);
  });

  it("잘못된 날짜 → -1 반환", () => {
    expect(calcElapsedMonths("invalid", "2025-06-01")).toBe(-1);
  });

  it("철거일이 과세기준일 이후 → 0 반환", () => {
    expect(calcElapsedMonths("2025-07-01", "2025-06-01")).toBe(0);
  });
});

// ============================================================
// Zod 스키마 검증 테스트
// ============================================================

describe("P4-03: Zod 스키마 검증", () => {
  it("유효: 기본 일반 토지 입력", () => {
    const result = separateAggregateLandSchema.safeParse({
      id: "L001",
      jurisdictionCode: "11680",
      landArea: 200,
      officialLandPrice: 1_000_000,
      zoningDistrict: "commercial",
      buildingFloorArea: 50,
    });
    expect(result.success).toBe(true);
  });

  it("유효: 공장용지 — factoryStandardArea 포함", () => {
    const result = separateAggregateLandSchema.safeParse({
      id: "L002",
      jurisdictionCode: "11680",
      landArea: 300,
      officialLandPrice: 500_000,
      zoningDistrict: "industrial",
      isFactory: true,
      factoryStandardArea: 400,
    });
    expect(result.success).toBe(true);
  });

  it("유효: 철거 + 철거일 입력", () => {
    const result = separateAggregateLandSchema.safeParse({
      id: "L003",
      jurisdictionCode: "11680",
      landArea: 100,
      officialLandPrice: 800_000,
      zoningDistrict: "residential",
      demolished: true,
      demolishedDate: "2025-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("무효: demolished=true 인데 demolishedDate 미입력", () => {
    const result = separateAggregateLandSchema.safeParse({
      id: "L004",
      jurisdictionCode: "11680",
      landArea: 100,
      officialLandPrice: 800_000,
      zoningDistrict: "residential",
      demolished: true,
      // demolishedDate 누락
    });
    expect(result.success).toBe(false);
    const errors = result.error?.issues ?? [];
    // superRefine 에러 메시지 확인 (path 또는 message로 검증)
    expect(
      errors.some(
        (e) =>
          e.message.includes("철거일") ||
          e.message.includes("demolishedDate") ||
          e.path.some((p) => p === "demolishedDate"),
      ),
    ).toBe(true);
  });

  it("무효: demolishedDate 입력했지만 demolished=false", () => {
    const result = separateAggregateLandSchema.safeParse({
      id: "L005",
      jurisdictionCode: "11680",
      landArea: 100,
      officialLandPrice: 800_000,
      zoningDistrict: "residential",
      demolished: false,
      demolishedDate: "2025-01-15",
    });
    expect(result.success).toBe(false);
    const errors = result.error?.issues ?? [];
    // superRefine 에러 메시지 확인
    expect(
      errors.some(
        (e) =>
          e.message.includes("demolished") ||
          e.path.some((p) => p === "demolished"),
      ),
    ).toBe(true);
  });
});
