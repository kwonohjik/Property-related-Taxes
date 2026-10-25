/**
 * anchor — 함께 부담부증여 묶음 × 일반건물 × 배우자등 이월과세 — §97의2②3호 신고단위 비교 배선 (PR-1)
 *
 * 계획서 `docs/00-pm/gb-bg-carryover-share-bundled.plan.md` §1.2·§4.5. 수정 前: ⑧·⑫ 가 「단건으로 계산하세요」로 막았고(PR-3),
 * 그 전에는 묶음 카드가 이월과세를 읽지 않아 양도인 기준(B) 110,760,000 만 냈다. 계획서 실측(일회성 probe): A 140,526,000 · 위치 무관 ·
 * 증여세 3천만이면 135,846,000(효과 −4,680,000 = 단건과 같다).
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

const landCarry = (n: number) =>
  ({ ...landBg(n), acquisitionCause: "carryover_gift", bgCoDonorActualAcquisitionLand: "20,000,000", carryover: { ...gbAsset().carryover, giftDateValuation: "300,000,000" } }) as AssetForm;
const acqOf = (u: { parts: { acquisitionPrice: number }[] }) => u.parts.map((p) => p.acquisitionPrice);

describe("일반건물 부담부증여 × 이월과세 — 묶음에서 신고단위 A/B 비교(수정 前: ⑧·⑫ 400 「단건으로 계산하세요」)", () => {
  it("Q1 일반건물 첫 자산 · K-5 → A 채택 140,526,000 (미적용 110,760,000)", async () => {
    const a = await ok(formOf([gbAsset(), landBg(2)], BUNDLE));
    expect(a.determinedTax).toBe(140_526_000);
    const u = a.burdenedGiftCarryoverUnits.primary;
    expect(u).toMatchObject({ adoptedScenario: "A", determinedTaxA: 140_526_000, determinedTaxB: 110_760_000, assetLabel: "주 자산" });
    // [A] 당초 증여자 기준시가 1천만·4천만의 §159 몫 · 기산일 = 당초 증여자 취득일 / [B] 양도인 기준 · 증여받은 날
    expect(acqOf(u.scenarioA)).toEqual([12_500_000, 50_000_000]);
    expect(acqOf(u.scenarioB)).toEqual([125_000_000, 125_000_000]);
    expect([u.scenarioA.landHoldingStartDate, u.scenarioB.landHoldingStartDate]).toEqual(["2015-01-01", "2024-05-01"]);
    // 채택된 A 카드가 신고 카드다 — 산식 재료도 A 카드다
    expect(a.properties.slice(0, 2).map((p: { acquisitionPrice: number }) => p.acquisitionPrice)).toEqual([12_500_000, 50_000_000]);
    expect(a.generalBuildingDetailsByAsset.primary.assetCards.map((c: { acquisitionPrice: number }) => c.acquisitionPrice)).toEqual([12_500_000, 50_000_000]);
  });

  it("Q2 토지 첫 자산 · 일반건물 둘째 → Q1과 같다(위치 무관 · 단위 키 = 자산 id)", async () => {
    const a = await ok(formOf([landBg(1), second(gbAsset())], BUNDLE));
    expect(a.determinedTax).toBe(140_526_000);
    expect(a.burdenedGiftCarryoverUnits.a2).toMatchObject({ adoptedScenario: "A", determinedTaxA: 140_526_000, determinedTaxB: 110_760_000 });
  });

  it("Q3 Q1 + 증여세 3천만 → 135,846,000(효과 −4,680,000 = 단건과 같다)", async () => {
    const a = await ok(formOf([gbAsset({}, { giftTaxAmount: "30,000,000" }), landBg(2)], BUNDLE));
    expect(a.determinedTax).toBe(135_846_000);
    expect(a.burdenedGiftCarryoverUnits.primary.giftTaxAmount).toBe(30_000_000);
  });

  it("K-7 감정가액 첫 자산 → A 113,226,000 / B 91,960,000 — B는 증여일 평가액(소령 §163⑨), A는 당초 증여자 감정가액", async () => {
    const a = await ok(formOf([gbAsset(K7), landBg(2)], BUNDLE));
    expect(a.determinedTax).toBe(113_226_000);
    const u = a.burdenedGiftCarryoverUnits.primary;
    expect([u.determinedTaxA, u.determinedTaxB]).toEqual([113_226_000, 91_960_000]);
    expect(acqOf(u.scenarioA)).toEqual([50_000_000, 100_000_000]);
    expect(acqOf(u.scenarioB)).toEqual([150_000_000, 150_000_000]);
  });

  it("②3호 — A가 적으면 B: 당초 증여자 기준시가가 양도인과 같으면 A 51,965,120 < B ⇒ B 110,760,000 · 신고 카드·명세는 B 그대로", async () => {
    const a = await ok(formOf([gbAsset({ bgCoDonorLandStdPriceAtAcq: "180,000,000", bgCoDonorBuildingStdPriceAtAcq: "100,000,000" }), landBg(2)], BUNDLE));
    expect(a.determinedTax).toBe(110_760_000);
    expect(a.burdenedGiftCarryoverUnits.primary).toMatchObject({ adoptedScenario: "B", determinedTaxA: 51_965_120, determinedTaxB: 110_760_000 });
    // 미채택 [A] 요약은 반사실 실행(이 단위만 A)에서 — 최종(B) 카드를 다시 쓰면 두 열이 같아진다
    expect(acqOf(a.burdenedGiftCarryoverUnits.primary.scenarioA)).toEqual([225_000_000, 125_000_000]);
    expect(acqOf(a.burdenedGiftCarryoverUnits.primary.scenarioB)).toEqual([125_000_000, 125_000_000]);
    expect(a.properties.slice(0, 2).map((p: { acquisitionPrice: number }) => p.acquisitionPrice)).toEqual([125_000_000, 125_000_000]);
    expect(a.generalBuildingDetailsByAsset.primary.assetCards.map((c: { acquisitionPrice: number }) => c.acquisitionPrice)).toEqual([125_000_000, 125_000_000]);
    expect(a.burdenedGift.cards).toBeUndefined();
  });

  it("혼재 단위 — 토지 이월과세(단건 엔진 단위)와 일반건물 이월과세(외부 단위)를 한 번의 순차 고정점으로 푼다", async () => {
    const a = await ok(formOf([gbAsset(), landCarry(2)], BUNDLE));
    expect(a.determinedTax).toBe(153_006_000);
    expect(a.burdenedGiftCarryoverUnits.primary).toMatchObject({ adoptedScenario: "A", determinedTaxA: 153_006_000, determinedTaxB: 120_580_000 });
    expect(a.properties[2].carryoverTaxationDetail).toMatchObject({
      adoptedScenario: "A",
      filingUnitComparison: { determinedTaxWithCarryover: 153_006_000, determinedTaxWithout: 149_326_000 },
    });
  });
});

describe("Q-4 a — 「부담부증여 평가 명세」 취득 열 = 채택 시나리오의 자산별 명세 합", () => {
  it.each<[string, () => TransferFormData]>([
    ["일반건물 첫 자산", () => formOf([gbAsset(), landBg(2)], BUNDLE)],
    ["일반건물 둘째 자산", () => formOf([landBg(1), second(gbAsset())], BUNDLE)],
  ])("%s — 토지 62,500,000(일반건물 A 12,500,000 + 토지 50,000,000) · 건물 50,000,000 · 자산별 카드", async (_n, make) => {
    const a = await ok(make());
    expect(a.burdenedGift.perAsset.land.acquisitionPrice).toBe(62_500_000);
    expect(a.burdenedGift.perAsset.building.acquisitionPrice).toBe(50_000_000);
    expect(a.burdenedGift.cards.map((c: { label: string }) => c.label).join(" / ")).toContain("이월과세 적용(당초 증여자 기준)");
    expect(a.burdenedGift.cards).toHaveLength(2);
  });
});

describe("회귀 0 · 차단 유지", () => {
  it("일반건물이 이월과세가 아니면 종전 그대로 — 110,760,000 · 단위 없음 · 명세는 물건 전체 재계산", async () => {
    const a = await ok(formOf([gbAsset({ acquisitionCause: "gift" }), landBg(2)], BUNDLE));
    expect(a.determinedTax).toBe(110_760_000);
    expect(a.burdenedGiftCarryoverUnits).toBeUndefined();
    expect([a.burdenedGift.perAsset.land.acquisitionPrice, a.burdenedGift.perAsset.building.acquisitionPrice]).toEqual([212_727_272, 118_181_818]);
    expect(a.burdenedGift.cards).toBeUndefined();
  });
  it("V-3 이월과세 환산 토글 → ⑧ 이 단건과 같은 문구로 먼저 막는다(엔진 throw 전)", async () => {
    const f = formOf([gbAsset({}, { useEstimatedAcquisition: true, estimationMode: "general" }), landBg(2)], BUNDLE);
    expect(issues(f).map((i) => i.message).join("\n")).toContain("이월과세 취득가액을 환산으로 구할 수 없습니다");
    expect((await run(f)).status).toBe(400);
  });
});
