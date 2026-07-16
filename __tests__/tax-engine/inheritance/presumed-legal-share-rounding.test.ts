/**
 * 추정상속재산(§15) 법정상속분 안분 — 다항목 floor 오차 수정 anchor
 *
 * 버그(이미지52): 추정상속재산 350M을 법정상속분(배우자 1.5:자녀 1:자녀 1 = 3:2:2)으로 안분하면
 *   배우자 150,000,000 / 자녀 100,000,000 / 100,000,000 이어야 하는데,
 *   협의분할 미입력 항목이 여럿(부동산 108M·예금 100M·채무 142M)일 때 항목별로 distributeByLegalShares를
 *   호출하여 항목마다 floor 잔액 흡수가 배우자에게 누적 → 150,000,004 / 99,999,998 / 99,999,998.
 *
 * 수정: 미입력 항목의 added를 합산한 뒤 1회만 안분 → floor 오차 단일화.
 *   협의분할 입력 항목은 개별 안분 유지(사용자 명시 분배).
 */
import { describe, it, expect } from "vitest";
import {
  calcHeirAllocation,
  type HeirAllocationParams,
} from "@/lib/tax-engine/inheritance-allocation";
import type {
  Heir,
  PresumedInheritanceItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const heir = (id: string, relation: Heir["relation"]): Heir => ({
  id,
  relation,
  name: id,
});

function params(
  presumedItems: PresumedInheritanceItem[],
  added: Map<string, number>,
): HeirAllocationParams {
  const heirs = [heir("sp", "spouse"), heir("c1", "child"), heir("c2", "child")];
  return {
    heirs,
    estateItems: [],
    presumedItems,
    debtItems: [],
    priorGifts: [],
    presumedAddedById: added,
    valuatedAmountById: new Map(),
    taxBase: 0,
    computedTax: 0,
    generationSkipSurcharge: 0,
    corporateExemption: 0,
    corporateGiftTaxBase: 0,
    grossEstateWithGifts: 350_000_000,
    isFiledOnTime: true,
    filingCreditRate: 0.03,
  };
}

const item = (id: string, category: PresumedInheritanceItem["category"]): PresumedInheritanceItem => ({
  id,
  category,
  amountWithin1Y: 0,
  amountWithin2Y: 0,
  verifiedUseAmount: 0,
});

describe("추정상속재산 법정상속분 안분 — 다항목 floor 오차 수정 (이미지52)", () => {
  it("PR-1: 미입력 3항목(108M·100M·142M=350M) → 합산 1회 안분 — 배우자 150M / 자녀 100M / 100M (오차 0)", () => {
    const items = [
      item("p1", "real_estate"),
      item("p2", "deposit"),
      item("p3", "financial_debt"),
    ];
    const added = new Map([
      ["p1", 108_000_000],
      ["p2", 100_000_000],
      ["p3", 142_000_000],
    ]);
    const r = calcHeirAllocation(params(items, added));
    expect(r.perHeir["sp"]?.presumedAmount).toBe(150_000_000);
    expect(r.perHeir["c1"]?.presumedAmount).toBe(100_000_000);
    expect(r.perHeir["c2"]?.presumedAmount).toBe(100_000_000);
  });

  it("PR-2: 단일 항목 350M → 동일 결과 (단일·다항목 일관성)", () => {
    const r = calcHeirAllocation(
      params([item("p1", "real_estate")], new Map([["p1", 350_000_000]])),
    );
    expect(r.perHeir["sp"]?.presumedAmount).toBe(150_000_000);
    expect(r.perHeir["c1"]?.presumedAmount).toBe(100_000_000);
    expect(r.perHeir["c2"]?.presumedAmount).toBe(100_000_000);
  });

  it("PR-3: 합계는 항상 added 총합 보존 (잔액 흡수)", () => {
    const items = [item("p1", "real_estate"), item("p2", "deposit")];
    const added = new Map([["p1", 100_000_001], ["p2", 99_999_999]]);
    const r = calcHeirAllocation(params(items, added));
    const sum =
      (r.perHeir["sp"]?.presumedAmount ?? 0) +
      (r.perHeir["c1"]?.presumedAmount ?? 0) +
      (r.perHeir["c2"]?.presumedAmount ?? 0);
    expect(sum).toBe(200_000_000);
  });

  it("PR-4: 협의분할 입력 항목은 개별 안분 유지 (미입력과 혼재) — 입력분 보존 + 미입력분 법정상속분", () => {
    const items: PresumedInheritanceItem[] = [
      // 협의분할 입력: 차남 100M 단독
      { ...item("p1", "deposit"), heirAllocations: [{ heirId: "c2", amount: 100_000_000 }] },
      // 미입력: 부동산 108M + 채무 142M = 250M → 법정상속분 안분
      item("p2", "real_estate"),
      item("p3", "financial_debt"),
    ];
    const added = new Map([
      ["p1", 100_000_000],
      ["p2", 108_000_000],
      ["p3", 142_000_000],
    ]);
    const r = calcHeirAllocation(params(items, added));
    // 미입력 250M 법정상속분(3:2:2): 배우자 floor(250M×3/7)=107,142,857, 자녀 각 floor(250M×2/7)=71,428,571, 배우자 잔액 흡수
    // 배우자 = 250M − 71,428,571×2 = 107,142,858 / 자녀 각 71,428,571 / + 차남 입력 100M
    const sp = r.perHeir["sp"]?.presumedAmount ?? 0;
    const c1 = r.perHeir["c1"]?.presumedAmount ?? 0;
    const c2 = r.perHeir["c2"]?.presumedAmount ?? 0;
    expect(sp + c1 + c2).toBe(350_000_000); // 총합 보존
    expect(c2).toBe(71_428_571 + 100_000_000); // 차남 = 미입력 법정분 + 협의분할 입력 100M
    expect(c1).toBe(71_428_571);
  });
});
