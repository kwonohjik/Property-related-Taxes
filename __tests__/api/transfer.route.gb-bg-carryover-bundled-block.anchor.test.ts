/**
 * anchor — 일반건물 **부담부증여 × 이월과세 × 지분 분할 취득(축 B)·함께 부담부증여 묶음** 차단 (F27 B · 계획서 `docs/00-pm/gb-bg-carryover-presumed-scenario-b.plan.md` PR-3 · Q-3 a)
 *
 * §97의2 시나리오 비교(F27)는 단건만 탄다. 수정 前 실측: 묶음에서 K-5 는 이월과세를 읽지 않고 양도인 기준(B) 값만 냈다 — 지분 50/50 결정세액 97,800,000 ·
 * 묶음(일반건물 + 토지 부담부증여) 110,760,000, 당초 증여자 기준시가를 1원·1원으로 바꿔도 같았다(Δ 0) · K-7 은 400. ⑧ 은 아무 말이 없었다.
 * ⇒ ⑧(`validateBurdenedGiftAsset` 1-a′)과 ⑫(`refineGbBgCarryoverBundled`)가 같은 문구로 막는다. 단건·이월과세 아님·일반 양도는 그대로.
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

interface Run { status: number; det?: number; message?: string; fieldErrors: string[]; co?: { adoptedScenario: "A" | "B"; determinedTaxA: number; determinedTaxB: number } }
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
  return { status: res.status, det: a?.determinedTax, message: json.error?.message, fieldErrors: Object.keys(json.error?.fieldErrors ?? {}), co: a?.burdenedGiftCarryoverDetail };
}
const run = async (f: TransferFormData): Promise<Run> => post(await bodyOf(f));
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));

// ─────────────────────────────────────────────────────────────────────
const BUNDLED = "지분 분할 취득·함께 부담부증여 묶음에서 아직 계산하지 못합니다";
const half = { ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>;
const K7 = {
  bgAcquisitionMethod: "appraisal", bgCoDonorPresumedAcquisitionLand: "100,000,000", bgCoDonorPresumedAcquisitionBuilding: "200,000,000",
  bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "300,000,000",
} as Partial<AssetForm>;
const landBg = (n: number) => ({
  ...makeDefaultAsset(n), assetKind: "land", addressJibun: "강원 홍천군 테스트리 1", acquisitionArea: "300", transferArea: "300", acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "300,000,000",
  bgMortgageDebtAmount: "150,000,000", bgMortgageSetAmount: "150,000,000", bgLendingDepositTotal: "0", bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "100,000,000", standardPriceAtTransfer: "150000000", standardPriceAtAcq: "80000000",
}) as unknown as AssetForm;
const second = (a: AssetForm, n = 2) => ({ ...a, assetId: `a${n}` }) as AssetForm;
const BUNDLE = { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1,300,000,000" };

const blocked: Array<[string, () => TransferFormData, string]> = [
  ["지분 분할 50/50 · K-5", () => formOf([gbAsset(half), second(gbAsset(half))], { assetSplitMode: "fractional" }), "carryoverTaxation"],
  ["지분 분할 50/50 · K-5 · 분할 방식 미선언(전 자산 지분 → 축 B)", () => formOf([gbAsset(half), second(gbAsset(half))]), "carryoverTaxation"],
  ["지분 분할 50/50 · K-7", () => formOf([gbAsset({ ...K7, ...half }), second(gbAsset({ ...K7, ...half }))], { assetSplitMode: "fractional" }), "carryoverTaxation"],
  ["지분 분할 · 첫 지분만 이월과세", () => formOf([gbAsset(half), second(gbAsset({ ...half, acquisitionCause: "gift" }))], { assetSplitMode: "fractional" }), "carryoverTaxation"],
  // 🔴 수정 前 ⑧ 만 막고 API 200 · 97,800,000 — 최상위 carryoverTaxation 은 첫 지분 것뿐이라 둘째 지분 이월과세가 조용히 사라졌다(계획서 gb-bg-carryover-share-bundled §1.3)
  ["지분 분할 · 둘째 지분만 이월과세", () => formOf([gbAsset({ ...half, acquisitionCause: "gift" }), second(gbAsset(half))], { assetSplitMode: "fractional" }), "generalBuildingShares.1.burdenedGiftInfo.carryoverDonorBasis"],
  ["부담부증여 묶음 · 일반건물 첫 자산 · K-5", () => formOf([gbAsset(), landBg(2)], BUNDLE), "carryoverTaxation"],
  ["부담부증여 묶음 · 일반건물 첫 자산 · K-7", () => formOf([gbAsset(K7), landBg(2)], BUNDLE), "carryoverTaxation"],
  ["부담부증여 묶음 · 일반건물 둘째 자산 · K-5", () => formOf([landBg(1), second(gbAsset())], BUNDLE), "companionAssets.0.carryoverTaxation"],
];

describe("🔴 ⑧ ↔ ⑫ — 묶음의 일반건물 부담부증여 × 이월과세는 둘 다 같은 문구로 막는다(수정 前: ⑧ 통과 · K-5 200 B 값 / K-7 400)", () => {
  it.each(blocked)("%s", async (_n, make, field) => {
    const f = make();
    expect(issues(f).map((i) => i.message).join("\n")).toContain(BUNDLED);
    const r = await run(f);
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toContain(field);
    expect(r.message ?? "").not.toContain("[burdened_gift]"); // 엔진 throw 가 아니라 ⑫ 에서 막힌다
  });
});

describe("대조 — 그대로 계산된다", () => {
  it("단건 일반건물 부담부증여 × 이월과세 K-5 → 200 · A 109,326,000(F27 그대로)", async () => {
    const f = formOf([gbAsset()]);
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.co?.adoptedScenario).toBe("A");
    expect(r.det).toBe(109_326_000);
  });
  it("지분 분할 · 이월과세 아님(증여 취득) → 막지 않는다", async () => {
    const f = formOf([gbAsset({ ...half, acquisitionCause: "gift" }), second(gbAsset({ ...half, acquisitionCause: "gift" }))], { assetSplitMode: "fractional" });
    expect(issues(f).map((i) => i.message).join("\n")).not.toContain(BUNDLED);
    expect((await run(f)).fieldErrors).not.toContain("carryoverTaxation");
  });
  it("지분 분할 · 일반 양도(부담부증여 아님) × 이월과세 → 막지 않는다(지분 카드가 이월과세를 싣는 기존 경로 · PR-5a)", async () => {
    const reg = { ...half, transferType: "regular" } as Partial<AssetForm>;
    const f = formOf([gbAsset(reg), second(gbAsset(reg))], { assetSplitMode: "fractional" });
    expect(issues(f).map((i) => i.message).join("\n")).not.toContain(BUNDLED);
    const r = await run(f);
    expect(r.fieldErrors).not.toContain("carryoverTaxation");
    expect(r.status, r.message).toBe(200);
  });
  it("부담부증여 묶음 · 이월과세가 일반건물이 아닌 토지 쪽 → 이 차단 문구는 나오지 않는다(일반건물 F27 한정 규칙)", async () => {
    const landCo = { ...landBg(2), acquisitionCause: "carryover_gift", carryover: gbAsset().carryover } as AssetForm;
    const f = formOf([gbAsset({ acquisitionCause: "gift" }), landCo], BUNDLE);
    expect(issues(f).map((i) => i.message).join("\n")).not.toContain(BUNDLED);
  });
  it("부담부증여 묶음 · 일반건물이 이월과세 아님 → 막지 않는다", async () => {
    const f = formOf([gbAsset({ acquisitionCause: "gift" }), landBg(2)], BUNDLE);
    expect(issues(f).map((i) => i.message).join("\n")).not.toContain(BUNDLED);
    expect((await run(f)).fieldErrors).not.toContain("carryoverTaxation");
  });
});
