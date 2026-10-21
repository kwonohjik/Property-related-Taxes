/**
 * 지분 규약 `applyRatio` 부동소수 1원 과소 — 일반건물 × 지분 분할 route anchor (2026-10-21)
 *
 * 계획: docs/00-pm/share-ratio-apply-float-precision.plan.md §4 S (`app/api/calc/transfer/general-building-fractional.ts:138`)
 *
 * 지분별 양도가액 = `applyRatio(물건 전체 양도가액, 지분율)`, 마지막 지분이 잔액을 흡수한다.
 * 70%에서 옛 식은 170,000,000 × 0.7 = 118,999,999 — 지분 하나가 1원 부족하고 마지막 지분이 1원을 더 받는다.
 * 지분 payload는 클라이언트가 만든 `ownershipRatio`(= parseFloat(70)/100 = 0.7)로 도달한다.
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
import { applyShareScale } from "@/lib/calc/transfer-tax-api-gb-shares";

const TRANSFER_DATE = "2024-03-01";
const TOTAL = 170_000_000; // 70%에서 옛 식 118,999,999

const PROPERTY_LEVEL = {
  landArea: 100,
  buildingArea: 200,
  buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000,
  transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential" as const,
};
const shareValuation = (acqLandPerSqm: number, acqBuildingStd: number) => ({
  ...PROPERTY_LEVEL,
  acquisitionLandPricePerSqm: acqLandPerSqm,
  acquisitionBuildingStdPrice: acqBuildingStd,
  buildingAcquisitionCause: "purchase" as const,
});
const SHARE_A = { shareId: "share-a", shareLabel: "70% 지분", ownershipRatio: 0.7, acquisitionDate: "2009-03-01", valuation: shareValuation(1_000_000, 100_000_000) };
const SHARE_B = { shareId: "share-b", shareLabel: "30% 지분", ownershipRatio: 0.3, acquisitionDate: "2015-03-01", valuation: shareValuation(1_500_000, 150_000_000) };

const BODY = {
  propertyType: "general_building" as const,
  transferDate: TRANSFER_DATE,
  acquisitionPrice: 0,
  expenses: 0,
  useEstimatedAcquisition: true,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  transferPrice: TOTAL,
  totalPropertyTransferPrice: TOTAL,
  acquisitionDate: SHARE_A.acquisitionDate,
  generalBuildingValuation: SHARE_A.valuation,
  generalBuildingShares: [SHARE_A, SHARE_B],
};

type Apportioned = { assetId: string; allocatedSalePrice: number };

describe("GB × 지분 70%/30% — 지분별 양도가액 (general-building-fractional.ts)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("🔴 70% 지분의 토지·건물 카드 양도가액 합 = 119,000,000, 30% 지분 = 51,000,000 (옛 118,999,999 / 51,000,001)", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY) }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json.error)).toBe(200);
    const rows = (json.data?.apportionment?.apportioned ?? []) as Apportioned[];
    const sum = (idx: number) => rows.filter((r) => r.assetId.endsWith(`#${idx}`)).reduce((n, r) => n + r.allocatedSalePrice, 0);
    expect(sum(0)).toBe(119_000_000);
    expect(sum(1)).toBe(51_000_000);
  });
});

describe("applyShareScale — 일반건물 지분 금액 스케일 (transfer-tax-api-gb-shares.ts)", () => {
  it("🔴 70%: 100% 기준 입력이 참값으로 줄어든다", () => {
    const out = applyShareScale({ landAcquisitionPrice: 170_000_000, buildingAcquisitionPrice: 340_000_000, landDirectExpenses: 21_000_000 }, 0.7);
    expect(out.landAcquisitionPrice).toBe(119_000_000);
    expect(out.buildingAcquisitionPrice).toBe(238_000_000);
    expect(out.landDirectExpenses).toBe(14_700_000);
  });
});
