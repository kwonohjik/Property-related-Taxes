/**
 * 부담부증여 K-6(매매사례가액)·K-7(감정가액) — 라우트 ⑫ anchor (Zod 통과·침묵 strip 방지·필수 입력).
 * 계획서: docs/00-pm/burdened-gift-appraisal-sales-case-acquisition.plan.md §4 IN-2
 *
 * 문제 20 상황 1을 라우트로 흘려 **엔진까지 새 필드가 도달**하는지 실측한다 — Zod가 enum·금액 필드를
 * 몰라 strip하면 엔진은 취득가액 0 → 양도차익 78,920,000(과대)을 낸다(Pre-Do 실측).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Json = {
  data?: {
    result?: {
      transferGain: number;
      penaltyTax?: number;
      penaltyBase?: number;
      transferBurdenedGiftBreakdown?: {
        acquisitionMethodUsed: string;
        perAsset: { land: { acquisitionPrice: number; estimatedDeduction: number } };
      };
    };
  };
  error?: { fieldErrors?: Record<string, unknown> };
};
async function send(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}

/** 문제 20 — 토지 A. */
const BGI = {
  valuationMode: "sangjeungbeop_market",
  lendingDepositTotal: 0,
  mortgageDebtAmount: 80_000_000,
  annualRentTotal: 0,
  marketValueAtTransfer: 400_000_000,
  acquisitionMethod: "appraisal",
  presumedLandAcquisitionPrice: 250_000_000,
  presumedBuildingAcquisitionPrice: 0,
  landStdPriceAtTransfer: 320_000_000,
  buildingStdPriceAtTransfer: 0,
  landStdPriceAtAcquisition: 180_000_000,
  buildingStdPriceAtAcquisition: 0,
  donorRelation: "lineal_descendant",
};
const BODY = {
  propertyType: "land",
  transferType: "burdened_gift",
  transferPrice: 80_000_000,
  transferDate: "2026-10-20",
  acquisitionPrice: 0,
  acquisitionDate: "2018-10-20",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  residencePeriodMonths: 0,
  annualBasicDeductionUsed: 0,
  burdenedGiftInfo: BGI,
};

describe("부담부증여 K-6/K-7 라우트 ⑫", () => {
  it.each(["appraisal", "salesCase"])("%s — 새 필드가 엔진까지 도달 (양도차익 28,920,000)", async (method) => {
    const r = await send({ ...BODY, burdenedGiftInfo: { ...BGI, acquisitionMethod: method } });
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    const res = r.json.data!.result!;
    expect(res.transferBurdenedGiftBreakdown!.acquisitionMethodUsed).toBe(method);
    expect(res.transferBurdenedGiftBreakdown!.perAsset.land.acquisitionPrice).toBe(50_000_000);
    expect(res.transferBurdenedGiftBreakdown!.perAsset.land.estimatedDeduction).toBe(1_080_000);
    expect(res.transferGain).toBe(28_920_000);
  });

  it.each(["appraisal", "salesCase"])("%s — 금액을 모두 비우면 400 (종전 취득가액 0 → 양도차익 과대)", async (method) => {
    const { presumedLandAcquisitionPrice: _l, presumedBuildingAcquisitionPrice: _b, ...rest } = BGI;
    void _l;
    void _b;
    const r = await send({ ...BODY, burdenedGiftInfo: { ...rest, acquisitionMethod: method } });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).toContain("burdenedGiftInfo.presumedAcquisitionTotal");
  });

  it("알 수 없는 산정방식은 400", async () => {
    const r = await send({ ...BODY, burdenedGiftInfo: { ...BGI, acquisitionMethod: "estimated" } });
    expect(r.status).toBe(400);
  });

  // PR-3 — 신축 5년 이내 × 감정가액: Zod → route → 엔진 → `penaltyAxis`까지 가산세가 도달한다.
  describe("§114조의2 신축 × 감정가액 가산세 (PR-3)", () => {
    const BUILDING_BGI = {
      ...BGI,
      acquisitionMethod: "appraisal",
      marketValueAtTransfer: 500_000_000,
      mortgageDebtAmount: 200_000_000,
      presumedLandAcquisitionPrice: 0,
      presumedBuildingAcquisitionPrice: 150_000_000,
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: 400_000_000,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: 100_000_000,
    };
    const BUILDING_BODY = {
      ...BODY,
      propertyType: "housing",
      transferPrice: 200_000_000,
      transferDate: "2024-03-01",
      acquisitionDate: "2021-01-01",
      householdHousingCount: 2,
      isSelfBuilt: true,
      buildingType: "new",
      constructionDate: "2021-01-01",
      burdenedGiftInfo: BUILDING_BGI,
    };

    it("건물 감정가액 150M × 채무비율 0.4 = 60M → 가산세 3,000,000", async () => {
      const r = await send(BUILDING_BODY);
      expect(r.status, JSON.stringify(r.json.error)).toBe(200);
      const res = r.json.data!.result!;
      expect(res.penaltyBase).toBe(60_000_000);
      expect(res.penaltyTax).toBe(3_000_000);
    });

    it("🔴 구별력 — 신축이 아니면 0", async () => {
      const r = await send({ ...BUILDING_BODY, isSelfBuilt: false });
      expect(r.status).toBe(200);
      expect(r.json.data!.result!.penaltyTax).toBe(0);
    });

    it("증축(85㎡ 초과)은 400 — 증축한 부분의 감정가액을 받는 칸이 없다", async () => {
      const r = await send({ ...BUILDING_BODY, buildingType: "extension", extensionFloorArea: 120 });
      expect(r.status).toBe(400);
    });
  });
});
