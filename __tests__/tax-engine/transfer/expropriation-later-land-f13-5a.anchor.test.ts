/**
 * 5A × F-13 — 함께 양도에서 따로 입력한 주택부수토지 카드가 짝 주택보다 나중 취득(보유요건 미달)일 때
 * 짝 주택의 수용 단서(「소득세법 시행령」 제154조 제1항 단서 제2호 가목)가 그 토지도 덮는가.
 *
 * 카드는 짝 주택의 판정(`appurtenantHouseVerdict`)만 받는데, 종전에는 그 판정에 단서 정보가 없어
 * 고시일 전에 취득한 토지 카드도 보유요건으로 과세됐다(실측 8,844,000 — 단서 유무와 무관하게 같은 값).
 * 판정에 단서가 덮는 토지 취득 기한(`expropriationLandCutoff`)을 실어 넘긴다. route 경유(주택 판정 → 카드 판정 배선 포함).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";

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

const TD = "2026-02-16";
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(new Date(TD)) as never);
});

/** 1세대1주택 · 주택 2014 취득 · 수도권 주거지역(배율 3배) · 정착면적 100㎡ → 한도 300㎡ · 합계 8억(고가주택 아님) */
const primary = (over: object = {}) => ({
  propertyType: "housing", transferPrice: 500_000_000, transferDate: TD, acquisitionPrice: 250_000_000,
  acquisitionDate: "2014-01-01", acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false,
  householdHousingCount: 1, residencePeriodMonths: 60, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
  isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true, reductions: [], annualBasicDeductionUsed: 0,
  buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential",
  totalSalePrice: 800_000_000, standardPriceAtTransferForApportion: 500_000, ...over,
});
/** 부수토지 카드 — 2024-12-01 취득(양도일까지 1년 2개월 · 주택보다 나중) · 200㎡(한도 이내) */
const land = (over: object = {}) => ({
  assetId: "c1", assetLabel: "부수토지", assetKind: "land", landNature: "appurtenant_to_housing",
  acquisitionCause: "purchase", acquisitionDate: "2024-12-01", fixedAcquisitionPrice: 150_000_000,
  standardPriceAtTransfer: 300_000, directExpenses: 0, isOneHousehold: true, areaM2: 200, reductions: [], ...over,
});
const proviso = { oneHouseExemptionProviso: { reason: "expropriation", businessApprovalDate: "2025-03-01", expropriationDate: TD } };
const NOTICE = "나중에 취득한 부수토지에 이 단서를 적용한 정면 해석례는 확인하지 못했습니다";

type Agg = { totalTax: number; warnings?: string[]; properties: { propertyId: string; isExempt?: boolean; transferGain: number }[] };
async function post(body: object): Promise<Agg> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const json = (await res.json()) as { data?: { aggregated: Agg }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.aggregated;
}
const card = (a: Agg) => a.properties.find((p) => p.propertyId === "c1")!;
const hasNotice = (a: Agg) => (a.warnings ?? []).some((w) => w.includes(NOTICE));

describe("5A × F-13 — 따로 입력한 부수토지 카드 × 짝 주택의 수용 단서", () => {
  it("토지 카드를 고시일 전에 취득 → 짝 주택의 단서가 덮어 비과세 + 확인 필요 고지", async () => {
    const a = await post({ ...primary(proviso), companionAssets: [land()] });
    expect(card(a).isExempt).toBe(true);
    expect(a.totalTax).toBe(0);
    expect(hasNotice(a)).toBe(true);
  }, 60_000);

  it("대조: 단서 없음 → 카드 보유요건 미달로 과세, 고지 없음", async () => {
    const a = await post({ ...primary(), companionAssets: [land()] });
    expect(card(a).isExempt).toBe(false);
    expect(card(a).transferGain).toBe(150_000_000);
    // 카드는 1년 2개월 보유 — 카드 취득일부터 보아(O-4) 1~2년 단기 60%: (150,000,000 − 2,500,000) × 60% = 88,500,000 → ×1.1 (종전 짝 주택 보유연수의 누진 8,844,000)
    expect(a.totalTax).toBe(97_350_000);
    expect(hasNotice(a)).toBe(false);
  }, 60_000);

  it("토지 카드를 고시일 이후에 취득 → 괄호 밖이라 과세, 고지 없음", async () => {
    const a = await post({ ...primary(proviso), companionAssets: [land({ acquisitionDate: "2025-05-01" })] });
    expect(card(a).isExempt).toBe(false);
    // 카드는 9.5개월 보유 — 1년 미만 단기 70%: (150,000,000 − 2,500,000) × 70% = 103,250,000 → ×1.1 (종전 누진 8,844,000)
    expect(a.totalTax).toBe(113_575_000);
    expect(hasNotice(a)).toBe(false);
  }, 60_000);
});
