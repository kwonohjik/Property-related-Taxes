/**
 * anchor — 부담부증여 × 이월과세 × K-5 · **한 파트만 증여받은 일반건물**의 시나리오 B = 증여받은 파트는 양도인 증여일 평가액(소령 §163⑨), 다른 파트는 환산.
 *
 * 계획서 `docs/02-design/features/bg-carryover-k5-one-part-b.plan.md` (Q-1~Q-5 a). 시료·헬퍼는 `transfer.route.gb-bg-part-carryover-calc.anchor.test.ts`와 같다.
 * 기대값은 계획서 §1 대용 실측(K-4 분리 칸: 증여받은 파트 = 평가액 · 다른 파트 = 환산 + 개산공제와 같은 차익)이다.
 * 수정 前: B는 두 파트 모두 환산 + 개산공제(토지만 70,998,000 · 건물만 66,675,500) → A 채택(90,758,940 · 74,817,560).
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
    bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted", bgActualAcquisitionLand: "250,000,000", bgActualAcquisitionBuilding: "250,000,000", /* K-5 이월과세 B = 양도인 증여일 평가액(소령 §163⑨) */
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
const detail = (r: Run) => r.a?.burdenedGiftCarryoverDetail as { determinedTaxA: number; determinedTaxB: number; adoptedScenario: string; scenarioA: Body; scenarioB: Body };
const ok200 = async (b: Body) => {
  const r = await post(b);
  expect(r.status, r.message).toBe(200);
  return r;
};

const M = 1_000_000;
const withV = (b: Body, part: "land" | "building", v: number | undefined): Body =>
  patchInfo(b, part === "land" ? { actualLandAcquisitionPrice: v, actualBuildingAcquisitionPrice: undefined } : { actualBuildingAcquisitionPrice: v, actualLandAcquisitionPrice: undefined });
const bCards = (r: Run) => (detail(r).scenarioB.parts as Body[]).map((p) => [p.acquisitionPrice, p.transferGain]);

describe("엔진·⑫ — 증여받은 파트는 평가액(실지), 다른 파트는 환산", () => {
  it("토지만 · 평가액 1억 → B 101,598,000 채택 (수정 前 A 90,758,940)", async () => {
    const r = await ok200(withV(await landOnlyBody("purchase"), "land", 100 * M));
    const d = detail(r);
    expect([d.determinedTaxA, d.determinedTaxB, d.adoptedScenario, r.det]).toEqual([90_758_940, 101_598_000, "B", 101_598_000]);
    // 토지 = 1억 × 0.5 · 개산공제 없음 / 건물 = 환산 1.25억 + 개산공제 150만
    expect(bCards(r)).toEqual([[50_000_000, 200_000_000], [125_000_000, 123_500_000]]);
  });
  it("토지만 · 평가액 2.5억 → B 71,598,000 · A 채택 불변", async () => {
    const d = detail(await ok200(withV(await landOnlyBody("purchase"), "land", 250 * M)));
    expect([d.determinedTaxA, d.determinedTaxB, d.adoptedScenario]).toEqual([90_758_940, 71_598_000, "A"]);
  });
  it("건물만 · 평가액 1억 → B 97,275,500 채택 (수정 前 A 74,817,560)", async () => {
    const r = await ok200(withV(await buildingOnlyBody(), "building", 100 * M));
    const d = detail(r);
    expect([d.determinedTaxA, d.determinedTaxB, d.adoptedScenario, r.det]).toEqual([74_817_560, 97_275_500, "B", 97_275_500]);
    expect(bCards(r)).toEqual([[125_000_000, 123_500_000], [50_000_000, 200_000_000]]);
  });
  it("증여받은 파트 평가액 없음 → 400 (다른 파트 칸만 있어도)", async () => {
    for (const [b, other] of [[await landOnlyBody("purchase"), "building"], [await buildingOnlyBody(), "land"]] as const) {
      const none = patchInfo(b, { actualLandAcquisitionPrice: undefined, actualBuildingAcquisitionPrice: undefined });
      expect((await post(none)).status).toBe(400);
      expect((await post(withV(b, other, 300 * M))).status).toBe(400);
    }
  });
});

const issuesOf = (f: TransferFormData) =>
  [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)).filter((i) => !String(i.field).startsWith("household")) as { field?: string; message?: string }[];
/** 화면 입력 — 증여받은 파트 평가액만 바꾸고 다른 파트 칸은 비운다(⑤가 숨긴다). */
const lForm = (v: string, other = "") => formOf([lOnly("purchase", { bgActualAcquisitionLand: v, bgActualAcquisitionBuilding: other } as Partial<AssetForm>)]);
const bForm = (v: string, other = "") => formOf([bOnly({}, { bgActualAcquisitionBuilding: v, bgActualAcquisitionLand: other } as Partial<AssetForm>)]);

describe("화면 경로 ⑧ → ④ → ⑫ → 엔진", () => {
  it("④ 토지만 → 토지 평가액만 싣는다(건물 칸 남은 값·총액은 싣지 않는다)", async () => {
    const info = (await bodyOf(formOf([lOnly("purchase", { bgActualAcquisitionLand: "100,000,000", bgActualAcquisitionBuilding: "300,000,000", bgActualAcquisitionTotal: "400,000,000" } as Partial<AssetForm>)]))).burdenedGiftInfo;
    expect([info.actualLandAcquisitionPrice, info.actualBuildingAcquisitionPrice, info.actualAcquisitionTotal]).toEqual([100_000_000, undefined, undefined]);
  });
  it("④ 건물만 → 건물 평가액만", async () => {
    const info = (await bodyOf(bForm("100,000,000", "300,000,000"))).burdenedGiftInfo;
    expect([info.actualLandAcquisitionPrice, info.actualBuildingAcquisitionPrice]).toEqual([undefined, 100_000_000]);
  });
  it("토지만 1억 → 101,598,000 · 건물만 1억 → 97,275,500", async () => {
    expect(issuesOf(lForm("100,000,000"))).toEqual([]);
    expect((await ok200(await bodyOf(lForm("100,000,000")))).det).toBe(101_598_000);
    expect(issuesOf(bForm("100,000,000"))).toEqual([]);
    expect((await ok200(await bodyOf(bForm("100,000,000")))).det).toBe(97_275_500);
  });
  it("⑧ 증여받은 파트 평가액 비움 → 그 칸 오류 · 다른 파트 칸은 요구하지 않는다", () => {
    expect(issuesOf(lForm("", "300,000,000")).map((i) => i.field)).toEqual(["bgActualAcquisitionLand"]);
    expect(issuesOf(bForm("", "300,000,000")).map((i) => i.field)).toEqual(["bgActualAcquisitionBuilding"]);
  });
  it("⑫ 증여받은 파트 칸이 비면 그 경로로 400", async () => {
    const r = await post(withV(await bodyOf(lForm("100,000,000")), "building", 300 * M));
    expect(r.status).toBe(400);
    expect(r.fieldErrors.some((f) => f.includes("actualLandAcquisitionPrice"))).toBe(true);
  });
});

describe("지분·묶음 — 단건과 같은 leaf (Q-3 a · 묶음은 K-4 분리 칸 대용과 1원까지 같다)", () => {
  const VL = { bgActualAcquisitionLand: "100,000,000", bgActualAcquisitionBuilding: "" } as Partial<AssetForm>;
  const VB = { bgActualAcquisitionBuilding: "100,000,000", bgActualAcquisitionLand: "" } as Partial<AssetForm>;
  it("지분 50/50 토지만 101,598,000 · 건물만 97,275,500 (= 단건)", async () => {
    expect((await ok200(await bodyOf(shares(lOnly("purchase", VL), lOnly("purchase", VL))))).det).toBe(101_598_000);
    expect((await ok200(await bodyOf(shares(bOnly({}, VB), bOnly({}, VB))))).det).toBe(97_275_500);
  });
  it.each([["일반건물 첫째", true], ["일반건물 둘째", false]] as const)("묶음(%s) 토지만 129,998,400 · 건물만 125,305,400 — B 채택 (수정 前 A 121,785,200 · 105,004,800)", async (_n, first) => {
    const run = async (gb: AssetForm) => ok200(await bodyOf(first ? bundle(gb, landBg(2)) : bundle(landBg(1), gb)));
    const units = (r: Run) => Object.values((r.a?.burdenedGiftCarryoverUnits ?? {}) as Record<string, Body>).map((u) => [u.determinedTaxA, u.determinedTaxB, u.adoptedScenario]);
    const rl = await run(lOnly("purchase", VL));
    expect([rl.det, units(rl)]).toEqual([129_998_400, [[121_785_200, 129_998_400, "B"]]]);
    const rb = await run(bOnly({}, VB));
    expect([rb.det, units(rb)]).toEqual([125_305_400, [[105_004_800, 125_305_400, "B"]]]);
  });
});

describe("엔진 방어선 — ⑫를 우회한 직접 호출", () => {
  it("assertCarryoverDonorBasis: 한 파트 K-5 · 증여받은 파트 평가액 없음 → 던진다(제163조 제9항) · 그 파트만 있으면 통과", async () => {
    const { assertCarryoverDonorBasis } = await import("@/lib/tax-engine/transfer-tax-carryover-burdened-gift");
    const ct = { giftRegistryDate: new Date("2024-05-01"), donorAcquisitionDate: new Date("2015-01-01"), donorAcquisitionPrice: 0, useEstimatedAcquisition: false, giftTaxAmount: 0 };
    const info = {
      valuationMode: "sangjeungbeop_market", marketValueAtTransfer: 1_000_000_000, acquisitionMethod: "converted",
      lendingDepositTotal: 0, mortgageDebtAmount: 500_000_000, annualRentTotal: 0,
      landStdPriceAtTransfer: 200_000_000, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 100_000_000,
      carryoverDonorBasis: { landStdPriceAtAcquisition: 10_000_000, parts: { land: true, building: false } },
    };
    expect(() => assertCarryoverDonorBasis({ ...info, actualBuildingAcquisitionPrice: 300 * M } as never, ct as never)).toThrow(/제163조 제9항/);
    expect(() => assertCarryoverDonorBasis({ ...info, actualLandAcquisitionPrice: 100 * M } as never, ct as never)).not.toThrow();
  });
});
