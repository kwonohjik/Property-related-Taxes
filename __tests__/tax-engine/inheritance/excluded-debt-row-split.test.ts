/**
 * 집계표 ㉠ 과세제외(비과세/불산입) · ㉡ 채무(채무/공과금/장례비) 행 분리 anchor.
 *
 * 설계: docs/02-design/features/heir-allocation-excluded-debt-row-split.engine.design.md
 * 불변식 (세액 영향 0):
 *   nonTaxableShare + notIncludedShare === excludedFromTaxation
 *   debtPrincipalShare + publicChargeShare + funeralShare === debtShare
 *   taxableValueShare 분리 전후 불변
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  Heir,
  EstateItem,
  DebtItem,
  ExemptionCheckedItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const HEIRS: Heir[] = [
  { id: "h-spouse", name: "배우자", relation: "spouse" },
  { id: "h-child", name: "자녀", relation: "child" },
];

const HOUSE: EstateItem = {
  id: "e-house",
  category: "real_estate_apartment",
  name: "주택",
  marketValue: 2_000_000_000,
};

function base(over?: Partial<InheritanceTaxInput>): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2024-03-01",
    estateItems: [HOUSE],
    heirs: HEIRS,
    preGiftsWithin10Years: [],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    deductionInput: {
      heirs: HEIRS,
      spouseActualAmount: 0,
      netFinancialAssets: 0,
      cohabitHouseStdPrice: 0,
      farmingAssetValue: 0,
      familyBusinessValue: 0,
    },
    creditInput: { priorGifts: [], isFiledOnTime: true },
    ...over,
  } as InheritanceTaxInput;
}

const EXEMPTIONS: ExemptionCheckedItem[] = [
  { ruleId: "inh_ritual_items", claimedAmount: 10_000_000 }, // §12 비과세
  { ruleId: "inh_public_interest", claimedAmount: 100_000_000 }, // §16 불산입
];

const DEBTS: DebtItem[] = [
  { id: "d-fin", name: "은행대출", category: "financial", amount: 200_000_000 },
  { id: "d-personal", name: "사채", category: "personal", amount: 100_000_000 },
  { id: "d-tax", name: "재산세", category: "tax", amount: 50_000_000 },
  { id: "d-meal", name: "장례식대", category: "funeral", amount: 12_000_000, isBongan: false },
  { id: "d-bongan", name: "봉안시설", category: "funeral", amount: 6_000_000, isBongan: true },
];

describe("과세제외·채무 행 분리 (집계표 ㉠ 2행·㉡ 3행)", () => {
  it("RS-1: 비과세/불산입 합 == excludedFromTaxation (treatment 분리)", () => {
    const r = calcInheritanceTax(base({ exemptions: EXEMPTIONS }));
    const perHeir = r.heirAllocationResult!.perHeir;
    for (const id of ["h-spouse", "h-child"]) {
      const p = perHeir[id];
      expect((p.nonTaxableShare ?? 0) + (p.notIncludedShare ?? 0)).toBe(
        p.excludedFromTaxation ?? 0,
      );
    }
    // Σ 비과세 == 1천만(족보), Σ 불산입 == 1억(공익법인)
    const sumNonTaxable = Object.values(perHeir).reduce((s, p) => s + (p.nonTaxableShare ?? 0), 0);
    const sumNotIncluded = Object.values(perHeir).reduce((s, p) => s + (p.notIncludedShare ?? 0), 0);
    expect(sumNonTaxable).toBe(10_000_000);
    expect(sumNotIncluded).toBe(100_000_000);
  });

  it("RS-2: 채무/공과금/장례비 합 == debtShare (category 분리·장례비 capped)", () => {
    const r = calcInheritanceTax(base({ debtItems: DEBTS }));
    const perHeir = r.heirAllocationResult!.perHeir;
    for (const id of ["h-spouse", "h-child"]) {
      const p = perHeir[id];
      expect(
        (p.debtPrincipalShare ?? 0) + (p.publicChargeShare ?? 0) + (p.funeralShare ?? 0),
      ).toBe(p.debtShare ?? 0);
    }
    const sum = (k: "debtPrincipalShare" | "publicChargeShare" | "funeralShare") =>
      Object.values(perHeir).reduce((s, p) => s + (p[k] ?? 0), 0);
    expect(sum("debtPrincipalShare")).toBe(300_000_000); // 금융 2억 + 사적 1억
    expect(sum("publicChargeShare")).toBe(50_000_000); // 공과금
    // 장례비: 식대 1,200만→capped 1,000만 + 봉안 600만→capped 500만 = 1,500만
    expect(sum("funeralShare")).toBe(15_000_000);
  });

  it("RS-3: 분리 echo 추가가 taxableValueShare 불변 (세액 영향 0)", () => {
    const input = base({ exemptions: EXEMPTIONS, debtItems: DEBTS });
    const r = calcInheritanceTax(input);
    const perHeir = r.heirAllocationResult!.perHeir;
    // 과세가액상당액 = 본래 + 추정 + 사전증여 − 채무 − 과세제외
    for (const id of ["h-spouse", "h-child"]) {
      const p = perHeir[id];
      const reconstructed = Math.max(
        0,
        p.directEstateAmount +
          p.presumedAmount +
          p.priorGiftAmount -
          p.debtShare -
          (p.excludedFromTaxation ?? 0),
      );
      expect(p.taxableValueShare).toBe(reconstructed);
    }
    // 결정세액 echo 존재(분리가 최종 세액 파이프라인 깨지 않음)
    expect(r.finalTax).toBeGreaterThanOrEqual(0);
  });
});
