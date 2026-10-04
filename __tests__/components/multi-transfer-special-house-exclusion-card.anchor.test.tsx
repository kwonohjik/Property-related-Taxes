/**
 * anchor — 다건 결과 「건별 상세」에 단건과 같은 감면주택 판정 카드(`SpecialHouseExclusionDetailCard`)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9.8 「다건 감면주택 판정 카드」(사용자 결정 2026-10-04 「붙여라」).
 *
 * 다건 아코디언은 공용 `ReductionDetailCards`를 재사용하고, 엔진은 `pickReductionDetails`로 이 detail을 자산별
 * breakdown에 싣는다(route 경유 값 = 단건 값: `transfer.route.multi-special-act-exclusion.anchor.test.ts` MS-13).
 * 이 파일은 그 detail이 카드로 **렌더**되는지, 그리고 단건처럼 그 건의 명부로 「보유 주택 N」을 붙이는지를 고정한다
 * (#1954부터 다건 ⑬이 명부 행 선언을 건별로 보내므로 `houseId`는 그 건의 명부를 가리킨다).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(() => cleanup());

/** route MS-13a/b가 단건·다건 공통으로 내는 값 그대로 */
const DETAIL_99_2: NonNullable<PerPropertyBreakdown["specialHouseExclusionDetail"]> = {
  excludedCount: 1,
  entries: [
    { article: "unsold_99_2", articleLabel: "§99의2 신축주택등", eligible: true, legalBasis: "조특법 §99의2②", houseId: "h3" },
  ] as NonNullable<PerPropertyBreakdown["specialHouseExclusionDetail"]>["entries"],
};

function makeBreakdown(over: Partial<PerPropertyBreakdown> = {}): PerPropertyBreakdown {
  return {
    propertyId: "p1",
    propertyLabel: "주택 A",
    rateGroup: "progressive",
    transferPrice: 2_000_000_000,
    acquisitionPrice: 300_000_000,
    necessaryExpense: 0,
    capitalExpenditureForDisplay: 0,
    transferGain: 1_700_000_000,
    longTermHoldingDeduction: 0,
    income: 680_000_000,
    lossOffsetFromSameGroup: 0,
    lossOffsetFromOtherGroup: 0,
    incomeAfterOffset: 680_000_000,
    incomeDeductionReducible: 0,
    allocatedBasicDeduction: 0,
    taxBaseShare: 677_500_000,
    appliedRate: 0.42,
    progressiveDeduction: 35_940_000,
    determinedTax: 0,
    steps: [],
    isExempt: false,
    ...over,
  } as PerPropertyBreakdown;
}

function makeProperty(): PropertyItem {
  const form = createDefaultTransferFormData();
  form.houses = [
    { id: "h2", region: "capital", acquisitionDate: "2012-01-01", officialPrice: "300000000", isInherited: false, isLongTermRental: false },
    { id: "h3", region: "capital", acquisitionDate: "2013-06-01", officialPrice: "300000000", isInherited: false, isLongTermRental: false },
  ] as typeof form.houses;
  return { propertyId: "p1", propertyLabel: "주택 A", form, completionPercent: 100 } as PropertyItem;
}

describe("다건 건별 상세 — 감면주택 판정 카드", () => {
  it("MC-1 detail이 있으면 카드가 뜨고 단건과 같은 내용(조문·제외 채수·근거·그 건 명부의 보유 주택 N)", () => {
    render(
      <PropertyBreakdownAccordion
        breakdown={makeBreakdown({ specialHouseExclusionDetail: DETAIL_99_2 })}
        property={makeProperty()}
      />,
    );
    const card = screen.getByTestId("special-house-exclusion-card");
    expect(within(card).getByText("조특법 감면주택 보유 — 주택수 제외")).toBeInTheDocument();
    expect(within(card).getByText("제외 1채")).toBeInTheDocument();
    expect(within(card).getByText("주택수 제외")).toBeInTheDocument();
    expect(within(card).getByText("근거 조문: 조특법 §99의2②")).toBeInTheDocument();
    expect(within(card).getByTestId("count-exclusion-house-ref").textContent).toBe("보유 주택 2 (2013-06-01 취득) — ");
    expect(within(card).getByTestId("count-exclusion-house-ref").parentElement?.textContent).toBe(
      "보유 주택 2 (2013-06-01 취득) — §99의2 신축주택등",
    );
  });

  it("MC-2 (음성) detail이 없으면 카드가 뜨지 않는다", () => {
    render(<PropertyBreakdownAccordion breakdown={makeBreakdown()} property={makeProperty()} />);
    expect(screen.queryByTestId("special-house-exclusion-card")).toBeNull();
  });

  it("MC-3 (음성) entries가 비면 카드가 뜨지 않는다", () => {
    render(
      <PropertyBreakdownAccordion
        breakdown={makeBreakdown({ specialHouseExclusionDetail: { excludedCount: 0, entries: [] } })}
        property={makeProperty()}
      />,
    );
    expect(screen.queryByTestId("special-house-exclusion-card")).toBeNull();
  });
});
