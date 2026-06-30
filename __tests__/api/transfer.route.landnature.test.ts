/**
 * 양도세 Route Handler — landNature(부수토지 일체과세) 매핑 회귀 anchor
 *
 * 버그(⑭ silent drop): route.ts가 Zod 검증된 `data.landNature`를 engineInput에 매핑하지 않아,
 * bundled 토지-primary + companion 주택(primaryContextForCompanionRate 설정) 시나리오에서
 * resolveCompanionLandRate가 landNature=undefined로 applied=false → 부수토지 일체과세(70%) 미발동.
 *
 * 이 anchor는 route 경유로 부수토지 70% 적용을 단언 — 매핑 누락 시 실패한다.
 */
import { describe, it, expect, vi } from "vitest";
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

// primary = 토지(부수토지), companion = 단기보유(5개월) 주택 → 부수토지 일체과세 70%
const PAYLOAD = {
  propertyType: "land" as const,
  assetKind: "land" as const,
  landNature: "appurtenant_to_housing" as const,
  transferPrice: 600_000_000,
  transferDate: "2024-06-01",
  acquisitionPrice: 200_000_000,
  acquisitionDate: "2010-01-01",
  acquisitionCause: "purchase" as const,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  // 부수토지 한도 산정 — 토지(100㎡) ≤ 건물바닥(100㎡) × 배율 → 한도 내
  buildingFootprintArea: 100,
  appurtenantLandZone: "metropolitan_residential" as const,
  isUrbanArea: true,
  acquisitionArea: 100,
  // bundled 안분
  bundledSaleMode: "apportioned" as const,
  totalSalePrice: 1_000_000_000,
  standardPriceAtTransferForApportion: 400_000_000, // 토지(primary) 양도시 기준시가
  companionAssets: [
    {
      assetId: "house-1",
      assetLabel: "주택",
      assetKind: "housing" as const,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2024-01-01", // 양도일과 5개월 → 단기보유 70%
      fixedAcquisitionPrice: 300_000_000,
      buildingFootprintArea: 100,
      appurtenantLandZone: "metropolitan_residential" as const,
      isUrbanArea: true,
      standardPriceAtTransfer: 600_000_000,
      directExpenses: 0,
    },
  ],
};

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("[LANDNATURE-ROUTE] 부수토지 일체과세 landNature 매핑", () => {
  it("bundled 토지-primary + companion 단기주택 → 부수토지 70% 적용 (route 경유)", async () => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
    const res = await POST(makeReq(PAYLOAD));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.mode).toBe("bundled");
    const props = body.data.aggregated.properties as Array<{
      propertyId: string;
      appliedRate: number;
      shortTermNote?: string;
    }>;
    const landItem = props.find((p) => p.propertyId === "primary");
    expect(landItem).toBeDefined();
    // landNature 매핑 누락 시 일반 누진세율(부수토지 일체과세 미발동) → 0.70 단언으로 회귀 차단
    expect(landItem!.appliedRate).toBe(0.70);
    expect(landItem!.shortTermNote).toContain("부수토지 일체과세");
  });
});
