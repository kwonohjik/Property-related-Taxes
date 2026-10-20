/**
 * Route(POST) anchor — 겸용 일괄양도 안분 기준(감정가액) + 상가건물 감가상각비 + 건물 귀속 양도비 (Step 4 · ⑫⑭)
 *
 * 계획서: `docs/00-pm/mixed-use-sale-split-basis.plan.md` §4.4 · §10
 * 엔진 직접 호출 anchor(`__tests__/tax-engine/transfer-tax/mixed-use-sale-split-basis.anchor.test.ts`)는 ⑫ Zod를 거치지 않아
 * 신규 필드가 침묵 strip되는지 못 본다 — 여기서 같은 사례가 HTTP 경유로도 52,137,000이 되는지 확인한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

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

function body(extra: Record<string, unknown> = {}) {
  return {
    transferPrice: 200_000_000,
    acquisitionPrice: 120_000_000,
    acquisitionDate: "2023-03-20",
    transferDate: "2026-07-01",
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [] as unknown[],
    annualBasicDeductionUsed: 0,
    residencePeriodMonths: 36,
    propertyType: "mixed-use-house" as const,
    mixedUse: {
      isMixedUseHouse: true as const,
      residentialFloorArea: 30,
      nonResidentialFloorArea: 70,
      buildingFootprintArea: 100,
      totalLandArea: 400,
      landAcquisitionDate: "2020-12-01",
      buildingAcquisitionDate: "2023-03-20",
      transferStandardPrice: { housingPrice: 57_000_000, housingBuildingPrice: 27_000_000, commercialBuildingPrice: 63_000_000, landPricePerSqm: 250_000 },
      acquisitionStandardPrice: {
        housingBuildingPrice: 18_000_000, commercialBuildingPrice: 42_000_000, landPricePerSqm: 100_000, landPricePerSqmAtBuildingAcq: 100_000,
      },
      separateAcquisition: { landMode: "actual", buildingMode: "actual", landAcquisitionPrice: 50_000_000, buildingAcquisitionPrice: 70_000_000 },
      residencePeriodYears: 3,
      isOneHouseExempt: true,
      isMetropolitanArea: false,
      zoneType: "agriculture_forest" as const,
      ...extra,
    },
  };
}

interface Part { landTransferPrice: number; buildingTransferPrice: number; buildingAcqPrice: number; buildingAppraisalDed: number; incomeAmount: number }
interface MixedResult {
  commercialPart: Part;
  housingPart: Part;
  saleSplit?: { basis: string; deemedUnclear?: { deemed: boolean; detail: { exemptionApplied?: string } } };
}

async function post(payload: unknown) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }));
  return { status: res.status, json: (await res.json()) as { data?: { mode: string; result: MixedResult }; error?: unknown } };
}
async function call(payload: unknown): Promise<MixedResult> {
  const { status, json } = await post(payload);
  expect(status, JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(json.data?.mode).toBe("mixed-use");
  return json.data!.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

const FULL = {
  landAppraisalAtTransfer: 150_000_000,
  buildingAppraisalAtTransfer: 100_000_000,
  commercialBuildingDepreciation: 2_250_000,
  buildingDirectTransferExpense: 1_000_000,
};

describe("Route — 겸용 안분 기준·감가상각·건물 귀속 양도비 (⑫ strip 없음 · ⑭ 도달)", () => {
  it("[R-0 대조군] 새 필드 없음 → 현행 기준시가 안분", async () => {
    const r = await call(body());
    expect(r.saleSplit).toBeUndefined();
    expect(r.commercialPart.buildingTransferPrice).toBe(66_315_790);
  });

  it("[R-1] 사례 전체 → 상가 양도소득금액 52,137,000 (네 필드 모두 엔진까지 도달)", async () => {
    const r = await call(body(FULL));
    expect(r.saleSplit?.basis).toBe("appraisal");
    expect(r.commercialPart.buildingTransferPrice).toBe(56_000_000);
    expect(r.commercialPart.landTransferPrice).toBe(84_000_000);
    expect(r.commercialPart.buildingAcqPrice).toBe(46_750_000);
    expect(r.commercialPart.buildingAppraisalDed).toBe(700_000);
    expect(r.commercialPart.incomeAmount).toBe(52_137_000);
  });

  it("[R-2] 계약서 구분가액 + §166⑧ 예외 필드도 도달한다 — 30% 이상 이탈인데 예외로 구분가액 유지", async () => {
    // 건물 20,000,000은 기준시가 안분 94,736,843 대비 79% 이탈 — 예외 필드가 strip되면 의제 발동으로 현행 경로가 된다.
    const r = await call(body({ landTransferPrice: 180_000_000, buildingTransferPrice: 20_000_000, saleSplitExemption: "other_law" }));
    expect(r.saleSplit?.basis).toBe("declared");
    expect(r.saleSplit?.deemedUnclear?.detail.exemptionApplied).toBe("other_law");
    expect(r.commercialPart.landTransferPrice).toBe(126_000_000);
  });

  it("[R-3] 감정가액 한쪽만 → 400 (자동 fallback 금지)", async () => {
    const { status } = await post(body({ landAppraisalAtTransfer: 150_000_000 }));
    expect(status).toBe(400);
  });

  it("[R-5] 계약서 구분가액 합 ≠ 양도가액 → 400 (엔진 throw 500이 아니다 — 동기화 점검 L-4)", async () => {
    const { status, json } = await post(body({ landTransferPrice: 110_000_000, buildingTransferPrice: 80_000_000 }));
    expect(status).toBe(400);
    expect(JSON.stringify(json)).toContain("구분가액 합");
  });

  it("[R-4] 계약서 구분가액 한쪽만 → 400", async () => {
    const { status } = await post(body({ landTransferPrice: 110_000_000 }));
    expect(status).toBe(400);
  });
});
