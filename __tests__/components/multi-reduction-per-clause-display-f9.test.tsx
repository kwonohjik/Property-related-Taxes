/**
 * F-9 ⑦ — 다건 감면 재계산 카드가 **호별 산정**을 그대로 보여 준다.
 *
 * 호가 하나면 A·D 라벨이 「해당 호 산출세액·과세표준 (§104①N호)」가 되고, 호가 둘 이상이면
 * A·D 한 쌍으로는 산식이 성립하지 않으므로 호별 행을 따로 그린다. 호별 산정이 아니면(동등성)
 * 종전 「합산 산출세액」 라벨을 유지한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const E77 = {
  type: "public_expropriation",
  cashCompensation: 600_000_000,
  bondCompensation: 0,
  businessApprovalDate: D("2013-01-01"),
};
const E77_2026 = { ...E77, businessApprovalDate: D("2018-01-01") };
const y2026 = { acquisitionDate: D("2015-01-01"), transferDate: D("2026-06-01") };
const card = (id: string, o: Record<string, unknown>, reductions: unknown[] = []) => ({
  ...baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 500_000_000,
    acquisitionPrice: 150_000_000,
    acquisitionDate: D("2010-01-01"),
    transferDate: D("2024-06-01"),
    reductions,
    ...o,
  } as Partial<TransferTaxInput>),
  propertyId: id,
  propertyLabel: id,
});

function renderView(props: object[], taxYear: number) {
  const agg = calculateTransferTaxAggregate(
    { taxYear, annualBasicDeductionUsed: 0, properties: props } as never,
    rates,
  );
  const properties = agg.properties.map((p) => ({
    propertyId: p.propertyId,
    propertyLabel: p.propertyLabel,
  })) as unknown as PropertyItem[];
  return render(<MultiTransferTaxResultView result={agg} properties={properties} taxYear={taxYear} />);
}

describe("F-9 감면 재계산 카드 — 호별 표시", () => {
  it("F9U-1 호가 하나면 「해당 호」 라벨과 그 호의 값", () => {
    const { container } = renderView([card("L", { isUnregistered: true }), card("B", {}, [E77])], 2024);
    const text = container.textContent ?? "";
    expect(text).toContain("해당 호 산출세액 (§104①1호)");
    expect(text).toContain("74,870,000");
    expect(text).toContain("해당 호 과세표준 (§104①1호)");
    expect(text).toContain("249,500,000");
    expect(text).not.toContain("합산 산출세액");
  });

  it("F9U-2 호가 둘이면 호별 행을 그리고 A·D 한 쌍은 숨긴다", () => {
    const { container, getByTestId } = renderView(
      [card("L", { ...y2026, isNonBusinessLand: true }, [E77_2026]), card("B", y2026, [E77_2026])],
      2026,
    );
    const rows = within(getByTestId("reduction-clause-rows")).getAllByRole("row");
    expect(rows).toHaveLength(3); // 머리글 + 2호
    expect(getByTestId("reduction-clause-rows").textContent).toContain("16,485,000");
    expect(getByTestId("reduction-clause-rows").textContent).toContain("12,570,000");
    expect(container.textContent ?? "").not.toContain("해당 호 산출세액 (§");
  });

  it("F9U-3 (대조군) 호별 산정이 아니면 종전 「합산 산출세액」 라벨", () => {
    const { container, queryByTestId } = renderView([card("L", {}, [E77]), card("B", {}, [E77])], 2024);
    expect(container.textContent ?? "").toContain("합산 산출세액");
    expect(queryByTestId("reduction-clause-rows")).toBeNull();
  });

  it("F9U-4 감면 후 비교로 감면 전 작은 방법이 채택되면 이유를 적는다 · 대조: 큰 쪽 채택이면 없다", () => {
    const bond5 = { ...E77_2026, cashCompensation: 0, bondCompensation: 600_000_000, bondHoldingYears: 5 };
    const flipped = renderView(
      [card("L", { ...y2026, isNonBusinessLand: true }, [bond5]), card("B", { ...y2026, transferPrice: 300_000_000 })],
      2026,
    );
    expect(flipped.getByTestId("comparative-after-reduction-note")).toBeTruthy();
    cleanup();
    const plain = renderView([card("L", { ...y2026, isNonBusinessLand: true }), card("B", y2026, [E77_2026])], 2026);
    expect(plain.queryByTestId("comparative-after-reduction-note")).toBeNull();
  });
});
