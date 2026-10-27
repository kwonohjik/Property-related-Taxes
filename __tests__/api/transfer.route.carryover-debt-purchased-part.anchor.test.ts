/**
 * anchor — 이월과세 × 당초 증여 때 인수한 채무 부분(매입분): 화면 경로(폼 → ⑧ → ④ → ⑫ → ⑭ route) 핵심 셀.
 * 설계서 §2·§5·§6·§7 (A-0~A-13 · A-17 · A-18). 엔진 레벨 값은 `__tests__/tax-engine/transfer/carryover-debt-pieces.aggregate.anchor.test.ts`.
 *
 * 폼 필드는 기존 `carryover.giftDebtAssumed`·`giftAssumedDebt`를 직접 채운다(⑤ 화면 토글은 UI 단계).
 * 수정 前: ④는 채무 키를 싣지 않았고 ⑫는 받지 않았다 — 토글이 무효과였다(374,610,000).
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
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import { bgAsset, bgForm, bodyOf as bgBodyOf } from "@/__tests__/calc/_helpers/carryover-donor-built-bg-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 계획서 §2 사례 — 주택 · 다주택 · 비조정 · 양도 15억 · 증여 2023-06-01 평가 10억 · 증여자 2000-06-01 1억. `co`·`over`·`price`로 한 칸씩 바꾼다. */
function e1Form(co: Record<string, unknown> = {}, over: Partial<AssetForm> = {}, price = "1,500,000,000"): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-03-01"; f.contractTotalPrice = price; f.isOneHousehold = false; f.householdHousingCount = "2";
  f.assets[0] = {
    ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "100,000,000",
      giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no", ...co },
    ...over,
  } as AssetForm;
  return withTestAddress(f);
}
const ON = (debt = "400,000,000") => ({ giftDebtAssumed: true, giftAssumedDebt: debt });
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)).filter((i) => !String(i.field).startsWith("household")) as { field?: string; message?: string }[];
async function bodyOf(f: TransferFormData): Promise<Body> {
  let captured: Body = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { captured = JSON.parse(String(init.body)); return { ok: true, status: 200, json: async () => ({ data: {} }) } as Response; }));
  try { await callTransferTaxAPI(f); } catch { /* 본문만 필요 */ }
  vi.unstubAllGlobals();
  return captured;
}
async function post(body: Body) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const json = (await res.json()) as { data?: Body; error?: { fieldErrors?: Record<string, string[]>; message?: string } };
  const agg = json.data?.aggregated ?? json.data?.result;
  return { status: res.status, mode: json.data?.mode as string | undefined, det: agg?.determinedTax as number | undefined, data: json.data, agg, fieldErrors: json.error?.fieldErrors ?? {}, json };
}
const run = async (f: TransferFormData) => post(await bodyOf(f));
const ids = (r: { agg?: Body }) => (r.agg?.properties as { propertyId: string }[]).map((p) => p.propertyId);
const detailOf = (r: { agg?: Body }, id = "primary") => (r.agg?.properties as Body[]).find((p) => p.propertyId === id)?.carryoverTaxationDetail as Body;

describe("R-0 · 토글 OFF — 회귀", () => {
  it("단건 mode:single · 374,610,000 · 채무 키 없음(남은 값이 있어도 OFF면 싣지 않는다)", async () => {
    const f = e1Form({ giftAssumedDebt: "400,000,000" });
    expect(issues(f)).toEqual([]);
    expect((await bodyOf(f)).carryoverTaxation).not.toHaveProperty("giftAssumedDebt");
    const r = await run(f);
    expect([r.status, r.mode, r.det]).toEqual([200, "single", 374_610_000]);
  });
});

describe("R-1 · 기본 — 토글 ON · 채무 4억", () => {
  it("⑧ 통과 · ④ 본문에 채무 · mode:bundled · A′ 293,970,000 · 카드 id · apportionment 두 행", async () => {
    const f = e1Form(ON());
    expect(issues(f)).toEqual([]);
    const body = await bodyOf(f);
    expect(body.carryoverTaxation.giftAssumedDebt).toBe(400_000_000);
    const r = await run(f);
    expect([r.status, r.mode, r.det]).toEqual([200, "bundled", 293_970_000]);
    expect(ids(r)).toEqual(["primary", "primary__purchased"]);
    expect((r.data!.apportionment.apportioned as { assetId: string }[]).map((a) => a.assetId)).toEqual(["primary", "primary__purchased"]);
    const s = detailOf(r).scenarioA.purchasedPartSplit;
    expect(s.gift).toMatchObject({ transferPrice: 900_000_000, acquisitionDate: "2000-06-01" });
    expect(s.purchased).toMatchObject({ transferPrice: 600_000_000, acquisitionPrice: 400_000_000, acquisitionDate: "2023-06-01" });
  });
  it("채무 0 입력 = 조각 없음 → 단건 mode:single 374,610,000 (옛 이력 회귀 0)", async () => {
    const r = await run(e1Form(ON("0")));
    expect([r.mode, r.det]).toEqual(["single", 374_610_000]);
  });
});

describe("R-2·R-3 · 단기 · B 채택", () => {
  it("증여 2025-06-01 → 349,270,000", async () => {
    const r = await run(e1Form({ ...ON(), giftRegistryDate: "2025-06-01" }, { acquisitionDate: "2025-06-01" }));
    expect([r.mode, r.det]).toEqual(["bundled", 349_270_000]);
  });
  it("증여자 취득가액 14억 → B 채택 173,060,000 · 카드 한 장 · apportionment 한 행 · echo 있음", async () => {
    const r = await run(e1Form({ ...ON(), donorAcquisitionPrice: "1,400,000,000" }));
    expect([r.mode, r.det]).toEqual(["bundled", 173_060_000]);
    expect(ids(r)).toEqual(["primary"]);
    expect(r.data!.apportionment.apportioned).toHaveLength(1);
    expect(detailOf(r).adoptedScenario).toBe("B");
    expect(detailOf(r).scenarioA.purchasedPartSplit.determinedTaxA).toBe(71_070_000);
  });
});

describe("R-4~R-7 · 필요경비 · 환산 · r=1 · 정수", () => {
  it("증여세 상당액 2천만 · 증여자 capex 3천만 · 본인 capex 5천만 · 양도비 1천만 → 258,606,000", async () => {
    const f = e1Form({ ...ON(), giftTaxAmount: "20,000,000", donorCapitalExpenditure: "30,000,000" }, { capitalExpenditure: "50,000,000", transferExpense: "10,000,000" } as Partial<AssetForm>);
    expect(issues(f)).toEqual([]);
    expect((await run(f)).det).toBe(258_606_000);
  });
  it("증여자 환산(일반 기준시가 1억 / 5억) → 258,160,800", async () => {
    const f = e1Form({ ...ON(), useEstimatedAcquisition: true, estimationMode: "general", donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: "100,000,000", donorStandardPriceAtTransfer: "500,000,000" });
    expect(issues(f)).toEqual([]);
    expect((await run(f)).det).toBe(258_160_800);
  });
  it("채무 = 평가액(r=1) → 173,060,000 · 카드 한 장(원 id)", async () => {
    const r = await run(e1Form(ON("1,000,000,000")));
    expect([r.mode, r.det]).toEqual(["bundled", 173_060_000]);
    expect(ids(r)).toEqual(["primary"]);
  });
  it("정수 불변식 r=1/3 → 307,410,000", async () => {
    const r = await run(e1Form({ ...ON("333,333,333"), donorAcquisitionPrice: "100,000,001" }, {}, "1,500,000,001"));
    expect(r.det).toBe(307_410_000);
  });
  it("지분 모드 — 채무는 평가액과 같은 지분율로 스케일된다(r 불변)", async () => {
    const f = e1Form(ON(), { ownershipNumerator: "1", ownershipDenominator: "2" } as Partial<AssetForm>);
    const b = await bodyOf(f);
    expect([b.carryoverTaxation.giftDateValuation, b.carryoverTaxation.giftAssumedDebt]).toEqual([500_000_000, 200_000_000]);
  });
});

describe("R-9~R-13 · 본문 변형 — 1세대1주택 · 토지 · 건물 · 중과 · 미등기", () => {
  const withOn = async (patch: Body, ctPatch: Body = {}) => {
    const b = await bodyOf(e1Form(ON()));
    return post({ ...b, ...patch, carryoverTaxation: { ...b.carryoverTaxation, ...ctPatch } });
  };
  it("A-9 1세대1주택 15억(거주 36개월 · 계속 같은 세대) → ②2호 불발 · A′ 25,909,000", async () => {
    const r = await withOn({ isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 36 }, { donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: "2000-06-01" });
    expect(r.det).toBe(25_909_000);
    expect(detailOf(r).adoptedScenario).toBe("A");
    expect(detailOf(r).exclusionReason).toBeUndefined();
    expect(detailOf(r).filingUnitComparison).toEqual({ determinedTaxWithCarryover: 25_909_000, determinedTaxWithout: 18_685_000 });
  });
  it("A-9 반례 — A만 1세대1주택이 되는 조합(증여 9개월) → 집 전체 ②2호 배제 · B 채택 · 조각 없음", async () => {
    const r = await withOn({ isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 36, transferPrice: 1_000_000_000, acquisitionDate: "2025-06-01" }, { giftRegistryDate: "2025-06-01", donorSameHouseholdContinuous: false });
    expect(r.status).toBe(200);
    expect(detailOf(r).exclusionReason).toBe("one_house_exemption");
    expect(detailOf(r).adoptedScenario).toBe("B");
    expect(ids(r)).toEqual(["primary"]);
  });
  it("토지·상업용건물 293,970,000 · 비사업용 토지 372,520,000 · 미등기 728,000,000 · 조정지역 다주택 608,435,000", async () => {
    expect((await withOn({ propertyType: "land" })).det).toBe(293_970_000);
    expect((await withOn({ propertyType: "building" })).det).toBe(293_970_000);
    expect((await withOn({ propertyType: "land", isNonBusinessLand: true })).det).toBe(372_520_000);
    expect((await withOn({ isUnregistered: true })).det).toBe(728_000_000);
    expect((await withOn({ isRegulatedArea: true, wasRegulatedAtAcquisition: true, transferDate: "2026-06-01" })).det).toBe(608_435_000);
  });
});

describe("함께 양도 둘째 자산 — 컴패니언 이월과세 + 채무", () => {
  const PRIMARY = {
    propertyType: "land", transferPrice: 1_800_000_000, transferDate: "2024-03-01", acquisitionPrice: 500_000_000, acquisitionDate: "2010-01-01", acquisitionCause: "purchase",
    expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 1, residencePeriodMonths: 0, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
    isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, reductions: [], annualBasicDeductionUsed: 0, totalSalePrice: 1_800_000_000, standardPriceAtTransferForApportion: 1_000_000_000,
  };
  const comp = (debt?: number) => ({
    assetId: "c1", assetLabel: "이월과세 주택", assetKind: "housing", standardPriceAtTransfer: 400_000_000, standardPriceAtTransferForApportion: 400_000_000, directExpenses: 0,
    isOneHousehold: false, reductions: [], acquisitionCause: "carryover_gift", acquisitionDate: "2021-06-01", donorAcquisitionDate: "2005-01-01",
    carryoverTaxation: { giftRegistryDate: "2021-06-01", donorAcquisitionDate: "2005-01-01", donorAcquisitionPrice: 100_000_000, useEstimatedAcquisition: false, giftTaxAmount: 30_000_000, giftDateValuation: 300_000_000, donorRelation: "spouse", exclusionDeclared: {}, ...(debt === undefined ? {} : { giftAssumedDebt: debt }) },
  });
  it("채무 1억 → 컴패니언 카드가 둘(원 id · `c1__purchased`)로 나뉘고 매입분은 맨 끝 · 양도가액 합 = 안분 양도가액", async () => {
    const [plain, debt] = [await post({ ...PRIMARY, companionAssets: [comp()] }), await post({ ...PRIMARY, companionAssets: [comp(100_000_000)] })];
    expect([plain.status, debt.status]).toEqual([200, 200]);
    expect(ids(plain)).toEqual(["primary", "c1"]);
    expect(ids(debt)).toEqual(["primary", "c1", "c1__purchased"]);
    const rows = debt.agg!.properties as { propertyId: string; transferPrice: number; acquisitionPrice: number }[];
    const whole = (plain.agg!.properties as { propertyId: string; transferPrice: number }[]).find((p) => p.propertyId === "c1")!.transferPrice;
    const [g, p] = [rows.find((x) => x.propertyId === "c1")!, rows.find((x) => x.propertyId === "c1__purchased")!];
    expect(g.transferPrice + p.transferPrice).toBe(whole);
    expect(p.acquisitionPrice).toBe(100_000_000);
    expect(debt.det).not.toBe(plain.det);
  });
});

describe("⑧ · ⑫ — 필수·상한·미지원 차단(같은 규칙)", () => {
  it("M1 토글 ON + 칸 공백 → 그 칸으로 · 0은 통과", () => {
    const e = issues(e1Form({ giftDebtAssumed: true, giftAssumedDebt: "" }));
    expect(e.map((i) => i.field)).toEqual(["carryover.giftAssumedDebt"]);
    expect(issues(e1Form(ON("0")))).toEqual([]);
  });
  it("M2 채무 > 평가액 → 그 칸으로 · 채무 = 평가액은 통과", () => {
    expect(issues(e1Form(ON("1,000,000,001"))).map((i) => i.field)).toEqual(["carryover.giftAssumedDebt"]);
    expect(issues(e1Form(ON("1,000,000,000")))).toEqual([]);
  });
  it("Q-6 채무 = 평가액인데 증여세 상당액·증여자 자본적지출이 있으면 차단(조용히 버리지 않는다)", () => {
    expect(issues(e1Form({ ...ON("1,000,000,000"), giftTaxAmount: "1,000" })).map((i) => i.field)).toEqual(["carryover.giftTaxAmount"]);
    expect(issues(e1Form({ ...ON("1,000,000,000"), donorCapitalExpenditure: "1,000" })).map((i) => i.field)).toEqual(["carryover.donorCapitalExpenditure"]);
  });
  it("⑫ 같은 규칙: 채무 > 평가액 · r=1+상당액 → 400(carryoverTaxation.giftAssumedDebt)", async () => {
    const b = await bodyOf(e1Form(ON()));
    const over = await post({ ...b, carryoverTaxation: { ...b.carryoverTaxation, giftAssumedDebt: 1_000_000_001 } });
    expect(over.status).toBe(400);
    expect(Object.keys(over.fieldErrors)).toContain("carryoverTaxation.giftAssumedDebt");
    const full = await post({ ...b, carryoverTaxation: { ...b.carryoverTaxation, giftAssumedDebt: 1_000_000_000, giftTaxAmount: 1_000 } });
    expect(full.status).toBe(400);
  });
  it("A-17 E4(지금 양도도 부담부증여) 주택 — 토글 ON이면 ⑧ 차단(`carryover.giftDebtAssumed`) · ⑫ 400 · 토글 OFF면 종전 69,550,000", async () => {
    const e4 = (co: Record<string, unknown>) => bgForm(bgAsset("converted", { donorBuilt: false }, {
      bgMarketValueAtTransfer: "1,000,000,000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "400,000,000", bgAcquisitionMethod: "actual",
      bgActualAcquisitionTotal: "1,000,000,000", bgCoDonorActualAcquisitionTotal: "150,000,000",
      carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "150,000,000", giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no", ...co },
    } as Partial<AssetForm>));
    expect(issues(e4(ON())).map((i) => i.field)).toEqual(["carryover.giftDebtAssumed"]);
    const off = e4({});
    expect(issues(off)).toEqual([]);
    const body = await bgBodyOf(off);
    expect((await post({ ...body, isRegulatedArea: false, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 })).det).toBe(69_550_000);
    const bad = await post({ ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0, carryoverTaxation: { ...(body.carryoverTaxation as Body), giftAssumedDebt: 400_000_000 } });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.fieldErrors)).toContain("carryoverTaxation.giftAssumedDebt");
  });
  it("A-18 미지원 조합(소유자 분리 · 주택부수토지 토지) 본문 + 채무 → ⑫ 400", async () => {
    const b = await bodyOf(e1Form(ON()));
    for (const extra of [{ selfOwns: "land_only", landAcquisitionDate: "2023-06-01", buildingOwnerSameHousehold: true }, { propertyType: "land", landNature: "appurtenant_to_housing" }]) {
      const r = await post({ ...b, ...extra });
      expect(r.status, JSON.stringify(extra)).toBe(400);
      expect(Object.keys(r.fieldErrors).some((k) => k.includes("giftAssumedDebt"))).toBe(true);
    }
  });
});
