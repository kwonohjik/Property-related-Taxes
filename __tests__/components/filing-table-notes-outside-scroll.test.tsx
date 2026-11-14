/**
 * 신고서 양식 표 아래 「※」 안내가 표의 가로 스크롤 영역 **밖**에 있다 — 375px에서 문장 끝이 가려지던 결함.
 * 계획서: `docs/00-pm/filing-table-footnote-375-clip.plan.md`
 *
 * 종전: 안내 블록이 `overflow-x-auto` 안의 `inline-block min-w-full`에 들어 있어, 표가 화면보다 넓으면(375px에서 내용 414 · 칸 339)
 * 안내가 **표 폭**으로 줄바꿈되어 오른쪽 끝이 잘렸다(옆으로 밀어야 읽힘). jsdom은 레이아웃을 재지 못하므로
 * 「스크롤 영역의 자손이 아니다」라는 구조를 못박고, 실제 폭은 E2E(`filing-table-footnote-375.spec.ts`)가 잰다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const breakdown = (propertyId: string, refCalc: number) =>
  ({
    propertyId, propertyLabel: propertyId, transferPrice: 100_000_000, acquisitionPrice: 50_000_000, necessaryExpense: 0, capitalExpenditureForDisplay: 0,
    transferGain: 50_000_000, isExempt: false, income: 40_000_000, incomeAfterOffset: 40_000_000, longTermHoldingDeduction: 10_000_000,
    appliedRate: 0.38, refCalculatedTax: refCalc, refDeterminedTax: refCalc,
  }) as unknown as PerPropertyBreakdown;

const aggregated = {
  totalIncomeAfterOffset: 375_000_000, basicDeduction: 2_500_000, taxBase: 372_500_000, calculatedTax: 123_060_000, reductionAmount: 0, determinedTax: 123_060_000,
  penaltyTax: 0, localIncomeTax: 12_306_000, priorPaidTax: 0, settlementAdditionalPayable: 123_060_000, settlementRefund: 0, priorPaidLocalTax: 0, settlementLocalPayable: 12_306_000,
} as unknown as AggregateMeta["aggregated"];

function twoHouseForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-03-10";
  form.assets = [
    { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2018-02-01" } as AssetForm,
    { ...makeDefaultAsset(2), assetId: "a2", assetKind: "housing", acquisitionDate: "2016-04-01" } as AssetForm,
  ];
  return form;
}

describe("신고서 표 ※ 안내 — 가로 스크롤 영역 밖", () => {
  it("N-1 🔴 합산 표 자산별 세액 칸 안내(`filing-row-footnote`)가 `overflow-x-auto`의 자손이 아니다", () => {
    render(
      <FilingFormTable
        result={{} as TransferTaxResult}
        formData={twoHouseForm()}
        aggregate={{ properties: [breakdown("primary", 74_870_000), breakdown("a2", 27_610_000)], aggregated }}
      />,
    );
    const note = screen.getByTestId("filing-row-footnote");
    expect(note.textContent).toContain("자산별 칸(참고)");
    // 짝 가드 — 표 자체는 여전히 스크롤 영역 안이다(표를 잘못 꺼내지 않았다)
    const table = note.closest("[data-print-section='form-table']")!.querySelector("table")!;
    expect(table.closest(".overflow-x-auto")).not.toBeNull();
    expect(note.closest(".overflow-x-auto")).toBeNull();
  });
});
