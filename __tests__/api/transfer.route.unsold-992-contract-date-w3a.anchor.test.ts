/**
 * W3a ⑫ — §99의2 조문 칸 「최초 매매계약일」이 없으면 자산-수준 매매계약일이 있어도 400 (자기건설은 제외).
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

const BASE = {
  propertyType: "housing" as const,
  transferPrice: 500_000_000,
  transferDate: "2026-06-15",
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2013-06-01",
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
  annualBasicDeductionUsed: 0,
};

async function run(body: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, text: await res.text() };
}

describe("W3a ⑫ — §99의2 조문 칸 필수", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });
  it("조문 칸이 없고 자산 칸만 있으면 400 + 조문 칸 안내", async () => {
    const r = await run({
      ...BASE,
      assetContractDate: "2013-05-01",
      reductions: [{ type: "unsold_99_2", houseType992: "new_or_unsold", acquisitionPrice992: 300_000_000, exclusiveAreaSqm992: 80 }],
    });
    expect(r.status).toBe(400);
    expect(r.text).toContain("contractDate992");
  }, 60_000);
  it("조문 칸이 있으면 이 사유로는 400이 아니다", async () => {
    const r = await run({
      ...BASE,
      reductions: [{ type: "unsold_99_2", houseType992: "new_or_unsold", contractDate992: "2013-05-01", acquisitionPrice992: 300_000_000, exclusiveAreaSqm992: 80 }],
    });
    expect(r.status).toBe(200);
  }, 60_000);
});
