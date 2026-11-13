/**
 * anchor — 이월과세 × 증여자 신축·증축 **비주택 건물** × 영 §164⑨ 특례 · 가산세 base 정렬 (DP-6, Q-1 a)
 * 계획서: docs/00-pm/donor-nonhousing-building-penalty-base-dp6.plan.md
 *
 * 소득세법 §114조의2① «…환산취득가액(증축은 증축한 부분에 한정한다)의 100분의 5» — base 는 **양도차익 계산에 실제로 쓰인** 환산취득가액이다.
 * A 의 양도차익은 `resolveConversionDenominatorAtTransfer` 로 특례(공익수용 1호·공매·경락 2호)가 걸린 분모를 쓰므로 base 도 같은 분모여야 한다.
 *
 *  · NH-1 단독 신축: 공매 경락 2억 · 수용 per-sqm(분모 2억) → base 150,000,000 → 300,000,000 (가산세 7,500,000 → 15,000,000)
 *  · NH-2 증축: 22,500,000 → 45,000,000 (1,125,000 → 2,250,000)
 *  · NH-3 불변: 특례 없음 · 수용 불발(분모가 안 바뀜) · A 양도차익(결정세액 축)
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

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const COMMON = {
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false,
  householdHousingCount: 2, residencePeriodMonths: 0, reductions: [] as unknown[], annualBasicDeductionUsed: 0,
};
const CT = { giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2022-01-10", useEstimatedAcquisition: true, giftTaxAmount: 0, giftDateValuation: 800_000_000 };
const DB_NEW = { buildingType: "new", constructionDate: "2022-01-10" };
const DB_EXT = { buildingType: "extension", constructionDate: "2022-01-10", extensionFloorArea: 100, extensionStdPriceAtAcquisition: 30_000_000 };

/** 양도가 3억 · 증여자 취득 당시 기준시가 2억 · 양도 당시 기준시가 4억 (특례 없으면 분모 4억) */
const base = (db: object, over: object = {}) => ({
  ...COMMON,
  propertyType: "building",
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
  carryoverTaxation: { ...CT, donorBuilt: db },
  ...over,
});
/** 2호 공매 — 경락가 2억 → 분모 min(4억, 2억) = 2억 */
const AUCTION = { isAuctionTransfer: true, auctionPrice: 200_000_000 };
/** 1호 수용 per-sqm — min(400만, 200만, 300만) × 100㎡ = 2억 */
const EXPR = { transferCause: "public_expropriation", transferArea: 100, standardPricePerSqmAtTransfer: 4_000_000, compensationPerSqm: 2_000_000, compensationBasisStdPrice: 3_000_000 };
/** 1호 불발 — 보상액·기초가 기준시가 이상이라 분모가 안 바뀐다 */
const EXPR_MISS = { transferCause: "public_expropriation", transferArea: 100, standardPricePerSqmAtTransfer: 4_000_000, compensationPerSqm: 5_000_000, compensationBasisStdPrice: 5_000_000 };

interface Result {
  penaltyBase: number; penaltyTax: number; totalTax: number; transferGain: number;
  carryoverTaxationDetail?: { adoptedScenario: string; donorBuiltPenalty?: { applied: boolean; formula?: { multiplicand: number; numerator: number; denominator: number } } };
}
async function call(b: object): Promise<{ status: number; result?: Result; error?: unknown }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }));
  const json = (await res.json()) as { data?: { result: Result }; error?: unknown };
  return { status: res.status, result: json.data?.result, error: json.error };
}
const OK = (r: { status: number; error?: unknown }) => expect(r.status, JSON.stringify(r.error)).toBe(200);

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("NH-1 단독 신축 — 특례 분모로 정렬", () => {
  it("NH-1-1 특례 없음: 150,000,000 / 7,500,000 / 총 41,308,300 (불변)", async () => {
    const r = await call(base(DB_NEW));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 150_000_000, penaltyTax: 7_500_000, totalTax: 41_308_300, transferGain: 144_000_000 });
  });
  it("NH-1-2 공매 경락 2억: base 300,000,000 · 가산세 15,000,000 · 총 16,500,000 · 양도차익 −6,000,000 불변 (종전 150,000,000 / 7,500,000 / 8,250,000)", async () => {
    const r = await call(base(DB_NEW, AUCTION));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 300_000_000, penaltyTax: 15_000_000, totalTax: 16_500_000, transferGain: -6_000_000 });
  });
  it("NH-1-3 수용 per-sqm(분모 2억): 같은 값", async () => {
    const r = await call(base(DB_NEW, EXPR));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 300_000_000, penaltyTax: 15_000_000, totalTax: 16_500_000, transferGain: -6_000_000 });
  });
  it("NH-1-4 수용 불발(분모 4억 그대로): 150,000,000 불변", async () => {
    const r = await call(base(DB_NEW, EXPR_MISS));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 150_000_000, penaltyTax: 7_500_000 });
  });
  it("NH-1-5 단일 소스 항등: base = 양도가 × 취득 당시 기준시가 ÷ 특례 분모", async () => {
    const r = await call(base(DB_NEW, AUCTION));
    expect(r.result!.penaltyBase).toBe(Math.floor((300_000_000 * 200_000_000) / 200_000_000));
  });
});

describe("NH-2 증축 — 특례 분모로 정렬", () => {
  it("NH-2-1 특례 없음: 22,500,000 / 1,125,000 / 총 34,295,800 (불변)", async () => {
    const r = await call(base(DB_EXT));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 22_500_000, penaltyTax: 1_125_000, totalTax: 34_295_800 });
    expect(r.result!.carryoverTaxationDetail!.donorBuiltPenalty!.formula).toEqual({ multiplicand: 300_000_000, numerator: 30_000_000, denominator: 400_000_000 });
  });
  it("NH-2-2 공매 경락 2억: base 45,000,000 · 가산세 2,250,000 · 총 2,475,000 · echo 분모 2억", async () => {
    const r = await call(base(DB_EXT, AUCTION));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 45_000_000, penaltyTax: 2_250_000, totalTax: 2_475_000, transferGain: -6_000_000 });
    expect(r.result!.carryoverTaxationDetail!.donorBuiltPenalty!.formula).toEqual({ multiplicand: 300_000_000, numerator: 30_000_000, denominator: 200_000_000 });
  });
  it("NH-2-3 수용 per-sqm: 같은 값", async () => {
    const r = await call(base(DB_EXT, EXPR));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 45_000_000, penaltyTax: 2_250_000 });
  });
  it("NH-2-4 수용 불발: 22,500,000 불변", async () => {
    const r = await call(base(DB_EXT, EXPR_MISS));
    OK(r);
    expect(r.result).toMatchObject({ penaltyBase: 22_500_000, penaltyTax: 1_125_000 });
  });
});

describe("NH-3 불변 대조군", () => {
  it("NH-3-1 5년 경과(양도 2027-02): 가산세 없음 — 특례와 무관", async () => {
    const r = await call(base(DB_NEW, { ...AUCTION, transferDate: "2027-02-01" }));
    OK(r);
    expect(r.result!.penaltyTax ?? 0).toBe(0);
  });
  it("NH-3-2 donorBuilt 없음: 가산세 없음", async () => {
    const r = await call({ ...base(DB_NEW, AUCTION), carryoverTaxation: { ...CT } });
    OK(r);
    expect(r.result!.penaltyTax ?? 0).toBe(0);
  });
});
