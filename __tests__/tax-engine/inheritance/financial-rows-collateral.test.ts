/**
 * buildPhaseDFinancialRows — §22 표시 rows에 담보 금융저당 차감 정합 anchor
 *
 * dual-truth 수정: 공제 base(suggestNetFinancialAssets, deduction-suggest.ts:121)는 담보 금융저당을
 * 차감하나, 표시 rows(phaseDFinancialRows)는 누락 → rows 합 > base. 본 수정으로 rows에도 반영.
 */
import { describe, expect, it } from "vitest";

import { buildPhaseDFinancialRows } from "@/lib/tax-engine/inheritance-tax-financial-rows";
import { deriveCollateralDebts } from "@/lib/tax-engine/inheritance-collateral-debt";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function asset(over: Partial<EstateItem>): EstateItem {
  return {
    id: over.id ?? "a1",
    category: over.category ?? "financial",
    name: over.name ?? "예금",
    ...over,
  };
}

describe("buildPhaseDFinancialRows — §22 담보 금융저당 정합", () => {
  it("FR-1: 예금 3억 + 주택 저당 1.5억(§14 ON·금융채무) → 예금 row + 담보 금융저당 row, 순금융 1.5억", () => {
    const items = [
      asset({ id: "a1", category: "financial", marketValue: 300_000_000 }),
      asset({
        id: "a2",
        category: "real_estate_apartment",
        name: "주택",
        marketValue: 2_000_000_000,
        mortgageAmount: 150_000_000,
        deductSecuredClaimAsDebt: true,
        securedClaimIsFinancialDebt: true,
      }),
    ];
    const rows = buildPhaseDFinancialRows(items, [], deriveCollateralDebts(items));
    expect(rows.find((r) => r.label === "예금")?.amount).toBe(300_000_000);
    expect(rows.find((r) => r.label === "담보 금융저당")?.amount).toBe(
      150_000_000,
    );
    // 순금융 = 자산 − (금융채무 + 담보 금융저당) = 3억 − 1.5억 = 1.5억 (공제 base와 정합)
    const debtSum = rows
      .filter((r) => r.label === "금융채무" || r.label === "담보 금융저당")
      .reduce((s, r) => s + r.amount, 0);
    expect(300_000_000 - debtSum).toBe(150_000_000);
  });

  it("FR-2: §14 자동공제 OFF → 담보 금융저당 row 없음 (회귀)", () => {
    const items = [
      asset({ id: "a1", category: "financial", marketValue: 300_000_000 }),
      asset({
        id: "a2",
        category: "real_estate_apartment",
        marketValue: 2_000_000_000,
        mortgageAmount: 150_000_000,
        securedClaimIsFinancialDebt: true,
        // deductSecuredClaimAsDebt 미설정 (OFF)
      }),
    ];
    const rows = buildPhaseDFinancialRows(items, [], deriveCollateralDebts(items));
    expect(rows.find((r) => r.label === "담보 금융저당")).toBeUndefined();
    expect(rows.find((r) => r.label === "예금")?.amount).toBe(300_000_000);
  });
});
