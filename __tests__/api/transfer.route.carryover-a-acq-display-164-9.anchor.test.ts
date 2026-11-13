/**
 * anchor — 이월과세 시나리오 A **환산 취득가액 표시값** × 영 §164⑨ 특례 (DP-6 후속 V-5, Q-2 a)
 * 계획서: docs/00-pm/donor-nonhousing-building-penalty-base-dp6.plan.md §7
 *
 * `calcCarryoverScenarios` 의 `donorAcqPrice` 가 원시 `standardPriceAtTransfer` 로 환산돼 특례(공익수용 1호·공매·경락 2호)를 못 봤다.
 * 그 값이 A 카드 «취득가액»(`scenarioA.acquisitionPrice`)·환산 산식 분모(`estimatedStdPriceAtTransfer`)·합산 신고서 취득가액과
 * 필요경비(= 양도가 − 취득가 − 양도차익 역산)로 흘러 항등식이 가린 채 어긋났다. **세액·양도차익은 처음부터 정확**했다(엔진이 특례 분모로 계산).
 *
 *  · CA-1 단건 비주택(건물): 공매 경락 2억 → 취득가액 150,000,000 → 300,000,000 · 분모 400,000,000 → 200,000,000
 *  · CA-2 세액 불변(증여세 2천만 · 경락가 3.99억): 양도차익·결정세액 그대로, 필요경비(expenses)만 정확해진다
 *  · CA-3 합산(`/multi`) 신고서 열: 취득가액 300,000,000 · 필요경비 6,000,000 (종전 150,000,000 / 156,000,000)
 *  · CA-4 불변: 특례 없음 · 수용 불발 · 재개발 아님
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const COMMON = {
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false,
  householdHousingCount: 2, residencePeriodMonths: 0, reductions: [] as unknown[], annualBasicDeductionUsed: 0,
};
const CT = { giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2022-01-10", useEstimatedAcquisition: true, giftTaxAmount: 0, giftDateValuation: 800_000_000 };

/** 양도가 3억 · 증여자 취득 당시 기준시가 2억 · 양도 당시 4억 (특례 없으면 분모 4억 → 환산취득가 150,000,000) — 이월과세 A, donorBuilt 없음 */
const base = (over: object = {}, ctOver: object = {}, propertyType = "building") => ({
  ...COMMON,
  propertyType,
  transferPrice: 300_000_000,
  transferDate: "2026-03-01",
  acquisitionPrice: 0,
  acquisitionDate: "2024-05-01",
  expenses: 0,
  useEstimatedAcquisition: true,
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAtTransfer: 400_000_000,
  acquisitionCause: "carryover_gift",
  donorAcquisitionDate: "2022-01-10",
  carryoverTaxation: { ...CT, ...ctOver },
  ...over,
});
/** 2호 공매 — 경락가 2억 → 분모 min(4억, 2억) = 2억 */
const AUCTION = { isAuctionTransfer: true, auctionPrice: 200_000_000 };
/** 2호 공매 — 경락가 3.99억 → 분모 3.99억 (양도차익 > 0 인 시료) */
const AUCTION_HIGH = { isAuctionTransfer: true, auctionPrice: 399_000_000 };
/** 1호 수용 per-sqm — min(400만, 200만, 300만) × 100㎡ = 2억 */
const EXPR = { transferCause: "public_expropriation", transferArea: 100, standardPricePerSqmAtTransfer: 4_000_000, compensationPerSqm: 2_000_000, compensationBasisStdPrice: 3_000_000 };
/** 1호 불발 — 보상액·기초가 기준시가 이상이라 분모가 안 바뀐다 */
/** 1호 주택 총액(라목) — min(양도 당시 4억, 보상액 2억, 보상기초 2.5억) = 2억 */
const HOUSING_EXPR = { transferCause: "public_expropriation", housingCompensationTotal: 200_000_000, housingCompensationBasisTotal: 250_000_000 };
const EXPR_MISS = { transferCause: "public_expropriation", transferArea: 100, standardPricePerSqmAtTransfer: 4_000_000, compensationPerSqm: 5_000_000, compensationBasisStdPrice: 5_000_000 };

interface A {
  acquisitionPrice: number; transferGain: number; determinedTax: number; giftTaxAddedToExpense: number;
  estimatedStdPriceAtAcquisition?: number; estimatedStdPriceAtTransfer?: number; lumpDeductionBase?: number;
}
interface Result { transferGain: number; determinedTax: number; totalTax: number; expenses?: number; estimatedBase?: number; carryoverTaxationDetail?: { adoptedScenario: string; scenarioA: A } }
async function single(b: object): Promise<{ status: number; r?: Result; error?: unknown }> {
  const res = await SINGLE(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }));
  const json = (await res.json()) as { data?: { result: Result }; error?: unknown };
  return { status: res.status, r: json.data?.result, error: json.error };
}
interface Row { transferPrice: number; acquisitionPrice: number; necessaryExpense: number; transferGain: number; carryoverTaxationDetail?: { scenarioA: A } }
async function multi(prop: object): Promise<{ status: number; p?: Row; error?: unknown }> {
  const res = await MULTI(new NextRequest("http://localhost/api/calc/transfer/multi", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taxYear: 2026, annualBasicDeductionUsed: 0, properties: [{ propertyId: "p1", propertyLabel: "p1", ...prop }] }),
  }));
  const json = (await res.json()) as { data?: { properties: Row[] }; error?: unknown };
  return { status: res.status, p: json.data?.properties?.[0], error: json.error };
}
const OK = (r: { status: number; error?: unknown }) => expect(r.status, JSON.stringify(r.error)).toBe(200);

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("CA-1 단건 — A 카드 취득가액·환산 분모가 특례 분모를 따른다", () => {
  it("CA-1-1 특례 없음: 취득가액 150,000,000 · 분모 400,000,000 · 양도차익 144,000,000 (불변)", async () => {
    const x = await single(base());
    OK(x);
    expect(x.r!.carryoverTaxationDetail!.scenarioA).toMatchObject({ acquisitionPrice: 150_000_000, estimatedStdPriceAtAcquisition: 200_000_000, estimatedStdPriceAtTransfer: 400_000_000, transferGain: 144_000_000 });
  });
  it("CA-1-2 공매 경락 2억: 취득가액 300,000,000 · 분모 200,000,000 · 양도차익 −6,000,000 불변 (종전 150,000,000 / 400,000,000)", async () => {
    const x = await single(base(AUCTION));
    OK(x);
    expect(x.r!.carryoverTaxationDetail!.scenarioA).toMatchObject({ acquisitionPrice: 300_000_000, estimatedStdPriceAtAcquisition: 200_000_000, estimatedStdPriceAtTransfer: 200_000_000, transferGain: -6_000_000, determinedTax: 0 });
    expect(x.r!.transferGain).toBe(-6_000_000);
  });
  it("CA-1-3 수용 per-sqm(분모 2억): 같은 값", async () => {
    const x = await single(base(EXPR));
    OK(x);
    expect(x.r!.carryoverTaxationDetail!.scenarioA).toMatchObject({ acquisitionPrice: 300_000_000, estimatedStdPriceAtTransfer: 200_000_000, transferGain: -6_000_000 });
  });
  it("CA-1-4 수용 불발(분모 4억 그대로): 150,000,000 · 400,000,000 불변", async () => {
    const x = await single(base(EXPR_MISS));
    OK(x);
    expect(x.r!.carryoverTaxationDetail!.scenarioA).toMatchObject({ acquisitionPrice: 150_000_000, estimatedStdPriceAtTransfer: 400_000_000, transferGain: 144_000_000 });
  });
  it("CA-1-5 항등: 취득가액 = 양도가 × 취득 당시 기준시가 ÷ 특례 분모, 개산공제 = 취득 당시 기준시가 × 3%", async () => {
    const x = await single(base(AUCTION));
    const a = x.r!.carryoverTaxationDetail!.scenarioA;
    expect(a.acquisitionPrice).toBe(Math.floor((300_000_000 * a.estimatedStdPriceAtAcquisition!) / a.estimatedStdPriceAtTransfer!));
    expect(300_000_000 - a.acquisitionPrice - Math.floor(a.lumpDeductionBase! * 0.03)).toBe(a.transferGain);
  });
  it("CA-1-6 일체 주택 총액 트랙(라목)도 같다 — 공매 경락 2억", async () => {
    const x = await single(base(AUCTION, {}, "housing"));
    OK(x);
    const a = x.r!.carryoverTaxationDetail!.scenarioA;
    expect(a.estimatedStdPriceAtTransfer).toBe(200_000_000);
    expect(a.acquisitionPrice).toBe(Math.floor((300_000_000 * 200_000_000) / 200_000_000));
  });
  it("CA-1-7 일체 주택 수용 총액 트랙(라목): 분모 min(4억, 2억, 2.5억) = 2억 · 취득가액 300,000,000", async () => {
    const x = await single(base(HOUSING_EXPR, {}, "housing"));
    OK(x);
    const a = x.r!.carryoverTaxationDetail!.scenarioA;
    expect(a).toMatchObject({ estimatedStdPriceAtTransfer: 200_000_000, acquisitionPrice: 300_000_000 });
  });
});

describe("CA-2 세액 불변 — 증여세 상당액 갈래(donorAcqPrice 역산)", () => {
  // 경락가 3.99억: 분모 3.99억 → 환산취득가 150,375,939(정확) · 종전 표시 150,000,000. 증여세 2천만.
  const ZERO = { giftTaxAmount: 0 };
  const GIFT = { giftTaxAmount: 20_000_000 };
  it("CA-2-1 증여세 0: 양도차익 143,624,061 · 결정세액 29,931,947 · 취득가액 150,375,939", async () => {
    const x = await single(base(AUCTION_HIGH, ZERO));
    OK(x);
    expect(x.r).toMatchObject({ transferGain: 143_624_061, determinedTax: 29_931_947 });
    expect(x.r!.carryoverTaxationDetail!.scenarioA.acquisitionPrice).toBe(150_375_939);
    expect(x.r!.estimatedBase).toBe(150_375_939); // 결과 최상위 값과 A 카드 값이 같아진다(종전 150,000,000 ≠ 150,375,939)
  });
  it("CA-2-2 증여세 2천만: 양도차익 123,624,061(−2천만 정확) · 결정세액 23,491,947 불변 · 필요경비 26,000,000", async () => {
    const x = await single(base(AUCTION_HIGH, GIFT));
    OK(x);
    expect(x.r).toMatchObject({ transferGain: 123_624_061, determinedTax: 23_491_947, expenses: 26_000_000 }); // 종전 expenses 26,375,939
    expect(x.r!.carryoverTaxationDetail!.scenarioA).toMatchObject({ acquisitionPrice: 150_375_939, giftTaxAddedToExpense: 20_000_000 });
  });
  it("CA-2-3 특례 없음 + 증여세 2천만: 124,000,000 · 23,613,000 · 26,000,000 (불변)", async () => {
    const x = await single(base({}, GIFT));
    OK(x);
    expect(x.r).toMatchObject({ transferGain: 124_000_000, determinedTax: 23_613_000, expenses: 26_000_000 });
  });
  it("CA-2-4 공매 2억 + 증여세 2천만: 차익 −6,000,000 · 세액 0 불변", async () => {
    const x = await single(base(AUCTION, GIFT));
    OK(x);
    expect(x.r).toMatchObject({ transferGain: -6_000_000, determinedTax: 0 });
  });
});

describe("CA-3 합산(/multi) 신고서 열 — 취득가액·필요경비", () => {
  it("CA-3-1 특례 없음: 취득가액 150,000,000 · 필요경비 6,000,000 · 양도차익 144,000,000 (불변)", async () => {
    const m = await multi(base());
    OK(m);
    expect(m.p).toMatchObject({ transferPrice: 300_000_000, acquisitionPrice: 150_000_000, necessaryExpense: 6_000_000, transferGain: 144_000_000 });
  });
  it("CA-3-2 공매 경락 2억: 취득가액 300,000,000 · 필요경비 6,000,000 · 양도차익 −6,000,000 (종전 150,000,000 / 156,000,000)", async () => {
    const m = await multi(base(AUCTION));
    OK(m);
    expect(m.p).toMatchObject({ transferPrice: 300_000_000, acquisitionPrice: 300_000_000, necessaryExpense: 6_000_000, transferGain: -6_000_000 });
  });
  it("CA-3-3 단건과 같은 취득가액", async () => {
    const s = await single(base(AUCTION));
    const m = await multi(base(AUCTION));
    expect(m.p!.acquisitionPrice).toBe(s.r!.carryoverTaxationDetail!.scenarioA.acquisitionPrice);
  });
});

describe("CA-4 범위 밖 — 변하지 않는다", () => {
  it("CA-4-1 donorBuilt(DP-6) 가산세 base는 그대로 300,000,000", async () => {
    const x = await single(base(AUCTION, { donorBuilt: { buildingType: "new", constructionDate: "2022-01-10" } }));
    OK(x);
    expect((x.r as unknown as { penaltyBase: number }).penaltyBase).toBe(300_000_000);
    expect(x.r!.carryoverTaxationDetail!.scenarioA.acquisitionPrice).toBe(300_000_000);
  });
  it("CA-4-2 직접 입력 취득가액(useEstimatedAcquisition=false)은 특례와 무관하게 입력값", async () => {
    const x = await single(base({ ...AUCTION, useEstimatedAcquisition: false }, { useEstimatedAcquisition: false, donorAcquisitionPrice: 120_000_000 }));
    OK(x);
    expect(x.r!.carryoverTaxationDetail!.scenarioA.acquisitionPrice).toBe(120_000_000);
  });
});
