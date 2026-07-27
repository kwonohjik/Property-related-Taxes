/**
 * 양도소득세 Route Handler — 지분 모드(같은 물건 분할취득) 일괄양도 anchor
 *
 * 버그: 같은 물건을 지분 60%(상속) + 40%(매매)로 나눠 취득 → 100% 일괄 양도 시,
 *   route가 §166⑥ 일괄양도 기준시가 안분 경로로 태우면서 각 자산의 확정 양도가액
 *   (총계약가 × 지분율)을 fixedSalePrice로 주입하지 않아(게이트가 isActualMode 뿐),
 *   전 자산이 variable로 분류 → 기준시가 합 0 → "안분 분모 부족" throw → 500.
 *
 * 근거: 지분 모드는 §166⑥ 일괄양도(서로 다른 물건)가 아니라 같은 물건의 지분 분할이므로
 *   양도가액이 지분율로 확정된다 — 기준시가는 개입 여지 없음.
 *
 * 계획: docs/00-pm/fractional-share-bundled-sale-fix.plan.md
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    limit: 30,
    remaining: 29,
    resetAt: Date.now() + 60_000,
  }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const TOTAL = 1_700_000_000;

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * 실제 API 변환(buildTransferPayload)이 지분 모드(apportioned)에서 route로 보내는 형태를 모사.
 *   - primaryActualSalePrice·standardPriceAtTransferForApportion 미설정 (지분 모드)
 *   - companion.fixedSalePrice = 총계약가 × 지분율 (helpers가 채운 값)
 *   - companion.totalPropertyTransferPrice = 총계약가 (지분 모드 표식)
 */
const C1_PAYLOAD = {
  propertyType: "housing" as const,
  transferPrice: 1_020_000_000, // 1.7B × 60% (primary)
  totalPropertyTransferPrice: TOTAL,
  transferDate: "2023-02-16",
  acquisitionPrice: 484_800_000, // 808M × 60%
  acquisitionDate: "2008-05-05",
  acquisitionCause: "inheritance" as const,
  decedentAcquisitionDate: "2001-01-01",
  expenses: 20_400_000,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 177,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  totalSalePrice: TOTAL,
  // 지분 모드: api.ts가 primaryActualSalePrice = 총계약가 × 지분율을 자동 채워 전송.
  primaryActualSalePrice: 1_020_000_000,
  // bundledSaleMode 미지정 → 기본 apportioned (지분 모드는 actual 아님)
  companionAssets: [
    {
      assetId: "frac-2",
      assetLabel: "40% 매매 지분",
      assetKind: "housing" as const,
      fixedSalePrice: 680_000_000, // 1.7B × 40% (helpers가 채운 값)
      totalPropertyTransferPrice: TOTAL,
      directExpenses: 0,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2021-11-11",
      fixedAcquisitionPrice: 600_000_000,
      isOneHousehold: true,
      reductions: [] as unknown[],
    },
  ],
};

describe("POST /api/calc/transfer — 지분 모드 분할취득 (C1)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("C1 60%상속+40%매매 → 200 (기준시가 없이 지분율 안분)", async () => {
    const res = await POST(makeRequest(C1_PAYLOAD));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mode).toBe("bundled");
  });

  it("C1 양도가액 = 지분율 안분 (primary 1,020,000,000 / frac-2 680,000,000)", async () => {
    const res = await POST(makeRequest(C1_PAYLOAD));
    const body = await res.json();
    const { apportioned } = body.data.apportionment;
    const primary = apportioned.find((a: { assetId: string }) => a.assetId === "primary");
    const frac2 = apportioned.find((a: { assetId: string }) => a.assetId === "frac-2");
    expect(primary.allocatedSalePrice).toBe(1_020_000_000);
    expect(frac2.allocatedSalePrice).toBe(680_000_000);
    expect(primary.allocatedSalePrice + frac2.allocatedSalePrice).toBe(TOTAL);
  });
});

// ── C2: 1/3 × 3자산 — floor 절사 잔액을 마지막 자산이 흡수 ──
// applyRatio(1e9, 1/3) = 333,333,333 × 3 = 999,999,999 → 잔액 1원.
// 마지막 자산이 흡수하여 Σ = totalSalePrice 불변식 유지 (throw 없음).
const THIRD = 1_000_000_000;
const C2_PAYLOAD = {
  propertyType: "housing" as const,
  transferPrice: 333_333_333, // applyRatio(1e9, 1/3)
  totalPropertyTransferPrice: THIRD,
  transferDate: "2024-06-01",
  acquisitionPrice: 100_000_000,
  acquisitionDate: "2015-03-20",
  acquisitionCause: "purchase" as const,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 3,
  residencePeriodMonths: 60,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  totalSalePrice: THIRD,
  primaryActualSalePrice: 333_333_333,
  companionAssets: [
    {
      assetId: "third-2",
      assetLabel: "2번째 1/3 지분",
      assetKind: "housing" as const,
      fixedSalePrice: 333_333_333,
      totalPropertyTransferPrice: THIRD,
      directExpenses: 0,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2016-04-10",
      fixedAcquisitionPrice: 110_000_000,
      isOneHousehold: false,
      reductions: [] as unknown[],
    },
    {
      assetId: "third-3",
      assetLabel: "3번째 1/3 지분",
      assetKind: "housing" as const,
      fixedSalePrice: 333_333_333,
      totalPropertyTransferPrice: THIRD,
      directExpenses: 0,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2017-05-15",
      fixedAcquisitionPrice: 120_000_000,
      isOneHousehold: false,
      reductions: [] as unknown[],
    },
  ],
};

describe("POST /api/calc/transfer — 지분 모드 floor 잔액 흡수 (C2)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("C2 1/3×3 → 200 (throw 없음)", async () => {
    const res = await POST(makeRequest(C2_PAYLOAD));
    expect(res.status).toBe(200);
  });

  it("C2 마지막 자산이 1원 잔액 흡수 (Σ = 1,000,000,000)", async () => {
    const res = await POST(makeRequest(C2_PAYLOAD));
    const body = await res.json();
    const { apportioned } = body.data.apportionment;
    const sum = apportioned.reduce(
      (s: number, a: { allocatedSalePrice: number }) => s + a.allocatedSalePrice,
      0,
    );
    expect(sum).toBe(THIRD);
    // 마지막 자산(third-3)이 잔액 흡수 → 333,333,334
    const last = apportioned.find((a: { assetId: string }) => a.assetId === "third-3");
    expect(last.allocatedSalePrice).toBe(333_333_334);
  });
});
