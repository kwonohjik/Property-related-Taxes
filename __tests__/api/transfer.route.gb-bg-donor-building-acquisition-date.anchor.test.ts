/**
 * anchor — 일반건물 부담부증여 × 이월과세: 당초 증여자의 **건물** 취득일 · 건물 기준시가 0 (선행 V-3 · Q-1~Q-4 a)
 *
 * 계획서 `docs/00-pm/gb-bg-donor-building-acquisition-date.plan.md`.
 * 「소득세법」 제95조 제4항 단서 — 증여자가 **해당 자산을** 취득한 날부터 기산 · 「소득세법 시행령」 제162조 제1항 제4호 — 신축은 사용승인서 교부일.
 * 수정 前: 시나리오 A 건물 기산일 = 토지 쪽 증여자 취득일(분리 ON 건물 블록 칸은 보이지만 미도달) · 건물 기준시가 0 통과(취득가액 0).
 * 기대값은 손계산(계획서 §1).
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
const card = (s: Body, label: "토지" | "건물") => (s.parts as Body[]).find((p) => String(p.propertyLabel).startsWith(label))!;
const ok = async (f: TransferFormData) => {
  expect(issues(f)).toEqual([]);
  const r = await run(f);
  expect(r.status, r.message).toBe(200);
  return r;
};


const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" };
const NEW_2020 = { donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2020-06-01" };
/** 둘 다 이월과세 · 증여세 없음 — 건물 블록(분리 ON) / 건물분 칸(분리 OFF) 증여자 취득일 `bDate`. */
const both = (separate: boolean, bDate: string, over: Partial<AssetForm> = {}, landCo: Record<string, unknown> = {}) =>
  formOf([gbAsset({
    ...(separate ? { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01" } : {}),
    gbBuildingAcquisitionCause: "carryover_gift",
    buildingCarryover: { ...CO, giftDateValuation: "400,000,000", donorAcquisitionDate: bDate } as never,
    ...over,
  } as Partial<AssetForm>, { giftDateValuation: "600,000,000", ...landCo })]);
const starts = (r: Run) => [detail(r).scenarioA.landHoldingStartDate, detail(r).scenarioA.buildingHoldingStartDate];

describe("Q-1 건물 기산일 = 당초 증여자의 건물 취득일", () => {
  /**
   * 토지 2015-01-01(11년 · 장특 22%) · 건물 2020-06-01(5년 · 10%).
   *   토지 237,350,000 − 52,217,000 = 185,133,000 · 건물 199,400,000 − 19,940,000 = 179,460,000
   *   364,593,000 − 2,500,000 = 362,093,000 × 40% − 25,940,000 = 118,897,200 (B 97,800,000 → A 채택).
   * 수정 前: 건물도 2015 → 109,326,000.
   */
  it.each([["분리 ON(건물 블록 칸)", true], ["분리 OFF(같은 블록 건물분 칸)", false]] as const)("%s 2020-06-01 → 118,897,200", async (_n, separate) => {
    const f = both(separate, "2020-06-01");
    const b = await bodyOf(f);
    expect(b.burdenedGiftInfo.carryoverDonorBasis.buildingDonorAcquisitionDate).toBe("2020-06-01");
    const r = await ok(f);
    expect(starts(r)).toEqual(["2015-01-01", "2020-06-01"]);
    expect([detail(r).adoptedScenario, r.det]).toEqual(["A", 118_897_200]);
  });
  it("같은 날(2015) → 109,326,000 (회귀 0)", async () => {
    expect((await ok(both(false, "2015-01-01"))).det).toBe(109_326_000);
  });
  it("건물 취득일 없는 종전 본문(직접 호출) → 사건 날짜 하나로 기산(서버 호환) · 109,326,000", async () => {
    const b = await bodyOf(both(true, "2020-06-01"));
    delete b.burdenedGiftInfo.carryoverDonorBasis.buildingDonorAcquisitionDate;
    expect((await post(b)).det).toBe(109_326_000);
  });
  it.each([["분리 ON", true], ["분리 OFF", false]] as const)("⑧ %s 건물 취득일 비움 → buildingCarryover.donorAcquisitionDate", (_n, separate) => {
    expect(fields(both(separate, ""))).toContain("buildingCarryover.donorAcquisitionDate");
  });
  it("⑫ 토지만 이월과세에 건물 취득일을 실으면 400", async () => {
    const b = await bodyOf(formOf([gbAsset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01", acquisitionDate: "2020-01-01" } as Partial<AssetForm>)]));
    expect(b.burdenedGiftInfo.carryoverDonorBasis.parts).toEqual({ land: true, building: false });
    const bad = { ...b, burdenedGiftInfo: { ...b.burdenedGiftInfo, carryoverDonorBasis: { ...b.burdenedGiftInfo.carryoverDonorBasis, buildingDonorAcquisitionDate: "2020-06-01" } } };
    expect((await post(bad)).status).toBe(400);
  });
});

describe("Q-2 일반건물 당초 증여자 건물 기준시가 0 거부", () => {
  it("⑧ 0 → bgCoDonorBuildingStdPriceAtAcq", () => {
    expect(fields(both(false, "2015-01-01", { bgCoDonorBuildingStdPriceAtAcq: "0" } as Partial<AssetForm>))).toContain("bgCoDonorBuildingStdPriceAtAcq");
  });
  it("⑫ 본문 건물 기준시가 0 → 400", async () => {
    const b = await bodyOf(both(false, "2015-01-01"));
    const bad = { ...b, burdenedGiftInfo: { ...b.burdenedGiftInfo, carryoverDonorBasis: { ...b.burdenedGiftInfo.carryoverDonorBasis, buildingStdPriceAtAcquisition: 0 } } };
    expect((await post(bad)).status).toBe(400);
  });
  it("토지 자산은 0을 그대로 받는다(건물이 없다 — 회귀 0)", () => {
    const land = { ...gbAsset({}, {}), assetKind: "land", bgCoDonorBuildingStdPriceAtAcq: "0" } as unknown as AssetForm;
    expect(fields(formOf([land]))).not.toContain("bgCoDonorBuildingStdPriceAtAcq");
  });
});

describe("Q-3 신축이면 신축 취득일 = 건물 취득일", () => {
  it("둘 다 이월과세 · 신축 2019-06-01 ≠ 건물 2020-06-01 → carryover.donorBuiltDate", () => {
    expect(fields(both(false, "2020-06-01", {}, { ...NEW_2020, donorBuiltDate: "2019-06-01" }))).toContain("carryover.donorBuiltDate");
  });
  it("같은 날이면 통과 → 118,897,200", async () => {
    expect((await ok(both(false, "2020-06-01", {}, NEW_2020))).det).toBe(118_897_200);
  });
  it("건물만 이월과세 · 건물 블록 증여자 취득일 2015 ≠ 신축 2020 → carryover.donorBuiltDate", () => {
    const f = formOf([gbAsset({
      acquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01", acquisitionDate: "2024-05-01", landAcquisitionPrice: "50,000,000",
      gbBuildingAcquisitionCause: "carryover_gift",
      buildingCarryover: { ...CO, giftDateValuation: "400,000,000", ...NEW_2020 } as never,
    } as Partial<AssetForm>)]);
    expect(fields(f)).toContain("carryover.donorBuiltDate");
  });
});
