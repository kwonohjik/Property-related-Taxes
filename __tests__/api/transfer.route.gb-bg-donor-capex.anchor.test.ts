/**
 * anchor — 일반건물 부담부증여 × 이월과세: 당초 증여자의 자본적지출(「소득세법」 제97조의2 제1항 제2호)을 시나리오 A 필요경비에 더한다 (V-3 · Q-3 a)
 *
 * 계획서 `docs/00-pm/gb-bg-on-building-block-fields.plan.md` §1.3 · §4.3.
 * 수정 前: 토지 블록 「증여자 자본적지출」은 ④ 본문에 실리지만 일반건물 부담부증여 route가 A에 더하지 않았다(세액 그대로).
 * 기대값은 손계산(계획서 §1.3) — 1억 × 채무 비율 50% × (1 − 22%) × 38% = 14,820,000 감소.
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
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const detail = (r: Run) => r.a?.burdenedGiftCarryoverDetail as { determinedTaxA: number; determinedTaxB: number; adoptedScenario: string; scenarioA: Body; donorCapexAddedToExpense?: number };
const ok = async (f: TransferFormData) => {
  expect(issues(f)).toEqual([]);
  const r = await run(f);
  expect(r.status, r.message).toBe(200);
  return r;
};


const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" };

/** K-4 실지 · 분리 ON · 둘 다 이월과세 · 신고서 산출세액 1억·과세가액 10억(토지분 6억·건물분 4억). 양도인 = 증여 당시 평가액 6억·4억 · 당초 증여자 실지 5천만·1억. */
const k4 = (landCo: Record<string, unknown> = {}, bldCo: Record<string, unknown> = {}, over: Partial<AssetForm> = {}) =>
  gbAsset({
    hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01",
    gbBuildingAcquisitionCause: "carryover_gift",
    bgAcquisitionMethod: "actual",
    bgActualAcquisitionLand: "600,000,000", bgActualAcquisitionBuilding: "400,000,000",
    bgCoDonorActualAcquisitionLand: "50,000,000", bgCoDonorActualAcquisitionBuilding: "100,000,000",
    buildingCarryover: { ...CO, giftDateValuation: "400,000,000", ...bldCo } as never,
    ...over,
  } as Partial<AssetForm>, { giftDateValuation: "600,000,000", giftTaxCalculated: "100,000,000", giftTaxBase: "1,000,000,000", ...landCo });

describe("Q-3 a 증여자 자본적지출 → 시나리오 A 필요경비", () => {
  it("기준: 자본적지출 없음 → 90,260,000 (A 채택)", async () => {
    const r = await ok(formOf([k4()]));
    expect(r.det).toBe(90_260_000);
    expect(detail(r).adoptedScenario).toBe("A");
  });

  it("토지 블록 1억 → 75,440,000 (수정 前 90,260,000) · B는 양도인 값이라 그대로", async () => {
    const base = await ok(formOf([k4()]));
    const r = await ok(formOf([k4({ donorCapitalExpenditure: "100,000,000" })]));
    expect(r.det).toBe(75_440_000);
    expect(detail(r).determinedTaxB).toBe(detail(base).determinedTaxB);
    // ⑦ [A] 열 표시 재료 — 채무 비율 안분 전 금액 · 없으면 싣지 않는다.
    expect([detail(r).donorCapexAddedToExpense, detail(base).donorCapexAddedToExpense]).toEqual([100_000_000, undefined]);
  });

  it("2024.1.1. 전 양도 — 제2호는 그 뒤 양도분부터라 더하지 않는다(단건 엔진과 같은 가드)", async () => {
    const pre = (capex: string) => formOf([k4({ donorCapitalExpenditure: capex, giftRegistryDate: "2020-05-01" }, { giftRegistryDate: "2020-05-01" }, { acquisitionDate: "2020-05-01", landAcquisitionDate: "2020-05-01" })], { transferDate: "2023-12-01", filingDate: "2024-02-28" });
    const without = await run(pre(""));
    const withCapex = await run(pre("100,000,000"));
    expect(without.status, without.message).toBe(200);
    expect(withCapex.det).toBe(without.det);
    // ④가 이미 싣지 않는다 — 직접 호출(본문에 값이 실려 와도)에서도 route가 더하지 않는다(엔진 가드).
    const body = await bodyOf(pre(""));
    expect(body.carryoverTaxation).toBeDefined();
    const direct = await post({ ...body, carryoverTaxation: { ...body.carryoverTaxation, donorCapitalExpenditure: 100_000_000 } });
    expect([direct.status, direct.det]).toEqual([200, without.det]);
  });

  it("지분 50/50 · 자본적지출 없음 → 합계 = 단건 90,260,000", async () => {
    const half = { ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>;
    const share = (n: number) => ({ ...k4({}, {}, half), assetId: `a${n}`, assetLabel: `자산 ${n}` }) as AssetForm;
    expect((await ok(formOf([share(1), share(2)], { assetSplitMode: "fractional" }))).det).toBe(90_260_000);
  });

  it("지분 50/50 → 합계 = 단건 75,440,000", async () => {
    const half = { ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>;
    const share = (n: number) => ({ ...k4({ donorCapitalExpenditure: "100,000,000" }, {}, half), assetId: `a${n}`, assetLabel: `자산 ${n}` }) as AssetForm;
    const r = await ok(formOf([share(1), share(2)], { assetSplitMode: "fractional" }));
    expect(r.det).toBe(75_440_000);
  });
});

const landBg = (n: number) => ({
  ...makeDefaultAsset(n), assetId: `a${n}`, assetKind: "land", addressJibun: "강원 홍천군 테스트리 1", acquisitionArea: "300", transferArea: "300", acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "300,000,000",
  bgMortgageDebtAmount: "150,000,000", bgMortgageSetAmount: "150,000,000", bgLendingDepositTotal: "0", bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "100,000,000", standardPriceAtTransfer: "150000000", standardPriceAtAcq: "80000000",
}) as unknown as AssetForm;
const BUNDLE = { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1,300,000,000" };
describe("묶음(함께 부담부증여) — 같은 leaf", () => {
  /**
   * 일반건물 K-4 + 토지 부담부증여. A 채택 121,260,000 → 105,660,000.
   *   증여자 자본적지출 1억 × 채무 비율 50% = 5천만을 A의 당초 증여자 취득시 기준시가(토지 1천만 : 건물 4천만)로 나눈다 → 토지 −1천만 · 건물 −4천만.
   *   과세표준 368,000,000 → 329,000,000(−5천만 × (1 − 22%)) · 40% 구간 → −15,600,000.
   */
  it("일반건물 첫 자산 · 토지 블록 1억 → 105,660,000 (수정 前 121,260,000) · B 12,360,000 그대로", async () => {
    const base = await ok(formOf([k4(), landBg(2)], BUNDLE));
    const r = await ok(formOf([k4({ donorCapitalExpenditure: "100,000,000" }), landBg(2)], BUNDLE));
    const unit = (x: Run) => x.a?.burdenedGiftCarryoverUnits?.primary;
    expect([base.det, unit(base).adoptedScenario]).toEqual([121_260_000, "A"]);
    expect(r.det).toBe(105_660_000);
    expect(unit(r).determinedTaxB).toBe(12_360_000);
    expect(unit(r).donorCapexAddedToExpense).toBe(100_000_000);
    expect(r.a?.properties.slice(0, 2).map((p: Body) => p.transferGain)).toEqual([185_000_000, 140_000_000]);
  });
});

describe("한 파트만 이월과세 — 당초 증여자 자본적지출은 증여받은 파트에만 귀속한다(2026-10-27 사용자 결정)", () => {
  /** 건물만 이월과세 · K-4 · 건물 블록이 증여 사건(자본적지출 칸 포함). 토지 = 양도인 본인 매입 2018. */
  const bOnly = (capex: string) => formOf([gbAsset({
    hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2018-01-01", acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "carryover_gift",
    bgAcquisitionMethod: "actual",
    bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "400,000,000",
    bgCoDonorActualAcquisitionBuilding: "100,000,000",
    buildingCarryover: { ...CO, giftDateValuation: "400,000,000", giftTaxCalculated: "100,000,000", giftTaxBase: "1,000,000,000", donorCapitalExpenditure: capex } as never,
  } as Partial<AssetForm>)]);
  /**
   * 1억 × 채무 비율 50% = 5천만 → 건물에만(취득시 기준시가로 나누면 양도인 토지 1억 : 당초 증여자 건물 4천만이라 대부분 토지로 샌다).
   *   건물 양도차익 180,000,000 → 130,000,000 · 토지 100,000,000 그대로.
   *   과세표준 221,900,000 → 182,900,000(−5천만 × (1 − 22%)) · 38% → −14,820,000.
   */
  it("건물만 · 건물 블록 1억 → 64,382,000 → 49,562,000 · 토지 양도차익 불변", async () => {
    const base = await ok(bOnly(""));
    const r = await ok(bOnly("100,000,000"));
    expect([base.det, detail(base).adoptedScenario]).toEqual([64_382_000, "A"]);
    expect(r.det).toBe(49_562_000);
    expect(r.a?.properties.map((p: Body) => p.transferGain)).toEqual([100_000_000, 130_000_000]);
  });
});

describe("legacy 필요경비 한 덩어리(자본적지출·양도비 칸 비어 있음) — 택일로 버려지지 않는다", () => {
  /**
   * 예전 「필요경비」 2천만만 있는 이력: 87,296,000. 당초 증여자 1억을 더하면 72,476,000(−14,820,000 · §1.3과 같은 감소).
   * 자본적지출 칸에 얹었다면 legacy 2천만이 택일(`declaredExpenses`)로 버려져 감소가 14,820,000 − 2,964,000이 된다.
   */
  it("legacy 2천만 + 토지 블록 1억 → 87,296,000 → 72,476,000", async () => {
    const legacy = (capex: string) => formOf([k4({ donorCapitalExpenditure: capex }, {}, { directExpenses: "20,000,000", capitalExpenditure: "", transferExpense: "" } as Partial<AssetForm>)]);
    expect((await ok(legacy(""))).det).toBe(87_296_000);
    expect((await ok(legacy("100,000,000"))).det).toBe(72_476_000);
  });
});
