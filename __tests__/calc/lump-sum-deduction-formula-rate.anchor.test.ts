/**
 * 개산공제 산식 표시가 **실제 적용 율**을 말하는지 — `× 3%` 하드코딩 회귀 anchor.
 *
 * 계획서: docs/00-pm/transfer-appraisal-salescase-lump-sum-deduction.plan.md §7.4
 *
 * ## 결함 (수정 전 실측)
 * 율이 문자열로 박혀 있어 미등기(시행령 §163⑥1호·2호 단서 3/1000)·§163⑥4호(1/100)에서
 * **등식이 거짓**이었다:
 *   「개산공제 300,000 = 취득시 기준시가 100,000,000 × 3%」 (100,000,000 × 3% = 3,000,000).
 * 환산 모드 + 미등기에서 이미 도달 가능한 활성 결함이었다.
 *
 * ## 왜 `buildStatementItems`를 통해 보는가
 * 산식 빌더를 직접 부르면 「호출부가 올바른 율을 넘기는가」가 검증되지 않는다 —
 * 라이브러리 anchor는 컴포넌트가 그것을 쓴다는 것을 증명하지 못한다. 배선까지 함께 잠근다.
 */
import { describe, it, expect } from "vitest";

import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

function engineResult(over: Partial<TransferTaxInput>): TransferTaxResult {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 200_000_000,
      transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2017-03-09"),
      acquisitionPrice: 0,
      isOneHousehold: false,
      householdHousingCount: 2,
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 100_000_000,
      standardPriceAtTransfer: 150_000_000,
      ...over,
    }),
    makeMockRates(),
  );
}

function form(assetOver: Partial<AssetForm> = {}, isUnregistered = false): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-02-16";
  f.contractTotalPrice = "200,000,000";
  f.isUnregistered = isUnregistered;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2017-03-09",
    actualSalePrice: "200,000,000",
    useEstimatedAcquisition: true,
    standardPriceAtAcq: "100000000",
    standardPriceAtTransfer: "150000000",
    ...assetOver,
  };
  return f;
}

/** ⑦ 상세명세서의 「필요경비」 행 산식 */
function expenseFormula(result: TransferTaxResult, f: TransferFormData): string {
  const items = buildStatementItems(result, f, f.assets[0], undefined, 200_000_000);
  return String(items.get("expenses")?.formula ?? "");
}

describe("A-9 — 개산공제 산식은 실제 적용 율을 말한다", () => {
  it("A-9a: 미등기 → `× 3%`가 아니라 0.3%로 표시된다", () => {
    const r = engineResult({ isUnregistered: true });
    expect(r.estimatedDeduction).toBe(300_000);
    const formula = expenseFormula(r, form({}, true));
    expect(
      formula,
      "종전: 「개산공제 300,000 = 취득시 기준시가 100,000,000 × 3%」 — 등식이 거짓이었다",
    ).not.toContain("× 3%");
    expect(formula).toContain("0.3%");
  });

  it("A-9b: 등기는 3% 그대로 — 넓히기 오판정 가드", () => {
    const formula = expenseFormula(engineResult({}), form());
    expect(formula).toContain("× 3%");
  });

  it("A-9c: 등식이 자기일관 — 표시된 base × 표시된 율 = 표시된 개산공제", () => {
    for (const unreg of [false, true]) {
      const r = engineResult({ isUnregistered: unreg });
      const formula = expenseFormula(r, form({}, unreg));
      const m = /개산공제 ([\d,]+) = 취득시 기준시가 ([\d,]+) × ([\d.]+)%/.exec(formula);
      expect(m, `산식 형태가 바뀌었다: ${formula}`).not.toBeNull();
      const [, ded, base, pct] = m!;
      const num = (v: string) => Number(v.replace(/,/g, ""));
      expect(Math.floor(num(base) * (Number(pct) / 100)), `미등기=${unreg}`).toBe(num(ded));
      expect(num(ded)).toBe(r.estimatedDeduction);
    }
  });
});
