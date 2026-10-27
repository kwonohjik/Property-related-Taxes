/**
 * anchor — 일반건물 부담부증여 × 이월과세 **화면 경로**: 증여받은 파트에만 §97의2 (PR-2 화면)
 *
 * 계획서 `docs/00-pm/gb-bg-part-carryover-calc.plan.md` §4.4~§4.6. 서버(PR-1)는 `carryoverDonorBasis.parts`가 오면 그 파트만 계산한다.
 * 여기서는 폼 → ⑧(`collectStepIssues`) → ④(`callTransferTaxAPI`) → route 를 그대로 거쳐 PR-1 anchor(본문 직접 조립)와 같은 값이 나오는지 본다.
 * 수정 前: ⑧이 한쪽만 이월과세를 막고(#2571), ④는 `parts`를 싣지 않으며 건물만이면 이월과세 자체를 싣지 않는다.
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
import { sameDayBuildingDonorDate } from "./_helpers/gb-bg-building-donor-date";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

const TRANSFER_DATE = "2026-03-01";

/** 일반건물 · 부담부증여 K-5 · 이월과세(당초 증여자 취득 시 기준시가 토지 1천만·건물 4천만 → A 채택). `co`/`over` 로 한 칸씩 바꾼다. */
function gbAsset(over: Partial<AssetForm> = {}, co: Record<string, unknown> = {}): AssetForm {
  return sameDayBuildingDonorDate({
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
  } as AssetForm);
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
const ok = async (f: TransferFormData) => {
  expect(issues(f)).toEqual([]);
  const r = await run(f);
  expect(r.status, r.message).toBe(200);
  return r.a!;
};


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
const fields = (f: TransferFormData) => issues(f).map((i) => (i as { field?: string }).field);
const messages = (f: TransferFormData) => issues(f).map((i) => (i as { message?: string }).message ?? "");
const det = async (f: TransferFormData) => (await ok(f)).determinedTax;
const partsOf = (b: Body) => b.burdenedGiftInfo?.carryoverDonorBasis?.parts;
/** 화면의 건물만 — 당초 증여자 토지 칸은 화면에 없다(비움). */
const bOnlyUi = (bc: Record<string, unknown> = {}, over: Partial<AssetForm> = {}) =>
  bOnly(bc, { bgCoDonorLandStdPriceAtAcq: "", ...over } as Partial<AssetForm>);
/** 화면의 토지만 — 당초 증여자 건물 칸은 화면에 없다(비움). */
const lOnlyUi = (cause: AssetForm["gbBuildingAcquisitionCause"], over: Partial<AssetForm> = {}) =>
  lOnly(cause, { bgCoDonorBuildingStdPriceAtAcq: "", ...over } as Partial<AssetForm>);

describe("화면 경로 — 토지만 이월과세 (수정 前: ⑧ 차단)", () => {
  it.each([
    ["L2 건물 양도인 매매", lOnlyUi("purchase")],
    ["L4 건물 본인 신축", lOnlyUi("newConstruction")],
    ["L2 · 당초 증여자 건물 칸에 남은 값(4천만)", lOnly("purchase")],
  ] as const)("%s → 90,758,940 · parts {토지}", async (_n, a) => {
    expect(await det(formOf([a]))).toBe(90_758_940);
    expect(partsOf(await bodyOf(formOf([a])))).toEqual(LAND);
  });
  it("증여받지 않은 건물의 당초 증여자 값은 싣지 않는다", async () => {
    const d = (await bodyOf(formOf([lOnly("purchase")]))).burdenedGiftInfo.carryoverDonorBasis;
    expect([d.landStdPriceAtAcquisition, d.buildingStdPriceAtAcquisition]).toEqual([10_000_000, undefined]);
  });
});

describe("화면 경로 — 건물만 이월과세 (수정 前: ⑧ 차단 · ④ 이월과세 미전송)", () => {
  it("B0 증여세 없음 → 74,817,560 · parts {건물} · 사건은 건물 서브폼", async () => {
    const f = formOf([bOnlyUi()]);
    expect(await det(f)).toBe(74_817_560);
    const b = await bodyOf(f);
    expect(partsOf(b)).toEqual(BLDG);
    expect([b.carryoverTaxation?.giftRegistryDate, b.carryoverTaxation?.donorAcquisitionDate]).toEqual(["2024-05-01", "2015-01-01"]);
  });
  it("B1 산출 3천만 / 과세가액 10억 → 70,371,560", async () => {
    expect(await det(formOf([bOnlyUi(RETURN)]))).toBe(70_371_560);
  });
});

describe("⑧ — 증여받은 파트의 칸만 요구한다", () => {
  it("건물만 · 당초 증여자 건물 기준시가 비움 → 그 칸", () => {
    expect(fields(formOf([bOnlyUi({}, { bgCoDonorBuildingStdPriceAtAcq: "" } as Partial<AssetForm>)]))).toContain("bgCoDonorBuildingStdPriceAtAcq");
  });
  it("토지만 · 당초 증여자 토지 기준시가 비움 → 그 칸", () => {
    expect(fields(formOf([lOnlyUi("purchase", { bgCoDonorLandStdPriceAtAcq: "" } as Partial<AssetForm>)]))).toContain("bgCoDonorLandStdPriceAtAcq");
  });
  it("건물만 · 증여세 산출세액만 → 건물 서브폼의 과세가액 칸", () => {
    expect(fields(formOf([bOnlyUi({ giftTaxCalculated: "30,000,000", giftTaxAmount: "" })]))).toContain("buildingCarryover.giftTaxBase");
  });
  it.each([["appraisal"], ["salesCase"]] as const)("K-6·K-7(%s) × 한 파트만 → 막는다(Q-3 a)", (m) => {
    const f = formOf([lOnlyUi("purchase", { bgAcquisitionMethod: m, bgActualAcquisitionLand: "400,000,000", bgActualAcquisitionBuilding: "100,000,000", bgCoDonorPresumedAcquisitionLand: "50,000,000" } as Partial<AssetForm>)]);
    expect(messages(f).some((s) => s.includes("한 파트"))).toBe(true);
  });
});

describe("당초 증여자 신축·증축(§114조의2) — 건물을 증여받았을 때만 묻는다", () => {
  it("토지만이면 묻지 않는다 · 건물만이면 묻는다", () => {
    expect(donorBuiltBgApplicable(lOnlyUi("purchase"))).toBe(false);
    expect(donorBuiltBgApplicable(bOnlyUi())).toBe(true);
  });
  it("건물만 + 증여자 신축(2016) → 화면 경로로 계산된다", async () => {
    const f = formOf([bOnlyUi({ donorAcquisitionDate: "2016-01-01", donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2016-01-01" })]); // 신축 건물의 취득일 = 신축 취득일(계획서 `gb-bg-donor-building-acquisition-date.plan.md` Q-3 a)
    await ok(f);
    expect((await bodyOf(f)).burdenedGiftInfo.carryoverDonorBasis.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2016-01-01" });
  });
});

describe("지분·묶음 — 화면 경로도 단건과 같다", () => {
  it("지분 50/50 둘 다 토지만 90,758,940 · 둘 다 건물만 74,817,560", async () => {
    expect(await det(shares(lOnlyUi("purchase"), lOnlyUi("purchase")))).toBe(90_758_940);
    expect(await det(shares(bOnlyUi(), bOnlyUi()))).toBe(74_817_560);
  });
  it.each([["일반건물 첫째", true], ["일반건물 둘째", false]] as const)("묶음(%s) 토지만 121,785,200 · 건물만 105,004,800", async (_n, first) => {
    const mk = (gb: AssetForm) => (first ? bundle(gb, landBg(2)) : bundle(landBg(1), gb));
    expect(await det(mk(lOnlyUi("purchase")))).toBe(121_785_200);
    expect(await det(mk(bOnlyUi()))).toBe(105_004_800);
  });
});

describe("회귀 0", () => {
  it("분리 OFF(L0·L1) 109,326,000 · 104,646,000 — parts 미전송", async () => {
    expect(await det(formOf([gbAsset({}, { giftTaxAmount: "" })]))).toBe(109_326_000);
    // 둘 다 이월과세 — 평가액은 토지분·건물분으로 받는다(`gb-bg-carryover-gift-tax-part-limit.plan.md` Q-3 b). 5억:5억 = 양도가액 비율이라 종전 값 그대로.
    expect(await det(formOf([gbAsset({ buildingCarryover: { ...CARRYOVER_DEFAULTS, giftDateValuation: "500,000,000" } } as Partial<AssetForm>, { ...RETURN, giftDateValuation: "500,000,000" })]))).toBe(104_646_000);
    expect(partsOf(await bodyOf(formOf([gbAsset()])))).toBeUndefined();
  });
  it("분리 ON 둘 다 이월과세(L3) 109,326,000", async () => {
    const f = formOf([gbAsset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01", gbBuildingAcquisitionCause: "carryover_gift", buildingCarryover: { ...CO } as never } as Partial<AssetForm>, { giftTaxAmount: "" })]);
    expect(await det(f)).toBe(109_326_000);
  });
  it("이월과세 없음(분리 ON 둘 다 매매) — 당초 증여자 칸을 요구하지 않고 싣지 않는다", async () => {
    const f = formOf([bOnlyUi({}, { gbBuildingAcquisitionCause: "purchase", buildingCarryover: undefined })]);
    await ok(f);
    expect((await bodyOf(f)).burdenedGiftInfo.carryoverDonorBasis).toBeUndefined();
  });
});
