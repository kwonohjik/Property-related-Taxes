/**
 * D15 — 미등기양도자산 감면 배제(조세특례제한법 §129②) · API 경로 anchor.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §2 · §7.
 *
 * - 겸용주택: route가 `calcMixedUseTransferTax`를 직접 호출해 `calculateTransferTax`를 거치지 않는다
 *   ⇒ 겸용 전용 게이트(`computeMixedUsePostTax`)를 route 수준에서 고정한다.
 * - Q-1: 미등기 + 자경농지 감면(§69)은 모순 입력(소득세법 시행령 §168①3호) — Zod가 거부한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { propertySchema } from "@/lib/api/transfer-tax-schema";

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

const RED_77 = [
  {
    type: "public_expropriation",
    cashCompensation: 800_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: "2024-01-01",
  },
];
const SELF_FARMING = [{ type: "self_farming", farmingYears: 10 }];

const COMMON = {
  transferPrice: 1_500_000_000,
  transferDate: "2024-03-01",
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2009-03-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};

const MIXED = {
  ...COMMON,
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 100,
    landAcquisitionDate: "2009-03-01",
    buildingAcquisitionDate: "2009-03-01",
    transferStandardPrice: {
      housingPrice: 300_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 2_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 150_000_000,
      commercialBuildingPrice: 50_000_000,
      landPricePerSqm: 1_000_000,
    },
    residencePeriodYears: 0,
    zoneType: "general_residential" as const,
  },
};

interface Total {
  reductionAmount: number;
  totalPayable: number;
  ruralSurtax: number;
}

async function post(over: object): Promise<{ total: Total; warnings: string[] }> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...MIXED, ...over }),
    }),
  );
  const json = (await res.json()) as {
    data?: { result: { total: Total; warnings: string[] } };
    error?: unknown;
  };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("D15 겸용주택 — §129② 게이트", () => {
  // 🔁 A1a(보유기간 초일 산입) — 등기 짝의 감면액 5,532,128 → 5,320,430. 2009-03-01 → 2024-03-01이
  //    초일 산입으로 15년(종전 14년)이라 상가분 장특 28% → 30%. 미등기 쪽은 장특 배제라 불변.
  //    산식은 transfer.route.mixed-use-reduction-penalty-f17b.anchor.test.ts MIXED 주석 참조.
  //    anchor: `__tests__/tax-engine/holding-period-first-day-inclusion.anchor.test.ts`.
  it("D15-MU1 미등기 + §77: 감면 0 · 감면 없음과 같은 세액 · §129② 안내 / 등기(긍정 짝) 5,320,430", async () => {
    const u = await post({ isUnregistered: true, reductions: RED_77 });
    const uNone = await post({ isUnregistered: true, reductions: [] });
    expect(u.total.reductionAmount).toBe(0);
    expect(u.total.ruralSurtax).toBe(0);
    expect(u.total.totalPayable).toBe(uNone.total.totalPayable);
    expect(u.warnings.filter((w) => w.includes("조특법 §129②"))).toHaveLength(1);
    expect(uNone.warnings.filter((w) => w.includes("조특법 §129②"))).toHaveLength(0);

    const reg = await post({ isUnregistered: false, reductions: RED_77 });
    expect(reg.total.reductionAmount).toBe(5_320_430);
  });
});

describe("D15-V Q-1 — Zod: 미등기 + 자경농지 감면 거부 (소득세법 시행령 §168①3호)", () => {
  const LAND = { ...COMMON, propertyType: "land" as const, transferPrice: 500_000_000 };
  const issuesAt = (payload: object) => {
    const r = propertySchema.safeParse(payload);
    return r.success ? [] : r.error.issues.filter((i) => i.message.includes("§168①3호")).map((i) => i.path.join("."));
  };

  it("D15-V1 주 자산: 미등기 + self_farming → reductions에서 거부 / 등기면 통과(긍정 짝)", () => {
    expect(issuesAt({ ...LAND, isUnregistered: true, reductions: SELF_FARMING })).toEqual(["reductions"]);
    expect(issuesAt({ ...LAND, isUnregistered: false, reductions: SELF_FARMING })).toEqual([]);
    // 미등기라도 자경이 아니면 거부하지 않는다 — 감면은 엔진이 §129②로 0 처리한다.
    expect(issuesAt({ ...LAND, isUnregistered: true, reductions: RED_77 })).toEqual([]);
  });

  it("D15-V2 컴패니언: 자산 미등기 + self_farming → companionAssets.0.reductions에서 거부 / 등기면 통과", () => {
    const companion = (isUnregistered: boolean) => ({
      ...LAND,
      companionAssets: [
        {
          assetId: "c1",
          assetLabel: "다른 토지",
          assetKind: "land" as const,
          standardPriceAtTransfer: 400_000_000,
          directExpenses: 0,
          acquisitionCause: "purchase" as const,
          acquisitionDate: "2010-01-01",
          fixedAcquisitionPrice: 111_000_000,
          reductions: SELF_FARMING,
          isUnregistered,
          isOneHousehold: false,
        },
      ],
      totalSalePrice: 1_000_000_000,
      standardPriceAtTransferForApportion: 400_000_000,
    });
    expect(issuesAt(companion(true))).toEqual(["companionAssets.0.reductions"]);
    expect(issuesAt(companion(false))).toEqual([]);
  });
});
