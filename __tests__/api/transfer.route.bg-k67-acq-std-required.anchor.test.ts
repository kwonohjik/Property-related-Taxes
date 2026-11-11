/**
 * 부담부증여 K-6(매매사례가액)·K-7(감정가액) × 취득시 기준시가 0 — 직접 API도 400(Q-53 a · 계획서 docs/00-pm/remaining-4-measurements.plan.md §G).
 * 종전: 총액을 토지·건물로 나눌 때만 막혀(`burdened-gift-acquisition.ts`) 토지 단독·파트별 금액은 개산공제 0원인 채 200이었다
 * (문제 20 토지 A 28,920,000 → 30,000,000). 시료는 `burdened-gift-appraisal-sales-case.route.anchor.test.ts`와 같다.
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
const STD_MSG = "취득시 기준시가가 없습니다";
describe("KS-1 토지 단독 · 기준시가 있으면 종전 그대로", () => {
  it.each(["appraisal", "salesCase"])("%s: 80,000,000 − 50,000,000 − 개산공제 1,080,000 = 28,920,000", async (m) => {
    const r = await send({ ...BODY, burdenedGiftInfo: { ...BGI, acquisitionMethod: m } });
    expect(r.status).toBe(200);
    expect(r.json.data?.result?.transferGain).toBe(28_920_000);
  });
});
describe("KS-2 취득시 기준시가 0 → 400(종전 200 · 개산공제 0 · 30,000,000)", () => {
  for (const [name, top, part] of [
    ["토지 단독", { propertyType: "land" }, {}],
    ["주택 · 파트별 금액", { propertyType: "housing" }, { presumedBuildingAcquisitionPrice: 50_000_000, buildingStdPriceAtTransfer: 80_000_000 }],
  ] as const) {
    it.each(["appraisal", "salesCase"])(`${name} · %s`, async (m) => {
      const r = await send({ ...BODY, ...top, burdenedGiftInfo: { ...BGI, ...part, acquisitionMethod: m, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 0 } });
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.json)).toContain(STD_MSG);
    });
  }
});
