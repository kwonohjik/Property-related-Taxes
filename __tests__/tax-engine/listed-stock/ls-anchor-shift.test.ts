/**
 * Phase 3 anchor — EstateItem.resolvedValuationAnchor → besshiData echo.
 *
 * 이미지 13 본문: 갑지 ④에 shift된 anchor가 표시되어야 함.
 * Plan: docs/00-pm/listed-stock-valuation-anchor-shift-fix.plan.md §3-8
 */

import { describe, it, expect } from "vitest";
import { evaluateListedStock } from "@/lib/tax-engine/property-valuation-stock";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const BASE: EstateItem = {
  id: "as-test",
  category: "listed_stock",
  name: "테스트",
  listedStockAvgPrice: 10000,
  listedStockShares: 100,
  stockClass: "common",
};

describe("EstateItem.resolvedValuationAnchor → 갑지 ④ shift 적용", () => {
  it("AS-01: 사용자 입력 12-03 토 + resolvedValuationAnchor 12-02 → 갑지 ④ = 12-02", () => {
    const result = evaluateListedStock(
      { ...BASE, resolvedValuationAnchor: "2022-12-02" },
      { valuationDate: "2022-12-03" },
    );
    expect(result.besshiData?.page1.valuationDate).toBe("2022-12-02");
  });

  it("AS-02: resolvedValuationAnchor 없으면 context.valuationDate 사용 (회귀 가드)", () => {
    const result = evaluateListedStock(BASE, { valuationDate: "2022-07-06" });
    expect(result.besshiData?.page1.valuationDate).toBe("2022-07-06");
  });

  it("AS-03: 납회 2001-12-31 → anchor 12-28 → 갑지 ④ = 12-28", () => {
    const result = evaluateListedStock(
      { ...BASE, resolvedValuationAnchor: "2001-12-28" },
      { valuationDate: "2001-12-31" },
    );
    expect(result.besshiData?.page1.valuationDate).toBe("2001-12-28");
  });
});
