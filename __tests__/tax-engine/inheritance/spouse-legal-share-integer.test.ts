import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type { InheritanceTaxInput, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * §19 배우자 법정상속분 정수연산 정밀도 (리뷰 확정 #6 회귀).
 *
 * spouseRatio = numerator/denominator (float) × 금액 floor은 무한소수 비율에서 1원 오차 발생.
 * 정정: floor(numeratorCorrected × numerator / denominator) — 정수 분자·분모 (BigInt-safe).
 * 동일 파일 distributeByLegalShares가 이미 쓰는 정수 패턴과 정합.
 */
function makeInput(heirs: Heir[], marketValue: number): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2024-01-01",
    estateItems: [
      { id: "e1", category: "real_estate_land", name: "테스트 토지", marketValue },
    ],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    debtItems: [],
    preGiftsWithin10Years: [],
    heirs,
    deductionInput: {
      heirs,
      spouseLegalShareOverride: undefined, // 자동 산정 경로
      netFinancialAssets: 0,
      cohabitHouseStdPrice: 0,
      farmingAssetValue: 0,
      familyBusinessValue: 0,
      legateeAmountNonHeir: 0,
    },
    creditInput: { priorGifts: [], isFiledOnTime: true },
    isGenerationSkip: false,
  };
}

describe("§19 배우자 법정상속분 정수연산 (리뷰 #6)", () => {
  it("[SPOUSE-INT] 배우자+자녀4, 과세가액 1,833,333,337 → 법정상속분 500,000,001 (float 시 500,000,000)", () => {
    // 배우자+자녀4 → spouseRatio = 1.5/5.5 = 3/11
    // numeratorCorrected = 1,833,333,337 (장례비 500만 자동 보정 후 원가 복원)
    // 정수: floor(1,833,333,337 × 3 / 11) = 500,000,001
    // float: floor(1,833,333,337 × 0.2727…) = 500,000,000 (또는 5억 최소보장으로 동일)
    const heirs: Heir[] = [
      { id: "sp", relation: "spouse", name: "배우자" },
      { id: "c1", relation: "child", name: "자녀1", isHeir: true },
      { id: "c2", relation: "child", name: "자녀2", isHeir: true },
      { id: "c3", relation: "child", name: "자녀3", isHeir: true },
      { id: "c4", relation: "child", name: "자녀4", isHeir: true },
    ];
    const result = calcInheritanceTax(makeInput(heirs, 1_833_333_337));
    expect(result.deductionDetail.spouseDeduction).toBe(500_000_001);
  });
});
