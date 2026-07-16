/**
 * nonprofit-heir-allocation — 비영리법인 협의분할 per-heir 과세 anchor
 *
 * Design: docs/02-design/features/inheritance-heir-allocation-nonprofit-default-layout.engine.design.md
 *
 * 배경: inheritance-allocation.ts가 모든 relation==="corporate"를 영리법인(finalTax=0)으로
 *   취급하던 것을 isForProfitCorporate로 게이팅. 비영리법인(isForProfit===false)은 수유자처럼
 *   정상 과세, 영리법인(isForProfit≠false)은 finalTax=0 불변.
 *
 * 검증 (계획 §9 A-1~A-5):
 *   A-1 isForProfitCorporate predicate
 *   A-2 비영리법인 협의분할 배정 → finalTax > 0 + directEstateAmount === 배정액
 *   A-3 영리법인 동일 시나리오 → finalTax === 0 (회귀)
 *   A-4 총액 보존 — Σ perHeir.finalTax 정합
 *   A-5 비영리법인 categoryBreakdown·grossInheritance 정상
 */

import { describe, it, expect } from "vitest";
import { calcHeirAllocation } from "@/lib/tax-engine/inheritance-allocation";
import { isForProfitCorporate } from "@/lib/tax-engine/inheritance-gift-common";
import type {
  Heir,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const child = { id: "c1", relation: "child", name: "자녀" } as Heir;
const nonprofit = {
  id: "np1",
  relation: "corporate",
  name: "△△재단",
  isForProfit: false,
} as Heir;
const forprofit = {
  id: "fp1",
  relation: "corporate",
  name: "○○주식회사",
  isForProfit: true,
} as Heir;

const itemToNonprofit = {
  id: "A",
  category: "real_estate_land",
  name: "토지A",
  marketValue: 1_000_000_000,
  heirAllocations: [{ heirId: "np1", amount: 1_000_000_000 }],
} as unknown as EstateItem;
const itemToChild = {
  id: "B",
  category: "real_estate_land",
  name: "토지B",
  marketValue: 1_000_000_000,
  heirAllocations: [{ heirId: "c1", amount: 1_000_000_000 }],
} as unknown as EstateItem;

function run(corp: Heir) {
  return calcHeirAllocation({
    heirs: [child, corp],
    estateItems: [
      { ...itemToNonprofit, heirAllocations: [{ heirId: corp.id, amount: 1_000_000_000 }] },
      itemToChild,
    ],
    presumedItems: [],
    debtItems: [],
    priorGifts: [],
    presumedAddedById: new Map(),
    valuatedAmountById: new Map([
      ["A", 1_000_000_000],
      ["B", 1_000_000_000],
    ]),
    taxBase: 2_000_000_000,
    computedTax: 640_000_000,
    generationSkipSurcharge: 0,
    corporateExemption: 0,
    corporateGiftTaxBase: 0,
    grossEstateWithGifts: 2_000_000_000,
    isFiledOnTime: true,
    filingCreditRate: 0.03,
  });
}

describe("[비영리법인 협의분할] per-heir 과세 게이팅", () => {
  it("A-1: isForProfitCorporate — 영리 true / 비영리·자연인·수유자 false", () => {
    expect(isForProfitCorporate(forprofit)).toBe(true);
    expect(isForProfitCorporate({ relation: "corporate" })).toBe(true); // undefined=영리 기본
    expect(isForProfitCorporate(nonprofit)).toBe(false);
    expect(isForProfitCorporate(child)).toBe(false);
    expect(isForProfitCorporate({ relation: "legatee" })).toBe(false);
  });

  it("A-2: 비영리법인 협의분할 배정 → finalTax>0 + directEstateAmount=배정액", () => {
    const np = run(nonprofit).perHeir["np1"];
    expect(np.directEstateAmount).toBe(1_000_000_000);
    expect(np.taxBaseShare).toBe(1_000_000_000);
    expect(np.finalTax).toBe(310_400_000);
  });

  it("A-3: 영리법인 동일 시나리오 → finalTax=0 (회귀)", () => {
    const fp = run(forprofit).perHeir["fp1"];
    expect(fp.finalTax).toBe(0);
    expect(fp.directEstateAmount).toBe(0);
  });

  it("A-4: 총액 보존 — Σ perHeir.finalTax 정합 (비영리=자녀 대칭 50/50)", () => {
    const r = run(nonprofit);
    const sum = Object.values(r.perHeir).reduce((s, h) => s + h.finalTax, 0);
    expect(r.perHeir["c1"].finalTax).toBe(310_400_000);
    expect(sum).toBe(620_800_000); // 영리법인 단독 케이스(자녀 620,800,000)와 동일 총액
  });

  it("A-5: 비영리법인 categoryBreakdown·grossInheritance 정상", () => {
    const np = run(nonprofit).perHeir["np1"];
    expect(np.grossInheritance).toBe(1_000_000_000);
    expect(np.categoryBreakdown?.realEstate).toBe(1_000_000_000);
  });
});
