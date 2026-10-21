/**
 * anchor: 부담부증여 표시 취득가액·필요경비 — 결과 화면 (계획서 `docs/00-pm/burdened-gift-display-acquisition.plan.md` PR-1 · D1·D3).
 *
 * - D1 엔진 표시 echo(`resolveDisplayAcquisitionAndExpense`)에 §159 분기가 없어, 묶음 자산별 취득가액이 route 입력(화면에 없는
 *   자산 일반 칸 300,000,000)이고 필요경비가 역산 음수였다 → 합산 신고서 「취득가액 600,000,000 · 필요경비 0 · 차익 388,000,000」.
 * - D3 단건 원조합원 입주권 부담부증여의 신고서·명세서 §166 역산이 폼 계약금액(0)을 받아 합계 취득가액 −400,000,000.
 * 세액은 바뀌지 않는다(표시 전용 — 각 경우 결정세액 단언).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { burdenedGiftPerAssetTotals, redevInverseTransferPrice } from "@/lib/tax-engine/burdened-gift-totals";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { buildRows, deriveColumns, type AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { runCalc } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/** 원조합원 입주권 부담부증여 — 일반 기준시가 두 칸이 화면에 없다(#2351 Playwright 0개). */
const right = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(2), assetId: "o", addressJibun: "서울 강남구 테스트동 9-9",
    assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false, redevSubject: "right",
    acquisitionCause: "purchase", acquisitionDate: "2009-07-01", transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant",
    bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000",
    bgActualAcquisitionTotal: "300,000,000", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
    redevOriginalAssetType: "housing", redevRightsValue: "900,000,000", redevSettlementDirection: "pay",
    redevSettlementAmount: "200,000,000", redevPreApprovalExpenses: "0", useEstimatedAcquisition: false,
    standardPriceAtAcq: "", standardPriceAtTransfer: "", ...over,
  }) as AssetForm;
const house = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetId: "h", addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "600000000", standardPriceAtTransfer: "400000000",
    useEstimatedAcquisition: false, ...over,
  }) as AssetForm;
/** 부담부증여 주택(보충적 평가) — 양도시 기준시가 칸이 화면에 있다(§159 C의 입력). */
const bgHouse = (over: Record<string, unknown> = {}) =>
  house({
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "200000000", standardPriceAtTransfer: "1000000000",
    standardPriceAtAcq: "500000000", actualSalePrice: "", ...over,
  });
const BASE = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const bundle = (assets: AssetForm[], bundledSaleMode: "actual" | "apportioned", contractTotalPrice = "") =>
  Object.assign(createDefaultTransferFormData(), BASE, { assets, contractTotalPrice, assetSplitMode: "companion", bundledSaleMode }) as TransferFormData;


/** 단건 입주권 부담부증여 결정세액 — 수정 전 코드에서 같은 값(§4 PR-1 1단계). */
const DA2_TAX = 117_700_000;
const L = ["양도가액", "취득가액", "필요경비", "전체 양도차익"] as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cells = (rows: any[], col: string) => L.map((l) => rows.find((x) => x.label.trim() === l)?.values?.[col]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stmt = (items: Map<string, any>) => ["transferPrice", "acquisitionPrice", "expenses", "transferGain"].map((k) => items.get(k)?.value);
const single = (a: AssetForm) => Object.assign(createDefaultTransferFormData(), BASE, { assets: [a] }) as TransferFormData;
const h2 = () => bgHouse({ assetId: "h2", addressJibun: "서울 강남구 테스트동 3-3", standardPriceAtTransfer: "600000000", standardPriceAtAcq: "300000000" });

async function bundled(f: TransferFormData) {
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const agg = r.json.data.aggregated;
  const props = agg.properties as PerPropertyBreakdown[];
  const meta = { properties: props, aggregated: agg } as unknown as AggregateMeta;
  return {
    agg,
    echo: props.map((p) => [p.transferPrice, p.acquisitionPrice, p.necessaryExpense, p.transferGain]),
    rows: buildAggregateRows({} as unknown as TransferTaxResult, meta, f),
    items: buildStatementItems(aggregateToFilingResult(agg), f, undefined, meta, undefined),
  };
}

describe("DA-1 전 자산 부담부증여 묶음 — echo·합산 신고서·명세서가 §159 값 (D1)", () => {
  it.each([
    ["안분 16억", () => bundle([bgHouse(), h2()], "apportioned", "1600000000")],
    ["실가 거래", () => bundle([bgHouse(), h2()], "actual", "")],
  ] as const)("%s: 취득가액 250,000,000 · 150,000,000 · 필요경비 7,500,000 · 4,500,000 (종전 300,000,000 · 음수)", async (_l, mk) => {
    const f = mk();
    const { agg, echo, rows, items } = await bundled(f);
    expect(echo).toEqual([
      [500_000_000, 250_000_000, 7_500_000, 242_500_000],
      [300_000_000, 150_000_000, 4_500_000, 145_500_000],
    ]);
    expect(cells(rows, "total")).toEqual([800_000_000, 400_000_000, 12_000_000, 388_000_000]);
    expect(stmt(items)).toEqual([800_000_000, 400_000_000, 12_000_000, 388_000_000]);
    expect(agg.determinedTax).toBe(94_116_000);
  });

  it("주택 + 입주권 — 주택은 §159, 입주권은 §166 역산(200,000,000) · 결정세액 178,436,400", async () => {
    const { agg, echo, rows } = await bundled(bundle([bgHouse(), right()], "apportioned", ""));
    expect(echo).toEqual([
      [400_000_000, 200_000_000, 6_000_000, 194_000_000],
      [600_000_000, 200_000_000, 0, 400_000_000],
    ]);
    expect(cells(rows, "total")).toEqual([1_000_000_000, 400_000_000, 6_000_000, 594_000_000]);
    expect(agg.determinedTax).toBe(178_436_400);
  });
});

describe("DA-2 단건 원조합원 입주권 부담부증여 — 신고서·명세서 합계 (D3)", () => {
  it("합계 양도가액 600,000,000 · 취득가액 200,000,000 (종전 빈칸 · −400,000,000)", async () => {
    const f = single(right());
    const r = await runCalc(f);
    const res = r.json.data.result as TransferTaxResult;
    const { mode } = deriveColumns(res, undefined, undefined, undefined);
    expect(mode).toBe("redev-4split");
    const rows = buildRows(res, mode, f);
    expect(cells(rows, "total")).toEqual([600_000_000, 200_000_000, 0, 400_000_000]);
    // 분할 열은 종전 그대로(인가 전 120,000,000 · 청산금 80,000,000)
    expect(cells(rows, "preApproval")).toEqual([360_000_000, 120_000_000, 0, 240_000_000]);
    expect(cells(rows, "settlement")).toEqual([240_000_000, 80_000_000, 0, 160_000_000]);
    expect(stmt(buildStatementItems(res, f, undefined, undefined, undefined))).toEqual([600_000_000, 200_000_000, 0, 400_000_000]);
    expect(res.determinedTax).toBe(DA2_TAX);
  });
});

describe("DA-3 대조 — 바뀌지 않는다", () => {
  it("단건 주택 부담부증여 신고서·명세서(이미 §159 값)", async () => {
    const f = single(bgHouse());
    const r = await runCalc(f);
    const res = r.json.data.result as TransferTaxResult;
    const { mode } = deriveColumns(res, undefined, undefined, undefined);
    expect(cells(buildRows(res, mode, f), "total")).toEqual([400_000_000, 200_000_000, 6_000_000, 194_000_000]);
    expect(stmt(buildStatementItems(res, f, undefined, undefined, undefined))).toEqual([400_000_000, 200_000_000, 6_000_000, 194_000_000]);
  });

  it("부담부증여 없는 묶음 — echo 취득가액 = 입력", async () => {
    const { echo } = await bundled(
      bundle([house(), house({ assetId: "h4", addressJibun: "서울 강남구 테스트동 7-7", standardPriceAtTransfer: "900000000" })], "apportioned", "1300000000"),
    );
    expect(echo.map((e) => e[1])).toEqual([300_000_000, 300_000_000]);
    for (const [tp, acq, nec, gain] of echo) expect(tp - acq - nec).toBe(gain);
  });

  it("일반건물 부담부증여 단건 — 카드 입력이 이미 §159 값(카드 결과에 명세 없음)", async () => {
    const f = single({
      ...makeDefaultAsset(1), assetId: "gb", addressJibun: "서울 강남구 테스트동 8-8", assetKind: "general_building", acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual",
      gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
      gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential", fixedAcquisitionPrice: "200000000",
      transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant", bgMortgageDebtAmount: "200000000",
    } as AssetForm);
    const { agg, echo } = await bundled(f);
    expect(echo).toEqual([
      [100_000_000, 50_000_000, 1_500_000, 48_500_000],
      [100_000_000, 50_000_000, 1_500_000, 48_500_000],
    ]);
    expect(agg.determinedTax).toBe(9_936_000);
  });
});

describe("DA-4 leaf", () => {
  const part = (tp: number, acq: number, ded: number) => ({ transferPrice: tp, acquisitionPrice: acq, estimatedDeduction: ded });
  const brkd = { perAsset: { land: part(100, 40, 1), building: part(300, 160, 5) } } as never;
  it("토지·건물 합", () => {
    expect(burdenedGiftPerAssetTotals(brkd)).toEqual({ transferPrice: 400, acquisitionPrice: 200, estimatedDeduction: 6 });
  });
  it("§166 역산 양도가액 — §166 + 부담부증여만 §159 값, 그 밖은 fallback", () => {
    expect(redevInverseTransferPrice({ redevelopmentDetail: {} as never, transferBurdenedGiftBreakdown: brkd }, 7)).toBe(400);
    expect(redevInverseTransferPrice({ redevelopmentDetail: {} as never }, 7)).toBe(7);
    expect(redevInverseTransferPrice({ transferBurdenedGiftBreakdown: brkd }, 7)).toBe(7);
  });
});
