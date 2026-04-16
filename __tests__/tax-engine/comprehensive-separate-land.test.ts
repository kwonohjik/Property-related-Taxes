/**
 * 종합부동산세 별도합산 토지분 테스트 (T-21)
 * 종합부동산세법 §12(별도합산 과세대상)·§14(세율·공제) 기반
 *
 * 검증 항목:
 * - 기본공제 80억원 경계
 * - 3단계 누진세율 (0.5% / 0.6% / 0.7%)
 * - 재산세 비율 안분 공제 (creditAmount ≤ calculatedTax 상한)
 * - 세부담 상한 없음 (SeparateAggregateLandTaxResult에 taxCap 없음)
 * - 농어촌특별세 20%
 */

import { describe, it, expect } from "vitest";
import {
  applySeparateAggregateLandRate,
  applySeparateLandPropertyTaxCredit,
  calculateSeparateAggregateLandTax,
} from "../../lib/tax-engine/comprehensive-separate-land";
import { COMPREHENSIVE_LAND_CONST } from "../../lib/tax-engine/legal-codes";
import type { SeparateAggregateLandForComprehensive } from "../../lib/tax-engine/types/comprehensive.types";

// ============================================================
// 누진세율 3단계 — applySeparateAggregateLandRate
// ============================================================

describe("applySeparateAggregateLandRate — 별도합산 토지 누진세율", () => {
  // T01: 과세표준 0 → 세액 0
  it("T01: 과세표준 0 → 세액 0", () => {
    const { calculatedTax, appliedRate } = applySeparateAggregateLandRate(0);
    expect(calculatedTax).toBe(0);
    expect(appliedRate).toBe(COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_1);
  });

  // T02: 200억 이하 → 0.5%
  it("T02: 과세표준 100억 → 0.5% → 산출세액 5,000만", () => {
    const { calculatedTax, appliedRate, progressiveDeduction } =
      applySeparateAggregateLandRate(10_000_000_000);
    expect(appliedRate).toBe(COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_1);
    expect(progressiveDeduction).toBe(0);
    expect(calculatedTax).toBe(50_000_000); // 100억 × 0.5% = 5,000만
  });

  // T03: 과세표준 정확히 200억 → 0.5% 마지막 구간
  it("T03: 과세표준 200억 (경계) → 0.5% → 산출세액 1억", () => {
    const { calculatedTax, appliedRate } =
      applySeparateAggregateLandRate(20_000_000_000);
    expect(appliedRate).toBe(COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_1);
    expect(calculatedTax).toBe(100_000_000); // 200억 × 0.5% = 1억
  });

  // T04: 과세표준 200억 초과 → 0.6%, 누진공제 2,000만
  it("T04: 과세표준 300억 → 0.6% → 산출세액 1억6,000만", () => {
    // 300억 × 0.6% - 2,000만 = 1억8,000만 - 2,000만 = 1억6,000만
    const { calculatedTax, appliedRate, progressiveDeduction } =
      applySeparateAggregateLandRate(30_000_000_000);
    expect(appliedRate).toBe(COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_2);
    expect(progressiveDeduction).toBe(COMPREHENSIVE_LAND_CONST.SEPARATE_DEDUCTION_2);
    expect(calculatedTax).toBe(160_000_000);
  });

  // T05: 과세표준 정확히 400억 → 0.6% 마지막 구간
  it("T05: 과세표준 400억 (경계) → 0.6% → 산출세액 2억2,000만", () => {
    // 400억 × 0.6% - 2,000만 = 2억4,000만 - 2,000만 = 2억2,000만
    const { calculatedTax, appliedRate } =
      applySeparateAggregateLandRate(40_000_000_000);
    expect(appliedRate).toBe(COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_2);
    expect(calculatedTax).toBe(220_000_000);
  });

  // T06: 과세표준 400억 초과 → 0.7%, 누진공제 6,000만
  it("T06: 과세표준 500억 → 0.7% → 산출세액 2억9,000만", () => {
    // 500억 × 0.7% - 6,000만 = 3억5,000만 - 6,000만 = 2억9,000만
    const { calculatedTax, appliedRate, progressiveDeduction } =
      applySeparateAggregateLandRate(50_000_000_000);
    expect(appliedRate).toBe(COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_3);
    expect(progressiveDeduction).toBe(COMPREHENSIVE_LAND_CONST.SEPARATE_DEDUCTION_3);
    expect(calculatedTax).toBe(290_000_000);
  });
});

// ============================================================
// 재산세 비율 안분 공제 — applySeparateLandPropertyTaxCredit
// ============================================================

describe("applySeparateLandPropertyTaxCredit — 재산세 비율 안분 공제", () => {
  // T07: 정상 비율 안분 공제
  it("T07: 정상 비율 안분 — 종부세 과세표준 50% = creditAmount 절반", () => {
    // calculatedTax=1억, propertyTax=2,000만, propertyTaxBase=100억, compBase=50억
    // ratio = 50억/100억 = 0.5, creditRaw = floor(2,000만 × 0.5) = 1,000만
    const result = applySeparateLandPropertyTaxCredit(
      100_000_000,  // calculatedTax
      20_000_000,   // propertyTaxAmount
      10_000_000_000, // propertyTaxBase
      5_000_000_000,  // comprehensiveTaxBase
    );
    expect(result.ratio).toBeCloseTo(0.5, 4);
    expect(result.creditAmount).toBe(10_000_000);
  });

  // T08: 비율 1.0 상한 — 종부세 과세표준 > 재산세 과세표준
  it("T08: 비율 1.0 상한 — 종부세 과세표준 > 재산세 과세표준 → ratio = 1.0", () => {
    // ratio = min(80억/50억, 1.0) = min(1.6, 1.0) = 1.0
    const result = applySeparateLandPropertyTaxCredit(
      100_000_000,
      20_000_000,
      5_000_000_000,  // propertyTaxBase 50억
      8_000_000_000,  // comprehensiveTaxBase 80억 (더 큼)
    );
    expect(result.ratio).toBe(1.0);
    expect(result.creditAmount).toBe(20_000_000); // 전액 공제
  });

  // T09: creditAmount ≤ calculatedTax 상한
  it("T09: creditAmount > calculatedTax → calculatedTax로 상한", () => {
    // ratio = 1.0, creditRaw = 50,000,000 > calculatedTax = 30,000,000 → 30,000,000
    const result = applySeparateLandPropertyTaxCredit(
      30_000_000,   // calculatedTax (작음)
      50_000_000,   // propertyTaxAmount (큼)
      5_000_000_000,
      5_000_000_000,
    );
    expect(result.creditAmount).toBe(30_000_000); // calculatedTax 상한
  });

  // T10: propertyTaxBase = 0 방어
  it("T10: propertyTaxBase = 0 → creditAmount = 0", () => {
    const result = applySeparateLandPropertyTaxCredit(
      100_000_000,
      20_000_000,
      0,              // propertyTaxBase = 0 (분모)
      5_000_000_000,
    );
    expect(result.ratio).toBe(0);
    expect(result.creditAmount).toBe(0);
  });
});

// ============================================================
// 통합 계산 — calculateSeparateAggregateLandTax
// ============================================================

describe("calculateSeparateAggregateLandTax — 통합 계산", () => {
  // T11: 빈 배열 → 납세의무 없음
  it("T11: 빈 토지 배열 → isSubjectToTax = false, 세액 0", () => {
    const result = calculateSeparateAggregateLandTax([]);
    expect(result.isSubjectToTax).toBe(false);
    expect(result.determinedTax).toBe(0);
    expect(result.ruralSpecialTax).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  // T12: 공시지가 합산 80억 이하 → 납세의무 없음
  it("T12: 공시지가 80억 이하 → isSubjectToTax = false", () => {
    const lands: SeparateAggregateLandForComprehensive[] = [
      {
        landId: "L1",
        publicPrice: 5_000_000_000,  // 50억
        propertyTaxBase: 3_500_000_000,
        propertyTaxAmount: 5_000_000,
      },
      {
        landId: "L2",
        publicPrice: 3_000_000_000,  // 30억
        propertyTaxBase: 2_100_000_000,
        propertyTaxAmount: 3_000_000,
      },
    ];
    // 합계 80억 → 80억 초과 아님
    const result = calculateSeparateAggregateLandTax(lands);
    expect(result.totalPublicPrice).toBe(8_000_000_000);
    expect(result.isSubjectToTax).toBe(false);
    expect(result.determinedTax).toBe(0);
  });

  // T13: 공시지가 정확히 80억 → 납세의무 없음 (초과가 아니라 경계)
  it("T13: 공시지가 정확히 80억 → isSubjectToTax = false", () => {
    const lands: SeparateAggregateLandForComprehensive[] = [
      {
        landId: "L1",
        publicPrice: 8_000_000_000,
        propertyTaxBase: 5_600_000_000,
        propertyTaxAmount: 8_000_000,
      },
    ];
    const result = calculateSeparateAggregateLandTax(lands);
    expect(result.isSubjectToTax).toBe(false);
  });

  // T14: 공시지가 100억 → 과세표준 20억 → 0.5% → 산출세액 1,000만
  it("T14: 공시지가 100억 → 과세표준 20억 → 1,000만원 (세율 0.5%)", () => {
    const lands: SeparateAggregateLandForComprehensive[] = [
      {
        landId: "L1",
        publicPrice: 10_000_000_000,  // 100억
        propertyTaxBase: 7_000_000_000,
        propertyTaxAmount: 10_000_000,
      },
    ];
    const result = calculateSeparateAggregateLandTax(lands);

    expect(result.isSubjectToTax).toBe(true);
    expect(result.basicDeduction).toBe(COMPREHENSIVE_LAND_CONST.SEPARATE_DEDUCTION_AMOUNT); // 80억
    expect(result.taxBase).toBe(2_000_000_000); // 100억 - 80억 = 20억
    expect(result.appliedRate).toBe(COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_1); // 0.5%
    expect(result.calculatedTax).toBe(10_000_000); // 20억 × 0.5% = 1,000만

    // 재산세 비율 안분: creditAmount = floor(10,000,000 × 20억 / 70억) = 2,857,142
    const expectedCredit = Math.floor(safeMultiplyThenDivide(10_000_000, 2_000_000_000, 7_000_000_000));
    expect(result.propertyTaxCredit.creditAmount).toBe(expectedCredit);

    // 결정세액 = calculatedTax - creditAmount
    expect(result.determinedTax).toBe(result.calculatedTax - expectedCredit);

    // 농특세 = floor(결정세액 × 20%)
    expect(result.ruralSpecialTax).toBe(Math.floor(result.determinedTax * 0.2));
  });

  // T15: 세부담 상한 없음 — SeparateAggregateLandTaxResult에 taxCap 필드 없음
  it("T15: 세부담 상한 없음 — 결과 객체에 taxCap 속성 없음", () => {
    const lands: SeparateAggregateLandForComprehensive[] = [
      {
        landId: "L1",
        publicPrice: 30_000_000_000, // 300억
        propertyTaxBase: 21_000_000_000,
        propertyTaxAmount: 30_000_000,
      },
    ];
    const result = calculateSeparateAggregateLandTax(lands);
    expect(result.isSubjectToTax).toBe(true);
    // taxCap 속성이 존재하지 않음을 확인
    expect("taxCap" in result).toBe(false);
  });

  // T16: 복수 토지 인별 합산
  it("T16: 복수 토지 합산 — 공시지가 총합 및 재산세 합산", () => {
    const lands: SeparateAggregateLandForComprehensive[] = [
      {
        landId: "L1",
        publicPrice: 6_000_000_000,  // 60억
        propertyTaxBase: 4_200_000_000,
        propertyTaxAmount: 6_000_000,
      },
      {
        landId: "L2",
        publicPrice: 4_000_000_000,  // 40억
        propertyTaxBase: 2_800_000_000,
        propertyTaxAmount: 4_000_000,
      },
    ];
    // 합계: 공시지가 100억, 재산세 과세표준 70억, 재산세 1,000만
    const result = calculateSeparateAggregateLandTax(lands);
    expect(result.totalPublicPrice).toBe(10_000_000_000); // 100억
    expect(result.taxBase).toBe(2_000_000_000); // 100억 - 80억 = 20억
    expect(result.isSubjectToTax).toBe(true);
    // 재산세 합산도 동일한 결과여야 함
    expect(result.propertyTaxCredit.propertyTaxAmount).toBe(10_000_000);
  });

  // T17: 공정시장가액비율 100% — afterDeduction = taxBase (절사 제외)
  it("T17: 공정시장가액비율 100% 확인", () => {
    const lands: SeparateAggregateLandForComprehensive[] = [
      {
        landId: "L1",
        publicPrice: 9_000_000_000,  // 90억
        propertyTaxBase: 6_300_000_000,
        propertyTaxAmount: 9_000_000,
      },
    ];
    const result = calculateSeparateAggregateLandTax(lands);
    expect(result.fairMarketRatio).toBe(COMPREHENSIVE_LAND_CONST.SEPARATE_FAIR_MARKET_RATIO); // 1.0
    // 90억 - 80억 = 10억 → 만원 절사 → 10억 (10억은 만원 단위로 나누어 떨어짐)
    expect(result.afterDeduction).toBe(1_000_000_000);
    expect(result.taxBase).toBe(1_000_000_000); // 100% 적용 후 그대로
  });

  // T18: 200억 초과 구간 (0.6%) 전체 흐름
  it("T18: 과세표준 300억 구간 (0.6%) — 결정세액 및 농특세 검증", () => {
    const lands: SeparateAggregateLandForComprehensive[] = [
      {
        landId: "L1",
        publicPrice: 38_000_000_000, // 380억 → 과세표준 300억
        propertyTaxBase: 26_600_000_000,
        propertyTaxAmount: 38_000_000,
      },
    ];
    const result = calculateSeparateAggregateLandTax(lands);

    expect(result.taxBase).toBe(30_000_000_000); // 380억 - 80억 = 300억
    expect(result.appliedRate).toBe(COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_2); // 0.6%
    // 300억 × 0.6% - 2,000만 = 1억8,000만 - 2,000만 = 1억6,000만
    expect(result.calculatedTax).toBe(160_000_000);
    expect(result.ruralSpecialTax).toBe(Math.floor(result.determinedTax * 0.2));
    expect(result.totalTax).toBe(result.determinedTax + result.ruralSpecialTax);
  });
});

// 헬퍼 (테스트용)
function safeMultiplyThenDivide(a: number, b: number, c: number): number {
  if (c === 0) return 0;
  const product = a * b;
  if (Math.abs(product) > Number.MAX_SAFE_INTEGER) {
    return Number(BigInt(Math.floor(a)) * BigInt(Math.floor(b)) / BigInt(Math.floor(c)));
  }
  return Math.floor(product / c);
}
