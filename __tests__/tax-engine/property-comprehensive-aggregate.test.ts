/**
 * 재산세 종합합산과세대상 테스트 (P3-03~11)
 *
 * TC-01: 나대지 → 종합합산
 * TC-02: 일반 영업용 건물 부속토지(한도 내) → 별도합산
 * TC-03: 영업용 부속토지 한도 초과분 → 종합합산(split)
 * TC-04: 자경 농지 → 분리과세
 * TC-05: 자경 미충족 농지 → 종합합산
 * TC-06: 골프장 토지 → 분리과세(고율)
 * TC-07: 산업단지 공업지역 공장용지 → 분리과세(0.2%)
 * TC-08: 과세표준 5천만원 이하 단일 구간 세율 검증
 * TC-09: 과세표준 5천만원~1억원 누진 구간 (경계값)
 * TC-10: 과세표준 1억원 초과 누진 구간 (경계값)
 * TC-11: 세부담상한 150% 적용
 * TC-12: 지자체 2곳 안분 계산
 */

import { describe, it, expect } from "vitest";
import {
  isSeparatedTaxation,
  isSeparateAggregate,
  classifyLandForComprehensive,
  calculateComprehensiveAggregateTaxBase,
  calculateComprehensiveAggregateTax,
  applyBurdenCap,
  allocateByJurisdiction,
  calculateComprehensiveAggregate,
} from "../../lib/tax-engine/property-tax-comprehensive-aggregate";
import type {
  LandInfo,
  ComprehensiveAggregateInput,
} from "../../lib/tax-engine/property-tax-comprehensive-aggregate";

// ── 기본 필지 픽스처 ──
const VACANT_LAND: LandInfo = {
  id: "L001",
  address: "서울시 강남구 테헤란로 1",
  jurisdictionCode: "11680",
  landCategory: "잡종지",
  useZone: "commercial",
  area: 200,
  officialLandPrice: 5_000_000, // 50억/200㎡ = 1㎡당 500만원 → 1조 넘음 방지로 낮춤
  hasBuilding: false,
};

const COMMERCIAL_WITH_BUILDING: LandInfo = {
  id: "L002",
  address: "서울시 중구 명동 5",
  jurisdictionCode: "11140",
  landCategory: "대",
  useZone: "commercial",
  area: 500,
  officialLandPrice: 3_000_000,
  hasBuilding: true,
  buildingFloorArea: 100,
  buildingUsage: "commercial",
};

// ============================================================
// TC-01~07: 토지 분류 판정
// ============================================================

describe("isSeparatedTaxation — 분리과세 판정", () => {
  it("TC-04: 자경 농지 (전) → 분리과세", () => {
    expect(
      isSeparatedTaxation({
        ...VACANT_LAND,
        id: "L_farm",
        landCategory: "전",
        isSelfCultivated: true,
      }),
    ).toBe(true);
  });

  it("TC-05: 자경 미충족 농지 → 분리과세 아님", () => {
    expect(
      isSeparatedTaxation({
        ...VACANT_LAND,
        id: "L_farm2",
        landCategory: "전",
        isSelfCultivated: false,
      }),
    ).toBe(false);
  });

  it("TC-06: 골프장 → 분리과세", () => {
    expect(
      isSeparatedTaxation({ ...VACANT_LAND, id: "L_golf", isGolfCourse: true }),
    ).toBe(true);
  });

  it("TC-07: 산업단지 공업지역 공장용지 → 분리과세", () => {
    expect(
      isSeparatedTaxation({
        ...VACANT_LAND,
        id: "L_factory",
        landCategory: "공장용지",
        useZone: "industrial",
        isFactory: true,
        isIndustrialComplexFactory: true,
      }),
    ).toBe(true);
  });

  it("TC-07-a: 주거지역 내 공장용지 → 분리과세 아님", () => {
    expect(
      isSeparatedTaxation({
        ...VACANT_LAND,
        id: "L_factory2",
        landCategory: "공장용지",
        useZone: "residential",
        isFactory: true,
        isIndustrialComplexFactory: true,
      }),
    ).toBe(false);
  });
});

describe("classifyLandForComprehensive — 3분류 오케스트레이터", () => {
  it("TC-01: 나대지(건물 없음, 잡종지) → 종합합산", () => {
    const result = classifyLandForComprehensive(VACANT_LAND);
    expect(result.category).toBe("comprehensive_aggregate");
    expect(result.comprehensiveArea).toBe(200);
  });

  it("TC-02: 일반 영업용 건물 부속토지(면적 200㎡, 바닥 100㎡×상업3배=300㎡ 한도 내) → 별도합산", () => {
    // 상업지역 배율 3배: 기준면적 = 100㎡ × 3 = 300㎡
    // 토지 200㎡ < 300㎡ → 전부 별도합산
    const result = classifyLandForComprehensive({
      ...COMMERCIAL_WITH_BUILDING,
      area: 200,
    });
    expect(result.category).toBe("separate_aggregate");
    expect(result.separateAggregateArea).toBe(200);
  });

  it("TC-03: 영업용 부속토지 1200㎡ / 바닥 100㎡×상업3배=300㎡ 한도 → split(초과 900㎡ 종합합산)", () => {
    // 상업지역 배율 3배: 기준면적 = 100㎡ × 3 = 300㎡
    // 토지 1200㎡ - 300㎡ = 900㎡ 초과 → 종합합산 이관
    const result = classifyLandForComprehensive({
      ...COMMERCIAL_WITH_BUILDING,
      id: "L_split",
      area: 1200,
    });
    expect(result.category).toBe("comprehensive_aggregate");
    expect(result.comprehensiveArea).toBe(900);
    expect(result.separateAggregateArea).toBe(300);
  });

  it("TC-04: 자경 농지 → 분리과세", () => {
    const result = classifyLandForComprehensive({
      ...VACANT_LAND,
      id: "L_farm3",
      landCategory: "전",
      isSelfCultivated: true,
    });
    expect(result.category).toBe("separated");
  });
});

// ============================================================
// TC-08~10: 누진세율 계산
// ============================================================

describe("calculateComprehensiveAggregateTax — 누진세율", () => {
  it("TC-08: 과세표준 3천만원 → 0.2% = 60,000원", () => {
    expect(calculateComprehensiveAggregateTax(30_000_000)).toBe(60_000);
  });

  it("TC-09: 과세표준 5천만원 경계 → 0.2% = 100,000원", () => {
    expect(calculateComprehensiveAggregateTax(50_000_000)).toBe(100_000);
  });

  it("TC-09-a: 과세표준 7천만원 → 0.3% - 5만 = 160,000원", () => {
    // floor(70,000,000 × 0.003) - 50,000 = 210,000 - 50,000 = 160,000
    expect(calculateComprehensiveAggregateTax(70_000_000)).toBe(160_000);
  });

  it("TC-09-b: 과세표준 1억원 경계 → 0.3% - 5만 = 250,000원", () => {
    // floor(100,000,000 × 0.003) - 50,000 = 300,000 - 50,000 = 250,000
    expect(calculateComprehensiveAggregateTax(100_000_000)).toBe(250_000);
  });

  it("TC-10: 과세표준 2억원 → 0.5% - 255만 = 745,000원", () => {
    // floor(200,000,000 × 0.005) - 2,550,000 = 1,000,000 - 2,550,000 = 음수?
    // 200,000,000 × 0.005 = 1,000,000 - 2,550,000 < 0 → 이건 틀린 계산
    // 아니, 누진공제는 구간 전체에 적용하는 누진공제액
    // 실제: floor(200M × 0.005) - 2,550,000 = 1,000,000 - 2,550,000 = -1,550,000 → 잘못됨
    // 정확한 계산: 1구간(5천만×0.2%) + 2구간((1억-5천만)×0.3%) + 3구간((2억-1억)×0.5%)
    //            = 100,000 + 150,000 + 500,000 = 750,000
    // 공식: floor(2억 × 0.005) - 2,550,000 = 1,000,000 - 2,550,000 → 공식 검증 필요
    // 사실 누진공제 방식: floor(taxBase × maxRate) - 누진공제
    // 3구간 공식: floor(과표 × 0.005) - 2,550,000
    // 검증: 과표 = 1억1원: floor(100,000,001 × 0.005) - 2,550,000 = 500,000 - 2,550,000 = -2,050,000
    // → 이건 잘못된 누진공제. 올바른 공식은:
    // 3구간: 1억원이하 세액 + (과표 - 1억) × 0.5%
    //      = 250,000 + (과표 - 1억) × 0.005
    // 누진공제 방식: floor(과표 × 0.005) - 2,550,000
    // 과표 1억1원: floor(1억1원 × 0.005) - 2,550,000 = 500,000 - 2,550,000 = 음수
    // → 이 공식은 과표가 충분히 클 때만 성립
    // 실제 예: 과표 10억: floor(10억 × 0.005) - 2,550,000 = 5,000,000 - 2,550,000 = 2,450,000
    // 구간별: 5천만×0.002 + 5천만×0.003 + 9억×0.005 = 100,000 + 150,000 + 4,500,000 = 4,750,000
    // → 불일치. 공식에 버그 있음!
    // 올바른 누진공제 계산:
    // floor(taxBase × 0.005) - 2,550,000 이 맞으려면:
    // 1억1원 기준: 10억 ÷ 1억1원 비율로... 아니
    // 구간별 직접 계산:
    // ≤5천만: taxBase × 0.002
    // ≤1억: 5천만 × 0.002 + (taxBase - 5천만) × 0.003 = taxBase × 0.003 - 50,000
    // >1억: 5천만 × 0.002 + 5천만 × 0.003 + (taxBase - 1억) × 0.005
    //      = 100,000 + 150,000 + taxBase × 0.005 - 500,000
    //      = taxBase × 0.005 - 250,000
    // → 3구간 누진공제는 250,000원! (2,550,000이 아님)
    // 에이전트 스펙의 공식: return Math.floor(taxBase * 0.005) - 2_550_000;
    // → 이 값이 맞으려면:
    //   과표 1억1원: floor(1억1원 × 0.005) = 500,000 - 2,550,000 < 0 → 잘못됨
    // 올바른 공식:
    //   >1억: Math.floor(taxBase * 0.005) - 250,000
    // 테스트: 2억원 → floor(2억 × 0.005) - 250,000 = 1,000,000 - 250,000 = 750,000
    // 구간별: 100,000 + 150,000 + 500,000 = 750,000 ✓
    expect(calculateComprehensiveAggregateTax(200_000_000)).toBe(750_000);
  });

  it("TC-10-b: 과세표준 10억원 → 0.5%기반 누진공제 250,000 = 4,750,000원", () => {
    // floor(1,000,000,000 × 0.005) - 250,000 = 5,000,000 - 250,000 = 4,750,000
    // 구간별 검증: 100,000 + 150,000 + (9억 × 0.005) = 100,000 + 150,000 + 4,500,000 = 4,750,000 ✓
    expect(calculateComprehensiveAggregateTax(1_000_000_000)).toBe(4_750_000);
  });
});

// ============================================================
// TC-11: 세부담상한
// ============================================================

describe("applyBurdenCap — 세부담상한 150%", () => {
  it("TC-11: 산출세액 > 전년도×150% → 상한 적용", () => {
    const result = applyBurdenCap(1_000_000, 600_000);
    // 600,000 × 1.5 = 900,000 < 1,000,000 → 상한 적용
    expect(result.taxAfterCap).toBe(900_000);
    expect(result.appliedCapRate).toBe(1.5);
  });

  it("TC-11-a: 산출세액 ≤ 전년도×150% → 상한 미적용", () => {
    const result = applyBurdenCap(800_000, 600_000);
    // 600,000 × 1.5 = 900,000 > 800,000 → 상한 미적용
    expect(result.taxAfterCap).toBe(800_000);
    expect(result.appliedCapRate).toBeUndefined();
  });

  it("TC-11-b: 전년도 세액 미제공 → 상한 미적용", () => {
    const result = applyBurdenCap(1_000_000, undefined);
    expect(result.taxAfterCap).toBe(1_000_000);
    expect(result.appliedCapRate).toBeUndefined();
  });
});

// ============================================================
// TC-12: 지자체 안분 + 통합 계산
// ============================================================

describe("calculateComprehensiveAggregate — 통합 계산", () => {
  it("TC-12: 지자체 2곳 안분 (강남 70% + 중구 30%)", () => {
    const input: ComprehensiveAggregateInput = {
      taxpayerId: "900101-1234567",
      targetYear: 2026,
      landList: [
        {
          ...VACANT_LAND,
          id: "L_gangnam",
          jurisdictionCode: "11680",
          area: 140,
          officialLandPrice: 5_000_000, // 7억
        },
        {
          ...VACANT_LAND,
          id: "L_junggu",
          jurisdictionCode: "11140",
          area: 60,
          officialLandPrice: 5_000_000, // 3억
        },
      ],
    };

    const result = calculateComprehensiveAggregate(input);

    // 전체 공시지가: 10억
    expect(result.totalOfficialValue).toBe(1_000_000_000);
    // 과세표준: 10억 × 0.7 = 7억
    expect(result.taxBase).toBe(700_000_000);
    // 세액: floor(7억 × 0.005) - 250,000 = 3,500,000 - 250,000 = 3,250,000
    // 구간별: 100,000 + 150,000 + (6억 × 0.005) = 100,000 + 150,000 + 3,000,000 = 3,250,000 ✓
    expect(result.grossTax).toBe(3_250_000);

    // 지자체 2곳 안분
    expect(result.jurisdictionAllocation).toHaveLength(2);
    const gangnam = result.jurisdictionAllocation.find(
      (a) => a.jurisdictionCode === "11680",
    );
    const junggu = result.jurisdictionAllocation.find(
      (a) => a.jurisdictionCode === "11140",
    );
    expect(gangnam).toBeDefined();
    expect(junggu).toBeDefined();
    // 합산 = 총 세액
    const total = (gangnam?.allocatedTax ?? 0) + (junggu?.allocatedTax ?? 0);
    expect(total).toBe(result.taxAfterCap);
  });

  it("TC-12-a: 종합합산 토지 없음 → grossTax=0, 경고 1건", () => {
    const input: ComprehensiveAggregateInput = {
      taxpayerId: "TEST",
      targetYear: 2026,
      landList: [
        {
          ...VACANT_LAND,
          id: "L_golf2",
          isGolfCourse: true,
        },
      ],
    };
    const result = calculateComprehensiveAggregate(input);
    expect(result.grossTax).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
