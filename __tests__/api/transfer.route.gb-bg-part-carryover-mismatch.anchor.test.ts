/**
 * anchor — 일반건물 부담부증여 × 이월과세 — **토지·건물 중 한쪽만 이월과세면 ⑧·⑫가 막는다**
 *
 * 계획서 `docs/00-pm/gb-bg-part-carryover-mismatch.plan.md` §1·§4.2 (Q-1 b · Q-2 a · Q-3 a).
 * 수정 前(실측 2026-10-26): 부담부증여 경로가 이월과세를 토지 취득원인 하나로 판정해 ⑧ 0건 · 200 —
 *  · 건물만 이월과세 → 이월과세 통째 소실 66,675,500(= 이월과세 없음)
 *  · 토지만 이월과세 + 건물 본인 신축 + 당초 증여자 건물 기준시가 0 → 125,113,200(이월과세 없음 57,013,800)
 * 분리 OFF(원인 하나)와 일반 양도(파트별 이월과세 지원)는 그대로다.
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
const MISMATCH = "한쪽만 이월과세";
const mismatch = (f: TransferFormData) =>
  issues(f).map((i) => i as { field?: string; message?: string }).filter((i) => (i.message ?? "").includes(MISMATCH));
const zodPaths = async (f: TransferFormData) => {
  const r = await run(f);
  return { status: r.status, paths: r.fieldErrors };
};

/**
 * PR-2 화면(`gb-bg-part-carryover-calc.plan.md` §4.5)이 이 차단을 풀었다 — 서버가 증여받은 파트만 계산하고 ④가 `parts`를 싣는다.
 * 계산 값은 `transfer.route.gb-bg-part-carryover-ui.anchor.test.ts`가 고정한다. 여기서는 차단 문구가 다시 나오지 않는 것만 본다.
 */
describe("⑧ 분리 ON에서 토지·건물 중 한쪽만 이월과세 — PR-2 이후 막지 않는다 (#2571 차단 해제)", () => {
  it.each([
    ["건물만 · 증여세 없음(B0)", bOnly()],
    ["건물만 · 산출 3천만 + 과세가액 10억(B1)", bOnly(RETURN)],
    ["토지만 · 건물 양도인 매매(L2)", lOnly("purchase")],
    ["토지만 · 건물 본인 신축(L4)", lOnly("newConstruction")],
    ["토지만 · 건물 본인 신축 · 당초 증여자 건물 기준시가 0(L4z)", lOnly("newConstruction", { bgCoDonorBuildingStdPriceAtAcq: "0" } as Partial<AssetForm>)],
  ])("%s", (_n, a) => {
    expect(mismatch(formOf([a]))).toEqual([]);
  });

  it("지분 50/50 · 묶음도 막지 않는다", () => {
    expect(mismatch(shares(bOnly(), bOnly()))).toEqual([]);
    expect(mismatch(bundle(bOnly(), landBg(2)))).toEqual([]);
    expect(mismatch(bundle(landBg(1), bOnly()))).toEqual([]);
  });

  it("막지 않는다 — 분리 OFF(종전 기준 L0·L1) · 분리 ON 둘 다 이월과세(L3) · 이월과세 없음(P0) · 일반 양도 건물만·토지만", () => {
    for (const f of [
      formOf([gbAsset({}, { giftTaxAmount: "" })]),
      formOf([gbAsset({}, RETURN)]),
      formOf([gbAsset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01", gbBuildingAcquisitionCause: "carryover_gift", buildingCarryover: { ...CO } as never } as Partial<AssetForm>, { giftTaxAmount: "" })]),
      formOf([bOnly({}, { gbBuildingAcquisitionCause: "purchase", buildingCarryover: undefined })]),
      formOf([bOnly({}, { transferType: "regular" })]),
      formOf([lOnly("purchase", { transferType: "regular" })]),
    ])
      expect(mismatch(f)).toEqual([]);
  });

  it("분리 OFF 종전 세액 고정 — 109,326,000 · 104,646,000 (회귀 0)", async () => {
    expect((await ok(formOf([gbAsset({}, { giftTaxAmount: "" })]))).determinedTax).toBe(109_326_000);
    // 둘 다 이월과세 — 평가액은 토지분·건물분으로 받는다(`gb-bg-carryover-gift-tax-part-limit.plan.md` Q-3 b). 5억:5억 = 양도가액 비율이라 종전 값 그대로.
    expect((await ok(formOf([gbAsset({ buildingCarryover: { ...CARRYOVER_DEFAULTS, giftDateValuation: "500,000,000" } } as Partial<AssetForm>, { ...RETURN, giftDateValuation: "500,000,000" })]))).determinedTax).toBe(104_646_000);
  });
});

/** ⑫ 규칙(`parts` ↔ 취득원인 정합)은 PR-1 anchor가 본문으로 고정한다. 화면 경로는 PR-2부터 ④가 `parts`를 실어 통과한다. */
describe("⑫ 부담부증여 일반건물의 건물만 이월과세 — 화면 경로는 parts를 실어 통과한다 (PR-2 · 종전 400)", () => {
  it("단건 · 지분 · 묶음 — buildingAcquisitionCause 경로 거부가 없다", async () => {
    for (const f of [formOf([bOnly()]), shares(bOnly(), bOnly()), bundle(bOnly(), landBg(2)), bundle(landBg(1), bOnly())]) {
      const { status, paths } = await zodPaths(f);
      expect(paths.filter((p) => p.endsWith("buildingAcquisitionCause"))).toEqual([]);
      expect(status).toBe(200);
    }
  });
  it("거부하지 않는다 — 일반 양도 건물만 이월과세 · 분리 ON 둘 다 이월과세(109,326,000) · 부담부증여 토지만(본문이 종전 기준과 같은 모양 — ⑧만 막는다)", async () => {
    const regular = await run(formOf([bOnly({}, { transferType: "regular" })]));
    expect(regular.fieldErrors).not.toContain("generalBuildingValuation.buildingAcquisitionCause");
    expect((await run(formOf([lOnly("purchase")]))).status).toBe(200);
    const both = await run(formOf([gbAsset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2024-05-01", gbBuildingAcquisitionCause: "carryover_gift", buildingCarryover: { ...CO } as never } as Partial<AssetForm>, { giftTaxAmount: "" })]));
    expect([both.status, both.det]).toEqual([200, 109_326_000]);
  });
});
