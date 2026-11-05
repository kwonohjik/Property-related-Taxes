/**
 * anchor — 부담부증여 × 이월과세 × K-6/K-7(감정가액·매매사례가액) · **한 파트만 증여받은 일반건물** — 종전 ⑧·엔진 차단을 푼다.
 *
 * 계획서 `docs/02-design/features/bg-carryover-k5-one-part-b.plan.md` §9(K-5 한 파트와 같은 규칙).
 *  · A: 증여받은 파트 = 당초 증여자 감정가액·매매사례가액(§97의2①1호) · 다른 파트 = 양도인 자기 값(§97①1호나목) — 둘 다 개산공제
 *  · B: 증여받은 파트 = 양도인 증여일 평가액(소령 §163⑨ · 실비) · 다른 파트 = A와 같다
 * 시료는 `transfer.route.gb-bg-part-carryover-calc.anchor.test.ts`와 같다(양도 10억 · 채무비율 0.5 · 파트 양도가액 2.5억씩).
 * 카드 손계산: 토지만 A 토지 = 3천만 × 0.5 = 1,500만 · 개산공제 1천만 × 0.5 × 3% = 15만 → 234,850,000 / 건물 = 2.4억 × 0.5 · 1억 × 0.5 × 3% → 128,500,000 / B 토지 = 1억 × 0.5 → 200,000,000.
 * 수정 前: ⑧ 「감정가액·매매사례가액을 아직 계산하지 못합니다」 · 엔진 400.
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
const detail = (r: Run) => r.a?.burdenedGiftCarryoverDetail as { determinedTaxA: number; determinedTaxB: number; adoptedScenario: string; scenarioA: Body; scenarioB: Body };
const ok200 = async (b: Body) => {
  const r = await post(b);
  expect(r.status, r.message).toBe(200);
  return r;
};

const issuesOf = (f: TransferFormData) =>
  [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)).filter((i) => !String(i.field).startsWith("household")) as { field?: string; message?: string }[];
type M = "appraisal" | "salesCase";
const lIn = (m: M, over: Record<string, string> = {}) =>
  ({ bgAcquisitionMethod: m, bgCoDonorPresumedAcquisitionLand: "30,000,000", bgPresumedAcquisitionBuilding: "240,000,000", bgActualAcquisitionLand: "100,000,000", bgActualAcquisitionBuilding: "", ...over }) as unknown as Partial<AssetForm>;
const bIn = (m: M, over: Record<string, string> = {}) =>
  ({ bgAcquisitionMethod: m, bgCoDonorPresumedAcquisitionBuilding: "30,000,000", bgPresumedAcquisitionLand: "240,000,000", bgActualAcquisitionBuilding: "100,000,000", bgActualAcquisitionLand: "", ...over }) as unknown as Partial<AssetForm>;
const lF = (m: M, over: Record<string, string> = {}) => formOf([lOnly("purchase", lIn(m, over))]);
const bF = (m: M, over: Record<string, string> = {}) => formOf([bOnly({}, bIn(m, over))]);
const cards = (s: Body) => (s.parts as Body[]).map((p) => [p.acquisitionPrice, p.transferGain]);

describe.each(["appraisal", "salesCase"] as const)("화면 경로 ⑧ → ④ → ⑫ → 엔진 (%s)", (m) => {
  it("토지만 → B 103,138,000 채택 · 카드 손계산 일치", async () => {
    expect(issuesOf(lF(m))).toEqual([]);
    const r = await ok200(await bodyOf(lF(m)));
    const d = detail(r);
    expect([d.determinedTaxA, d.determinedTaxB, d.adoptedScenario, r.det]).toEqual([91_689_940, 103_138_000, "B", 103_138_000]);
    expect(cards(d.scenarioA)).toEqual([[15_000_000, 234_850_000], [120_000_000, 128_500_000]]);
    expect(cards(d.scenarioB)).toEqual([[50_000_000, 200_000_000], [120_000_000, 128_500_000]]);
  });
  it("건물만 → B 98,640,500 채택 (A 건물 개산공제 base = 당초 증여자 건물 기준시가 4천만)", async () => {
    expect(issuesOf(bF(m))).toEqual([]);
    const d = detail(await ok200(await bodyOf(bF(m))));
    expect([d.determinedTaxA, d.determinedTaxB, d.adoptedScenario]).toEqual([86_673_560, 98_640_500, "B"]);
    expect(cards(d.scenarioA)).toEqual([[120_000_000, 128_500_000], [15_000_000, 234_400_000]]);
    expect(cards(d.scenarioB)).toEqual([[120_000_000, 128_500_000], [50_000_000, 200_000_000]]);
  });
  it("④ 양도인 값은 다른 파트만 · 당초 증여자 값은 증여받은 파트만 · 평가액은 증여받은 파트만", async () => {
    const info = (await bodyOf(lF(m, { bgPresumedAcquisitionLand: "999,000,000", bgCoDonorPresumedAcquisitionBuilding: "999,000,000", bgActualAcquisitionBuilding: "999,000,000" }))).burdenedGiftInfo;
    expect([info.presumedLandAcquisitionPrice, info.presumedBuildingAcquisitionPrice]).toEqual([undefined, 240_000_000]);
    expect([info.carryoverDonorBasis.presumedLandAcquisitionPrice, info.carryoverDonorBasis.presumedBuildingAcquisitionPrice]).toEqual([30_000_000, undefined]);
    expect([info.actualLandAcquisitionPrice, info.actualBuildingAcquisitionPrice]).toEqual([100_000_000, undefined]);
  });
  it.each([
    ["토지만 · 평가액", "L", "bgActualAcquisitionLand"],
    ["토지만 · 양도인 건물 값", "L", "bgPresumedAcquisitionBuilding"],
    ["토지만 · 당초 증여자 토지 값", "L", "bgCoDonorPresumedAcquisitionLand"],
    ["건물만 · 평가액", "B", "bgActualAcquisitionBuilding"],
    ["건물만 · 양도인 토지 값", "B", "bgPresumedAcquisitionLand"],
    ["건물만 · 당초 증여자 건물 값", "B", "bgCoDonorPresumedAcquisitionBuilding"],
  ] as const)("⑧ %s 비움 → 그 칸 오류", (_n, which, field) => {
    const f = which === "L" ? lF(m, { [field]: "" }) : bF(m, { [field]: "" });
    expect(issuesOf(f).map((i) => i.field)).toContain(field);
  });
});

describe("⑫·엔진 방어선", () => {
  it.each([["actualLandAcquisitionPrice"], ["presumedBuildingAcquisitionPrice"]] as const)("⑫ 토지만 · 본문 %s 제거 → 400 · 그 경로", async (key) => {
    const b = await bodyOf(lF("appraisal"));
    delete b.burdenedGiftInfo[key];
    const r = await post(b);
    expect(r.status).toBe(400);
    expect(r.fieldErrors.some((f) => f.includes(key))).toBe(true);
  });
  it("엔진 assertCarryoverDonorBasis: 세 값 중 하나라도 없으면 던진다 · 모두 있으면 통과", async () => {
    const { assertCarryoverDonorBasis } = await import("@/lib/tax-engine/transfer-tax-carryover-burdened-gift");
    const ct = { giftRegistryDate: new Date("2024-05-01"), donorAcquisitionDate: new Date("2015-01-01"), donorAcquisitionPrice: 0, useEstimatedAcquisition: false, giftTaxAmount: 0 };
    const ok = {
      valuationMode: "sangjeungbeop_market", marketValueAtTransfer: 1_000_000_000, acquisitionMethod: "appraisal",
      lendingDepositTotal: 0, mortgageDebtAmount: 500_000_000, annualRentTotal: 0,
      landStdPriceAtTransfer: 200_000_000, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 100_000_000,
      actualLandAcquisitionPrice: 100_000_000, presumedBuildingAcquisitionPrice: 240_000_000,
      carryoverDonorBasis: { landStdPriceAtAcquisition: 10_000_000, presumedLandAcquisitionPrice: 30_000_000, parts: { land: true, building: false } },
    };
    expect(() => assertCarryoverDonorBasis(ok as never, ct as never)).not.toThrow();
    expect(() => assertCarryoverDonorBasis({ ...ok, actualLandAcquisitionPrice: undefined } as never, ct as never)).toThrow(/제163조 제9항/);
    expect(() => assertCarryoverDonorBasis({ ...ok, presumedBuildingAcquisitionPrice: undefined } as never, ct as never)).toThrow(/양도인의 취득 당시 감정가액/);
    expect(() => assertCarryoverDonorBasis({ ...ok, carryoverDonorBasis: { ...ok.carryoverDonorBasis, presumedLandAcquisitionPrice: undefined } } as never, ct as never)).toThrow(/당초 증여자 취득 당시 감정가액/);
    expect(() => assertCarryoverDonorBasis({ ...ok, carryoverDonorBasis: { ...ok.carryoverDonorBasis, landStdPriceAtAcquisition: undefined } } as never, ct as never)).toThrow(/기준시가/);
  });
});

describe("지분·묶음 — 단건과 같은 leaf", () => {
  it("지분 50/50 토지만 = 단건 103,138,000 · 건물만 = 98,640,500", async () => {
    expect((await ok200(await bodyOf(shares(lOnly("purchase", lIn("appraisal")), lOnly("purchase", lIn("appraisal")))))).det).toBe(103_138_000);
    expect((await ok200(await bodyOf(shares(bOnly({}, bIn("appraisal")), bOnly({}, bIn("appraisal")))))).det).toBe(98_640_500);
  });
  it.each([["일반건물 첫째", true], ["일반건물 둘째", false]] as const)("묶음(%s) 계산된다 · 같은 B", async (_n, first) => {
    const run = async (gb: AssetForm) => ok200(await bodyOf(first ? bundle(gb, landBg(2)) : bundle(landBg(1), gb)));
    const units = (r: Run) => Object.values((r.a?.burdenedGiftCarryoverUnits ?? {}) as Record<string, Body>).map((u) => u.adoptedScenario);
    expect(units(await run(lOnly("purchase", lIn("appraisal"))))).toEqual(["B"]);
    expect(units(await run(bOnly({}, bIn("appraisal"))))).toEqual(["B"]);
  });
});
