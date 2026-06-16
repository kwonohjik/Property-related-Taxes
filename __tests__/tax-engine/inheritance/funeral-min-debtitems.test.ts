/**
 * 장례비 최소 500만원 — debtItems 경로 (상증령 §9②1호)
 *
 * §9②1호: 일반 장례비(봉안 제외)가 500만원 미만이면 500만원으로 한다.
 *   → debtItems 경로에서도 최소 500만 보장되어야 함 (legacy 경로는 기존 적용).
 *
 * Pre-Do: 수정 전 FM-1·FM-2 실패 (현재 debtItems 경로는 Math.min만 적용 → 300만 그대로).
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  Heir,
  DebtItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const HEIRS: Heir[] = [
  { id: "h-spouse", name: "배우자", relation: "spouse" },
  { id: "h-son", name: "장남", relation: "child" },
];

function baseInput(debtItems: DebtItem[]): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2024-03-01",
    estateItems: [
      { id: "e1", category: "real_estate_apartment", name: "주택", marketValue: 2_000_000_000 },
    ],
    heirs: HEIRS,
    preGiftsWithin10Years: [],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    debtItems,
    deductionInput: {
      heirs: HEIRS,
      spouseActualAmount: 0,
      netFinancialAssets: 0,
      cohabitHouseStdPrice: 0,
      farmingAssetValue: 0,
      familyBusinessValue: 0,
    },
    creditInput: { priorGifts: [], isFiledOnTime: true },
  } as InheritanceTaxInput;
}

describe("장례비 최소 500만 — debtItems 경로 (§9②1호)", () => {
  it("FM-1: 식대 300만 입력 → 최소 500만 공제 (deductedBeforeAggregation=500만)", () => {
    const result = calcInheritanceTax(
      baseInput([{ id: "d1", category: "funeral", name: "장례식장", amount: 3_000_000, isBongan: false }]),
    );
    expect(result.deductedBeforeAggregation).toBe(5_000_000);
  });

  it("FM-2: 식대 0 + 봉안 200만 → 식대 최소 500만 + 봉안 200만 = 700만", () => {
    const result = calcInheritanceTax(
      baseInput([{ id: "d1", category: "funeral", name: "봉안당", amount: 2_000_000, isBongan: true }]),
    );
    expect(result.deductedBeforeAggregation).toBe(7_000_000);
  });

  it("FM-3(회귀): 식대 800만 → 그대로 800만 (한도 내)", () => {
    const result = calcInheritanceTax(
      baseInput([{ id: "d1", category: "funeral", name: "장례식장", amount: 8_000_000, isBongan: false }]),
    );
    expect(result.deductedBeforeAggregation).toBe(8_000_000);
  });

  it("FM-4(회귀): 식대 1,500만 → 1천만 한도 (상한)", () => {
    const result = calcInheritanceTax(
      baseInput([{ id: "d1", category: "funeral", name: "장례식장", amount: 15_000_000, isBongan: false }]),
    );
    expect(result.deductedBeforeAggregation).toBe(10_000_000);
  });

  it("FM-5(회귀): 봉안 700만 → 500만 한도 + 식대 최소 500만 = 1,000만", () => {
    const result = calcInheritanceTax(
      baseInput([{ id: "d1", category: "funeral", name: "봉안당", amount: 7_000_000, isBongan: true }]),
    );
    expect(result.deductedBeforeAggregation).toBe(10_000_000);
  });
});
