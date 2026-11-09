/**
 * F-5 — `/api/calc/transfer/multi`(연간 다건 합산) × 배우자등 이월과세(소득세법 §97의2).
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-5 · §16.
 *
 * 종전: ⑭(route)가 `carryoverTaxation`을 버려 **200 + 취득가액 0**으로 조용히 계산됐다(V-8 probe: 양도차익 15억) — ⑫가 거부했다.
 * 지금(2026-11-09 트랙 CO · `docs/00-pm/multi-carryover-bg-gb-shares.plan.md`): ⑭가 단건과 같은 Date 변환으로 옮긴다.
 * ⇒ 이 파일은 「조용한 0원 계산」이 돌아오지 않음을 **단건과 같은 세액**으로 고정한다(F5-1·F5-3). 서브객체 없는 원인(F5-2)은
 *    공용 refine이 계속 막는다.
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

describe("F-5 /multi × 이월과세 — 단건과 같은 세액", () => {
  it("F5-1 이월과세 자산(carryover_gift + carryoverTaxation) → 200 · 단건과 같은 세액 64,215,800(취득가액 0 계산 아님)", async () => {
    const r = await call([house("p1", CARRYOVER)]);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text).data.totalTax).toBe(64_215_800);
  });

  it("F5-2 취득원인만 carryover_gift(서브객체 없음)여도 거부 — 취득가액 0 계산 금지", async () => {
    const r = await call([house("p1", { acquisitionCause: "carryover_gift" })]);
    expect(r.status).toBe(400);
  });

  it("F5-3 다른 원인에 carryoverTaxation이 stale하게 실리면 단건처럼 무시한다 — 매매와 같은 세액(엔진은 원인이 이월과세일 때만 읽는다)", async () => {
    const stale = await call([house("p1", { acquisitionCause: "purchase", carryoverTaxation: CARRYOVER.carryoverTaxation })]);
    const plain = await call([house("p1", { acquisitionCause: "purchase" })]);
    expect(stale.status).toBe(200);
    expect(JSON.parse(stale.text).data.totalTax).toBe(JSON.parse(plain.text).data.totalTax);
  });

  it("F5-4 긍정 짝: 같은 자산을 매매 취득으로 보내면 200", async () => {
    const r = await call([house("p1", { acquisitionCause: "purchase" })]);
    expect(r.status).toBe(200);
  });
});
