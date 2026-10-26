/**
 * anchor — 일반 양도 일반건물 × 이월과세 — 증여세 산출세액·과세가액 **짝 반쪽 입력의 조용한 소실** 차단(⑧)
 *
 * 실측(2026-10-26, 폼 → ④ → route + 브라우저): 산출세액만 / 과세가액만 넣으면 ⑧ 0건 · 200 · 전송 상당액 0 → 163,932,000
 * (증여세 없음과 같다). 짝(3천만·10억)이면 160,572,000. 토지+건물 둘 다 이월과세도 같다(198,210,000 vs 192,918,000).
 * 원인: ④ `gbCarryoverUsesPartShape`(짝 둘 다 > 0) 미충족 → legacy 상당액 칸(화면에 없다) 0 · ⑧은 Σ(과세가액 > 0일 때)만 봤다.
 * 부담부증여 쪽 짝 검사(`gb-bg-carryover-gift-tax-input.plan.md` §4.2)와 같은 규칙을 일반 양도에도 건다.
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
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

const TD = "2024-03-01";
const BUILDING_CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorRelation: "lineal", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "50,000,000", giftDateValuation: "200,000,000" };
/** 일반 양도 · 환산 · 토지 이월과세(증여 2021-03-01 · 증여자 취득 2005-06-15). 건물 서브폼은 화면처럼 토지 값을 복사해 만든 상태다. */
function gb(co: Record<string, unknown> = {}, over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building",
    acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2021-03-01",
    useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbZoneType: "general_residential",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "150,000,000",
      giftTaxAmount: "", giftDateValuation: "400,000,000", donorRelation: "lineal", ...co },
    ...over,
  } as AssetForm;
}
const both = (bco: Record<string, unknown> = {}) => ({ gbBuildingAcquisitionCause: "carryover_gift", buildingCarryover: { ...BUILDING_CO, ...bco } }) as Partial<AssetForm>;
/** 건물만 이월과세 — 사건 정보(등기일·증여세)는 건물 서브폼이 유일한 입력처다(`gbCarryoverEventSource`). */
const buildingOnly = (bco: Record<string, unknown> = {}) =>
  ({ acquisitionCause: "purchase", landAcquisitionPrice: "150,000,000", carryover: undefined, gbBuildingAcquisitionCause: "carryover_gift", buildingCarryover: { ...BUILDING_CO, ...bco } }) as unknown as Partial<AssetForm>;
const formOf = (a: AssetForm): TransferFormData =>
  ({ ...createDefaultTransferFormData(), transferDate: TD, filingDate: "2024-05-31", contractTotalPrice: "1,000,000,000", householdHousingCount: "2", assets: [a] }) as TransferFormData;
const PAIR = { giftTaxCalculated: "30,000,000", giftTaxBase: "1,000,000,000" };
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));
const fields = (f: TransferFormData) => issues(f).map((i) => i.field);

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

describe("⑧ 일반 양도 일반건물 — 증여세 산출세액·과세가액 짝 (수정 前: 반쪽 입력 0건 통과 → 상당액 0)", () => {
  it.each([
    ["토지 이월과세 · 산출세액만", gb({ giftTaxCalculated: "30,000,000" }), "carryover.giftTaxBase"],
    ["토지 이월과세 · 과세가액만", gb({ giftTaxBase: "1,000,000,000" }), "carryover.giftTaxCalculated"],
    ["토지+건물 이월과세 · 산출세액만(사건 출처 = 토지)", gb({ giftTaxCalculated: "30,000,000" }, both()), "carryover.giftTaxBase"],
    ["건물만 이월과세 · 산출세액만(사건 출처 = 건물 서브폼)", gb({}, buildingOnly({ giftTaxCalculated: "30,000,000" })), "buildingCarryover.giftTaxBase"],
    ["건물만 이월과세 · 과세가액만", gb({}, buildingOnly({ giftTaxBase: "1,000,000,000" })), "buildingCarryover.giftTaxCalculated"],
  ])("%s → 빈 칸에서 막는다", (_n, a, field) => {
    expect(fields(formOf(a))).toContain(field);
  });

  it.each([
    ["증여세 없음", gb()],
    ["짝", gb(PAIR)],
    ["상당액 칸만(저장 이력 · legacy)", gb({ giftTaxAmount: "12,000,000" })],
    ["산출세액 0 + 과세가액(증여재산공제로 세액 0 — 상당액 0이 맞다)", gb({ giftTaxCalculated: "0", giftTaxBase: "1,000,000,000" })],
    ["토지+건물 · 짝", gb(PAIR, both())],
    ["건물만 · 짝", gb({}, buildingOnly(PAIR))],
  ])("%s → 막지 않는다", (_n, a) => {
    expect(issues(formOf(a))).toEqual([]);
  });

});

describe("세액 고정 — 짝이면 계산에 닿는다(실측값 그대로)", () => {
  it("토지 이월과세: 증여세 없음 163,932,000 · 짝 3천만/10억 160,572,000 · 상당액 1,200만 직접 입력 = 짝", async () => {
    const [none, pair, legacy] = await Promise.all([gb(), gb(PAIR), gb({ giftTaxAmount: "12,000,000" })].map((a) => run(formOf(a))));
    expect([none.status, pair.status, legacy.status]).toEqual([200, 200, 200]);
    expect([none.det, pair.det, legacy.det]).toEqual([163_932_000, 160_572_000, 160_572_000]);
  });
  it("토지+건물 이월과세: 증여세 없음 198,210,000 · 짝 192,918,000", async () => {
    const [none, pair] = await Promise.all([gb({}, both()), gb(PAIR, both())].map((a) => run(formOf(a))));
    expect([none.det, pair.det]).toEqual([198_210_000, 192_918_000]);
  });
});
