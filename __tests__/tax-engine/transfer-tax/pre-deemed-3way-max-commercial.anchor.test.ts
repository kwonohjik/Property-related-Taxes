/**
 * 상가·오피스텔 — 의제취득일 전 상속에서 3자 max가 ③(환산)을 채택하면 추계로 계산한다.
 *
 * STEP 0.35(`applyCommercialBuildingStep`)는 상속이면 실가 모드로 내리는데, ③ 채택이면 그 결과가
 * 추계이므로 그대로 둔다 — 종전에는 ③ 금액을 실가로 차감해 개산공제(§163⑥)·§97②2호 단서가 빠지고
 * 자본적지출까지 함께 차감됐다(C4: 양도차익 −40,000,000 · 세액 0).
 * 계획서: docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md §10
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

function make(reported?: number, capitalExpenditure?: number): TransferTaxInput {
  return baseTransferInput({
    propertyType: "commercial_building",
    acquisitionCause: "inheritance",
    transferPrice: 920_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("1983-07-26"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 0,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAtTransfer: 400_000_000,
    ...(capitalExpenditure !== undefined ? { capitalExpenditure, transferExpense: 0 } : {}),
    inheritedAcquisition: {
      inheritanceDate: new Date("1983-07-26"),
      assetKind: "house_apart",
      ...(reported ? { reportedValue: reported } : {}),
      transferPrice: 920_000_000,
      standardPriceAtDeemedDate: 200_000_000,
      standardPriceAtTransfer: 400_000_000, // ③ = 920M × 200M / 400M = 460M
      transferDate: new Date("2023-02-16"),
    },
  }) as TransferTaxInput;
}

describe("상가 의제취득일 전 상속 — ③ 채택이면 추계", () => {
  it("C1: ① 1억 < ③ 460M → ③ · 개산공제 6,000,000 (종전 실가 차감 460,000,000)", () => {
    const r = calculateTransferTax(make(100_000_000), rates);
    expect(r.inheritedAcquisitionDetail!.preDeemedBreakdown!.selectedMethod).toBe("converted");
    expect(r.usedEstimatedAcquisition).toBe(true);
    expect(r.transferGain).toBe(920_000_000 - 460_000_000 - 6_000_000);
    expect(r.totalTax).toBe(110_198_000);
  });

  it("C3: ① 5억 > ③ → ① 실가 (변경 없음)", () => {
    const r = calculateTransferTax(make(500_000_000), rates);
    expect(r.inheritedAcquisitionDetail!.preDeemedBreakdown!.selectedMethod).toBe("reported");
    expect(r.usedEstimatedAcquisition).toBe(false);
    expect(r.transferGain).toBe(420_000_000);
    expect(r.totalTax).toBe(99_913_000);
  });

  it("C4: ③ 채택 + 자본적지출 5억 → §97②2호 단서 swap (종전 ③·자본적지출 이중 차감 −40,000,000)", () => {
    const r = calculateTransferTax(make(100_000_000, 500_000_000), rates);
    expect(r.swapComparison).toEqual({ estimatedSide: 466_000_000, directSide: 500_000_000, chosen: "direct" });
    expect(r.transferGain).toBe(420_000_000);
    expect(r.totalTax).toBe(99_913_000);
  });
});
