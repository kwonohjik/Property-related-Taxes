/**
 * anchor(표시 전용) — 합산 상세명세서 「장기보유특별공제」 머리 산식이 혼합 비율을 공제율처럼 찍지 않는다.
 *
 * ## 결함 (2026-11-09 브라우저 실측)
 *
 * 머리 산식이 `과세대상 양도차익 × ${result.longTermHoldingRate}% (보유 + 거주)` 하나였다. 합산에서는 그 율이
 * 공제액 합 ÷ 차익 합의 **혼합 비율**이라 어느 자산의 공제율도 아니다:
 *
 * | 화면 | 표시 | 실제 자산별 공제율 |
 * |---|---|---|
 * | 연간 합산 오피스텔 + 아파트(중과) | × 7% | 20% · 0% |
 * | 함께 양도 주택 2채 | × 17% | 16% · 18% |
 * | 함께 양도 주택 + 오피스텔 | × 17% | 16% · 20% |
 *
 * 자산별 펼침(`buildLthFormula`)은 이미 자산마다 실제 율을 낸다. 자산 2건 이상이면 머리 산식은 합계임을 말한다. 값 불변.
 */
import { describe, it, expect } from "vitest";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const breakdown = (propertyId: string, transferGain: number, lthd: number) =>
  ({
    propertyId,
    propertyLabel: propertyId,
    transferPrice: transferGain * 2,
    acquisitionPrice: transferGain,
    necessaryExpense: 0,
    capitalExpenditureForDisplay: 0,
    transferGain,
    isExempt: false,
    income: transferGain - lthd,
    incomeAfterOffset: transferGain - lthd,
    longTermHoldingDeduction: lthd,
    appliedRate: 0.38,
    refCalculatedTax: 0,
    refDeterminedTax: 0,
  }) as unknown as PerPropertyBreakdown;

/** 함께 양도 주택 2채 실측 — 300,000,000 × 16% = 48,000,000 · 150,000,000 × 18% = 27,000,000 (합 75,000,000 ÷ 450,000,000 = 16.7%). */
const TWO: PerPropertyBreakdown[] = [breakdown("primary", 300_000_000, 48_000_000), breakdown("a2", 150_000_000, 27_000_000)];

function result(rate: number): TransferTaxResult {
  return {
    isExempt: false,
    transferGain: 450_000_000,
    taxableGain: 450_000_000,
    usedEstimatedAcquisition: false,
    longTermHoldingDeduction: 75_000_000,
    longTermHoldingRate: rate,
    basicDeduction: 2_500_000,
    taxBase: 372_500_000,
    appliedRate: 0.4,
    progressiveDeduction: 25_940_000,
    calculatedTax: 123_060_000,
    isSurchargeSuspended: false,
    reductionAmount: 0,
    determinedTax: 123_060_000,
    penaltyTax: 0,
    penaltyBase: 0,
    localIncomeTax: 12_306_000,
    totalTax: 135_366_000,
    steps: [],
  } as unknown as TransferTaxResult;
}

function form() {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-03-10";
  f.assets = [
    { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2018-02-01" } as AssetForm,
    { ...makeDefaultAsset(2), assetId: "a2", assetKind: "housing", acquisitionDate: "2016-04-01" } as AssetForm,
  ];
  return f;
}

const meta = (properties: PerPropertyBreakdown[]): AggregateMeta =>
  ({ properties, aggregated: { taxBase: 372_500_000, calculatedTax: 123_060_000 } }) as unknown as AggregateMeta;

const lthItem = (r: TransferTaxResult, m: AggregateMeta | undefined) =>
  buildStatementItems(r, form(), undefined, m, undefined).get("ltDeduction")!;

describe("상세명세서 장기보유특별공제 머리 산식 — 합산", () => {
  it("[LB-1] 🔴 자산 2건 — 혼합 비율(× 17%)을 찍지 않고 자산별 합계라고 말한다 · 값은 그대로", () => {
    const item = lthItem(result(75_000_000 / 450_000_000), meta(TWO));
    expect(item.value).toBe(75_000_000);
    expect(item.formula).not.toMatch(/×\s*\d+%/);
    expect(item.formula).toBe("자산별 장기보유특별공제 합계 (공제율은 자산마다 다름 — 자산별 펼침 참고)");
  });

  it("[LB-2] 자산별 펼침은 자산마다 실제 공제율을 낸다(16% · 18%)", () => {
    const item = lthItem(result(75_000_000 / 450_000_000), meta(TWO));
    const formulas = (item.perAsset ?? []).map((a) => (a as { formula?: string }).formula ?? "");
    expect(formulas.some((f) => f.includes("× 16%"))).toBe(true);
    expect(formulas.some((f) => f.includes("× 18%"))).toBe(true);
  });

  it("[LB-3] 단건 — 종전 산식 그대로(× 16%)", () => {
    expect(lthItem(result(0.16), undefined).formula).toBe("과세대상 양도차익 × 16% (보유 + 거주)");
  });

  it("[LB-4] 합산 자산 1건 — 혼합이 아니므로 종전 산식 그대로", () => {
    expect(lthItem(result(0.16), meta([TWO[0]])).formula).toBe("과세대상 양도차익 × 16% (보유 + 거주)");
  });
});
