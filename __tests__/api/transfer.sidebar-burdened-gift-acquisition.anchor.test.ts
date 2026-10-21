/**
 * anchor: 사이드바(⑥) 부담부증여 취득가액·필요경비 — 계획서 `docs/00-pm/burdened-gift-display-acquisition.plan.md` PR-2 (D2).
 *
 * 부담부증여 자산의 취득가액·필요경비는 엔진이 §159로 정한다(소득세법 시행령 §159① · 개산공제 §163⑥). 사이드바는 화면에 없는
 * 자산 일반 취득가액 칸(300,000,000)·화면의 자본적지출·route 안분 입력을 보였다. 이제 계산 전 「계산 후 표시」, 계산 후 엔진 값
 * (단건 §159 명세 · §166 자산은 역산 · 묶음은 엔진 표시 echo #2386 · 일반건물은 카드 합).
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

type Cell = [number, boolean, number, boolean];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cells = (f: TransferFormData, res: any = null): Cell[] =>
  computeTransferPerAssetSummary(f, res).rows.map((r) => [r.acqPrice, r.acqPending, r.expense, r.expensePending]);
const PEND: Cell = [0, true, 0, true];
const single = (a: AssetForm) => Object.assign(createDefaultTransferFormData(), BASE, { assets: [a] }) as TransferFormData;
const h2 = () => bgHouse({ assetId: "h2", addressJibun: "서울 강남구 테스트동 3-3", standardPriceAtTransfer: "600000000", standardPriceAtAcq: "300000000" });
const market = (over: Record<string, unknown>) =>
  house({ transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "800000000", bgDonorRelation: "lineal_descendant", bgMortgageDebtAmount: "200000000", actualSalePrice: "", ...over });

async function after(f: TransferFormData) {
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  return cells(f, r.json.data);
}

describe("SA-1 단건 부담부증여 — 계산 전 「계산 후 표시」, 계산 후 §159 명세", () => {
  it.each([
    ["기준시가 · 숨은 취득가 3억 (종전 300,000,000 / 300,000,000)", () => single(bgHouse()), [200_000_000, false, 6_000_000, false]],
    ["기준시가 · 숨은 값 없음 (종전 「-」 / 「-」)", () => single(bgHouse({ fixedAcquisitionPrice: "" })), [200_000_000, false, 6_000_000, false]],
    ["기준시가 · 자본적지출 5천만 (종전 계산 전 필요경비 50,000,000)", () => single(bgHouse({ capitalExpenditure: "50000000" })), [200_000_000, false, 6_000_000, false]],
    ["시가 모드 · 실지취득가 3억 (종전 300,000,000)", () => single(market({ bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000" })), [75_000_000, false, 0, false]],
    ["시가 모드 · 환산 (종전 300,000,000)", () => single(market({ bgAcquisitionMethod: "converted", standardPriceAtAcq: "300000000", standardPriceAtTransfer: "500000000" })), [120_000_000, false, 2_250_000, false]],
    ["원조합원 입주권 — 계산 후 §166 역산", () => single(right()), [200_000_000, false, 0, false]],
  ] as const)("%s", async (_l, mk, expected) => {
    const f = mk();
    expect(cells(f)).toEqual([PEND]);
    expect(await after(f)).toEqual([expected]);
  });
});

describe("SA-2 전 자산 부담부증여 묶음 — 계산 후 엔진 표시 echo (종전 안분 입력 300,000,000 · 필요경비 음수)", () => {
  it.each([
    ["주택 2건 · 안분 16억", () => bundle([bgHouse(), h2()], "apportioned", "1600000000"), [[250_000_000, false, 7_500_000, false], [150_000_000, false, 4_500_000, false]]],
    ["주택 2건 · 실가 거래", () => bundle([bgHouse(), h2()], "actual", ""), [[250_000_000, false, 7_500_000, false], [150_000_000, false, 4_500_000, false]]],
    ["주택 + 입주권 (종전 입주권 0)", () => bundle([bgHouse(), right()], "apportioned", ""), [[200_000_000, false, 6_000_000, false], [200_000_000, false, 0, false]]],
  ] as const)("%s", async (_l, mk, expected) => {
    const f = mk();
    expect(cells(f)).toEqual([PEND, PEND]);
    expect(await after(f)).toEqual(expected);
  });
});

describe("SA-3 대조 · 일반건물", () => {
  it("일반 주택 단건 — 취득가액 = 입력 300,000,000", () => {
    expect(cells(single(house()))[0][0]).toBe(300_000_000);
  });

  const gbBg = () => single({
      ...makeDefaultAsset(1), assetId: "gb", addressJibun: "서울 강남구 테스트동 8-8", assetKind: "general_building", acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual",
      gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
      gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential", fixedAcquisitionPrice: "200000000",
      transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant", bgMortgageDebtAmount: "200000000",
    } as AssetForm);
  it("일반건물 부담부증여 단건 — 계산 후 카드 합(50,000,000 × 2 · 1,500,000 × 2) 그대로", async () => {
    expect(await after(gbBg())).toEqual([[100_000_000, false, 3_000_000, false]]);
  });
  it("일반건물 부담부증여 단건 — 계산 전 「계산 후 표시」 (종전 숨은 취득가 200,000,000)", () => {
    expect(cells(gbBg())).toEqual([PEND]);
  });
});
