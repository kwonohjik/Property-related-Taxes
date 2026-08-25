/**
 * anchor: ⑭ route → 겸용 엔진 **원시 플래그 전달** (2026-08-25)
 *
 * 계획서: `docs/00-pm/transfer-mixed-use-surcharge-fallback.plan.md` §3.4
 *
 * 🔴 **엔진 anchor로는 이 배관을 못 잡는다.** `mixed-use-surcharge-fallback.anchor.test.ts`는
 *    `calcMixedUseTransferTax`에 `surchargeFallback`을 **직접 주입**하므로, route가 그 필드를
 *    안 만들어도 초록이다. ⑫⑬⑭는 TypeScript도 못 잡아 **침묵 stripping**된다
 *    (memory `feedback_api_zod_schema_sync` · `feedback_leaf_anchor_skips_zod_layer`).
 *
 * ⇒ 여기서는 **body만 주고** 세액이 실제로 움직이는지 본다.
 *
 * 종전: 겸용주택은 `houses[]`가 없으면 `mixedAsset.multiHouse`가 조립되지 않아 중과가
 *       통째로 미적용됐다(실브라우저 실측 505,484,136원 과소).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

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

/** 조정대상지역 · 세대 2주택 · 양도 2026-06-01(유예 종료 후) · **houses 미전송** */
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
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
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
  total: { transferTax: number; determinedTax: number; surchargeAddon?: number };
  housingPart: { longTermDeductionAmount: number };
  multiHouseSurcharge?: { surchargeType: string };
  warnings: string[];
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
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  expect(json.data.mode).toBe("mixed-use");
  return json.data.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

describe("⑭ 겸용주택 중과 fallback — route 배관", () => {
  it("MP-R1: 🔴 `houses` 미전송이어도 중과가 걸린다 (route가 원시 플래그를 넘긴다)", async () => {
    const r = await call();
    // 정밀 판정은 없다 — fallback 경로임을 먼저 고정한다.
    expect(r.multiHouseSurcharge).toBeUndefined();
    expect(r.total.surchargeAddon).toBe(0.2); // §104⑦1호 +20%p
    expect(r.housingPart.longTermDeductionAmount).toBe(0); // §95② 배제
    expect(r.warnings.some((w) => /세대 보유 주택 목록이 입력되지 않아/.test(w))).toBe(true);
  });

  it("MP-R2: 🔑 대조 — 비조정지역이면 그대로다 (게이트를 통째로 연 것이 아니다)", async () => {
    const r = await call({ isRegulatedArea: false });
    expect(r.total.surchargeAddon).toBeUndefined();
    expect(r.housingPart.longTermDeductionAmount).toBeGreaterThan(0);
    expect(r.warnings.some((w) => /세대 보유 주택 목록이 입력되지 않아/.test(w))).toBe(false);
  });

  it("MP-R3: 🔑 대조 — 1주택이면 그대로다 (주택 수에 겸용주택 자신이 포함된다)", async () => {
    const r = await call({ householdHousingCount: 1 });
    expect(r.total.surchargeAddon).toBeUndefined();
    expect(r.housingPart.longTermDeductionAmount).toBeGreaterThan(0);
  });

  it("MP-R4: 3주택이면 +30%p — 유형 구분이 route를 지나서도 산다", async () => {
    expect((await call({ householdHousingCount: 3 })).total.surchargeAddon).toBe(0.3);
  });

  it("MP-R5: 🔑 세액이 실제로 움직인다 — 배관이 끊기면 이 차이가 0이 된다", async () => {
    const surcharged = await call();
    const plain = await call({ isRegulatedArea: false });
    expect(surcharged.total.determinedTax).toBeGreaterThan(plain.total.determinedTax);
  });
});
