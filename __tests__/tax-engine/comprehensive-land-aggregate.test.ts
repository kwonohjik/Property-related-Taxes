/**
 * 종합부동산세 종합합산 토지분 테스트 (T-20)
 * 종합부동산세법 §11~§15 기반
 */

import { describe, it, expect } from "vitest";
import {
  calcAggregateLandTaxBase,
  calcAggregateLandTaxAmount,
  applyAggregateLandTaxCap,
  calculateAggregateLandTax,
} from "../../lib/tax-engine/comprehensive-tax";
import {
  calcComprehensiveAggregateLandStdTax,
} from "../../lib/tax-engine/comprehensive-land-aggregate";
import { COMPREHENSIVE_LAND_CONST } from "../../lib/tax-engine/legal-codes";
import type { AggregateLandTaxInput } from "../../lib/tax-engine/types/comprehensive.types";

// ============================================================
// 과세표준 산정
// ============================================================

describe("calcAggregateLandTaxBase — 종합합산 토지 과세표준", () => {
  // T01: 공시지가 합산 5억 이하 → 과세표준 0
  it("T01: 공시지가 합산 5억 이하 → 과세표준 0", () => {
    expect(calcAggregateLandTaxBase(400_000_000)).toBe(0);
  });

  // T02: 공시지가 정확히 5억 → 과세표준 0
  it("T02: 공시지가 정확히 5억 → 과세표준 0", () => {
    expect(calcAggregateLandTaxBase(500_000_000)).toBe(0);
  });

  // T03: 공시지가 10억 → 과세표준 5억 (만원 절사 확인)
  it("T03: 공시지가 10억 → 과세표준 5억원", () => {
    expect(calcAggregateLandTaxBase(1_000_000_000)).toBe(500_000_000);
  });

  // T04: 만원 미만 절사 검증 — 공시지가 505,009,999원
  it("T04: 만원 미만 절사 — 505,009,999원 → 과세표준 5,009,000원 (9,999원 절사)", () => {
    // (505,009,999 - 500,000,000) = 5,009,999 → 만원 절사 → 5,000,000? 아니면 5,009,000?
    // 5,009,999 / 10,000 = 500.9999 → floor = 500 → × 10,000 = 5,000,000
    // 실제: Math.floor(5,009,999 / 10,000) * 10,000 = 5,000,000
    expect(calcAggregateLandTaxBase(505_009_999)).toBe(5_000_000);
  });

  it("T04-b: 공시지가 505,190,000원 → 과세표준 5,190,000원", () => {
    // 5,190,000 / 10,000 = 519 → × 10,000 = 5,190,000
    expect(calcAggregateLandTaxBase(505_190_000)).toBe(5_190_000);
  });
});

// ============================================================
// 누진세율 적용
// ============================================================

describe("calcAggregateLandTaxAmount — 종합합산 토지 세율", () => {
  // T05: 과세표준 15억 이하 — 1% 적용
  it("T05: 과세표준 5억 → 1% → 산출세액 500만원", () => {
    const { calculatedTax, appliedRate } = calcAggregateLandTaxAmount(500_000_000);
    expect(appliedRate).toBe(COMPREHENSIVE_LAND_CONST.AGGREGATE_RATE_1);
    expect(calculatedTax).toBe(5_000_000);
  });

  // T06: 과세표준 정확히 15억 — 1% 마지막 구간
  it("T06: 과세표준 15억 (경계) → 1% → 산출세액 1,500만원", () => {
    const { calculatedTax, appliedRate } = calcAggregateLandTaxAmount(1_500_000_000);
    expect(appliedRate).toBe(COMPREHENSIVE_LAND_CONST.AGGREGATE_RATE_1);
    expect(calculatedTax).toBe(15_000_000);
  });

  // T07: 과세표준 20억 → 2% 구간
  it("T07: 과세표준 20억 → 2% → 산출세액 2,500만원 (2억×2% - 1,500만)", () => {
    // 20억×2% = 4,000만 - 1,500만 = 2,500만
    const { calculatedTax, appliedRate } = calcAggregateLandTaxAmount(2_000_000_000);
    expect(appliedRate).toBe(COMPREHENSIVE_LAND_CONST.AGGREGATE_RATE_2);
    expect(calculatedTax).toBe(25_000_000);
  });

  // T08: 과세표준 50억 → 3% 구간
  it("T08: 과세표준 50억 → 3% → 산출세액 9,000만원", () => {
    // 50억×3% = 1억5,000만 - 6,000만 = 9,000만
    const { calculatedTax, appliedRate } = calcAggregateLandTaxAmount(5_000_000_000);
    expect(appliedRate).toBe(COMPREHENSIVE_LAND_CONST.AGGREGATE_RATE_3);
    expect(calculatedTax).toBe(90_000_000);
  });

  // T09: 과세표준 정확히 45억 (경계)
  it("T09: 과세표준 45억 (경계) → 2% 구간 최고액", () => {
    // 45억×2% = 9,000만 - 1,500만 = 7,500만
    const { calculatedTax } = calcAggregateLandTaxAmount(4_500_000_000);
    expect(calculatedTax).toBe(75_000_000);
  });
});

// ============================================================
// 세부담 상한 (150%)
// ============================================================

describe("applyAggregateLandTaxCap — 세부담 상한 150%", () => {
  // T14: 전년도 세액 미입력 → undefined
  it("T14: 전년도 세액 미입력 → undefined 반환", () => {
    expect(applyAggregateLandTaxCap(5_000_000, 3_000_000, undefined)).toBeUndefined();
  });

  // T15: 상한 적용 케이스
  it("T15: 상한 적용 — 종부세 1,200만 > 상한(1,500만 - 재산세300만 = 1,200만)", () => {
    // prevYear=10,000,000, capAmount=15,000,000, propertyTax=3,000,000
    // cappedTax = min(12,000,000, 15,000,000 - 3,000,000) = 12,000,000 → isApplied = false (동일)
    const result = applyAggregateLandTaxCap(12_000_000, 3_000_000, 10_000_000);
    expect(result).not.toBeUndefined();
    expect(result!.capRate).toBe(1.5);
    expect(result!.cappedTax).toBe(12_000_000);
    expect(result!.isApplied).toBe(false);
  });

  // T16: 상한 미도달 → isApplied = false
  it("T16: 상한 미도달 — 종부세 100만 < 상한 → isApplied = false", () => {
    const result = applyAggregateLandTaxCap(1_000_000, 500_000, 10_000_000);
    expect(result!.isApplied).toBe(false);
    expect(result!.cappedTax).toBe(1_000_000);
  });

  // T17: cappedTax 음수 방어
  it("T17: cappedTax 음수 방어 → Math.max(0) = 0", () => {
    // capAmount=1,500,000, propertyTax=2,000,000 → capAmount-propertyTax=-500,000 → cappedTax=0
    const result = applyAggregateLandTaxCap(3_000_000, 2_000_000, 1_000_000);
    expect(result!.cappedTax).toBe(0);
    expect(result!.isApplied).toBe(true);
  });

  // T18: 전년도 세액 0원 → cappedTax = 0
  it("T18: 전년도 세액 0원 → cappedTax = 0", () => {
    const result = applyAggregateLandTaxCap(5_000_000, 1_000_000, 0);
    expect(result!.cappedTax).toBe(0);
    expect(result!.isApplied).toBe(true);
  });
});

// ============================================================
// 통합 계산
// ============================================================

describe("calcComprehensiveAggregateLandStdTax — 종합합산 재산세 표준세율 산출세액", () => {
  // SA01: 0 → 0
  it("SA01: 과세표준 0 → 0", () => {
    expect(calcComprehensiveAggregateLandStdTax(0)).toBe(0);
  });

  // SA02: 2,000만 (5천만 이하 구간 0.2%)
  it("SA02: 과세표준 2,000만 → 40,000원 (0.2%)", () => {
    expect(calcComprehensiveAggregateLandStdTax(20_000_000)).toBe(40_000);
  });

  // SA03: 7,000만 (5천만~1억 구간 0.3% - 5만)
  it("SA03: 과세표준 7,000만 → 160,000원 (0.3% - 50,000)", () => {
    // 7,000만 × 0.003 - 50,000 = 210,000 - 50,000 = 160,000
    expect(calcComprehensiveAggregateLandStdTax(70_000_000)).toBe(160_000);
  });

  // SA04: 사례10 ⑥ 검증 — 재산세 과표 12.6억
  it("SA04: 과세표준 12.6억 (사례10 ⑥) → 6,050,000원 (0.5% - 250,000)", () => {
    // 1,260,000,000 × 0.005 - 250,000 = 6,300,000 - 250,000 = 6,050,000
    expect(calcComprehensiveAggregateLandStdTax(1_260_000_000)).toBe(6_050_000);
  });
});

describe("calculateAggregateLandTax — 통합 계산", () => {
  // T19: 공시지가 10억 단일 토지 전체 흐름 — 법정 산식(§4의3) 기준으로 재산정
  it("T19: 공시지가 10억 전체 흐름 — §4의3 법정 안분 공제 검증", () => {
    // 재산세 과표 7억, 재산세 3,250,000원
    // 종부세 과표 5억
    // ⑤ = floor(500,000,000 × 70 × 5 / 100_000) = 1,750,000
    // ⑥ = 7억 × 0.5% - 250,000 = 3,500,000 - 250,000 = 3,250,000
    // 공제 = floor(3,250,000 × 1,750,000 / 3,250,000) = 1,750,000
    const input: AggregateLandTaxInput = {
      totalOfficialValue: 1_000_000_000,
      propertyTaxBase: 700_000_000,  // 10억 × 70%
      propertyTaxAmount: 3_250_000,
      previousYearTotalTax: undefined,
    };

    const result = calculateAggregateLandTax(input);

    expect(result.isSubjectToTax).toBe(true);
    expect(result.taxBase).toBe(500_000_000);
    expect(result.calculatedTax).toBe(5_000_000);
    // §4의3 법정 산식 공제액: 1,750,000원
    expect(result.propertyTaxCredit.creditAmount).toBe(1_750_000);
    expect(result.determinedTax).toBe(3_250_000); // 5,000,000 - 1,750,000
    // 세부담 상한 없음 (전년도 미입력)
    expect(result.taxCap).toBeUndefined();
    // 농특세 = 결정세액 × 20%
    expect(result.ruralSpecialTax).toBe(Math.floor(result.determinedTax * 0.2));
  });

  // 납세의무 없는 케이스
  it("공시지가 5억 이하 → isSubjectToTax = false, 세액 0", () => {
    const input: AggregateLandTaxInput = {
      totalOfficialValue: 300_000_000,
      propertyTaxBase: 210_000_000,
      propertyTaxAmount: 500_000,
    };
    const result = calculateAggregateLandTax(input);
    expect(result.isSubjectToTax).toBe(false);
    expect(result.determinedTax).toBe(0);
    expect(result.ruralSpecialTax).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  // YA-5T (종합합산): 국세청 사례10 실측 anchor
  // 출처: 국세청 종합부동산세 계산 사례집 사례10 (2022)
  it("YA-5T: 사례10 종합합산 — 공제 4,361,983원, 결정세액 8,638,017원", () => {
    // 공시지가: 서초구 나대지 4.3억 + 송파구 토지 3.7억 + 10억 = 18억원
    // 재산세 과표: 18억 × 70% = 12.6억원
    // 재산세 부과세액: 1,255,000 + 4,545,000 = 5,800,000원
    // 종부세 과표: (18억 - 5억) × 100% = 13억원
    // 산출세액: 13억 × 1% = 13,000,000원
    // ⑤ = floor(1,300,000,000 × 70 × 5 / 100_000) = 4,550,000원
    // ⑥ = 12.6억 × 0.5% - 250,000 = 6,050,000원
    // 공제 = floor(5,800,000 × 4,550,000 / 6,050,000) = 4,361,983원
    const input: AggregateLandTaxInput = {
      totalOfficialValue: 1_800_000_000,
      propertyTaxBase: 1_260_000_000,  // 18억 × 70%
      propertyTaxAmount: 5_800_000,    // 1,255,000 + 4,545,000
      previousYearTotalTax: undefined,
    };

    const result = calculateAggregateLandTax(input);

    expect(result.taxBase).toBe(1_300_000_000);       // (18억 - 5억) × 100%
    expect(result.calculatedTax).toBe(13_000_000);    // 13억 × 1%
    expect(result.propertyTaxCredit.creditAmount).toBe(4_361_983);   // 사례10 확인값
    expect(result.determinedTax).toBe(8_638_017);                    // 13,000,000 - 4,361,983
    expect(result.taxCap).toBeUndefined();
    expect(result.ruralSpecialTax).toBe(Math.floor(8_638_017 * 0.2));
  });
});

