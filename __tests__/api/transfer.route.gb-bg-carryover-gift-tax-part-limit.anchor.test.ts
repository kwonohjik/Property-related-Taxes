/**
 * anchor — 일반건물 부담부증여 × 토지·건물 **둘 다** 이월과세 — 증여세 상당액 한도는 **파트별 잔액** (PR-1 엔진)
 *
 * 계획서 `docs/00-pm/gb-bg-carryover-gift-tax-part-limit.plan.md` §1.1·§4.1 (Q-1 a · 「소득세법 시행령」 제163조의2 제2항 후단 · 사전-2025-법규재산-0366).
 * 수정 前: 두 파트 합계를 한도로 걸고 양도가액 비율로 나눠, 건물 양도차익이 음수(−15,350,000)가 되어 토지 차익을 깎았다(36,284,050).
 * 넘친 몫은 다른 파트로 옮기지 않는다(일반 양도 `transfer-tax-split-carryover.ts`와 같다). 기대값은 손계산(계획서 §1.1)으로 맞췄다.
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


const half = { ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>;
const landBg = (n: number) => ({
  ...makeDefaultAsset(n), assetKind: "land", addressJibun: "강원 홍천군 테스트리 1", acquisitionArea: "300", transferArea: "300", acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "300,000,000",
  bgMortgageDebtAmount: "150,000,000", bgMortgageSetAmount: "150,000,000", bgLendingDepositTotal: "0", bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "100,000,000", standardPriceAtTransfer: "150000000", standardPriceAtAcq: "80000000",
}) as unknown as AssetForm;
/** 화면 입력 — 증여세 신고서의 산출세액·과세가액. 상당액 칸은 화면에 없으므로 비운다. */
const RETURN = { giftTaxAmount: "", giftTaxCalculated: "30,000,000", giftTaxBase: "1,000,000,000" };
const shares = (a: AssetForm, b: AssetForm): TransferFormData =>
  formOf([{ ...a, ...half, assetLabel: "자산 1" }, { ...b, ...half, assetId: "a2", assetLabel: "자산 2" } as AssetForm], { assetSplitMode: "fractional" });
const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "1,000,000,000", giftTaxAmount: "", donorRelation: "lineal", donorSameHousehold: "no" };
/** 분리 ON · 토지는 양도인 매매(2015) · 건물만 직계존속에게서 증여(2024-05-01). */
const bOnly = (bc: Record<string, unknown> = {}, over: Partial<AssetForm> = {}) => gbAsset({
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "carryover_gift", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2015-01-01", acquisitionDate: "2024-05-01", carryover: undefined, buildingCarryover: { ...CO, ...bc } as never, ...over,
} as Partial<AssetForm>);
/** 분리 ON · 토지만 이월과세(2024-05-01 증여) · 건물은 양도인이 2020년에 `cause`로 취득. */
const lOnly = (cause: AssetForm["gbBuildingAcquisitionCause"], over: Partial<AssetForm> = {}) =>
  gbAsset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01", acquisitionDate: "2020-01-01", gbBuildingAcquisitionCause: cause, ...over } as Partial<AssetForm>, { giftTaxAmount: "" });
const bundle = (first: AssetForm, second: AssetForm) =>
  formOf([first, { ...second, assetId: "a2", assetLabel: "자산 2" } as AssetForm], { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1,300,000,000" });
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const LAND = { land: true, building: false };
const BLDG = { land: false, building: true };
const withParts = (b: Body, parts: unknown): Body => ({
  ...b,
  burdenedGiftInfo: { ...b.burdenedGiftInfo, carryoverDonorBasis: { ...b.burdenedGiftInfo.carryoverDonorBasis, parts } },
});
const patchInfo = (b: Body, info: Body, donor: Body = {}): Body => ({
  ...b,
  burdenedGiftInfo: { ...b.burdenedGiftInfo, ...info, carryoverDonorBasis: { ...b.burdenedGiftInfo.carryoverDonorBasis, ...donor } },
});
/** 토지만 — ④가 만든 본문(토지 원인 이월과세) + `parts`. */
const landOnlyBody = async (cause: AssetForm["gbBuildingAcquisitionCause"], over: Partial<AssetForm> = {}) =>
  withParts(await bodyOf(formOf([lOnly(cause, over)])), LAND);
/** 건물만 — PR-2부터 ④가 건물 블록(사건)·건물 당초 증여자 값·`parts`를 직접 싣는다(종전에는 토지만 본문에서 빌려 조립했다). */
const buildingOnlyBody = async (co: Record<string, unknown> = {}, over: Partial<AssetForm> = {}) => {
  const b = await bodyOf(formOf([bOnly(co, over)]));
  expect(partsOf(b)).toEqual(BLDG);
  return b;
};
const partsOf = (b: Body) => b.burdenedGiftInfo?.carryoverDonorBasis?.parts;
/** 분리 ON · 둘 다 이월과세(L3). */
const bothBody = async (over: Partial<AssetForm> = {}) =>
  bodyOf(formOf([gbAsset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01", acquisitionDate: "2024-05-01", gbBuildingAcquisitionCause: "carryover_gift", buildingCarryover: { ...CO } as never, ...over } as Partial<AssetForm>, { giftTaxAmount: "" })]));
const detail = (r: Run) => r.a?.burdenedGiftCarryoverDetail as { determinedTaxA: number; determinedTaxB: number; adoptedScenario: string; scenarioA: Body; scenarioB: Body };
const card = (s: Body, label: "토지" | "건물") => (s.parts as Body[]).find((p) => String(p.propertyLabel).startsWith(label))!;
const prop = (r: Run, label: "토지" | "건물") => (r.a!.properties as Body[]).find((p) => String(p.propertyLabel).startsWith(label))!;
const ok200 = async (b: Body) => {
  const r = await post(b);
  expect(r.status, r.message).toBe(200);
  return r;
};

/** 분리 ON · 둘 다 이월과세(증여 `gift`) · 당초 증여자 건물 기준시가 1.9억(건물 잔액 9,650,000) · 산출세액 `calc`/과세가액 10억. `over`로 양도인 취득 기준시가를 바꾼다. */
const both = async (gift: string, calc: string, over: Partial<AssetForm> = {}) => {
  const gt = { giftTaxAmount: "", giftTaxCalculated: calc, giftTaxBase: "1,000,000,000", giftRegistryDate: gift };
  return bodyOf(formOf([gbAsset({
    hasSeperateLandAcquisitionDate: true, landAcquisitionDate: gift, acquisitionDate: gift, gbBuildingAcquisitionCause: "carryover_gift",
    buildingCarryover: { ...CO, ...gt } as never, bgCoDonorBuildingStdPriceAtAcq: "190,000,000", ...over,
  } as Partial<AssetForm>, gt)]));
};
/** 양도인 취득 당시 기준시가 1.8억·1.8억 — B 차익이 작아 A가 채택된다. */
const HIGH_OWN = { gbAcqLandPricePerSqm: "1,800,000", gbAcqBuildingValue: "180,000,000" } as Partial<AssetForm>;

describe("둘 다 이월과세 · A 채택 — 건물 몫이 건물 잔액을 넘으면 건물에서 자른다 (수정 前 건물 양도차익 음수)", () => {
  it.each([
    // [산출세액, 수정 前 결정세액, 기대 결정세액, 토지 A 양도차익]
    ["100,000,000", 36_284_050, 42_050_540, 212_350_000], // 상당액 1억 × 0.5 → 파트당 2,500만 · 건물 잔액 9,650,000
    ["40,000,000", 46_363_540, 46_496_540, 227_350_000], //  파트당 1,000만 > 건물 잔액 9,650,000 (수정 前 −350,000)
  ] as const)("산출세액 %s → 건물 양도차익 0 · 토지 몫은 그대로", async (calc, before, expected, landGain) => {
    const r = await ok200(await both("2021-05-01", calc, HIGH_OWN));
    const d = detail(r);
    expect(d.adoptedScenario).toBe("A");
    expect(r.det).not.toBe(before);
    expect(r.det).toBe(expected);
    expect([card(d.scenarioA, "토지").transferGain, card(d.scenarioA, "건물").transferGain]).toEqual([landGain, 0]);
  });
  it("증여세 없음 → 한도와 무관(52,320,800 · 건물 양도차익 9,650,000)", async () => {
    const r = await ok200(await both("2021-05-01", "0", HIGH_OWN));
    expect(r.det).toBe(52_320_800);
    expect(card(detail(r).scenarioA, "건물").transferGain).toBe(9_650_000);
  });
});

describe("둘 다 이월과세 · B 채택 — A 세액만 바뀐다", () => {
  it("증여 2024 · 산출세액 1억 → A 25,923,700 → 31,296,200 · 채택 B 97,800,000 그대로", async () => {
    const r = await ok200(await both("2024-05-01", "100,000,000", { bgCoDonorLandStdPriceAtAcq: "190,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000" } as Partial<AssetForm>));
    const d = detail(r);
    expect([d.determinedTaxA, d.determinedTaxB, d.adoptedScenario, r.det]).toEqual([31_296_200, 97_800_000, "B", 97_800_000]);
    // 토지 잔액 9,650,000 < 토지 몫 2,500만 → 토지 0 · 건물은 몫 그대로(199,400,000 − 25,000,000)
    expect([card(d.scenarioA, "토지").transferGain, card(d.scenarioA, "건물").transferGain]).toEqual([0, 174_400_000]);
  });
});

describe("회귀 0 — 한도가 걸리지 않으면 종전과 같다", () => {
  it("L3 둘 다 · 증여세 없음 → 109,326,000", async () => {
    expect((await ok200(await bothBody())).det).toBe(109_326_000);
  });
  it("둘 다 · 산출세액 1억 · 한도 미발동 → A 93,742,700 · 채택 B 97,800,000", async () => {
    const r = await ok200(await both("2024-05-01", "100,000,000", { bgCoDonorBuildingStdPriceAtAcq: "40,000,000" } as Partial<AssetForm>));
    expect([detail(r).determinedTaxA, r.det]).toEqual([93_742_700, 97_800_000]);
  });
  it("분리 OFF L1(산출 3천만) → 104,646,000 · 건물만 B1 → 70,371,560", async () => {
    expect((await ok200(await bodyOf(formOf([gbAsset({}, RETURN)])))).det).toBe(104_646_000);
    expect((await ok200(await buildingOnlyBody(RETURN))).det).toBe(70_371_560);
  });
});
