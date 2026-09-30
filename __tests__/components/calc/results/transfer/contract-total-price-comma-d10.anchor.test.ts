/**
 * D-10 후속 — 결과 표시 fallback이 `formData.contractTotalPrice`를 `Number()`로 읽어
 * 콤마가 든 문자열("900,000,000")에서 NaN이 되던 것 (계획서 `one-house-exemption-fix.plan.md` §9.4 D-10).
 *
 * 실 UI 입력은 숫자만 저장하므로(CurrencyInput → `onChange(raw)`) 도달하지 않지만,
 * sessionStorage를 직접 시드하는 E2E 4건이 콤마 형태를 쓴다. 다른 표시 지점과 같은
 * `parseAmount()`로 읽어 형태와 무관하게 같은 값을 낸다(세액 경로는 원래 `parseAmount`).
 */
import { describe, it, expect } from "vitest";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

const result = (): TransferTaxResult =>
  ({
    transferPrice: 900_000_000,
    acquisitionPrice: 300_000_000,
    expenses: 0,
    transferGain: 600_000_000,
    taxableGain: 600_000_000,
    longTermHoldingDeduction: 0,
    longTermHoldingRate: 0,
    basicDeduction: 2_500_000,
    taxBase: 0,
    appliedRate: 0.4,
    progressiveDeduction: 25_940_000,
    calculatedTax: 0,
    reductionAmount: 0,
    determinedTax: 0,
    localIncomeTax: 0,
    totalTax: 0,
    isExempt: false,
    steps: [],
  }) as unknown as TransferTaxResult;

const asset = (): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionDate: "2019-03-01",
    actualSalePrice: "900000000",
    fixedAcquisitionPrice: "300000000",
  }) as AssetForm;

const form = (contractTotalPrice: string, a: AssetForm): TransferFormData =>
  ({ transferDate: "2024-06-01", contractTotalPrice, assets: [a] }) as unknown as TransferFormData;

describe.each([
  ["콤마 포함(시드 형태)", "900,000,000"],
  ["숫자만(실 UI 형태)", "900000000"],
])("contractTotalPrice %s", (_label, raw) => {
  it("상세명세서 1단계 양도가액·취득가액이 NaN이 아니다", () => {
    const a = asset();
    const m = buildStatementItems(result(), form(raw, a), a, undefined, undefined);
    expect(m.get("transferPrice")?.value).toBe(900_000_000);
    expect(m.get("acquisitionPrice")?.value).toBe(300_000_000);
  });

  it("신고서 양식 양도가액 합계 칸이 비지 않는다", () => {
    const a = asset();
    const rows = buildRows(result(), "single", form(raw, a), a);
    expect(rows.find((r) => r.label === "양도가액")?.values.total).toBe(900_000_000);
  });
});
