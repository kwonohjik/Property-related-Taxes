/**
 * 사례 28 Group G — §97② swap × 부수토지 일체과세 (G-4 cross-cutting anchor)
 *
 * 법령 쟁점:
 *   §97② 2호 단서: 환산/감정가액 모드에서 (환산+개산공제) < (자본적지출+양도비)이면
 *   후자를 필요경비로 swap. 이는 취득가·필요경비 산정에만 영향.
 *   부수토지 일체과세 70% 세율은 primaryContextForCompanionRate 기반 → swap 영향 없음.
 *
 * 케이스:
 *   사례 28 토지(217,542,381) + 자본적지출 5,000만원 + 양도비용 1,000만원 가정
 *   실가 모드: 직접 차감 (swap 비교 없음)
 *   환산 모드: (환산+개산) vs (자본+양도비) swap 비교
 *
 * 메모리 정책 참조:
 *   feedback_estimated_mode_expenses_pattern.md — 환산모드 expenses 필드(legacy)는 본 차익에 무시
 *   feedback_estimated_deduction_separation.md — 개산공제는 취득가와 별도 필요경비 항목
 *
 * 원본 테스트 (Group A~E, T-01~T-24):
 *   new-construction-bundled-case-28.test.ts
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import {
  TRANSFER_DATE,
  LAND_ACQ,
  LAND_ALLOC_PRICE,
  LAND_ACQ_PRICE,
  LAND_AREA,
  BUILDING_FOOTPRINT,
  EXCESS_LAND_TRANSFER_APPURT,
  EXCESS_LAND_ACQ_APPURT,
  EXCESS_LIMIT_AREA,
  EXCESS_BUILDING_FOOTPRINT,
  EXCESS_LAND_TRANSFER_EXCESS,
  EXCESS_LAND_ACQ_EXCESS,
  EXCESS_AREA,
  makeAppurtenantInput,
  makeExcessInput,
} from "./_helpers/case-28-fixtures";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

// ============================================================
// G-4 상수
// ============================================================

const G4_CAPITAL_EXP  = 50_000_000;   // 자본적지출 5,000만원
const G4_TRANSFER_EXP = 10_000_000;   // 양도비용 1,000만원
const G4_DIRECT_SIDE  = G4_CAPITAL_EXP + G4_TRANSFER_EXP; // 60,000,000

// T-29: 실가 모드 양도차익 = 217,542,381 - 150,000,000 - 60,000,000 = 7,542,381
const G4_LAND_GAIN_ACTUAL = LAND_ALLOC_PRICE - LAND_ACQ_PRICE - G4_DIRECT_SIDE;

// T-30: 환산 모드 기준시가 (토지 가상값)
const G4_STD_AT_ACQ      = 80_000_000;
const G4_STD_AT_TRANSFER = 111_564_000; // 540,000원/㎡ × 206.6㎡

const G4_ESTIMATED_BASE = Math.floor(LAND_ALLOC_PRICE * G4_STD_AT_ACQ / G4_STD_AT_TRANSFER); // 155,994,680
const G4_APPRAISAL_DED  = Math.floor(G4_STD_AT_ACQ * 0.03);                                  // 2,400,000
const G4_ESTIMATED_SIDE = G4_ESTIMATED_BASE + G4_APPRAISAL_DED;                               // 158,394,680

// 60,000,000 < 158,394,680 → swap 미발동 → 개산공제만 인정
const G4_GAIN_ESTIMATED_NO_SWAP = LAND_ALLOC_PRICE - G4_ESTIMATED_BASE - G4_APPRAISAL_DED; // 59,147,701

// T-31: swap 발동 케이스 — directSide(160,000,000) > estimatedSide(158,394,680)
const G4_BIG_CAPITAL_EXP = 150_000_000; // 자본적지출 1.5억
const G4_BIG_DIRECT_SIDE = G4_BIG_CAPITAL_EXP + G4_TRANSFER_EXP; // 160,000,000

// swap 발동: acquisitionCost = estimatedBase, expenses = bigDirect
// skipLossFloor=true 로 손실 그대로 반환
const G4_GAIN_SWAP = LAND_ALLOC_PRICE - G4_ESTIMATED_BASE - G4_BIG_DIRECT_SIDE; // -98,452,299

// ============================================================
// 헬퍼 팩토리
// ============================================================

/** 토지 단건 — 실가 모드 + 자본적지출 + 양도비용 + 부수토지 일체과세 70% */
function makeLandInputG4Actual(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: LAND_ALLOC_PRICE,
    transferDate: TRANSFER_DATE,
    acquisitionPrice: LAND_ACQ_PRICE,
    acquisitionDate: LAND_ACQ,
    expenses: 0,
    useEstimatedAcquisition: false,
    capitalExpenditure: G4_CAPITAL_EXP,
    transferExpense: G4_TRANSFER_EXP,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    annualBasicDeductionUsed: 0,
    acquisitionArea: LAND_AREA,
    skipLossFloor: true,
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths: 6,
      buildingFootprintArea: BUILDING_FOOTPRINT,
      isUrbanArea: true,
      bundledSaleMode: "apportioned",
    },
    ...overrides,
  });
}

/** 토지 단건 — 환산 모드 + 자본적지출(가변) + 양도비용 + 부수토지 일체과세 70% */
function makeLandInputG4Estimated(
  capitalExp: number,
  overrides?: Partial<TransferTaxInput>,
): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: LAND_ALLOC_PRICE,
    transferDate: TRANSFER_DATE,
    acquisitionPrice: LAND_ACQ_PRICE,
    acquisitionDate: LAND_ACQ,
    expenses: 0,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: G4_STD_AT_ACQ,
    standardPriceAtTransfer: G4_STD_AT_TRANSFER,
    capitalExpenditure: capitalExp,
    transferExpense: G4_TRANSFER_EXP,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    annualBasicDeductionUsed: 0,
    acquisitionArea: LAND_AREA,
    skipLossFloor: true,
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths: 6,
      buildingFootprintArea: BUILDING_FOOTPRINT,
      isUrbanArea: true,
      bundledSaleMode: "apportioned",
    },
    ...overrides,
  });
}

// ============================================================
// Group G — T-29 ~ T-32
// ============================================================

describe("사례 28 Group G — §97② swap × 부수토지 일체과세 (G-4 cross-cutting, 소득세법 §97②)", () => {
  /**
   * T-29: 실가 모드 — 자본적지출+양도비 직접 차감 → 양도차익 = 7,542,381, 세율 70% 유지
   *
   * 실가 모드에서는 §97② 단서 swap 비교 없음. 자본+양도비 합계(60,000,000) 직접 차감.
   * 세율 결정은 primaryContextForCompanionRate(건물 6개월) 기반 → 70% 유지.
   * swap은 취득가·필요경비 산정에만 영향 — 세율과 무관.
   */
  it("T-29 실가 모드 — 자본적지출+양도비 직접 차감, 양도차익 = 7,542,381, 세율 70% 유지", () => {
    const result = calculateTransferTax(makeLandInputG4Actual(), makeMockRates());
    expect(result.transferGain).toBe(G4_LAND_GAIN_ACTUAL); // 7,542,381
    expect(result.appliedRate).toBe(0.70);
    expect(result.swapApplied).toBeFalsy(); // 실가 모드 → swap 비교 없음
  });

  /**
   * T-30: 환산 모드 — swap 미발동 (directSide 60,000,000 < estimatedSide 158,394,680)
   *
   * estimatedBase = floor(217,542,381 × 80,000,000 / 111,564,000) = 155,994,680
   * 개산공제 = floor(80,000,000 × 3%) = 2,400,000
   * estimatedSide = 158,394,680 > directSide(60,000,000) → swap 미발동
   * 필요경비 = 개산공제(2,400,000)만 인정 (메모리: feedback_estimated_mode_expenses_pattern.md)
   * 양도차익 = 217,542,381 - 155,994,680 - 2,400,000 = 59,147,701
   */
  it("T-30 환산 모드 swap 미발동 — 개산공제만 인정, 양도차익 = 59,147,701", () => {
    const result = calculateTransferTax(makeLandInputG4Estimated(G4_CAPITAL_EXP), makeMockRates());
    expect(result.transferGain).toBe(G4_GAIN_ESTIMATED_NO_SWAP); // 59,147,701
    expect(result.swapApplied).toBeFalsy();
    expect(result.appliedRate).toBe(0.70); // swap 미발동해도 세율 70% 유지
  });

  /**
   * T-31: 환산 모드 — swap 발동 → 양도손실, 산출세액 = 0
   *
   * directSide(160,000,000) > estimatedSide(158,394,680) → swap 발동.
   * swap 후: acquisitionCost = estimatedBase(155,994,680), expenses = 160,000,000.
   * 양도차익 = 217,542,381 - 155,994,680 - 160,000,000 = -98,452,299 (손실)
   *
   * 엔진 동작: transferGain ≤ 0 → 양도손실 조기 반환 경로(소득세법 §92)
   *   calculatedTax = 0, totalTax = 0 (가산세 없음)
   *
   * 법령 원칙 확인:
   *   §97② 단서 swap은 필요경비 인정 방식만 규정 — 세율 결정(§104①)과 독립.
   *   손실 경로에서 세율이 적용되지 않는 것은 양도손실에 산출세액이 없기 때문이며
   *   부수토지 일체과세 원리(§89①3호·영§154⑦) 자체가 무효화되는 것이 아님.
   *
   * 참조 테스트: T-30에서 swap 미발동 시 70% 세율이 정상 적용됨을 확인 (회귀 방어).
   */
  it("T-31 환산 모드 swap 발동 → 양도손실 — transferGain = -98,452,299, 산출세액 = 0", () => {
    const result = calculateTransferTax(
      makeLandInputG4Estimated(G4_BIG_CAPITAL_EXP),
      makeMockRates(),
    );
    // swap 발동 → 양도손실 경로 (transferGain ≤ 0 → 조기 반환)
    expect(result.transferGain).toBe(G4_GAIN_SWAP); // -98,452,299
    expect(result.calculatedTax).toBe(0);
    expect(result.totalTax).toBe(0);
    // 손실 경로에서 세율 미적용(appliedRate=0) — swap이 세율 결정에 영향 없음을 T-30으로 보완
    expect(result.appliedRate).toBe(0);
  });

  /**
   * T-32: 한도 초과 companion split — 자본적지출 면적 안분은 호출자(UI) 책임
   *
   * 현행 엔진은 자산별 단건 입력이므로 자본적지출을 내부에서 면적 안분하지 않음.
   * G-2 케이스(토지 700㎡ → 부수 500㎡ + 초과 200㎡)에서
   * 자본적지출 5,000만원을 면적 비율로 안분하는 것은 호출자(UI/route.ts) 책임.
   *
   * 부수(500/700): floor(50,000,000 × 500/700) = 35,714,285원
   * 초과(200/700): 50,000,000 - 35,714,285 = 14,285,715원
   *
   * 검증:
   *   - 부수토지(한도 내): capitalExpenditure=35,714,285 주입 → 양도차익 정확, 세율 70%
   *   - 초과 토지: capitalExpenditure=14,285,715 주입 → 양도차익 정확, 세율 40%
   */
  it("T-32 한도 초과 split — 자본적지출 면적 안분 후 각 자산 독립 적용, 세율 분리 유지", () => {
    const TOTAL_CAPITAL_EXP = G4_CAPITAL_EXP; // 50,000,000

    // 호출자가 면적 비율로 안분
    const capExpAppurt = Math.floor(TOTAL_CAPITAL_EXP * 500 / 700); // 35,714,285
    const capExpExcess = TOTAL_CAPITAL_EXP - capExpAppurt;            // 14,285,715

    // 부수토지(한도 내) — primaryCtx 주입 → 70%
    const resultAppurt = calculateTransferTax(
      makeAppurtenantInput({ capitalExpenditure: capExpAppurt }),
      makeMockRates(),
    );
    const expectedAppurtGain = EXCESS_LAND_TRANSFER_APPURT - EXCESS_LAND_ACQ_APPURT - capExpAppurt;
    // 229,021,619 - 107,142,858 - 35,714,285 = 86,164,476
    expect(resultAppurt.transferGain).toBe(expectedAppurtGain);
    expect(resultAppurt.appliedRate).toBe(0.70);

    // 초과 토지 — primaryCtx 없음 → 토지 본래 보유기간 1~2년 40%
    const resultExcess = calculateTransferTax(
      makeExcessInput({ capitalExpenditure: capExpExcess }),
      makeMockRates(),
    );
    const expectedExcessGain = EXCESS_LAND_TRANSFER_EXCESS - EXCESS_LAND_ACQ_EXCESS - capExpExcess;
    // 91,608,647 - 42,857,142 - 14,285,715 = 34,465,790
    expect(resultExcess.transferGain).toBe(expectedExcessGain);
    expect(resultExcess.appliedRate).toBe(0.40);

    // 안분 합산 검증 (면적 안분 오류 방어)
    expect(capExpAppurt + capExpExcess).toBe(TOTAL_CAPITAL_EXP);
  });
});
