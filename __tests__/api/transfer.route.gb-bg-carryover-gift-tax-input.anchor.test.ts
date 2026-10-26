/**
 * anchor — 일반건물 부담부증여 × 이월과세 — **화면의 증여세 입력(산출세액·과세가액)이 계산에 닿는다**
 *
 * 계획서 `docs/00-pm/gb-bg-carryover-gift-tax-input.plan.md` §1·§4. 수정 前: 화면(`CarryoverGiftBlock`)은 일반건물이면 산출세액·과세가액을
 * 받는데 ④ `buildCarryoverPayload`는 상당액(`giftTaxAmount`)만 읽어 0이 실렸다 — 산출 3천만·과세가액 10억 입력이 109,326,000(증여세 0과 같다).
 * 결정(2026-10-26, 권장안): Q-1 a ④에서 엔진 leaf `apportionGiftTax` · Q-2 a 분자 = 증여 당시 평가액 × 지분율 · Q-3 a 결과 카드 한 줄.
 * 후속(`gb-bg-carryover-gift-tax-part-limit.plan.md` Q-3 b): 이 픽스처(분리 OFF = 토지·건물 둘 다 이월과세)는 평가액을 **토지분·건물분**으로 받는다.
 *   자산 전체 10억 = 토지분 5억 + 건물분 5억으로 나눠 넣는다 — 평가액 비율(5:5)이 양도가액 비율(양도시 기준시가 2억:2억)과 같아 세액은 종전 그대로다.
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
/** 화면 입력 — 증여세 신고서의 산출세액·과세가액. 상당액 칸은 화면에 없으므로 비운다. 평가액은 토지분 5억(아래 `BUILDING_HALF`가 건물분 5억). */
const RETURN = { giftTaxAmount: "", giftTaxCalculated: "30,000,000", giftTaxBase: "1,000,000,000", giftDateValuation: "500,000,000" };
/** 건물분 증여 당시 평가액(분리 OFF 같은 블록의 건물분 칸 = `buildingCarryover.giftDateValuation`). */
const bldgVal = (v: string) => ({ buildingCarryover: { ...CARRYOVER_DEFAULTS, giftDateValuation: v } }) as Partial<AssetForm>;
const BUILDING_HALF = bldgVal("500,000,000");
const shares = (a: AssetForm, b: AssetForm): TransferFormData =>
  formOf([{ ...a, ...half, assetLabel: "자산 1" }, { ...b, ...half, assetId: "a2", assetLabel: "자산 2" } as AssetForm], { assetSplitMode: "fractional" });
const ctOf = (body: Record<string, any>) => body.carryoverTaxation as { giftTaxAmount?: number } | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("화면 증여세(산출세액·과세가액) → 시행령 §163의2② 상당액 → 계산 (수정 前: 0 · 109,326,000)", () => {
  it("G1 단건 — 산출 3천만 × 평가액 10억(토지분 5억 + 건물분 5억) ÷ 과세가액 10억 = 상당액 30,000,000 → 104,646,000(상당액 직접 입력과 같다)", async () => {
    const f = formOf([gbAsset(BUILDING_HALF, RETURN)]);
    expect(ctOf(await bodyOf(f))?.giftTaxAmount).toBe(30_000_000);
    const a = await ok(f);
    expect(a.determinedTax).toBe(104_646_000);
    expect(a.burdenedGiftCarryoverDetail).toMatchObject({ adoptedScenario: "A", giftTaxAmount: 30_000_000 });
    const legacy = await ok(formOf([gbAsset({}, { giftTaxAmount: "30,000,000" })])); // 짝이 비면 건물분을 요구하지 않는다 — 양도가액 비율(5:5)로 나눈다
    expect(legacy.determinedTax).toBe(104_646_000);
  });

  it("G2 분자가 과세가액의 일부(평가액 5억 = 토지분 2.5억 + 건물분 2.5억 / 과세가액 10억) → 상당액 15,000,000 = 상당액 1,500만 직접 입력과 같은 세액", async () => {
    const f = formOf([gbAsset(bldgVal("250,000,000"), { ...RETURN, giftDateValuation: "250,000,000" })]);
    expect(ctOf(await bodyOf(f))?.giftTaxAmount).toBe(15_000_000);
    const [a, legacy] = [await ok(f), await ok(formOf([gbAsset({}, { giftTaxAmount: "15,000,000", giftDateValuation: "500,000,000" })]))];
    expect(a.determinedTax).toBe(legacy.determinedTax);
    expect(a.determinedTax).not.toBe(104_646_000);
  });

  it("G3 지분 50/50 — 두 지분에 같은 신고서 금액 → 분자가 지분 몫이라 지분마다 15,000,000(이중 산입 없음) · 104,646,000(PR-2 P4와 같다)", async () => {
    const f = shares(gbAsset(BUILDING_HALF, RETURN), gbAsset(BUILDING_HALF, RETURN));
    const body = await bodyOf(f);
    expect(body.generalBuildingShares.map((s: { carryoverTaxation?: { giftTaxAmount?: number } }) => s.carryoverTaxation?.giftTaxAmount)).toEqual([15_000_000, 15_000_000]);
    const a = await ok(f);
    expect(a.determinedTax).toBe(104_646_000);
    expect([a.burdenedGiftCarryoverUnits["0"].giftTaxAmount, a.burdenedGiftCarryoverUnits["1"].giftTaxAmount]).toEqual([15_000_000, 15_000_000]);
  });

  it("G4 함께 부담부증여 묶음(일반건물 첫 자산 + 토지) → 135,846,000(묶음 anchor Q3 상당액 3천만과 같다)", async () => {
    const f = formOf([gbAsset(BUILDING_HALF, RETURN), { ...landBg(2), assetId: "a2" } as AssetForm], { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "1,300,000,000" });
    expect(ctOf(await bodyOf(f))?.giftTaxAmount).toBe(30_000_000);
    const a = await ok(f);
    expect(a.determinedTax).toBe(135_846_000);
    expect(a.burdenedGiftCarryoverUnits.primary.giftTaxAmount).toBe(30_000_000);
  });

  it("G5 짝이 다 차지 않으면 종전 상당액(giftTaxAmount)을 쓴다 — 저장 이력 호환 · 짝이 차면 상당액 칸 값은 읽지 않는다", async () => {
    expect(ctOf(await bodyOf(formOf([gbAsset({}, { giftTaxAmount: "30,000,000" })])))?.giftTaxAmount).toBe(30_000_000);
    expect(ctOf(await bodyOf(formOf([gbAsset(BUILDING_HALF, { ...RETURN, giftTaxAmount: "7,000,000" })])))?.giftTaxAmount).toBe(30_000_000);
  });

  it("G6 일반 양도(부담부증여 아님) 일반건물은 종전 경로 그대로 — 최상위 상당액은 상당액 칸 값 · 산출세액·과세가액은 파트 사건 1벌로 간다", async () => {
    const body = await bodyOf(formOf([gbAsset({ transferType: "regular" }, RETURN)]));
    expect(ctOf(body)?.giftTaxAmount).toBe(0);
    expect(JSON.stringify(body)).toContain('"giftTaxCalculated":30000000');
  });
});

describe("⑧ 부담부증여 일반건물 증여세 칸 — 짝·분자 필수·분자 ≤ 과세가액 (수정 前: 검사 없음)", () => {
  const fieldsOf = (f: TransferFormData) => issues(f).map((i) => (i as { field?: string }).field ?? String(i));
  it.each([
    ["산출세액만", { giftTaxCalculated: "30,000,000" }, "carryover.giftTaxBase"],
    ["과세가액만", { giftTaxBase: "1,000,000,000" }, "carryover.giftTaxCalculated"],
    ["토지분 평가액 비움", { ...RETURN, giftDateValuation: "" }, "carryover.giftDateValuation"],
    // 둘 다 이월과세면 합(토지분 7억 + 건물분 5억)을 과세가액과 비교하고 건물분 칸에서 말한다(Q-3 b)
    ["평가액 합 > 과세가액", { ...RETURN, giftDateValuation: "700,000,000" }, "buildingCarryover.giftDateValuation"],
  ])("%s → 그 칸에서 막는다", (_n, co, field) => {
    expect(fieldsOf(formOf([gbAsset(BUILDING_HALF, co)]))).toContain(field);
  });
  it("건물분 평가액 비움(짝이 찼을 때) → 건물분 칸에서 막는다(Q-3 b)", () => {
    expect(fieldsOf(formOf([gbAsset({}, RETURN)]))).toContain("buildingCarryover.giftDateValuation");
  });
  it("지분 50% — 평가액 10억 × 0.5 = 5억 ≤ 과세가액 6억이면 통과 · 둘째 지분 오류는 「자산 2」로 말한다", () => {
    expect(issues(shares(gbAsset(BUILDING_HALF, { ...RETURN, giftTaxBase: "600,000,000" }), gbAsset(BUILDING_HALF, { ...RETURN, giftTaxBase: "600,000,000" })))).toEqual([]);
    const msgs = issues(shares(gbAsset(BUILDING_HALF, RETURN), gbAsset({}, { giftTaxCalculated: "30,000,000" }))).map((i) => JSON.stringify(i));
    expect(msgs.some((m) => m.includes("자산 2") && m.includes("과세가액"))).toBe(true);
  });
  it("빈 값(종전 시드 · 증여세 없음)과 산출세액 0 + 과세가액(증여재산공제로 세액 0)은 막지 않는다", () => {
    expect(issues(formOf([gbAsset()]))).toEqual([]);
    expect(issues(formOf([gbAsset({}, { giftTaxCalculated: "0", giftTaxBase: "1,000,000,000" })]))).toEqual([]);
  });
});
