/** @vitest-environment jsdom */
/**
 * NH-64 — 함께 양도·다건 자산별 감면 카드가 단건 detail 값을 찍었다.
 *
 * 합산 엔진은 받은 양도차손 중 감면소득 몫을 감면소득금액에서 빼고(소득세법 시행령 §167의2② · `transfer-tax-aggregate-once.ts`)
 * 농어촌특별세도 함께 양도 전체로 다시 정한다. 자산 카드는 그 전의 단건 값(§99 차감 122,500,000 · 농특세 9,800,000)을 찍어,
 * 실제 적용(72,500,000 · 합산 농특세 5,510,000)과 달랐다. 금액은 mock 세율.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);
const D = (s: string) => new Date(s);
const N99 = {
  type: "new_99", contractDate99: D("1999-02-01"), standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: 150_000_000,
  standardPriceAtTransfer99: 300_000_000, exclusiveAreaSqm99: 84, isResident99: true, isHousingConstructionBusiness99: false, acquisitionType99: "from_builder", firstContract99: "yes",
};
/** §99 주택(양도차익 7억) + 차손 2억 토지 — 차손 일부가 감면소득 몫으로 간다 */
function aggregate() {
  const house = { ...baseTransferInput({ propertyType: "housing", isOneHousehold: true, householdHousingCount: 2, transferPrice: 800_000_000, acquisitionPrice: 100_000_000, acquisitionDate: D("1999-06-01"), transferDate: D("2024-06-01"), reductions: [N99] } as never), propertyId: "H", propertyLabel: "H" };
  const land = { ...baseTransferInput({ propertyType: "land", isOneHousehold: false, householdHousingCount: 0, transferPrice: 200_000_000, acquisitionPrice: 400_000_000, acquisitionDate: D("2010-01-01"), transferDate: D("2024-06-01") } as never), propertyId: "L", propertyLabel: "L" };
  return calculateTransferTaxAggregate({ taxYear: 2024, annualBasicDeductionUsed: 0, properties: [house, land] } as never, makeMockRates()) as unknown as {
    ruralSurtax: number;
    properties: (Record<string, unknown> & { propertyId: string; incomeDeductionReducible: number; isExempt: boolean; reductionType?: string })[];
  };
}
const card = (h: ReturnType<typeof aggregate>["properties"][number], aggregated: boolean) =>
  render(
    <ReductionDetailCards
      result={h as never}
      calculatedTax={0}
      taxBase={0}
      longTermHoldingDeduction={0}
      aggregatedContext={aggregated}
      appliedReductionType={h.reductionType}
      incomeDeductionApplied={h.incomeDeductionReducible}
    />,
  );

describe("NH-64 함께 양도 자산 카드 — 합산 엔진 적용액", () => {
  it("💰 시료 — 단건 detail 122,500,000 · 9,800,000 / 합산 적용 72,500,000 · 합산 농특세 5,510,000", () => {
    const a = aggregate();
    const h = a.properties.find((p) => p.propertyId === "H")!;
    const d = h.new99Detail as { reducibleTransferIncome: number; ruralSurtax: number };
    expect([d.reducibleTransferIncome, d.ruralSurtax]).toEqual([122_500_000, 9_800_000]);
    expect([h.incomeDeductionReducible, a.ruralSurtax]).toEqual([72_500_000, 5_510_000]);
  });

  it("🔑 합산 카드 — 차감액은 72,500,000 · 차이 사유 한 줄 · 단건 농특세 줄 대신 합산 산정 안내", () => {
    const h = aggregate().properties.find((p) => p.propertyId === "H")!;
    const { container } = card(h, true);
    expect(container.textContent).toContain("72,500,000");
    expect(screen.getByTestId("income-deduction-aggregate-applied").textContent).toContain("122,500,000");
    expect(screen.queryByTestId("income-deduction-aggregate-rural")).not.toBeNull();
    expect(container.textContent).not.toContain("9,800,000");
  });

  it("단건(aggregatedContext 없음) — 종전 표시 그대로(122,500,000 · 농특세 9,800,000 · 안내 없음)", () => {
    const h = aggregate().properties.find((p) => p.propertyId === "H")!;
    const { container } = card(h, false);
    expect(container.textContent).toContain("122,500,000");
    expect(container.textContent).toContain("9,800,000");
    expect(screen.queryByTestId("income-deduction-aggregate-applied")).toBeNull();
    expect(screen.queryByTestId("income-deduction-aggregate-rural")).toBeNull();
  });
});
