/**
 * F-5 — `/api/calc/transfer/multi`(연간 다건 합산)는 배우자등 이월과세(소득세법 §97의2)를 매핑하지 않는다.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-5 · §16.
 *
 * 화면은 ⑧(`multi-transfer-tax-validate.ts`)이 「단건 계산기에서만 지원」으로 막지만, API를 직접 부르면
 * ⑫가 `carryoverTaxation`을 받아 놓고 ⑭(route)가 버려 **200 + 취득가액 0**으로 조용히 계산됐다
 * (V-8 probe: 양도차익 15억). ⇒ ⑫에서 ⑧과 같은 조건으로 거부한다(이월과세 지원은 별건).
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

import { POST } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const house = (id: string, over: object = {}) => ({
  propertyId: id,
  propertyLabel: id,
  propertyType: "housing" as const,
  transferDate: "2026-02-16",
  acquisitionDate: "2023-06-01",
  transferPrice: 1_500_000_000,
  acquisitionPrice: 1_500_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [],
  residencePeriodMonths: 0,
  ...over,
});
const CARRYOVER = {
  acquisitionCause: "carryover_gift",
  carryoverTaxation: {
    giftRegistryDate: "2023-06-01",
    donorAcquisitionDate: "2000-06-01",
    donorAcquisitionPrice: 10_000_000,
    useEstimatedAcquisition: false,
    giftTaxAmount: 0,
    giftDateValuation: 1_500_000_000,
    donorRelation: "spouse",
  },
};

async function call(properties: object[]) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer/multi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxYear: 2026, properties, annualBasicDeductionUsed: 0 }),
    }),
  );
  return { status: res.status, text: JSON.stringify(await res.json()) };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("F-5 /multi × 이월과세 — ⑫ 거부", () => {
  it("F5-1 이월과세 자산(carryover_gift + carryoverTaxation) → 400 · ⑧과 같은 안내", async () => {
    const r = await call([house("p1", CARRYOVER)]);
    expect(r.status).toBe(400);
    expect(r.text).toContain("단건 계산기에서만 지원");
  });

  it("F5-2 취득원인만 carryover_gift(서브객체 없음)여도 거부 — 취득가액 0 계산 금지", async () => {
    const r = await call([house("p1", { acquisitionCause: "carryover_gift" })]);
    expect(r.status).toBe(400);
  });

  it("F5-3 다른 원인에 carryoverTaxation이 stale하게 실려도 거부 — 조용히 버리지 않는다", async () => {
    const r = await call([house("p1", { acquisitionCause: "purchase", carryoverTaxation: CARRYOVER.carryoverTaxation })]);
    expect(r.status).toBe(400);
  });

  it("F5-4 긍정 짝: 같은 자산을 매매 취득으로 보내면 200", async () => {
    const r = await call([house("p1", { acquisitionCause: "purchase" })]);
    expect(r.status).toBe(200);
  });
});
