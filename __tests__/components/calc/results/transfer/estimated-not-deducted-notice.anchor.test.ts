/**
 * anchor: 환산 모드 「차감되지 않음」 고지가 **양도비도** 센다 (UI 리뷰 보통 #22).
 *
 * 종전 비교항은 `capitalExpenditureForDisplay`(자본적지출)와 폼의 **legacy** `directExpenses`
 * 둘뿐이었다. 신규 입력은 `capitalExpenditure`·`transferExpense`로 **분리**돼 있으므로
 * (`calc-wizard-asset.ts:178~182`), **자본적지출 0 + 양도비만** 입력하면 두 항이 다 0이라
 * **고지 자체가 뜨지 않았다** — 사용자는 입력한 양도비가 왜 세액에 반영되지 않는지 알 수 없다.
 *
 * 환산 모드에서 그 금액은 필요경비개산공제로 갈음되어 실제로 **차감되지 않는다**
 * (「소득세법 시행령」 §163⑥).
 */
import { describe, it, expect } from "vitest";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

/** 환산 모드 결과 — `estimatedBase`·`estimatedDeduction`이 있어야 환산 분기로 들어간다. */
const estimatedResult = (): TransferTaxResult =>
  ({
    transferPrice: 900_000_000,
    acquisitionPrice: 300_000_000,
    expenses: 3_000_000,
    transferGain: 572_000_000,
    taxableGain: 572_000_000,
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
    usedEstimatedAcquisition: true,
    estimatedBase: 300_000_000,
    estimatedDeduction: 3_000_000,
    capitalExpenditureForDisplay: 0,
    steps: [],
  }) as unknown as TransferTaxResult;

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2005-01-01",
    useEstimatedAcquisition: true,
    directExpenses: "",
    capitalExpenditure: "",
    transferExpense: "",
    ...over,
  }) as AssetForm;

const form = (a: AssetForm): TransferFormData =>
  ({ transferDate: "2024-06-01", contractTotalPrice: "900000000", assets: [a] }) as unknown as TransferFormData;

/** 「필요경비」 행 합계 열의 rose note. */
function expenseNote(a: AssetForm): string | undefined {
  const rows = buildRows(estimatedResult(), "single", form(a), a);
  return rows.find((r) => r.label === "필요경비")?.roseNotes?.total;
}

describe("환산 모드 「차감되지 않음」 고지", () => {
  it("🔑 N-1: 양도비만 입력해도 고지가 뜬다 (종전엔 침묵)", () => {
    const note = expenseNote(asset({ transferExpense: "5000000" }));
    expect(note).toBeTruthy();
    expect(note).toContain("5,000,000");
    expect(note).toContain("§163⑥");
  });

  it("N-2: 자본적지출 + 양도비면 합계로 고지한다", () => {
    const note = expenseNote(asset({ capitalExpenditure: "20000000", transferExpense: "5000000" }));
    expect(note).toContain("25,000,000");
  });

  it("N-3: legacy `directExpenses`만 있어도 종전대로 고지한다", () => {
    const note = expenseNote(asset({ directExpenses: "7000000" }));
    expect(note).toContain("7,000,000");
  });

  it("N-4: 아무것도 입력하지 않으면 고지하지 않는다 (없는 경고를 만들지 않는다)", () => {
    expect(expenseNote(asset())).toBeFalsy();
  });
});
