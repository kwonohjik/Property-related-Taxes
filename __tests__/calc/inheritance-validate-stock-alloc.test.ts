/**
 * 비상장 V1 협의분할 합계검증 — anchor (C9, §4-4)
 *
 * 계획: docs/00-pm/inheritance-unlisted-simple-stock-gross-estate-wiring.plan.md §4-4
 * 회귀 가드: 이전 validateEstateItemAllocations는 listed만 평가 위임 → V1 비상장은
 *   candidates=[] → return null(검증 건너뜀). 합계≠평가액이어도 차단 안 됨.
 */
import { describe, it, expect } from "vitest";
import { validateEstateItemAllocations } from "@/lib/calc/inheritance-validate";
import { computeStockValuation } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function v1Stock(heirAllocations?: EstateItem["heirAllocations"]): EstateItem {
  return {
    id: "s1",
    category: "unlisted_stock",
    name: "비상장A",
    unlistedValuationMode: "simple",
    unlistedStockData: {
      totalShares: 10_000,
      ownedShares: 10_000,
      weightedNetIncome: 100_000_000,
      netAssetValue: 5_000_000_000,
      capitalizationRate: 0.1,
    },
    heirAllocations,
  } as EstateItem;
}

describe("V1 비상장 협의분할 합계검증 (C9)", () => {
  it("합계 ≠ 평가액 → 오류 문자열 반환 (이전: null 통과)", () => {
    const val = computeStockValuation(v1Stock());
    expect(val).toBeGreaterThan(0);
    const err = validateEstateItemAllocations(
      v1Stock([{ heirId: "h2", amount: val - 1_000_000 }]), // 100만원 모자람
    );
    expect(err).not.toBeNull();
    expect(err).toContain("협의분할 합계");
  });

  it("합계 === 평가액 → null (통과)", () => {
    const val = computeStockValuation(v1Stock());
    const err = validateEstateItemAllocations(v1Stock([{ heirId: "h2", amount: val }]));
    expect(err).toBeNull();
  });

  it("협의분할 미입력 → null (총액-단위 모드 허용)", () => {
    expect(validateEstateItemAllocations(v1Stock())).toBeNull();
  });
});
