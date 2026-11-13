/**
 * anchor — 겸용주택 × 부담부증여 신고서 합계 열 «양도가액» (계획서 docs/00-pm/mixed-use-4col-separate-acq-bg-carryover.plan.md Q-2 a)
 *
 * 종전: 합계 열 양도가액이 «-»(빈칸)였다 — 부담부증여 화면에는 폼 계약금액 칸이 없어 `totalTransferPrice`가 0이고(`bgSingle`도 겸용엔 없다),
 * 4열(250M/50M/250M/50M)과 명세서(양도로 보는 채무액 600,000,000)에는 값이 있는데 합계 열만 비었다.
 * 기대값은 엔진 anchor `mixed-use-burdened-gift.anchor.test.ts` M-0와 같은 시나리오(F1 · 시가 15억 · 채무 6억 · 세액 69,094,001).
 *
 *  · BT-1 합계 열 = 4열 합 = 양도로 보는 채무액 600,000,000 · 5열 모두 항등식 성립
 *  · BT-2 채무 전부 주택 귀속(상가 열 0)도 합계 = 4열 합
 *  · BT-3 짝 — 부담부증여 아닌 겸용은 종전대로 폼 계약금액(override)을 합계로 쓴다
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

const RATES = makeMockRates() as never;
const TD = new Date("2024-03-01");
const ACQ = new Date("2010-03-15");
const asset = (over: Record<string, unknown> = {}) =>
  ({
    isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 200,
    landAcquisitionDate: ACQ, buildingAcquisitionDate: ACQ,
    transferStandardPrice: { housingPrice: 600e6, commercialBuildingPrice: 100e6, landPricePerSqm: 5_000_000, housingBuildingPrice: 100e6 },
    acquisitionStandardPrice: { housingPrice: 300e6, commercialBuildingPrice: 50e6, landPricePerSqm: 2_500_000, housingBuildingPrice: 50e6 },
    residencePeriodYears: 0, isMetropolitanArea: true, zoneType: "residential", isOneHouseExempt: false, acquisitionCause: "purchase", ...over,
  }) as never;
const bg = (over: Record<string, unknown> = {}) =>
  ({
    valuationMode: "sangjeungbeop_market", lendingDepositTotal: 0, mortgageDebtAmount: 600e6, annualRentTotal: 0, marketValueAtTransfer: 1_500_000_000,
    acquisitionMethod: "actual", actualAcquisitionTotal: 700e6, landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 1_200_000_000,
    landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 300e6 + 2_500_000 * 100 + 50e6, donorRelation: "lineal_descendant",
    debtAttribution: { housing: 0, commercial: 0, unallocated: 600e6 }, housingAppraisal: { exists: false }, ...over,
  }) as never;

const COLS = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"] as const;
function rowsOf(b: ReturnType<typeof calcMixedUseTransferTax>, override?: number) {
  const r = mixedUseToFilingResult(b);
  const fd = { transferDate: "2024-03-01", filingDate: "2024-12-31", contractTotalPrice: "", assets: [{ ...makeDefaultAsset(1), acquisitionDate: "2010-03-15" }] } as never;
  return buildRows(r, deriveColumns(r).mode, fd, undefined, override);
}
const cell = (rows: ReturnType<typeof rowsOf>, label: string, col: string) => {
  const v = (rows.find((x) => x.label === label)?.values as Record<string, unknown> | undefined)?.[col];
  return typeof v === "number" ? v : null;
};

describe("BT 겸용 × 부담부증여 신고서 합계 열 양도가액 (Q-2 a)", () => {
  it("BT-1 합계 = 4열 합 = 600,000,000 · 합계 열 항등식 (종전: 합계 빈칸)", () => {
    const b = calcMixedUseTransferTax(1, TD, { ...(asset() as object), burdenedGift: bg() } as never, RATES);
    expect(b.total.determinedTax).toBe(69_094_001); // 엔진 anchor M-0와 같은 시나리오
    expect(b.burdenedGift?.assumedDebtAmount).toBe(600_000_000);
    const rows = rowsOf(b);
    const cols = COLS.map((c) => cell(rows, "양도가액", c));
    expect(cols).toEqual([250_000_000, 50_000_000, 250_000_000, 50_000_000]);
    expect(cell(rows, "양도가액", "total")).toBe(600_000_000);
    const [tp, ac, ex, gn] = ["양도가액", "취득가액", "필요경비", "전체 양도차익"].map((l) => cell(rows, l, "total") ?? 0);
    expect(tp - ac - ex).toBe(gn);
    expect(gn).toBe(320_000_002);
  });

  it("BT-2 채무 전부 주택 귀속 — 상가 열 0 · 합계 = 4열 합(600,000,000)", () => {
    const b = calcMixedUseTransferTax(1, TD, { ...(asset() as object), burdenedGift: bg({ debtAttribution: { housing: 600e6, commercial: 0, unallocated: 0 } }) } as never, RATES);
    const rows = rowsOf(b);
    expect(COLS.map((c) => cell(rows, "양도가액", c))).toEqual([500_000_000, 100_000_000, 0, 0]);
    expect(cell(rows, "양도가액", "total")).toBe(600_000_000);
  });

  it("BT-3 짝 — 부담부증여 아닌 겸용은 종전대로 폼 계약금액(override)이 합계 (3,000,000,000)", () => {
    const b = calcMixedUseTransferTax(3_000_000_000, new Date("2024-08-20"), asset(), RATES);
    expect(b.burdenedGift).toBeUndefined();
    expect(cell(rowsOf(b, 3_000_000_000), "양도가액", "total")).toBe(3_000_000_000);
  });
});
