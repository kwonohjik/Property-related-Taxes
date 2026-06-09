/**
 * 비상속인(상속인·수유자 외) 사전증여 수증자 배부·공제 anchor.
 *
 * 설계: docs/02-design/features/inheritance-non-heir-prior-gift-allocation-fix.engine.design.md
 * 버그: 후순위 "기타(other)"·인척(며느리)이 사전증여만 받았을 때 ⑪·⑫에 상속인으로 오분류.
 * 수정: 민법 §1000 순위 자동판정(isInheritanceTaxPayer) → ⑪·⑫ 제외, ⑩ §28②본문 공제.
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  Heir,
  EstateItem,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const HOUSE: EstateItem = {
  id: "e-house",
  category: "real_estate_apartment",
  name: "주택",
  marketValue: 5_000_000_000,
};

function base(heirs: Heir[], priorGifts: PriorGift[]): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2024-03-01",
    estateItems: [HOUSE],
    heirs,
    preGiftsWithin10Years: priorGifts, // 합산(②)·배부 소스 (inheritance-tax.ts:109)
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    deductionInput: {
      heirs,
      spouseActualAmount: 0,
      netFinancialAssets: 0,
      cohabitHouseStdPrice: 0,
      farmingAssetValue: 0,
      familyBusinessValue: 0,
    },
    creditInput: { priorGifts, isFiledOnTime: true },
  } as InheritanceTaxInput;
}

describe("비상속인 사전증여 수증자 배부·공제 (§3의2①·§28②)", () => {
  // 자녀 2인(1순위) + 윤며느리(other, 사전증여만 받은 비상속인)
  const HEIRS_WITH_DAUGHTER_IN_LAW: Heir[] = [
    { id: "h-child1", name: "김첫째", relation: "child" },
    { id: "h-child2", name: "김둘째", relation: "child" },
    { id: "h-inlaw", name: "윤며느리", relation: "other" },
  ];
  const INLAW_GIFT: PriorGift[] = [
    {
      giftDate: "2022-06-01", // 5년 이내
      isHeir: false,
      giftAmount: 250_000_000,
      giftTaxBase: 240_000_000,
      giftTaxPaid: 38_000_000,
      doneeId: "h-inlaw",
      beneficiaryType: "legatee", // 비상속인 자연인
    },
  ];

  it("RN-1: 윤며느리(후순위 other) ⑪ 산출세액 배부 제외 (computedTaxShare=0)", () => {
    const r = calcInheritanceTax(base(HEIRS_WITH_DAUGHTER_IN_LAW, INLAW_GIFT));
    const inlaw = r.heirAllocationResult!.perHeir["h-inlaw"];
    expect(inlaw.computedTaxShare).toBe(0);
    expect(inlaw.isTaxPayer).toBe(false);
  });

  it("RN-2: 윤며느리 ⑫ 증여세액공제 제외 (priorGiftCredit=0)", () => {
    const r = calcInheritanceTax(base(HEIRS_WITH_DAUGHTER_IN_LAW, INLAW_GIFT));
    const inlaw = r.heirAllocationResult!.perHeir["h-inlaw"];
    expect(inlaw.priorGiftCredit).toBe(0);
  });

  it("RN-3: 윤며느리 ⑩ §28②본문 증여세액공제 = Min(38M, 한도)", () => {
    const r = calcInheritanceTax(base(HEIRS_WITH_DAUGHTER_IN_LAW, INLAW_GIFT));
    const inlaw = r.heirAllocationResult!.perHeir["h-inlaw"];
    // 한도 = floor(computedTax × 240M / taxBase). 증여세 38M과 Min.
    expect(inlaw.nonHeirGiftCredit).toBeGreaterThan(0);
    expect(inlaw.nonHeirGiftCredit).toBeLessThanOrEqual(38_000_000);
    expect(inlaw.nonHeirGiftCreditLimit).toBeGreaterThan(0);
  });

  it("RN-4: 자녀(상속인)는 ⑪ 배부 정상 + isTaxPayer=true", () => {
    const r = calcInheritanceTax(base(HEIRS_WITH_DAUGHTER_IN_LAW, INLAW_GIFT));
    const c1 = r.heirAllocationResult!.perHeir["h-child1"];
    expect(c1.isTaxPayer).toBe(true);
    expect(c1.computedTaxShare).toBeGreaterThan(0);
  });

  it("RN-5: 정합 — Σ computedTaxShare(상속인) == distributableTax", () => {
    const r = calcInheritanceTax(base(HEIRS_WITH_DAUGHTER_IN_LAW, INLAW_GIFT));
    const har = r.heirAllocationResult!;
    const sumComputed = Object.values(har.perHeir).reduce(
      (s, p) => s + (p.computedTaxShare ?? 0),
      0,
    );
    expect(sumComputed).toBe(har.distributableTax);
  });

  it("RN-6 (C-3 회귀): 4촌 방계(other) 단독상속 — shares 멤버 → ⑪·⑫ 정상 포함", () => {
    // 1~3순위·배우자 부재, other만 → 민법 §1000 4순위 단독상속
    const heirs: Heir[] = [
      { id: "h-other1", name: "사촌", relation: "other" },
      { id: "h-other2", name: "사촌2", relation: "other" },
    ];
    const r = calcInheritanceTax(base(heirs, []));
    const o1 = r.heirAllocationResult!.perHeir["h-other1"];
    expect(o1.isTaxPayer).toBe(true); // 단독상속인 → 납세의무자
    expect(o1.computedTaxShare).toBeGreaterThan(0); // ⑪ 정상 배부
  });

  it("RN-7 (회귀): 비상속인 없으면 모든 상속인 isTaxPayer=true (동작 불변)", () => {
    const heirs: Heir[] = [
      { id: "h-spouse", name: "배우자", relation: "spouse" },
      { id: "h-child", name: "자녀", relation: "child" },
    ];
    const r = calcInheritanceTax(base(heirs, []));
    expect(r.heirAllocationResult!.perHeir["h-spouse"].isTaxPayer).toBe(true);
    expect(r.heirAllocationResult!.perHeir["h-child"].isTaxPayer).toBe(true);
  });
});
