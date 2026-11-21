/**
 * 함께 양도한 부수토지 카드 — 세액 영향 후보 ①②(양도세 결과뷰 리뷰 2026-11-21 MAJOR 작업 중 발견).
 *
 * ① 일체과세 세율이 양도일을 보지 않고 현행(2021.6.1. 시행) 70%/60%로 고정됐다.
 *    「소득세법」 §104①(법제처 시행본 실독):
 *    - 2014.1.1.~2021.5.31.(제12169호~): 2호 «주택(이에 딸린 토지로서 대통령령으로 정하는 토지를 포함한다…) 및 조합원입주권은 제외» 40% ·
 *      3호 50%(«주택 및 조합원 입주권의 경우에는 100분의 40») ⇒ 주택(딸린 토지 포함) 1년 미만 40% · 1~2년 누진세율
 *    - 2013.1.1. 시행본(제11611호): 2·3호에 주택 괄호가 없다 ⇒ 부수토지도 토지 자신의 보유기간으로 40%/50%/누진
 *    수정 전 실측: 2020.6.1. 양도 · 주택 10개월 → 카드 70% / 17개월 → 60% / 2013.6.1. 양도 → 70%(당시 법에 없는 세율)
 * ② 짝 주택이 차손이면 조기 반환이 중과 판정(`surchargeEcho`)을 싣지 않아 카드가 §104⑦ 중과·§95② 장특 배제를 잃었다.
 *    수정 전 실측: 카드 누진 35% · 장특 36,000,000 / 대조군(주택 이익) 카드 중과 55% · 장특 0
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { housingRateForHoldingPeriod } from "@/lib/tax-engine/appurtenant-land-rate";
import { unifiedShortTermClause } from "@/lib/tax-engine/transfer-tax-rate-clause";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

/** 수도권 주거지역(3배) · 정착면적 100㎡ → 한도 300㎡ · 부수토지 200㎡(배율 이내) */
const primary = (td: string, over: object = {}) => ({
  propertyType: "housing", transferPrice: 500_000_000, transferDate: td, acquisitionPrice: 250_000_000, acquisitionDate: "2014-01-01",
  acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 1, residencePeriodMonths: 0,
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true,
  reductions: [], annualBasicDeductionUsed: 0, buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential",
  totalSalePrice: 800_000_000, standardPriceAtTransferForApportion: 500_000, ...over,
});
const land = (over: object = {}) => ({
  assetId: "c1", assetLabel: "부수토지", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase",
  acquisitionDate: "2014-01-01", fixedAcquisitionPrice: 150_000_000, standardPriceAtTransfer: 300_000, directExpenses: 0,
  isOneHousehold: true, areaM2: 200, reductions: [], ...over,
});
type Prop = { propertyId: string; rateGroup: string; transferGain: number; longTermHoldingDeduction: number; appliedRate: number; rateClause?: string };
async function post(td: string, body: object): Promise<Record<string, Prop>> {
  vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date(td)) as never);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const json = (await res.json()) as { data?: { aggregated: { properties: Prop[] } }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return Object.fromEntries(json.data!.aggregated.properties.map((p) => [p.propertyId, p]));
}

describe("① leaf — housingRateForHoldingPeriod는 양도일 시행본의 주택 세율", () => {
  const D = (s: string) => new Date(s);
  it("2021.6.1. 이후 — 70% / 60% / 누진", () => {
    expect(housingRateForHoldingPeriod(10, D("2021-06-01"))).toBe(0.7);
    expect(housingRateForHoldingPeriod(17, D("2021-06-01"))).toBe(0.6);
    expect(housingRateForHoldingPeriod(24, D("2021-06-01"))).toBe("progressive");
  });
  it("2014.1.1.~2021.5.31. — 1년 미만 40% · 1~2년 누진(2호가 주택 제외)", () => {
    expect(housingRateForHoldingPeriod(10, D("2021-05-31"))).toBe(0.4);
    expect(housingRateForHoldingPeriod(17, D("2021-05-31"))).toBe("progressive");
    expect(housingRateForHoldingPeriod(10, D("2014-01-01"))).toBe(0.4);
  });
  it("양도일 없는 호출은 종전(현행 세율) 그대로", () => {
    expect([housingRateForHoldingPeriod(10), housingRateForHoldingPeriod(17), housingRateForHoldingPeriod(30)]).toEqual([0.7, 0.6, "progressive"]);
  });
  it("40%는 3호(주택 1년 미만 괄호)", () => {
    expect(unifiedShortTermClause(0.4)).toBe("104-1-3");
  });
});

describe("① 화면 경로(route) — 부수토지 카드 세율이 양도일을 따른다", () => {
  it("🔑 2020.6.1. 양도 · 주택 10개월 → 카드 40% 3호(수정 전 70%) — 주택 카드와 같은 세율", async () => {
    const r = await post("2020-06-01", { ...primary("2020-06-01", { acquisitionDate: "2019-08-01" }), companionAssets: [land({ acquisitionDate: "2019-08-01" })] });
    expect(r.primary.appliedRate).toBe(0.4);
    expect([r.c1.appliedRate, r.c1.rateClause]).toEqual([0.4, "104-1-3"]);
  });
  it("🔑 2020.6.1. 양도 · 주택 17개월 → 카드 누진(1호, 수정 전 60%)", async () => {
    const r = await post("2020-06-01", { ...primary("2020-06-01", { acquisitionDate: "2019-01-01" }), companionAssets: [land({ acquisitionDate: "2019-01-01" })] });
    expect(r.primary.rateClause).toBe("104-1-1");
    expect(r.c1.rateClause).toBe("104-1-1");
    expect(r.c1.appliedRate).not.toBe(0.6);
  });
  it("🔑 2013.6.1. 양도(주택 괄호 없음) · 주택 6개월 · 토지 2005 취득 → 카드는 토지 보유기간(8년) 누진 · 장특 표1 24%(수정 전 70%)", async () => {
    const r = await post("2013-06-01", { ...primary("2013-06-01", { acquisitionDate: "2012-12-01" }), companionAssets: [land({ acquisitionDate: "2005-01-01" })] });
    expect(r.primary.appliedRate).toBe(0.5); // 주택 자신은 1년 미만 50%(3호)
    expect([r.c1.rateGroup, r.c1.rateClause]).toEqual(["progressive", "104-1-1"]);
    expect(r.c1.longTermHoldingDeduction).toBe(Math.floor(150_000_000 * 0.24));
  });
  it("대조 — 2021.6.1. 이후 양도는 종전 그대로 70%", async () => {
    const r = await post("2022-06-01", { ...primary("2022-06-01", { acquisitionDate: "2021-08-01" }), companionAssets: [land({ acquisitionDate: "2021-08-01" })] });
    expect([r.c1.appliedRate, r.c1.rateClause]).toEqual([0.7, "104-1-3"]);
  });
});

describe("② 짝 주택이 차손이어도 부수토지 카드는 §104⑦ 중과·§95② 장특 배제를 따른다", () => {
  const two = { householdHousingCount: 2, isRegulatedArea: true, isOneHousehold: false };
  it("🔑 주택 차손(−1억) · 2주택 조정 · 2026.6.15. 양도 → 카드 중과 55% · 장특 0 (수정 전 누진 35% · 장특 36,000,000) — 주택 이익 대조군과 같다", async () => {
    const loss = await post("2026-06-15", { ...primary("2026-06-15", { ...two, acquisitionPrice: 600_000_000 }), companionAssets: [land({ isOneHousehold: false })] });
    const gain = await post("2026-06-15", { ...primary("2026-06-15", two), companionAssets: [land({ isOneHousehold: false })] });
    expect(loss.primary.transferGain).toBe(-100_000_000);
    expect(gain.primary.transferGain).toBe(250_000_000);
    const pick = (p: Prop) => [p.rateGroup, p.rateClause, p.appliedRate, p.longTermHoldingDeduction];
    expect(pick(loss.c1)).toEqual(["multi_house_surcharge", "104-7-1", 0.55, 0]);
    expect(pick(loss.c1)).toEqual(pick(gain.c1));
  });
});
