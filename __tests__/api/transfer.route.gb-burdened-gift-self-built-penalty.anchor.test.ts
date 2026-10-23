/**
 * anchor — 일반건물 **부담부증여 K-5(환산)·K-7(감정) × 양도인 본인 신축** 「소득세법」 §114조의2 가산세 (PR-5b · 계획서 §17)
 *
 * ## 결함
 * 일반건물 부담부증여는 실가 경로(`general-building-route-actual.ts`)로 가는데 카드 조립이 §159 breakdown 의 산정방식(환산/감정)을 카드에
 * 싣지 않아 `isSelfBuilt`·신축일·`penaltyAxis` 가 전부 사라졌다 → 같은 조건의 단건 건물(`runBurdenedGiftStep`)은 붙는 가산세가 일반건물에는 0.
 *
 * ## 픽스처 (단건 S1/S2 와 같은 숫자)
 * 토지 100㎡×2,000,000(양도시 2억) · 건물 양도시 2억 · 취득시 토지 1억·건물 1억 · 인수채무 5억 · 시가 10억 → 채무비율 0.5 →
 *   건물 양도가(안분) 2.5억 → K-5: 건물 환산취득가 = 2.5억 × 1억/2억 = 125,000,000 → 가산세 6,250,000
 *   K-7: 건물 감정가액 3억(토지 2억) × 0.5 = 150,000,000 → 가산세 7,500,000
 * 신축 2022-01-10 · 양도 2026-03-01 (5년 이내). 총납부(지방소득세 10% 포함) 현행 K-5 64,780,100 / K-7 63,317,100.
 *   K-5 후: +6,250,000 +625,000 = 71,655,100 · K-7 후: +7,500,000 +750,000 = 71,567,100 (결정세액은 가산세가 아니라 불변).
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

const GB = {
  landArea: 100, buildingArea: 200, buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000, zoneType: "general_residential" as const,
  acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000,
};
const COMMON = {
  propertyType: "general_building" as const, transferDate: "2026-03-01", transferPrice: 1_000_000_000, acquisitionDate: "2022-01-10",
  acquisitionPrice: 0, expenses: 0, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
  isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, reductions: [] as unknown[], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
};
const INFO = (over: object = {}) => ({
  valuationMode: "sangjeungbeop_market" as const, acquisitionMethod: "converted" as const, marketValueAtTransfer: 1_000_000_000,
  lendingDepositTotal: 0, mortgageDebtAmount: 500_000_000, annualRentTotal: 0, mortgageSetAmount: 500_000_000,
  landStdPriceAtTransfer: 200_000_000, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 100_000_000,
  donorRelation: "lineal_descendant" as const, ...over,
});
const K7 = (over: object = {}) => INFO({ acquisitionMethod: "appraisal", presumedLandAcquisitionPrice: 200_000_000, presumedBuildingAcquisitionPrice: 300_000_000, ...over });
const SELF = { buildingAcquisitionCause: "newConstruction", buildingAcquisitionDate: "2022-01-10", landAcquisitionDate: "2015-01-01" };

type R = { determined: number; total: number; pen: number; props: Array<{ propertyId: string; penaltyTax?: number; penaltyBase?: number }> };
async function bg(info: object, gbOver: object = {}, top: object = {}): Promise<R> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...COMMON, transferType: "burdened_gift", acquisitionCause: "purchase", useEstimatedAcquisition: false, burdenedGiftInfo: info,
      generalBuildingValuation: { ...GB, actualPriceMode: true, ...gbOver }, ...top }),
  }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const a = json.data.aggregated;
  return { determined: a.determinedTax, total: a.totalTax, pen: a.penaltyTax, props: a.properties };
}
const building = (r: R) => r.props.find((p) => p.propertyId === "building")!;

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });

describe("GB 부담부증여 × 본인 신축 §114조의2", () => {
  it("K-5 환산: 건물분 환산취득가액 125,000,000 × 5% = 6,250,000 · 총납부 64,780,100 → 71,655,100", async () => {
    const self = await bg(INFO(), SELF);
    const none = await bg(INFO(), { ...SELF, buildingAcquisitionCause: "purchase" });
    expect(building(self).penaltyBase).toBe(125_000_000);
    expect(building(self).penaltyTax).toBe(6_250_000);
    expect(self.pen).toBe(6_250_000);
    expect(self.determined).toBe(none.determined); // 결정세액 불변 — 가산세는 §92③3호
    expect(none.total).toBe(64_780_100);
    expect(self.total).toBe(71_655_100);
  });

  it("K-7 감정: 건물 감정가액(채무비율 안분 후) 150,000,000 × 5% = 7,500,000 · 총납부 63,317,100 → 71,567,100", async () => {
    const self = await bg(K7(), SELF);
    const none = await bg(K7(), { ...SELF, buildingAcquisitionCause: "purchase" });
    expect(building(self).penaltyBase).toBe(150_000_000);
    expect(building(self).penaltyTax).toBe(7_500_000);
    expect(self.determined).toBe(none.determined);
    expect(none.total).toBe(63_317_100);
    expect(self.total).toBe(71_567_100);
  });

  it("토지 카드에는 붙지 않는다 (D4 — 건물분만)", async () => {
    const r = await bg(INFO(), SELF);
    expect(r.props.find((p) => p.propertyId === "land")?.penaltyTax ?? 0).toBe(0);
  });

  it("5년 경계: 신축 2021-03-01(양도 2026-03-01 당일) 포함 · 2021-02-28 제외", async () => {
    const on = await bg(INFO(), { ...SELF, buildingAcquisitionDate: "2021-03-01" }, { acquisitionDate: "2021-03-01" });
    const off = await bg(INFO(), { ...SELF, buildingAcquisitionDate: "2021-02-28" }, { acquisitionDate: "2021-02-28" });
    expect(on.pen).toBe(6_250_000);
    expect(off.pen).toBe(0);
    // 게이트가 닫히면 신호 자체가 없다 — 가산세 0 이고 `penaltyBase` 에코도 종전(미발동 0)과 같다
    expect(building(off).penaltyBase ?? 0).toBe(0);
  });

  it("신축이 아니면(매매) 0 — 대조군 (K-5·K-7 모두)", async () => {
    expect((await bg(INFO(), { ...SELF, buildingAcquisitionCause: "purchase" })).pen).toBe(0);
    expect((await bg(K7(), { ...SELF, buildingAcquisitionCause: "purchase" })).pen).toBe(0);
  });

  it("§97②2호 단서(W-6) swap 발동(자본적지출 6억 > 환산취득가+개산공제)이어도 base 는 swap 前 환산취득가 125,000,000", async () => {
    // swap 이면 건물 카드 취득가액은 0 이 되지만(건물 양도차익 100,000,000) 가산세는 «환산취득가액을 썼다는 사실»에 붙는다.
    const r = await bg(INFO(), { ...SELF, capitalExpenditure: 600_000_000 });
    expect(building(r).penaltyBase).toBe(125_000_000);
    expect(building(r).penaltyTax).toBe(6_250_000);
  });

  it("담보평가가 이겨 취득가액이 기준시가로 강제되면(요청은 환산이지만 실제 산정은 기준시가) 신호가 없다 — 1h-G1-2", async () => {
    // 시가 6억 < 담보 7억 → 평가액은 담보, 취득가액은 취득시 기준시가(K-1~K-3)로 간다
    const r = await bg(INFO({ marketValueAtTransfer: 600_000_000, mortgageDebtAmount: 700_000_000, mortgageSetAmount: 700_000_000 }), SELF);
    expect(r.pen).toBe(0);
    expect(building(r).penaltyBase ?? 0).toBe(0);
  });

  it("조문 비대상 산정방식은 0 — K-4 실지취득가 · K-1 기준시가", async () => {
    const k4 = await bg(INFO({ acquisitionMethod: "actual", actualLandAcquisitionPrice: 100_000_000, actualBuildingAcquisitionPrice: 300_000_000 }), SELF);
    const k1 = await bg({ ...INFO(), valuationMode: "sangjeungbeop_standard", acquisitionMethod: undefined }, SELF);
    expect(k4.pen).toBe(0);
    expect(k1.pen).toBe(0);
  });

  it("시행일 게이트: 환산 양도 2017-12-31 · 감정 양도 2019-12-31 은 0", async () => {
    const k5 = await bg(INFO(), { ...SELF, buildingAcquisitionDate: "2015-01-10" }, { transferDate: "2017-12-31", acquisitionDate: "2015-01-10" });
    const k7 = await bg(K7(), { ...SELF, buildingAcquisitionDate: "2016-01-10" }, { transferDate: "2019-12-31", acquisitionDate: "2016-01-10" });
    expect(k5.pen).toBe(0);
    expect(k7.pen).toBe(0);
  });

  it("[회귀 0] 비부담부증여 GB 본인 신축(환산) 가산세는 종전 그대로 12,500,000", async () => {
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...COMMON, useEstimatedAcquisition: true, generalBuildingValuation: { ...GB, buildingAcquisitionCause: "newConstruction", buildingAcquisitionDate: "2022-01-10" } }),
    }));
    const json = await res.json();
    expect(json.data.aggregated.penaltyTax).toBe(12_500_000);
  });

  it("[회귀 0] 부담부증여 실가 모드 아님 — 본인 신축 플래그만으로는 환산·감정 신호가 없다 (K-4 0 위 참조)", async () => {
    const r = await bg(INFO({ acquisitionMethod: "actual", actualAcquisitionTotal: 400_000_000 }), SELF);
    expect(r.pen).toBe(0);
  });
});
