/**
 * Anchor — H-16 레거시 전역 세대생략(§27) 시 배부표 생략 (자동 안분 fallback 금지)
 *
 * §27 할증은 특정 세대생략 상속인·수유자에게만 가산된다. 레거시 전역 input.isGenerationSkip 경로는
 * perHeirSurcharge를 산출하지 못해 어느 상속인에게도 할증을 귀속할 수 없다. 이때 배부표를 만들면
 * §27 할증이 배부표에 미반영 → Σ perHeir.finalTax < 결정세액(할증만큼 부족). 전 상속인 균등 안분은
 * §27 법리 위반이므로 금지 → 배부표 생략(undefined) + 경고. 결정세액에는 할증 정상 반영.
 *
 * 종전(버그): 배부표를 산출하되 perHeirSurcharge=0 → Σ perHeir가 결정세액보다 ~1.86억 부족.
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type { InheritanceTaxInput, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

const HEIRS: Heir[] = [
  { id: "h-spouse", name: "배우자", relation: "spouse" },
  { id: "h-son", name: "장남", relation: "child" },
];

function baseInput(opts: { genSkip?: boolean; beneficiary?: boolean }): InheritanceTaxInput {
  const heirs = opts.beneficiary
    ? [HEIRS[0], { ...HEIRS[1], isGenerationSkipBeneficiary: true }]
    : HEIRS;
  return {
    decedentType: "resident",
    deathDate: "2024-03-01",
    estateItems: [
      { id: "e1", category: "real_estate_apartment", name: "주택", marketValue: 3_000_000_000 },
    ],
    heirs,
    preGiftsWithin10Years: [],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    debtItems: [],
    isGenerationSkip: opts.genSkip ?? false,
    deductionInput: {
      heirs,
      spouseActualAmount: 0,
      netFinancialAssets: 0,
      cohabitHouseStdPrice: 0,
      farmingAssetValue: 0,
      familyBusinessValue: 0,
    },
    creditInput: { priorGifts: [], isFiledOnTime: true },
  } as InheritanceTaxInput;
}

const sumPerHeir = (r: ReturnType<typeof calcInheritanceTax>): number | null =>
  r.heirAllocationResult
    ? Object.values(r.heirAllocationResult.perHeir).reduce((s, h) => s + h.finalTax, 0)
    : null;

describe("H-16 레거시 전역 세대생략 배부표 생략", () => {
  it("[H16] 레거시 전역 isGenerationSkip → 배부표 생략 + 경고 (결정세액엔 할증 반영)", () => {
    const r = calcInheritanceTax(baseInput({ genSkip: true }));
    expect(r.generationSkipSurcharge).toBeGreaterThan(0); // 할증 발생
    expect(r.heirAllocationResult).toBeUndefined(); // 배부표 생략 (자동 안분 금지)
    expect((r.warnings ?? []).some((w) => w.includes("세대생략 할증"))).toBe(true);
  });

  it("[H16-REG] 세대생략 없음 → 배부표 유지, Σ perHeir = 결정세액 (회귀 보존)", () => {
    const r = calcInheritanceTax(baseInput({ genSkip: false }));
    expect(r.heirAllocationResult).toBeDefined();
    expect(sumPerHeir(r)).toBe(r.finalTax);
  });

  it("[H16-PERHEIR] 세대생략 수유자 개별 지정 → 배부표 유지, Σ perHeir = 결정세액", () => {
    const r = calcInheritanceTax(baseInput({ genSkip: false, beneficiary: true }));
    expect(r.heirAllocationResult).toBeDefined();
    expect(sumPerHeir(r)).toBe(r.finalTax);
  });
});
