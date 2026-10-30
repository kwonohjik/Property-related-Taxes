/**
 * anchor: 사이드바(⑥) 일반건물 부담부증여 함께 양도 묶음 — 계산 후 취득가액·필요경비 (계획서 `docs/00-pm/bg-sidebar-gb-bundle-and-gate.plan.md` Q-1).
 *
 * 엔진은 일반건물 하나를 `land#${자산id}`·`building#${자산id}` 카드로 쪼개 돌려준다. 사이드바는 `propertyId === 자산id`로만 찾아
 * 이 카드를 못 잡았고, 안분 행 취득가액(§159 입력 전 값 0)을 그대로 읽어 계산 후에도 취득가액·필요경비가 「-」였다(양도가액은 맞다 · 세액 불변).
 * 이제 그 자산의 카드 합 = 엔진이 §159로 실제 쓴 값이다.
 *
 * 오라클: 행마다 (양도가액 − 취득가액 − 필요경비)의 합 = 엔진 `aggregated.totalTransferGain` (±0) · 개별 기대값은 카드 값(`transferBurdenedGiftBreakdown.cards`)과 같다.
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

import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const gb = (id: number, over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(id), addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "general_building", acquisitionCause: "purchase", acquisitionDate: "2015-03-01",
    gbBuildingAcquisitionCause: "purchase", gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "200000000", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "100000000",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgMortgageDebtAmount: "300000000",
    bgMortgageSetAmount: "300000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "250000000",
    bgActualAcquisitionBuilding: "250000000", ...over,
  }) as AssetForm;
const house = (id: number, over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(id), addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", useEstimatedAcquisition: false,
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgMortgageDebtAmount: "300000000",
    bgMortgageSetAmount: "300000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "500000000", ...over,
  }) as AssetForm;
const bundle = (assets: AssetForm[]) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-03-01", filingDate: "2026-04-30", householdHousingCount: "2", assets, assetSplitMode: "companion", contractTotalPrice: "",
  }) as TransferFormData;

type Cell = [number, number, boolean, number, boolean]; // 양도가액 · 취득가액 · 취득 pending · 필요경비 · 경비 pending
const cells = (f: TransferFormData, res: Parameters<typeof computeTransferPerAssetSummary>[1]): Cell[] =>
  computeTransferPerAssetSummary(f, res).rows.map((r) => [r.salePrice, r.acqPrice, r.acqPending, r.expense, r.expensePending]);

async function after(f: TransferFormData) {
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const rows = computeTransferPerAssetSummary(f, r.json.data).rows;
  const sumGain = rows.reduce((n, x) => n + x.salePrice - x.acqPrice - x.expense, 0);
  return { cells: cells(f, r.json.data), sumGain, engineGain: r.json.data.aggregated.totalTransferGain as number };
}

describe("SB-1 일반건물 부담부증여 함께 양도 묶음 — 계산 후 카드 합 (종전 취득가액·필요경비 0)", () => {
  it.each([
    ["일반건물 2건", () => bundle([gb(1), gb(2)]), [[300_000_000, 150_000_000, false, 0, false], [300_000_000, 150_000_000, false, 0, false]]],
    ["자본적지출 2천만(채무비율 30% 안분 6백만)", () => bundle([gb(1, { capitalExpenditure: "20000000" }), gb(2)]), [[300_000_000, 150_000_000, false, 6_000_000, false], [300_000_000, 150_000_000, false, 0, false]]],
    ["환산 취득 — 개산공제 §163⑥", () => bundle([gb(1, { bgAcquisitionMethod: "converted" }), gb(2, { bgAcquisitionMethod: "converted" })]), [[300_000_000, 150_000_000, false, 1_800_000, false], [300_000_000, 150_000_000, false, 1_800_000, false]]],
    ["일반건물 3건(셋째 취득 2억)", () => bundle([gb(1), gb(2), gb(3, { bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "100000000" })]), [[300_000_000, 150_000_000, false, 0, false], [300_000_000, 150_000_000, false, 0, false], [300_000_000, 60_000_000, false, 0, false]]],
    ["일반건물 + 주택(둘 다 부담부증여)", () => bundle([gb(1), house(2)]), [[300_000_000, 150_000_000, false, 0, false], [300_000_000, 150_000_000, false, 0, false]]],
    ["주택 + 일반건물(순서 반대)", () => bundle([house(1), gb(2)]), [[300_000_000, 150_000_000, false, 0, false], [300_000_000, 150_000_000, false, 0, false]]],
  ] as const)("%s", async (_l, mk, expected) => {
    const f = mk();
    const r = await after(f);
    expect(r.cells).toEqual(expected);
    expect(r.sumGain).toBe(r.engineGain); // 행 합 = 엔진 양도차익
  });

  it("주택 2건 대조 — 종전부터 맞던 경로(propertyId = 자산id)는 그대로", async () => {
    const r = await after(bundle([house(1), house(2)]));
    expect(r.cells).toEqual([[300_000_000, 150_000_000, false, 0, false], [300_000_000, 150_000_000, false, 0, false]]);
    expect(r.sumGain).toBe(r.engineGain);
  });
});

describe("SB-2 계산 전 — 「계산 후 표시」 유지", () => {
  it("일반건물 2건: 계산 전에는 양도가액·취득가액·필요경비 모두 pending", () => {
    const rows = computeTransferPerAssetSummary(bundle([gb(1), gb(2)]), null).rows;
    expect(rows.map((r) => [r.salePending, r.acqPending, r.expensePending])).toEqual([[true, true, true], [true, true, true]]);
  });
});
