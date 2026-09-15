/**
 * 개산공제 산식 표시가 **실제 적용 율**을 말하는지 — `× 3%` 하드코딩 회귀 anchor.
 *
 * 종전에는 율이 문자열로 박혀 있어 미등기(0.3%)·§163⑥4호(1%)에서 **등식이 거짓**이었다:
 *   「개산공제 300,000 = 취득시 기준시가 100,000,000 × 3%」 (100,000,000 × 3% = 3,000,000).
 * 환산 모드 + 미등기에서 이미 도달 가능한 활성 결함이었다.
 *
 * 계획서: docs/00-pm/transfer-appraisal-salescase-lump-sum-deduction.plan.md
 */
import { describe, it, expect } from "vitest";

import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildNecessaryExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

function engineInput(over: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    transferPrice: 200_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2017-03-09"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 2,
    standardPriceAtAcquisition: 100_000_000,
    ...over,
  });
}

// ════════════════════════════════════════════════════════════════
// A-9 — 결과 산식 표시: 율 하드코딩 금지
// ════════════════════════════════════════════════════════════════

describe("A-9 — 개산공제 산식은 실제 적용 율을 말한다", () => {
  it("A-9a: 미등기 → `× 3%`가 아니라 0.3%로 표시되고 등식이 자기일관", () => {
    const r = calculateTransferTax(
      engineInput({ useEstimatedAcquisition: true, standardPriceAtTransfer: 150_000_000, isUnregistered: true }),
      makeMockRates(),
    );
    const formula = buildNecessaryExpenseFormula(r, false, r.expenses ?? 0);
    expect(r.estimatedDeduction).toBe(300_000);
    expect(
      formula,
      "종전: 「개산공제 300,000 = 취득시 기준시가 100,000,000 × 3%」 — 등식이 거짓이었다",
    ).not.toContain("× 3%");
    expect(formula).toContain("0.3%");
  });

  it("A-9b: 등기는 3% 그대로", () => {
    const r = calculateTransferTax(
      engineInput({ useEstimatedAcquisition: true, standardPriceAtTransfer: 150_000_000 }),
      makeMockRates(),
    );
    const formula = buildNecessaryExpenseFormula(r, false, r.expenses ?? 0);
    expect(formula).toContain("× 3%");
  });
});
