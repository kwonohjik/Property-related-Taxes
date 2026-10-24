/**
 * anchor — 일반건물 **부담부증여 × 이월과세 × 감정가액(K-7) × 당초 증여자 신축·증축** §114조의2 (계획서 `docs/00-pm/gb-bg-carryover-presumed-scenario-b.plan.md` PR-2 · Q-2 신축·증축 모두)
 *
 * 폼 → ④ → ⑧ → ⑫ → route · mock 세율. PR-1 시료(채무비율 0.5 · 당초 증여자 감정가액 토지 1억·건물 2억 · 증여일 평가액 3억·3억 → A 채택) + 증여자 신축 2022-01-10.
 * 기준액(단건 §159 step · 본인 신축 K-7 과 같은 규칙): 신축 = 채무비율 안분 후 건물 감정가액(2억 × 0.5 = 100,000,000 → 5,000,000) ·
 * 증축 = 증축한 부분의 감정가액 × 채무비율(6천만 × 0.5 = 30,000,000 → 1,500,000). 감정가액 게이트 시행일은 2020.1.1.(leaf anchor).
 * 수정 前: 술어가 K-7 을 범위 밖으로 봐 토글 비노출·미전송(가산세 0) · 직접 보내면 ⑫ 400 「환산취득가액(K-5)일 때만」.
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

/** 일반건물 · 부담부증여 K-5 · 이월과세(당초 증여자 취득 시 기준시가 토지 1천만·건물 4천만 → A 채택) · 증여자 신축 ON. `co`/`over` 로 한 칸씩 바꾼다. */
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
      donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10",
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

interface Run { status: number; body: Record<string, any>; pen: number; total: number; props: Array<{ propertyId: string; penaltyTax?: number; penaltyBase?: number }>; fieldErrors: string[]; echo?: { applied: boolean; notAppliedReason?: string; burdenedGift?: { method: string } }; co?: { adoptedScenario: string } } // eslint-disable-line @typescript-eslint/no-explicit-any
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
  const json = (await res.json()) as { data?: { aggregated?: Record<string, any> }; error?: { fieldErrors?: Record<string, string[]> } }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const a = json.data?.aggregated ?? {};
  return { status: res.status, body, pen: a.penaltyTax ?? 0, total: a.totalTax, props: a.properties ?? [], fieldErrors: Object.keys(json.error?.fieldErrors ?? {}), echo: a.donorBuiltPenalty, co: a.burdenedGiftCarryoverDetail };
}
const run = async (f: TransferFormData): Promise<Run> => post(await bodyOf(f));
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));

// ─────────────────────────────────────────────────────────────────────
const K7 = {
  bgAcquisitionMethod: "appraisal", bgCoDonorPresumedAcquisitionLand: "100,000,000", bgCoDonorPresumedAcquisitionBuilding: "200,000,000",
  bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "300,000,000",
} as Partial<AssetForm>;
const EXT = { donorBuiltType: "extension", donorBuiltExtensionArea: "90" };
const bld = (r: Run) => r.props.find((p) => p.propertyId === "building");

describe("K-7 × 증여자 신축 — 가산세가 붙는다", () => {
  it("🔴 A 채택: 건물 기준액 100,000,000(안분 후 감정가액) → 가산세 5,000,000 · echo 감정가액 · 토지 0", async () => {
    const f = formOf([gbAsset(K7)]);
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    expect(r.body.burdenedGiftInfo?.carryoverDonorBasis?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    expect(r.co?.adoptedScenario).toBe("A");
    expect(bld(r)?.penaltyBase).toBe(100_000_000);
    expect(r.pen).toBe(5_000_000);
    expect(r.props.find((p) => p.propertyId === "land")?.penaltyTax ?? 0).toBe(0);
    expect(r.echo).toMatchObject({ applied: true, burdenedGift: { method: "appraisal" } });
  });

  it("②3호 B 채택(증여세 3천만) → 가산세 0 + 중립 echo(scenario_b)", async () => {
    const r = await run(formOf([gbAsset(K7, { giftTaxAmount: "30,000,000" })]));
    expect(r.status).toBe(200);
    expect(r.co?.adoptedScenario).toBe("B");
    expect(r.pen).toBe(0);
    expect(r.echo).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
  });

  it("5년 밖(신축 2019-06-01 → 5년 2024-06-01 < 양도 2026-03-01) → 가산세 0 · outside_penalty_window", async () => {
    const r = await run(formOf([gbAsset(K7, { donorBuiltDate: "2019-06-01" })]));
    expect(r.status).toBe(200);
    expect(r.pen).toBe(0);
    expect(r.echo).toMatchObject({ applied: false, notAppliedReason: "outside_penalty_window" });
  });
});

describe("K-7 × 증여자 증축 — 증축한 부분의 감정가액 × 채무비율", () => {
  it("🔴 증축 90㎡ · 증축 감정가액 6천만 → 기준액 30,000,000 → 가산세 1,500,000 · 증축 부분 기준시가는 묻지 않는다", async () => {
    const f = formOf([gbAsset({ ...K7, bgPresumedExtensionAppraisal: "60,000,000" }, EXT)]);
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    expect(r.body.burdenedGiftInfo?.presumedExtensionAppraisalValue).toBe(60_000_000);
    expect(bld(r)?.penaltyBase).toBe(30_000_000);
    expect(r.pen).toBe(1_500_000);
  });

  it("증축 감정가액 미입력 → ⑧ 이 그 칸으로 막고, 직접 보내도 400(엔진 방어선)", async () => {
    const f = formOf([gbAsset(K7, EXT)]);
    expect(issues(f).map((i) => i.message).join("\n")).toContain("증축한 부분의 감정가액");
    const r = await run(f);
    expect(r.status).toBe(400);
  });

  it("증축 감정가액 > 당초 증여자 건물 감정가액(2억) → ⑧ 차단 · 400", async () => {
    const f = formOf([gbAsset({ ...K7, bgPresumedExtensionAppraisal: "200,000,001" }, EXT)]);
    expect(issues(f).map((i) => i.message).join("\n")).toContain("클 수 없습니다");
    expect((await run(f)).status).toBe(400);
  });

  it("85㎡ 이하 증축 → 게이트 닫힘: ⑧ 이 감정가액을 요구하지 않고 가산세 0", async () => {
    const f = formOf([gbAsset(K7, { ...EXT, donorBuiltExtensionArea: "80" })]);
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.pen).toBe(0);
  });
});

describe("범위 밖 — 매매사례가액(K-6)은 §114조의2 대상이 아니다", () => {
  it("K-6 + 토글 ON(stale) → ④ 미전송 · 가산세 0", async () => {
    const r = await run(formOf([gbAsset({ ...K7, bgAcquisitionMethod: "salesCase" })]));
    expect(r.status).toBe(200);
    expect(r.body.burdenedGiftInfo?.carryoverDonorBasis?.donorBuilt).toBeUndefined();
    expect(r.pen).toBe(0);
  });
});
