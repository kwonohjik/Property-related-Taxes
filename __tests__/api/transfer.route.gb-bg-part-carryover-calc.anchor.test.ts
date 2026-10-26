/**
 * anchor — 일반건물 부담부증여 × 이월과세 — **증여받은 파트에만 §97의2를 적용한다** (PR-1 서버)
 *
 * 계획서 `docs/00-pm/gb-bg-part-carryover-calc.plan.md` §1·§4 (Q-1~Q-5 a).
 * 화면(④)은 PR-2까지 `parts`를 싣지 않는다 — 여기서는 요청 본문에 `burdenedGiftInfo.carryoverDonorBasis.parts`를 직접 넣는다.
 * 기대값은 시제품 실측(§1)이고 카드 값은 손계산(§1.1)으로 맞췄다. 수정 前: 토지만은 건물까지 이월과세(109,326,000·125,113,200), 건물만은 ⑫ 400.
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
/** 건물만 — 화면은 PR-2까지 이월과세를 싣지 않으므로, 같은 증여 사건(CO)의 이월과세·당초 증여자 값을 본문에 넣는다. */
const buildingOnlyBody = async (co: Record<string, unknown> = {}, over: Partial<AssetForm> = {}) => {
  const base = await bodyOf(formOf([bOnly(co, over)]));
  const donor = await bodyOf(formOf([{ ...lOnly("purchase", over), carryover: { ...CO, ...co } } as AssetForm]));
  return withParts(
    { ...base, carryoverTaxation: donor.carryoverTaxation, burdenedGiftInfo: { ...base.burdenedGiftInfo, carryoverDonorBasis: donor.burdenedGiftInfo.carryoverDonorBasis } },
    BLDG,
  );
};
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

describe("토지만 이월과세 — 건물은 양도인 값·양도인 기산일 그대로 (수정 前 109,326,000 · L4z 125,113,200)", () => {
  it.each([
    ["L2 건물 양도인 매매(2020)", "purchase", {}],
    ["L4 건물 본인 신축(2020)", "newConstruction", {}],
    ["L4z 본인 신축 + 당초 증여자 건물 기준시가 0", "newConstruction", { bgCoDonorBuildingStdPriceAtAcq: "0" }],
  ] as const)("%s → 90,758,940", async (_n, cause, over) => {
    const r = await ok200(await landOnlyBody(cause, over as Partial<AssetForm>));
    const d = detail(r);
    expect(d.adoptedScenario).toBe("A");
    expect([d.determinedTaxA, d.determinedTaxB, r.det]).toEqual([90_758_940, 70_998_000, 90_758_940]);
    // 토지 A = 250,000,000 × 10,000,000 / 200,000,000 · 건물 = 양도인 환산 250,000,000 × 1억 / 2억
    expect([card(d.scenarioA, "토지").acquisitionPrice, card(d.scenarioA, "건물").acquisitionPrice]).toEqual([12_500_000, 125_000_000]);
    // 건물 장특 = 123,500,000 × 12%(2020-01-01부터 6년) — 수정 前 2015년부터 22%
    expect(prop(r, "건물").longTermHoldingDeduction).toBe(14_820_000);
    expect(prop(r, "토지").longTermHoldingDeduction).toBe(52_217_000);
    expect([d.scenarioA.landHoldingStartDate, d.scenarioA.buildingHoldingStartDate]).toEqual(["2015-01-01", "2020-01-01"]);
  });
});

describe("건물만 이월과세 — 토지는 양도인 값 (수정 前 ⑫ 400 · 그 전에는 이월과세 소실 66,675,500)", () => {
  it("B0 증여세 없음 → 74,817,560", async () => {
    const r = await ok200(await buildingOnlyBody());
    const d = detail(r);
    expect([d.determinedTaxA, d.determinedTaxB, d.adoptedScenario]).toEqual([74_817_560, 66_675_500, "A"]);
    expect([card(d.scenarioA, "토지").acquisitionPrice, card(d.scenarioA, "건물").acquisitionPrice]).toEqual([125_000_000, 50_000_000]);
    expect([prop(r, "토지").longTermHoldingDeduction, prop(r, "건물").longTermHoldingDeduction]).toEqual([27_170_000, 43_868_000]);
  });
  it("B1 산출 3천만 / 과세가액 10억 → 70,371,560 · 상당액(채무비율 후 15,000,000)은 건물에만", async () => {
    const r = await ok200(await buildingOnlyBody(RETURN));
    const d = detail(r);
    expect([d.determinedTaxA, d.adoptedScenario]).toEqual([70_371_560, "A"]);
    expect([card(d.scenarioA, "토지").transferGain, card(d.scenarioA, "건물").transferGain]).toEqual([123_500_000, 184_400_000]);
  });
});

describe("회귀 0 — parts 미지정 = 둘 다", () => {
  it("분리 ON 둘 다 이월과세(L3) · parts 미지정 / {둘 다 true} → 109,326,000", async () => {
    const b = await bothBody();
    expect((await ok200(b)).det).toBe(109_326_000);
    expect((await ok200(withParts(b, { land: true, building: true }))).det).toBe(109_326_000);
  });
  it("분리 OFF(L0·L1) → 109,326,000 · 104,646,000", async () => {
    expect((await ok200(await bodyOf(formOf([gbAsset()])))).det).toBe(109_326_000);
    expect((await ok200(await bodyOf(formOf([gbAsset({}, RETURN)])))).det).toBe(104_646_000);
  });
});

describe("⑫ parts 정합", () => {
  it("건물 원인만 이월과세인데 parts 미지정·{둘 다}·{토지만} → 400", async () => {
    const b = await buildingOnlyBody();
    for (const parts of [undefined, { land: true, building: true }, LAND]) {
      const r = await post(withParts(b, parts));
      expect(r.status).toBe(400);
    }
  });
  it("parts 둘 다 false → 400", async () => {
    expect((await post(withParts(await bothBody(), { land: false, building: false }))).status).toBe(400);
  });
});

describe("산정방식 격자 — 증여받지 않은 파트는 시나리오 B와 같은 카드", () => {
  const STD = { bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "" } as unknown as Partial<AssetForm>;
  const K4 = {
    bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "200,000,000",
    bgCoDonorActualAcquisitionLand: "50,000,000", bgCoDonorActualAcquisitionBuilding: "80,000,000",
  } as unknown as Partial<AssetForm>;
  it.each([["K-1~K-3 기준시가", STD], ["K-4 실지 분리 칸", K4], ["K-5 환산", {}]] as const)("%s · 토지만 / 건물만", async (_n, over) => {
    const both = detail(await ok200(await bothBody(over as Partial<AssetForm>)));
    const l = detail(await ok200(await landOnlyBody("purchase", over as Partial<AssetForm>)));
    expect(card(l.scenarioA, "토지").acquisitionPrice).toBe(card(both.scenarioA, "토지").acquisitionPrice);
    expect(card(l.scenarioA, "건물").acquisitionPrice).toBe(card(l.scenarioB, "건물").acquisitionPrice);
    expect(card(l.scenarioA, "건물").acquisitionPrice).not.toBe(card(both.scenarioA, "건물").acquisitionPrice);
    const bo = detail(await ok200(await buildingOnlyBody({}, over as Partial<AssetForm>)));
    expect(card(bo.scenarioA, "건물").acquisitionPrice).toBe(card(both.scenarioA, "건물").acquisitionPrice);
    expect(card(bo.scenarioA, "토지").acquisitionPrice).toBe(card(bo.scenarioB, "토지").acquisitionPrice);
  });
  it("K-4 총액 · 한 파트만 → 400 (총액은 파트를 가를 수 없다 — Q-4)", async () => {
    const b = await landOnlyBody("purchase");
    const r = await post(patchInfo(b, { acquisitionMethod: "actual", actualAcquisitionTotal: 500_000_000 }, { actualAcquisitionTotal: 130_000_000, landStdPriceAtAcquisition: undefined, buildingStdPriceAtAcquisition: undefined }));
    expect(r.status).toBe(400);
    expect(r.message).toContain("한 파트");
  });
  it.each([["appraisal"], ["salesCase"]] as const)("K-6·K-7(%s) · 한 파트만 → 400 (Q-3)", async (m) => {
    const b = await landOnlyBody("purchase");
    const r = await post(patchInfo(b, { acquisitionMethod: m, actualLandAcquisitionPrice: 400_000_000, actualBuildingAcquisitionPrice: 100_000_000 }, { presumedLandAcquisitionPrice: 50_000_000 }));
    expect(r.status).toBe(400);
    expect(r.message).toContain("한 파트");
  });
});

describe("당초 증여자 신축·증축(§114조의2)", () => {
  const DB = { buildingType: "new", constructionDate: "2016-01-01" };
  it("건물만 + 증여자 신축 → 계산된다", async () => {
    const b = await buildingOnlyBody();
    const r = await post({ ...b, burdenedGiftInfo: { ...b.burdenedGiftInfo, carryoverDonorBasis: { ...b.burdenedGiftInfo.carryoverDonorBasis, donorBuilt: DB } } });
    expect(r.status, r.message).toBe(200);
  });
  it("토지만 + 증여자 신축 → 400 (건물을 증여받지 않았다)", async () => {
    const b = await landOnlyBody("purchase");
    const r = await post({ ...b, burdenedGiftInfo: { ...b.burdenedGiftInfo, carryoverDonorBasis: { ...b.burdenedGiftInfo.carryoverDonorBasis, donorBuilt: DB } } });
    expect(r.status).toBe(400);
  });
});
