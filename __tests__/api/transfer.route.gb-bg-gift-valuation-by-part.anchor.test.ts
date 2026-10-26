/**
 * anchor — 일반건물 부담부증여 × 토지·건물 **둘 다** 이월과세 — 증여세 상당액을 **토지분·건물분 증여 당시 평가액**으로 나눈다 (PR-2 화면)
 *
 * 계획서 `docs/00-pm/gb-bg-carryover-gift-tax-part-limit.plan.md` §1.2·§4.2·§4.3 (Q-2 a · Q-3 b).
 * 폼 → ⑧(`collectStepIssues`) → ④(`callTransferTaxAPI`) → route.
 * 수정 前: 건물 블록(분리 ON)의 평가액이 계산에 닿지 않아 분자가 토지분뿐이었고(상당액 6천만 · A 99,966,000 채택),
 *          분리 OFF에는 건물분 칸이 없었다. 상당액은 양도가액 비율로 나눴다.
 * 기대값은 손계산(계획서 §1.2 · 이 파일 주석)이다.
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
import { donorBuiltBgApplicable } from "@/lib/calc/donor-built-bg-scope";
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

const RET = { giftTaxAmount: "", giftTaxCalculated: "100,000,000", giftTaxBase: "1,000,000,000" };
const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftTaxAmount: "", donorRelation: "lineal", donorSameHousehold: "no" };
/** 둘 다 이월과세 — 토지 블록 `land` · 건물분 `building`(분리 ON은 건물 블록, 분리 OFF는 같은 블록의 건물분 칸 — 둘 다 `buildingCarryover.giftDateValuation`). */
const both = (separate: boolean, land: string, building: string, over: Partial<AssetForm> = {}) =>
  formOf([gbAsset({
    ...(separate ? { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01" } : {}),
    gbBuildingAcquisitionCause: "carryover_gift",
    buildingCarryover: { ...CO, ...RET, giftDateValuation: building } as never,
    ...over,
  } as Partial<AssetForm>, { ...RET, giftDateValuation: land })]);

describe("둘 다 이월과세 — 토지분 6억 · 건물분 4억 → 상당액 1억(산출 1억 × 10억 ÷ 10억) · 파트 몫 3천만 · 2천만", () => {
  /**
   * 채무비율 0.5 → 상당액 5천만 → 토지 3천만 · 건물 2천만(평가액 6:4).
   * A: 토지 237,350,000 − 30,000,000 = 207,350,000 · 건물 199,400,000 − 20,000,000 = 179,400,000 · 장특 22%
   *    → 161,733,000 + 139,932,000 − 기본공제 2,500,000 = 299,165,000 × 38% − 19,940,000 = 93,742,700 < B 97,800,000 → B 채택.
   * 수정 前(분리 ON): 분자가 토지분 6억뿐 → 상당액 6천만 → A 99,966,000 > B → A 채택(뒤집힘).
   */
  it.each([["분리 ON(건물 블록)", true], ["분리 OFF(같은 블록 건물분 칸)", false]] as const)("%s", async (_n, separate) => {
    const f = both(separate, "600,000,000", "400,000,000");
    const b = await bodyOf(f);
    expect(b.carryoverTaxation.giftTaxAmount).toBe(100_000_000);
    expect(b.burdenedGiftInfo.carryoverDonorBasis.giftValuationByPart).toEqual({ land: 600_000_000, building: 400_000_000 });
    const r = await ok(f);
    const d = detail(r);
    expect([d.determinedTaxA, d.determinedTaxB, d.adoptedScenario]).toEqual([93_742_700, 97_800_000, "B"]);
    expect([card(d.scenarioA, "토지").transferGain, card(d.scenarioA, "건물").transferGain]).toEqual([207_350_000, 179_400_000]);
  });
});

describe("배분 축이 한도와 만나면 세액이 갈린다 — 건물 잔액 9,650,000", () => {
  /**
   * 증여 2021 · 양도인 기준시가 1.8억/1.8억(A 채택) · 당초 증여자 건물 기준시가 1.9억(건물 잔액 9,650,000).
   * 토지분 9억 · 건물분 1억 → 상당액 5천만 중 건물 5백만(잔액 안) · 토지 4,500만.
   *   토지 237,350,000 − 45,000,000 = 192,350,000 → 장특 22% 42,317,000 → 150,033,000
   *   건물 9,650,000 − 5,000,000 = 4,650,000 → 장특 22% 1,023,000 → 3,627,000
   *   153,660,000 − 2,500,000 = 151,160,000 × 38% − 19,940,000 = 37,500,800.
   * 양도가액 비율(5:5)이었다면 건물 2,500만이 잔액에서 잘려 42,050,540(PR-1 anchor)이다.
   */
  it("토지분 9억 · 건물분 1억 → 37,500,800 (A 채택)", async () => {
    const gt = { giftRegistryDate: "2021-05-01" };
    const f = both(true, "900,000,000", "100,000,000", {
      landAcquisitionDate: "2021-05-01", acquisitionDate: "2021-05-01", bgCoDonorBuildingStdPriceAtAcq: "190,000,000",
      gbAcqLandPricePerSqm: "1,800,000", gbAcqBuildingValue: "180,000,000",
      carryover: { ...CO, ...RET, ...gt, giftDateValuation: "900,000,000" } as never,
      buildingCarryover: { ...CO, ...RET, ...gt, giftDateValuation: "100,000,000" } as never,
    } as Partial<AssetForm>);
    const r = await ok(f);
    const d = detail(r);
    expect([d.adoptedScenario, r.det]).toEqual(["A", 37_500_800]);
    expect([card(d.scenarioA, "토지").transferGain, card(d.scenarioA, "건물").transferGain]).toEqual([192_350_000, 4_650_000]);
  });
});

describe("⑧ 둘 다 이월과세 · 증여세 신고서 금액이 찼으면 건물분 평가액 필수 · 합 ≤ 과세가액", () => {
  it.each([["분리 ON", true], ["분리 OFF", false]] as const)("%s — 건물분 비움 → buildingCarryover.giftDateValuation", (_n, separate) => {
    expect(fields(both(separate, "600,000,000", ""))).toContain("buildingCarryover.giftDateValuation");
  });
  it("토지분 비움 → carryover.giftDateValuation", () => {
    expect(fields(both(true, "", "400,000,000"))).toContain("carryover.giftDateValuation");
  });
  it("합 11억 > 과세가액 10억 → 차단", () => {
    expect(fields(both(false, "1,000,000,000", "100,000,000"))).toContain("buildingCarryover.giftDateValuation");
  });
  it("증여세 칸이 비면(증여세 없음) 건물분을 요구하지 않는다", () => {
    const f = both(true, "600,000,000", "", { carryover: { ...CO, giftDateValuation: "600,000,000" } as never, buildingCarryover: { ...CO, giftDateValuation: "" } as never } as Partial<AssetForm>);
    expect(fields(f)).not.toContain("buildingCarryover.giftDateValuation");
  });
});

describe("⑫ giftValuationByPart 정합", () => {
  it("한 파트만 이월과세(parts 토지만)에 실으면 400", async () => {
    const b = await bodyOf(formOf([gbAsset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01", acquisitionDate: "2020-01-01" } as Partial<AssetForm>, RET)]));
    expect(b.burdenedGiftInfo.carryoverDonorBasis.parts).toEqual({ land: true, building: false });
    const bad = { ...b, burdenedGiftInfo: { ...b.burdenedGiftInfo, carryoverDonorBasis: { ...b.burdenedGiftInfo.carryoverDonorBasis, giftValuationByPart: { land: 6, building: 4 } } } };
    expect((await post(bad)).status).toBe(400);
  });
});

describe("회귀 0", () => {
  it("한 파트만(토지만) → giftValuationByPart를 싣지 않는다", async () => {
    const b = await bodyOf(formOf([gbAsset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01", acquisitionDate: "2020-01-01" } as Partial<AssetForm>, { ...RET, giftDateValuation: "1,000,000,000" })]));
    expect(b.burdenedGiftInfo.carryoverDonorBasis.giftValuationByPart).toBeUndefined();
  });
  it("giftValuationByPart 없는 종전 본문(분리 OFF · 산출 3천만) → 104,646,000 (서버 호환 — 양도가액 비율)", async () => {
    const b = await bodyOf(formOf([gbAsset({}, { giftTaxAmount: "", giftTaxCalculated: "30,000,000", giftTaxBase: "1,000,000,000" })]));
    expect(b.burdenedGiftInfo.carryoverDonorBasis.giftValuationByPart).toBeUndefined();
    expect((await post(b)).det).toBe(104_646_000);
  });
});
