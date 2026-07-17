/**
 * Anchor — H-18 §23의2①1호 동거주택 상속공제 10년 요건 차단
 *
 * §23의2①1호(mst 276123): 피상속인과 상속인이 상속개시일부터 소급 10년 이상(미성년 기간 제외) 계속
 *   동거. 종전: cohabitStartDate 입력 시 동거연수(meetsRequirement)를 echo·경고만 하고 공제는 전액
 *   적용(10년 미충족도 공제) → 과다공제.
 *
 * backward-compat: cohabitStartDate 미입력 시 판정 데이터가 없으므로 기존 동작 유지(공제 적용).
 *   입력 시에만 10년 미충족 차단.
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type { InheritanceTaxInput, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

function baseInput(cohabitStart?: string): InheritanceTaxInput {
  const son: Heir = {
    id: "h-son",
    name: "장남",
    relation: "child",
    isCohabitant: cohabitStart ? true : undefined,
    cohabitStartDate: cohabitStart,
    birthDate: "1980-01-01",
  };
  const heirs = [{ id: "h-spouse", name: "배우자", relation: "spouse" } as Heir, son];
  return {
    decedentType: "resident",
    deathDate: "2024-03-01",
    estateItems: [
      { id: "e1", category: "real_estate_apartment", name: "동거주택", marketValue: 1_000_000_000 },
    ],
    heirs,
    preGiftsWithin10Years: [],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    debtItems: [],
    deductionInput: {
      heirs,
      spouseActualAmount: 0,
      netFinancialAssets: 0,
      cohabitHouseStdPrice: 500_000_000,
      farmingAssetValue: 0,
      familyBusinessValue: 0,
    },
    creditInput: { priorGifts: [], isFiledOnTime: true },
  } as InheritanceTaxInput;
}

const cohabit = (r: ReturnType<typeof calcInheritanceTax>) =>
  r.deductionDetail?.cohabitDeductionDetail;

describe("H-18 §23의2①1호 동거 10년 요건 차단", () => {
  it("[H18-OVER] 동거 14년(≥10년) → 동거주택공제 전액 적용 (5억)", () => {
    const r = calcInheritanceTax(baseInput("2010-01-01"));
    expect(cohabit(r)?.cohabitYears?.effectiveYears).toBe(14);
    expect(cohabit(r)?.cappedDeduction).toBe(500_000_000);
    expect(cohabit(r)?.isExcluded).not.toBe(true);
  });

  it("[H18-UNDER] 동거 6년(<10년) → 공제 0 + 차단 사유·경고", () => {
    const r = calcInheritanceTax(baseInput("2018-01-01"));
    expect(cohabit(r)?.cohabitYears?.effectiveYears).toBe(6);
    expect(cohabit(r)?.cappedDeduction).toBe(0);
    expect(cohabit(r)?.isExcluded).toBe(true);
    expect(cohabit(r)?.exclusionReason).toBe("under_ten_years");
    expect((r.warnings ?? []).some((w) => w.includes("동거주택 상속공제를 적용하지 않"))).toBe(true);
  });

  it("[H18-BACKCOMPAT] cohabitStartDate 미입력 → 판정 없음, 기존 동작 유지 (공제 적용)", () => {
    const r = calcInheritanceTax(baseInput(undefined));
    expect(cohabit(r)?.cohabitYears).toBeUndefined();
    expect(cohabit(r)?.cappedDeduction).toBe(500_000_000);
    expect(cohabit(r)?.isExcluded).not.toBe(true);
  });
});
