/**
 * anchor — 이월과세 증여세 상당액: 영 §163의2②2호 분자 = 「해당 자산가액(증여세가 과세된 증여세 과세가액)」 = 평가액 − 당초 증여 때 인수한 채무
 *
 * 계획서 `docs/00-pm/carryover-gift-tax-numerator-net.plan.md` (Q-1~Q-5 a).
 * 「상속세 및 증여세법」 제47조 제1항 — 과세가액은 증여재산가액에서 수증자가 인수한 채무를 뺀 금액이다.
 * 수정 前: 인수채무를 받을 칸이 없어 분자가 평가액(채무 차감 전)이었다 — 경로 1(일반건물 부담부증여)은 안내대로 넣으면 막히거나 상당액이 부풀고,
 *          경로 2(일반건물 일반 양도 파트)·경로 3(주택 분리 파트)은 분자와 B 취득가액이 한 칸이라 맞는 조합을 넣을 수 없었다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

const TRANSFER_DATE = "2026-03-01";

/** 일반건물 · 부담부증여 K-5 · 이월과세(당초 증여자 취득 시 기준시가 토지 1천만·건물 4천만 → A 채택). `co`/`over` 로 한 칸씩 바꾼다. */
function gbAsset(over: Partial<AssetForm> = {}, co: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "general_building",
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2024-05-01",
    gbBuildingAcquisitionCause: "purchase",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
    bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "1,000,000,000",
      giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no",
      ...co,
    },
    ...over,
  } as AssetForm;
}
const formOf = (assets: AssetForm[], over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: TRANSFER_DATE, filingDate: "2026-05-31", assets, houses: [], presaleRights: [],
    contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, ...over,
  }) as unknown as TransferFormData;

interface Run { status: number; det?: number; message?: string; fieldErrors: string[]; a?: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
async function bodyOf(f: TransferFormData): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let captured: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    captured = JSON.parse(String(init.body));
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) } as Response;
  }));
  try { await callTransferTaxAPI(f); } catch { /* body 만 필요하다 */ }
  vi.unstubAllGlobals();
  return captured;
}
async function post(body: Record<string, any>): Promise<Run> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: { aggregated?: Record<string, any> }; error?: { message?: string; fieldErrors?: Record<string, string[]> } }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const a = json.data?.aggregated;
  return { status: res.status, det: a?.determinedTax, message: json.error?.message, fieldErrors: Object.keys(json.error?.fieldErrors ?? {}), a };
}
const run = async (f: TransferFormData): Promise<Run> => post(await bodyOf(f));
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));
const fields = (f: TransferFormData) => issues(f).map((i) => (i as { field?: string }).field);
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const detail = (r: Run) => r.a?.burdenedGiftCarryoverDetail as { determinedTaxA: number; determinedTaxB: number; adoptedScenario: string; scenarioA: Body };
const ok = async (f: TransferFormData) => {
  expect(issues(f)).toEqual([]);
  const r = await run(f);
  expect(r.status, r.message).toBe(200);
  return r;
};


const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftTaxAmount: "", donorRelation: "lineal", donorSameHousehold: "no" };
/**
 * 경로 1 — 부담부증여 일반건물 · 분리 ON · 둘 다 이월과세. 당초 증여: 토지 5억 · 건물 5억, 채무 4억 인수(토지 2억 · 건물 2억 · 「상속세 및 증여세법」 제47조 제3항 단서).
 * `ret` = 신고서 산출세액·과세가액, `debt` = 토글을 켜고 넣는 파트별 인수채무(생략 = 토글 OFF).
 */
const p1 = (ret: { calc: string; base: string }, debt?: { land: string; building: string }) => {
  const r = { giftTaxAmount: "", giftTaxCalculated: ret.calc, giftTaxBase: ret.base };
  return formOf([gbAsset({
    hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01",
    gbBuildingAcquisitionCause: "carryover_gift",
    buildingCarryover: { ...CO, ...r, giftDateValuation: "500,000,000", ...(debt ? { giftAssumedDebt: debt.building } : {}) } as never,
  } as Partial<AssetForm>, { ...r, giftDateValuation: "500,000,000", ...(debt ? { giftDebtAssumed: true, giftAssumedDebt: debt.land } : {}) })]);
};
const DEBT_2_2 = { land: "200,000,000", building: "200,000,000" };

/** 경로 2 — 일반 양도 일반건물 · 환산 · 토지만 이월과세(증여 2021-03-01 · 증여자 2005-06-15 · 평가액 4억). */
const p2Asset = (co: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building",
    acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2021-03-01",
    useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbZoneType: "general_residential",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "150,000,000",
      giftTaxAmount: "", giftDateValuation: "400,000,000", donorRelation: "lineal", giftTaxCalculated: "30,000,000", giftTaxBase: "1,000,000,000", ...co },
  }) as AssetForm;

/**
 * 경로 3 — 주택 분리 계산 · 토지만 이월과세(A) 와이어(`transfer.route.split-part-carryover.predo.anchor.test.ts` A_NEW와 같은 사실관계).
 * 당초 증여: 토지 평가액 3억 + 다른 재산 1억 → 과세가액 4억(토지에 담보된 채무 1억 인수로 토지 과세가액은 2억 · 산출세액 2천만).
 */
const SPLIT_A = (landPart: Record<string, unknown> = {}) => ({
  propertyType: "housing", useEstimatedAcquisition: false, transferPrice: 1_200_000_000, transferDate: "2025-06-30", acquisitionPrice: 0, expenses: 0,
  isOneHousehold: false, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, residencePeriodMonths: 0, annualBasicDeductionUsed: 0,
  isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
  landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000,
  acquisitionCause: "purchase", acquisitionDate: "2021-03-01", buildingAcquisitionPrice: 400_000_000,
  landAcquisitionDate: "2023-03-01", landAcquisitionPrice: 300_000_000, landAcquisitionCause: "carryover_gift",
  carryoverGiftEvent: { giftRegistryDate: "2023-03-01", giftTaxCalculated: 20_000_000, giftTaxBase: 400_000_000, donorRelation: "lineal" },
  landCarryoverPart: { donorAcquisitionDate: "2000-01-01", donorAcquisitionPrice: 100_000_000, ...landPart },
});
const splitPost = async (b: Record<string, unknown>) => {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }));
  const body = await res.json();
  return { status: res.status, body, r: body?.data?.result };
};
/** 경로 3 화면 경로 — 「토지는 다른 원인으로 취득」 + 이월과세(A) 폼(`transfer-split-part-carryover.body-spread.test.ts`와 같은 사실관계 · 과세가액 4억). */
const p3Asset = (lc: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing",
    acquisitionCause: "purchase", acquisitionDate: "2021-03-01", landAcquisitionCause: "carryover_gift", landCauseHost: "purchase",
    landAcquisitionDate: "2023-03-01", hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000", buildingAcquisitionPrice: "400,000,000", actualSalePrice: "1,200,000,000",
    saleSplitMode: "actual", landTransferPrice: "700,000,000", buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
    landCarryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-03-01", donorRelation: "lineal", donorAcquisitionDate: "2000-01-01",
      donorAcquisitionPrice: "100,000,000", giftTaxCalculated: "20,000,000", giftTaxBase: "400,000,000", ...lc },
  }) as unknown as AssetForm;
const p3Form = (lc: Record<string, unknown> = {}) =>
  ({ transferDate: "2025-06-30", filingDate: "2025-08-31", assets: [p3Asset(lc)], houses: [], presaleRights: [], contractTotalPrice: "1,200,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true }) as unknown as TransferFormData;

describe("경로 1 — 부담부증여 일반건물 · 둘 다 이월과세 (④가 상당액을 만든다)", () => {
  /**
   * 당초 증여 과세가액 11억(현금 등 다른 재산 포함) · 산출세액 2,200만.
   *   토글 OFF: 분자 5억 + 5억 → 상당액 2,200만 × 10억 ÷ 11억 = 20,000,000 → 106,206,000(A).
   *   토글 ON(토지 2억 · 건물 2억): 분자 3억 + 3억 → 12,000,000 → 107,454,000(A) · 배분 비율도 3억 : 3억.
   *   손계산: 상당액 차이 8,000,000 × 채무 비율 50% × (1 − 장특 22%) × 40% = 1,248,000.
   */
  it("P3 → 106,206,000 → 107,454,000 · 배분 비율 = 파트별 증여세 과세가액", async () => {
    const off = p1({ calc: "22,000,000", base: "1,100,000,000" });
    const on = p1({ calc: "22,000,000", base: "1,100,000,000" }, DEBT_2_2);
    expect((await bodyOf(off)).carryoverTaxation.giftTaxAmount).toBe(20_000_000);
    const b = await bodyOf(on);
    expect(b.carryoverTaxation.giftTaxAmount).toBe(12_000_000);
    expect(b.burdenedGiftInfo.carryoverDonorBasis.giftValuationByPart).toEqual({ land: 300_000_000, building: 300_000_000 });
    expect((await ok(off)).det).toBe(106_206_000);
    const r = await ok(on);
    expect([r.det, detail(r).adoptedScenario]).toEqual([107_454_000, "A"]);
  });

  /** 이 자산만 증여 · 과세가액 6억 = 10억 − 채무 4억 · 산출세액 1.05억. 토글 OFF면 평가액 합 10억 > 6억으로 막히고, ON이면 분자 6억 → 상당액 105,000,000(B 채택 97,800,000). */
  it("P0 → 토글 OFF ⑧ 차단(인수채무 안내) · ON 통과 · 상당액 105,000,000", async () => {
    const off = p1({ calc: "105,000,000", base: "600,000,000" });
    expect(fields(off)).toEqual(["buildingCarryover.giftDateValuation"]);
    expect(issues(off).map((i) => (i as { message?: string }).message).join("")).toContain("«당초 증여 때 채무를 인수했다»를 켜고");
    const on = p1({ calc: "105,000,000", base: "600,000,000" }, DEBT_2_2);
    expect((await bodyOf(on)).carryoverTaxation.giftTaxAmount).toBe(105_000_000);
    const r = await ok(on);
    expect([r.det, detail(r).adoptedScenario]).toEqual([97_800_000, "B"]);
  });

  it("토지분 채무 = 토지 평가액 → 토지 분자 0 · 배분 비율 0 : 3억(⑫는 0을 받는다) · 상당액 6,000,000", async () => {
    const f = p1({ calc: "22,000,000", base: "1,100,000,000" }, { land: "500,000,000", building: "200,000,000" });
    const b = await bodyOf(f);
    expect(b.carryoverTaxation.giftTaxAmount).toBe(6_000_000);
    expect(b.burdenedGiftInfo.carryoverDonorBasis.giftValuationByPart).toEqual({ land: 0, building: 300_000_000 });
    expect((await ok(f)).status).toBe(200);
  });

  it("토글이 꺼져 있으면 남은 채무 값은 읽지 않는다(3중 패턴) — 106,206,000", async () => {
    const f = p1({ calc: "22,000,000", base: "1,100,000,000" }, DEBT_2_2);
    const a = f.assets[0] as AssetForm;
    const stale = formOf([{ ...a, carryover: { ...a.carryover!, giftDebtAssumed: false } } as AssetForm]);
    expect((await bodyOf(stale)).burdenedGiftInfo.carryoverDonorBasis.giftValuationByPart).toEqual({ land: 500_000_000, building: 500_000_000 });
    expect((await ok(stale)).det).toBe(106_206_000);
  });

  it("⑧ 토글 ON — 건물분 채무 비움 → buildingCarryover.giftAssumedDebt · 토지분 채무 > 평가액 → carryover.giftAssumedDebt", () => {
    expect(fields(p1({ calc: "22,000,000", base: "1,100,000,000" }, { land: "200,000,000", building: "" }))).toEqual(["buildingCarryover.giftAssumedDebt"]);
    expect(fields(p1({ calc: "22,000,000", base: "1,100,000,000" }, { land: "600,000,000", building: "200,000,000" }))).toEqual(["carryover.giftAssumedDebt"]);
  });
});

describe("경로 2 — 일반 양도 일반건물 파트(분자와 B 취득가액이 갈린다)", () => {
  /**
   * 토지만 이월과세 · 평가액 4억 · 신고서 산출세액 3천만 · 과세가액 10억 · 토지에 담보된 채무 1억 인수.
   *   토글 OFF: 상당액 3천만 × 4억 ÷ 10억 = 12,000,000 → 156,620,000.
   *   토글 ON : 상당액 3천만 × 3억 ÷ 10억 = 9,000,000 + 채무 부분(r = 1억 ÷ 4억 = 0.25)을 증여분·매입분으로 나눠 계산 → 141,690,000.
   *     🔴 2026-10-28 갱신 141,690,000 → 141,960,000: PR-2(본인 지출 소실 수정) 이후 매입분은 환산 개산공제 없이 본인 자본적지출+양도비만 필요경비다 —
   *     취득가액이 채무(실지거래가액)라 「소득세법」 제97조제2항제1호(개산공제는 제2호 몫). 매입분 개산공제 750,000 이 0 이 되어 매입분 소득 +675,000(장특 10%)
   *     × 40% = +270,000. 아래 손계산도 같이 갱신했다.
   *     (PR-2 이전에는 분자만 순액으로 하고 자산 전체를 증여자 기준으로 계산해 157,460,000이었다 — 반전 2026-10-28,
   *      설계서 `carryover-gift-debt-purchased-part-parts.engine.design.md` §6. 당초 증여 때 인수한 채무 부분은 증여가 아니라 양도이므로 따로 나눈다 —
   *      「소득세법」 제88조 제1호 후단.)
   *   손계산: 증여분 = 양도가 ×0.75 = 375,000,000 · 취득가액 150,000,000×0.75 = 112,500,000 · 상당액 9,000,000(전액) · 차익 253,500,000 · 장특(증여자 취득 20년) 30% → 소득 177,450,000
   *           매입분 = 양도가 125,000,000 · 취득가액 = 채무 100,000,000 · 필요경비 0 → 25,000,000 · 보유 5년 장특 10% → 22,500,000
   *           건물 = 247,000,000 − 장특 10% 24,700,000 = 222,300,000 (불변)
   *           합 422,250,000 − 2,500,000 = 419,750,000 × 40% − 25,940,000 = 141,960,000.
   *   B(미적용) 취득가액은 평가액 4억 그대로 — 파트 와이어 `giftDateAssetValue` 4억 · `giftAssumedDebt` 1억.
   */
  it("156,620,000 → 141,960,000 · 와이어는 평가액 4억 + 인수채무 1억 · 토지 증여분 + 매입분 꼬리", async () => {
    const off = await ok(formOf([p2Asset()]));
    expect(off.det).toBe(156_620_000);
    const rowOf = (r: Run, label: string) => (r.a?.properties as Body[]).find((p) => String(p.propertyLabel).startsWith(label))!;
    const landOf = (r: Run) => rowOf(r, "토지");
    const f = formOf([p2Asset({ giftDebtAssumed: true, giftAssumedDebt: "100,000,000" })]);
    const b = await bodyOf(f);
    expect(b.generalBuildingValuation.landCarryoverPart).toMatchObject({ giftDateAssetValue: 400_000_000, giftAssumedDebt: 100_000_000 });
    const r = await ok(f);
    expect(r.det).toBe(141_960_000);
    expect(landOf(r).carryoverTaxationDetail.scenarioA.giftTaxAddedToExpense).toBe(9_000_000);
    // B(미적용)는 평가액 4억을 취득가액으로 그대로 쓴다 — 채무를 빼지 않는다
    expect(landOf(r).carryoverTaxationDetail.scenarioB).toEqual(landOf(off).carryoverTaxationDetail.scenarioB);
    // 조각 — 부모 카드(증여분)에 echo, 꼬리 카드 `land__purchased`
    const split = landOf(r).carryoverTaxationDetail.scenarioA.purchasedPartSplit;
    expect(split).toMatchObject({ debtAmount: 100_000_000, giftValuation: 400_000_000 });
    expect(split.purchased).toMatchObject({ propertyId: "land__purchased", transferPrice: 125_000_000, acquisitionPrice: 100_000_000, acquisitionDate: "2021-03-01" });
    expect(split.gift).toMatchObject({ propertyId: "land", transferPrice: 375_000_000, acquisitionPrice: 112_500_000 });
    expect((r.a?.properties as Body[]).map((p) => p.propertyId)).toEqual(["land", "building", "land__purchased"]);
  });

  it("⑧ 토글 ON · 채무 비움 → carryover.giftAssumedDebt · ⑫ 채무 > 평가액 → 400", async () => {
    expect(fields(formOf([p2Asset({ giftDebtAssumed: true, giftAssumedDebt: "" })]))).toEqual(["carryover.giftAssumedDebt"]);
    const b = await bodyOf(formOf([p2Asset({ giftDebtAssumed: true, giftAssumedDebt: "100,000,000" })]));
    b.generalBuildingValuation.landCarryoverPart.giftAssumedDebt = 400_000_001;
    const r = await post(b);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.message) + JSON.stringify(r.fieldErrors)).toContain("giftAssumedDebt");
  });
});

describe("경로 3 — 주택 분리 계산 파트(파트 평가액 = 분자 + B 취득가액)", () => {
  /**
   * 토지만 이월과세(A) · 토지 평가액 3억 · 과세가액 4억(다른 재산 포함) · 산출세액 2천만 · 토지에 담보된 채무 1억 인수.
   *   토글 OFF: 2천만 × 3억 ÷ 4억 = 15,000,000 → 173,660,000(과세표준 499,000,000 × 40% − 25,940,000).
   *   토글 ON: 2천만 × 2억 ÷ 4억 = 10,000,000 → 과세표준 502,500,000(+5,000,000 × 70%) × 42% − 35,940,000 = 175,110,000.
   */
  it("와이어 — 173,660,000 → 175,110,000 · echo giftAssumedDebt · B 취득가액(증여 신고가액) 3억 그대로", async () => {
    const off = await splitPost(SPLIT_A());
    expect([off.status, off.r.determinedTax, off.r.splitDetail.land.carryover.giftTaxApportioned]).toEqual([200, 173_660_000, 15_000_000]);
    const on = await splitPost(SPLIT_A({ giftAssumedDebt: 100_000_000 }));
    expect([on.status, on.r.determinedTax]).toEqual([200, 175_110_000]);
    expect(on.r.splitDetail.land.carryover).toMatchObject({ giftTaxApportioned: 10_000_000, giftAssumedDebt: 100_000_000, giftDateValuation: 300_000_000 });
  });

  it("⑫ 채무 > 파트 평가액 → 400 landCarryoverPart.giftAssumedDebt", async () => {
    const o = await splitPost(SPLIT_A({ giftAssumedDebt: 300_000_001 }));
    expect(o.status).toBe(400);
    expect(Object.keys(o.body.error.fieldErrors)).toContain("landCarryoverPart.giftAssumedDebt");
  });

  it("화면 경로 — 토글 ON · 토지 채무 1억 → ⑧ 통과 · 와이어 giftAssumedDebt · 175,110,000 / 비우면 landCarryover.giftAssumedDebt", async () => {
    const f = p3Form({ giftDebtAssumed: true, giftAssumedDebt: "100,000,000" });
    const b = await bodyOf(f);
    expect(b.landCarryoverPart.giftAssumedDebt).toBe(100_000_000);
    // 단건 주택은 결과가 `data.result`에 온다(일반건물 `aggregated`와 다르다).
    const single = async (form: TransferFormData) => { expect(issues(form)).toEqual([]); return (await splitPost({ ...(await bodyOf(form)), isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0, annualBasicDeductionUsed: 0, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false })).r?.determinedTax; };
    expect(await single(f)).toBe(175_110_000);
    expect(await single(p3Form())).toBe(173_660_000);
    expect(fields(p3Form({ giftDebtAssumed: true, giftAssumedDebt: "" }))).toEqual(["landCarryover.giftAssumedDebt"]);
  });
});
