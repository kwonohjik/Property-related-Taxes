import { describe, it, expect } from "vitest";
import {
  sumEstateItemsValuation,
  sumPresumedItems,
} from "@/lib/stores/inheritance-summary";
import type {
  EstateItem,
  PresumedInheritanceItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function estate(partial: Partial<EstateItem>): EstateItem {
  return {
    id: partial.id ?? "e1",
    category: partial.category ?? "real_estate",
    name: partial.name ?? "",
    ...partial,
  } as EstateItem;
}

describe("sumEstateItemsValuation — 그룹별 평가액 합계 (접기 헤더 요약용)", () => {
  it("EG-01 빈 배열 → 0", () => {
    expect(sumEstateItemsValuation([])).toBe(0);
  });

  it("EG-02 marketValue 합산", () => {
    const items = [
      estate({ id: "e1", marketValue: 100_000_000 }),
      estate({ id: "e2", marketValue: 200_000_000 }),
    ];
    expect(sumEstateItemsValuation(items)).toBe(300_000_000);
  });

  it("EG-03 marketValue 없으면 standardPrice fallback", () => {
    const items = [estate({ id: "e1", standardPrice: 50_000_000 })];
    expect(sumEstateItemsValuation(items)).toBe(50_000_000);
  });

  it("EG-04 marketValue가 standardPrice보다 우선", () => {
    const items = [
      estate({ id: "e1", marketValue: 80_000_000, standardPrice: 50_000_000 }),
    ];
    expect(sumEstateItemsValuation(items)).toBe(80_000_000);
  });

  it("EG-05 상장주식 평균가 × 주식수", () => {
    const items = [
      estate({
        id: "s1",
        category: "listed_stock",
        listedStockAvgPrice: 10_000,
        listedStockShares: 1_000,
      }),
    ];
    expect(sumEstateItemsValuation(items)).toBe(10_000_000);
  });
});

describe("sumPresumedItems — 추정상속재산 §15 가산 합계", () => {
  function presumed(p: Partial<PresumedInheritanceItem>): PresumedInheritanceItem {
    return {
      id: p.id ?? "p1",
      category: p.category ?? "real_estate",
      amountWithin1Y: p.amountWithin1Y ?? 0,
      amountWithin2Y: p.amountWithin2Y ?? 0,
      verifiedUseAmount: p.verifiedUseAmount ?? 0,
      ...p,
    };
  }

  it("EG-06 빈 배열 → 0", () => {
    expect(sumPresumedItems([])).toBe(0);
  });

  it("EG-07 임계 미달(소액)·사용처 전액 입증 → 가산 0", () => {
    // 1년 이내 1천만(2억 임계 미달) + 전액 입증 → addedAmount 0
    const items = [
      presumed({
        amountWithin1Y: 10_000_000,
        verifiedUseAmount: 10_000_000,
      }),
    ];
    expect(sumPresumedItems(items)).toBe(0);
  });

  it("EG-08 여러 항목 가산액 합산 (evaluatePresumedItem 위임)", () => {
    // 큰 금액·미입증 → 가산 발생. 합계가 각 항목 가산의 합과 동일함을 검증.
    const a = presumed({ id: "p1", amountWithin1Y: 500_000_000, verifiedUseAmount: 0 });
    const b = presumed({ id: "p2", amountWithin1Y: 300_000_000, verifiedUseAmount: 0 });
    const total = sumPresumedItems([a, b]);
    const indiv = sumPresumedItems([a]) + sumPresumedItems([b]);
    expect(total).toBe(indiv);
    expect(total).toBeGreaterThan(0);
  });
});
