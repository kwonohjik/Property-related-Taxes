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
  calcSeparateAggregateLandStdTax,
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
// 별도합산 재산세 표준세율 산출세액 — calcSeparateAggregateLandStdTax
// ============================================================

describe("calcSeparateAggregateLandStdTax — 별도합산 재산세 표준세율 산출세액", () => {
  // SB01: 0 → 0
  it("SB01: 과세표준 0 → 0", () => {
    expect(calcSeparateAggregateLandStdTax(0)).toBe(0);
  });

  // SB02: 1억 (2억 이하 구간 0.2%)
  it("SB02: 과세표준 1억 → 200,000원 (0.2%)", () => {
    expect(calcSeparateAggregateLandStdTax(100_000_000)).toBe(200_000);
  });

  // SB03: 5억 (2억~10억 구간 0.3% - 20만)
  it("SB03: 과세표준 5억 → 1,300,000원 (0.3% - 200,000)", () => {
    // 5억 × 0.003 - 200,000 = 1,500,000 - 200,000 = 1,300,000
    expect(calcSeparateAggregateLandStdTax(500_000_000)).toBe(1_300_000);
  });

  // SB04: 사례11 ⑥ 검증 — 재산세 과표 357억
  it("SB04: 과세표준 357억 (사례11 ⑥) → 141,600,000원 (0.4% - 1,200,000)", () => {
    // 35,700,000,000 × 0.004 - 1,200,000 = 142,800,000 - 1,200,000 = 141,600,000
    expect(calcSeparateAggregateLandStdTax(35_700_000_000)).toBe(141_600_000);
  });
});

// ============================================================
// 재산세 비율 안분 공제 — applySeparateLandPropertyTaxCredit
// ============================================================

describe("applySeparateLandPropertyTaxCredit — 재산세 비율 안분 공제 (§4의3)", () => {
  // T07: 정상 비율 안분 — ⑤/⑥ 직접 전달
  it("T07: 정상 비율 안분 — ⑤=5,000만 / ⑥=1억 → ratio 0.5, creditAmount 1,000만", () => {
    // ⑤=5,000만, ⑥=1억, ⓐ=2,000만
    // ratio = 5,000만/1억 = 0.5, creditRaw = floor(2,000만 × 0.5) = 1,000만
    const result = applySeparateLandPropertyTaxCredit(
      100_000_000,  // calculatedTax
      20_000_000,   // propertyTaxAmount (ⓐ)
      50_000_000,   // numeratorStdTaxEq (⑤)
      100_000_000,  // denominatorStdTax (⑥)
    );
    expect(result.ratio).toBeCloseTo(0.5, 4);
    expect(result.creditAmount).toBe(10_000_000);
  });

  // T08: 비율 1.0 상한 — ⑤ > ⑥ 비현실 케이스 (표시 ratio는 1.0으로 클램프, creditRaw는 산식 그대로)
  it("T08: ⑤ > ⑥ → ratio 표시는 1.0 클램프, creditAmount = floor(ⓐ × ⑤/⑥)", () => {
    // ⑤=8,000만 > ⑥=5,000만 → ratio 표시 = 1.0, creditRaw = floor(2,000만 × 8,000만/5,000만) = 32,000,000
    // 실무상 ⑤(종부세 과표분) > ⑥(재산세 과표 전체)는 발생하지 않으나 방어 코드 확인
    const result = applySeparateLandPropertyTaxCredit(
      100_000_000,  // calculatedTax (상한)
      20_000_000,   // ⓐ
      80_000_000,   // ⑤ (더 큼 — 비현실적)
      50_000_000,   // ⑥
    );
    expect(result.ratio).toBe(1.0);   // 표시 ratio 클램프
    expect(result.creditAmount).toBe(32_000_000); // floor(20,000,000 × 80,000,000 / 50,000,000)
  });

  // T09: creditAmount ≤ calculatedTax 상한
  it("T09: creditAmount > calculatedTax → calculatedTax로 상한", () => {
    // ⑤=⑥ → ratio=1.0, creditRaw=ⓐ=50,000,000 > calculatedTax=30,000,000 → 30,000,000
    const result = applySeparateLandPropertyTaxCredit(
      30_000_000,   // calculatedTax (작음)
      50_000_000,   // ⓐ (큼)
      10_000_000,   // ⑤
      10_000_000,   // ⑥ (동일 → ratio=1.0)
    );
    expect(result.creditAmount).toBe(30_000_000); // calculatedTax 상한
  });

  // T10: denominatorStdTax = 0 방어
  it("T10: denominatorStdTax(⑥) = 0 → creditAmount = 0", () => {
    const result = applySeparateLandPropertyTaxCredit(
      100_000_000,
      20_000_000,
      5_000_000,  // ⑤
      0,          // ⑥ = 0 (분모 0 방어)
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

  // T14: 공시지가 100억 → 과세표준 20억 → §4의3 법정 산식 안분 공제
  it("T14: 공시지가 100억 → 과세표준 20억 → §4의3 법정 안분 공제 검증", () => {
    // publicPrice 100억, totalPropertyTaxBase 70억, propertyTaxAmount 1,000만
    // taxBase = 100억 - 80억 = 20억
    // ⑤ = floor(2,000,000,000 × 70 × 4 / 100_000) = 5,600,000
    // ⑥ = calcSeparateAggregateLandStdTax(7,000,000,000) = 70억×0.4% - 120만 = 26,800,000
    // 공제 = floor(10,000,000 × 5,600,000 / 26,800,000) = 2,089,552
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

    // §4의3 법정 산식 공제액: 2,089,552원
    expect(result.propertyTaxCredit.creditAmount).toBe(2_089_552);

    // 결정세액 = calculatedTax - creditAmount
    expect(result.determinedTax).toBe(10_000_000 - 2_089_552); // 7,910,448

    // 농특세 = floor(결정세액 × 20%)
    expect(result.ruralSpecialTax).toBe(Math.floor(result.determinedTax * 0.2));
  });

  // T15: 세부담 상한 — 종부세법 §15② 150% (KoreanLaw 검증 2026-06-12, G-3)
  //   종전 "별도합산은 상한 없음"은 드리프트였음. previousYearTotalTax 미입력 시 taxCap=undefined,
  //   입력 시 §15② 150% 적용.
  it("T15: 세부담 상한 §15② — prev 미입력 undefined / 입력 시 150% 적용", () => {
    const lands: SeparateAggregateLandForComprehensive[] = [
      {
        landId: "L1",
        publicPrice: 30_000_000_000, // 300억
        propertyTaxBase: 21_000_000_000,
        propertyTaxAmount: 30_000_000,
      },
    ];
    // prev 미입력 → 상한 미적용 (기존 사용자 경로 회귀 0)
    const noCap = calculateSeparateAggregateLandTax(lands);
    expect(noCap.isSubjectToTax).toBe(true);
    expect(noCap.taxCap).toBeUndefined();
    // prev 입력 → 150% 상한 적용
    const capped = calculateSeparateAggregateLandTax(lands, 1.0, 50_000_000);
    expect(capped.taxCap?.capRate).toBe(1.5);
    expect(capped.taxCap?.capAmount).toBe(Math.floor(50_000_000 * 1.5)); // 75,000,000
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

  // T18: 200억 초과 구간 (0.6%) — §4의3 법정 산식 공제 검증
  it("T18: 과세표준 300억 구간 (0.6%) — §4의3 법정 안분 공제 검증", () => {
    // publicPrice 380억, totalPropertyTaxBase 266억, propertyTaxAmount 3,800만
    // taxBase = 380억 - 80억 = 300억
    // ⑤ = floor(30,000,000,000 × 70 × 4 / 100_000) = 84,000,000
    // ⑥ = calcSeparateAggregateLandStdTax(26,600,000,000) = 266억×0.4% - 120만 = 105,200,000
    // 공제 = floor(38,000,000 × 84,000,000 / 105,200,000) = 30,342,205
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
    // 300억 × 0.6% - 2,000만 = 1억6,000만
    expect(result.calculatedTax).toBe(160_000_000);
    // §4의3 법정 산식 공제액: 30,342,205원
    expect(result.propertyTaxCredit.creditAmount).toBe(30_342_205);
    expect(result.determinedTax).toBe(160_000_000 - 30_342_205); // 129,657,795
    expect(result.ruralSpecialTax).toBe(Math.floor(result.determinedTax * 0.2));
    expect(result.totalTax).toBe(result.determinedTax + result.ruralSpecialTax);
  });

  // YA-5S (별도합산): 국세청 사례11 실측 anchor
  // 출처: 국세청 종합부동산세 계산 사례집 사례11 (2022)
  it("YA-5S: 사례11 별도합산 — 공제 119,379,661원, 결정세액(세전) 121,620,339원", () => {
    // 공시지가: 강원 평창군 90억 + 경기 용인시 420억 = 510억원
    // 재산세 과표: 510억 × 70% = 357억원
    // 재산세 부과세액: 24,000,000 + 116,400,000 = 140,400,000원
    // 종부세 과표: (510억 - 80억) × 100% = 430억원
    // 산출세액: 430억 × 0.7% - 6,000만 = 241,000,000원
    // ⑤ = floor(43,000,000,000 × 70 × 4 / 100_000) = 120,400,000원
    // ⑥ = 357억 × 0.4% - 1,200,000 = 141,600,000원
    // 공제 = floor(140,400,000 × 120,400,000 / 141,600,000) = 119,379,661원
    const lands: SeparateAggregateLandForComprehensive[] = [
      {
        landId: "L1",
        publicPrice: 9_000_000_000,     // 강원 평창군 90억 (50% 지분 → 100억×50%? 아니라 이미 지분 반영)
        propertyTaxBase: 6_300_000_000, // 90억 × 70%
        propertyTaxAmount: 24_000_000,
      },
      {
        landId: "L2",
        publicPrice: 42_000_000_000,    // 경기 용인시 420억
        propertyTaxBase: 29_400_000_000, // 420억 × 70%
        propertyTaxAmount: 116_400_000,
      },
    ];
    const result = calculateSeparateAggregateLandTax(lands);

    expect(result.totalPublicPrice).toBe(51_000_000_000);       // 510억
    expect(result.taxBase).toBe(43_000_000_000);                // 430억
    expect(result.calculatedTax).toBe(241_000_000);             // 241,000,000
    expect(result.propertyTaxCredit.creditAmount).toBe(119_379_661);  // 사례11 확인값
    expect(result.determinedTax).toBe(121_620_339);             // 241,000,000 - 119,379,661
    expect(result.ruralSpecialTax).toBe(Math.floor(121_620_339 * 0.2));
  });
});

