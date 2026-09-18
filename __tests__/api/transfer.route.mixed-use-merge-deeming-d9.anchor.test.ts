/**
 * anchor — **겸용주택 × 합가(혼인·동거봉양) 2주택 중과 배제** 경로 (D9, 2026-09-18).
 *
 * 계획서 docs/00-pm/transfer-review-4-defects.plan.md §1.4.
 *
 * 합가 의제(영 §167의10①15호 ① 요소)는 이제 중과 엔진이 재판정하지 않고 caller가 비과세 정본
 * `resolveMergeDeeming`으로 선판정해 `deemedOneHouseBy155`에 넣는다. 겸용 엔진은 그 판정에 필요한
 * 「먼저 양도」 선언(`isFirstTransferredInMerge`)을 **받지 않았다** — route → 조립 leaf → 엔진까지
 * 새로 이었다. 이 anchor는 그 배선이 끊기면 겸용주택의 합가 중과 배제가 조용히 사라지는 것을 막는다.
 *
 * 먼저 양도는 선언 필수(Q-5) — 단건과 같은 규칙.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

const house = (id: string, acq: string) => ({
  id,
  region: "capital" as const,
  acquisitionDate: acq,
  officialPrice: 800_000_000,
  isInherited: false,
  isLongTermRental: false,
});

/** 조정대상지역 · 세대 **2주택** · 겸용주택 양도 · 1세대(합가 의제 판정 대상). */
const MIXED = {
  transferPrice: 3_000_000_000,
  acquisitionPrice: 700_000_000,
  acquisitionDate: "2014-03-15",
  transferDate: "2026-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: true,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  // 중과 엔진 진입 — `multiHouse`는 `houses`가 있어야 조립된다.
  houses: [house("selling", "2014-03-15"), house("h2", "2015-03-01")],
  sellingHouseId: "selling",
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: "2014-03-15",
    buildingAcquisitionDate: "2014-03-15",
    transferStandardPrice: {
      housingPrice: 1_600_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 12_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 300_000_000,
      commercialBuildingPrice: 50_000_000,
      landPricePerSqm: 2_500_000,
    },
    residencePeriodYears: 0,
    zoneType: "general_residential" as const,
  },
};

interface MixedResult {
  total: { determinedTax: number };
  housingPart: { longTermDeductionAmount: number };
  multiHouseSurcharge?: {
    surchargeApplicable?: boolean;
    surchargeType?: string;
    exclusionReasons?: { type: string; detail: string }[];
  };
}

async function call(over: Record<string, unknown> = {}): Promise<MixedResult> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...MIXED, ...over }),
    }),
  );
  const json = (await res.json()) as { data: { mode: string; result: MixedResult } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(json.data.mode).toBe("mixed-use");
  return json.data.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

const MARRIAGE = { marriageMerge: { marriageDate: "2018-01-01" } };

describe("겸용주택 × 합가 2주택 중과 배제 (§167의10①15호)", () => {
  it("MUM-1 혼인 + 먼저 양도 선언 → 중과 배제가 발동한다", async () => {
    const r = await call({ ...MARRIAGE, isFirstTransferredInMerge: true });
    const reasons = r.multiHouseSurcharge?.exclusionReasons ?? [];
    expect(
      reasons.some((x) => x.type === "marriage_merge"),
      `배제 사유 부재 — ${JSON.stringify(r.multiHouseSurcharge)?.slice(0, 300)}`,
    ).toBe(true);
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(false);
  });

  it("MUM-2 대조군 — 먼저 양도 미선언이면 배제되지 않는다 (Q-5 · 판별력)", async () => {
    const r = await call({ ...MARRIAGE });
    const reasons = r.multiHouseSurcharge?.exclusionReasons ?? [];
    expect(reasons.some((x) => x.type === "marriage_merge")).toBe(false);
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(true);
  });

  it("MUM-3 동거봉양도 같은 정본을 탄다", async () => {
    const r = await call({ parentalCareMerge: { mergeDate: "2018-01-01" }, isFirstTransferredInMerge: true });
    const reasons = r.multiHouseSurcharge?.exclusionReasons ?? [];
    expect(reasons.some((x) => x.type === "parental_care_merge")).toBe(true);
  });

  it("MUM-4 배제가 세액을 실제로 바꾼다 (구별력 0 방지)", async () => {
    const withDecl = await call({ ...MARRIAGE, isFirstTransferredInMerge: true });
    const without = await call({ ...MARRIAGE });
    expect(withDecl.total.determinedTax).toBeLessThan(without.total.determinedTax);
  });
});
