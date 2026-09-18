/**
 * D45 — 이월과세 §97의2②2호 · API 경로 anchor (⑫ Zod · ⑭ route 매핑).
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §3 · §7.
 *
 * - D45-A1: 옛 클라이언트가 자기선언 필드(`oneHouseExemptionApplies`)를 보내도 ⑫가 strip → 자동 판정.
 * - 배우자 예외 사실(`spouseGiftOneHouseAtGiftDate`)이 ⑫·⑭를 지나 엔진에 닿는다(침묵 strip 금지).
 * - 레거시 플래그(`legacyOneHouseExemptionDeclared`)도 닿는다(옛 이력 재계산).
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
import { carryoverTaxationEngineShape } from "@/lib/api/transfer-tax-building-schemas";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const BASE = {
  propertyType: "housing",
  transferPrice: 1_500_000_000,
  transferDate: "2026-02-16",
  acquisitionPrice: 0,
  acquisitionDate: "2025-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  acquisitionCause: "carryover_gift",
};
const carry = (over: Record<string, unknown>) => ({
  ...BASE,
  carryoverTaxation: {
    giftRegistryDate: "2025-06-01",
    donorAcquisitionDate: "2000-06-01",
    donorAcquisitionPrice: 10_000_000,
    useEstimatedAcquisition: false,
    giftTaxAmount: 0,
    giftDateValuation: 1_500_000_000,
    ...over,
  },
});

interface Detail {
  exclusionReason?: string;
  oneHouseExclusionSource?: string;
  spouseOneHouseExceptionApplied?: boolean;
}
async function post(body: object): Promise<{ determinedTax: number; carryoverTaxationDetail?: Detail }> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data?: { result: never }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("D45 route — ⑫·⑭", () => {
  it("D45-A1 옛 클라이언트의 자기선언(`oneHouseExemptionApplies: true`)은 strip → 자동 판정 58,378,000 (OH-2)", async () => {
    const r = await post(
      carry({ giftRegistryDate: "2023-06-01", exclusionDeclared: { oneHouseExemptionApplies: true } }),
    );
    expect(r.carryoverTaxationDetail?.exclusionReason).not.toBe("one_house_exemption");
    expect(r.determinedTax).toBe(58_378_000);
  });

  it("D45-R1 배우자 예외 사실이 엔진에 닿는다 — OH-1 배우자 true 58,378,000 / false 0", async () => {
    const on = await post(carry({ donorRelation: "spouse", spouseGiftOneHouseAtGiftDate: true }));
    expect(on.carryoverTaxationDetail?.spouseOneHouseExceptionApplied).toBe(true);
    expect(on.determinedTax).toBe(58_378_000);
    const off = await post(carry({ donorRelation: "spouse" }));
    expect(off.carryoverTaxationDetail?.oneHouseExclusionSource).toBe("auto");
    expect(off.determinedTax).toBe(0);
  });

  it("D45-R2 레거시 플래그가 엔진에 닿는다 — OH-2 legacy → 0 (저장 당시 세액)", async () => {
    const r = await post(
      carry({ giftRegistryDate: "2023-06-01", exclusionDeclared: { legacyOneHouseExemptionDeclared: true } }),
    );
    expect(r.carryoverTaxationDetail?.oneHouseExclusionSource).toBe("legacy_declaration");
    expect(r.determinedTax).toBe(0);
  });

  it("D45-R3 컴패니언·GB 파트 shape도 두 필드를 보존한다(단건 인라인 shape과 parity) · 옛 키는 strip", () => {
    const parsed = carryoverTaxationEngineShape.parse({
      giftRegistryDate: "2023-06-01",
      donorAcquisitionDate: "2000-06-01",
      useEstimatedAcquisition: false,
      giftTaxAmount: 0,
      giftDateValuation: 1_500_000_000,
      spouseGiftOneHouseAtGiftDate: true,
      exclusionDeclared: { legacyOneHouseExemptionDeclared: true, oneHouseExemptionApplies: true },
    });
    expect(parsed.spouseGiftOneHouseAtGiftDate).toBe(true);
    expect(parsed.exclusionDeclared).toEqual({ legacyOneHouseExemptionDeclared: true });
  });
});
