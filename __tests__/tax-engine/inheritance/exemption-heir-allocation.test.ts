/**
 * 작업4 anchor — 비과세·과세가액 불산입 재산의 상속인별 귀속(협의분할)
 *
 * 설계(anchor A1 확정): 후보② — taxableValueShare에 별도 −exemptShare 항 + 음수 가드.
 *   2단계 안분: claimedAmount 분배(미입력=법정상속분) → scaleMapToTotal(인정 exemptAmount).
 *
 * anchor:
 *  - EXA-1: exemption.heirAllocations → per-heir excludedFromTaxation 기입 + 비과세 기여분 정합
 *  - EXA-2: 협의분할 미입력 → 법정상속분으로 인정액 안분
 *  - EXA-3: 한도초과(금양임야) → 인정액 기준 안분(claimedAmount 아님)
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  Heir,
  EstateItem,
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
  marketValue: 1_000_000_000,
};

function base(exemptions?: ExemptionCheckedItem[]): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2024-03-01",
    estateItems: [HOUSE],
    heirs: HEIRS,
    preGiftsWithin10Years: [],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    exemptions,
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

function sumTVS(r: ReturnType<typeof calcInheritanceTax>): number {
  return Object.values(r.heirAllocationResult!.perHeir).reduce(
    (s, p) => s + p.taxableValueShare,
    0,
  );
}

describe("비과세 상속인별 귀속 (작업4)", () => {
  it("EXA-1: 협의분할 입력 → per-heir excludedFromTaxation 기입 + 비과세 기여분 정합", () => {
    const r = calcInheritanceTax(
      base([
        {
          ruleId: "inh_public_interest",
          claimedAmount: 100_000_000,
          heirAllocations: [
            { heirId: "h-spouse", amount: 60_000_000 },
            { heirId: "h-child", amount: 40_000_000 },
          ],
        },
      ]),
    );
    const perHeir = r.heirAllocationResult!.perHeir;
    expect(perHeir["h-spouse"].excludedFromTaxation).toBe(60_000_000);
    expect(perHeir["h-child"].excludedFromTaxation).toBe(40_000_000);

    // 비과세 기여분: ΣTVS(미입력) − ΣTVS(비과세) == exemptAmount
    const r0 = calcInheritanceTax(base());
    expect(sumTVS(r0) - sumTVS(r)).toBe(100_000_000);
  });

  it("EXA-2: 협의분할 미입력 → 법정상속분으로 인정액 안분", () => {
    const r = calcInheritanceTax(
      base([{ ruleId: "inh_public_interest", claimedAmount: 100_000_000 }]),
    );
    const perHeir = r.heirAllocationResult!.perHeir;
    const sumExcl =
      (perHeir["h-spouse"].excludedFromTaxation ?? 0) +
      (perHeir["h-child"].excludedFromTaxation ?? 0);
    // 배우자 1.5 : 자녀 1 → 6천만 / 4천만 (Σ=1억)
    expect(sumExcl).toBe(100_000_000);
    expect(perHeir["h-spouse"].excludedFromTaxation).toBe(60_000_000);
    expect(perHeir["h-child"].excludedFromTaxation).toBe(40_000_000);
  });

  it("EXA-3: 한도초과(족보 1천만 한도) → 인정액 기준 안분", () => {
    // 족보 청구 3천만, 인정 1천만(한도). 협의분할 배우자2천:자녀1천(=청구3천)
    const r = calcInheritanceTax(
      base([
        {
          ruleId: "inh_ritual_items",
          claimedAmount: 30_000_000,
          heirAllocations: [
            { heirId: "h-spouse", amount: 20_000_000 },
            { heirId: "h-child", amount: 10_000_000 },
          ],
        },
      ]),
    );
    const perHeir = r.heirAllocationResult!.perHeir;
    const sumExcl =
      (perHeir["h-spouse"].excludedFromTaxation ?? 0) +
      (perHeir["h-child"].excludedFromTaxation ?? 0);
    // 인정 1천만이 2:1 비율로 안분 → 약 666.7만 / 333.3만, Σ=1천만(청구 3천만 아님)
    expect(sumExcl).toBe(10_000_000);
  });
});
