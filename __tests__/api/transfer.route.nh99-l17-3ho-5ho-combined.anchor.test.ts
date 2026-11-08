/**
 * 조특법 §99·§99의3·§99의4 리뷰 L17 — 겸용주택(세대 3주택)에서 3호 미확인 ⑥ 행과 5호 「모름」 행이 함께 있고 둘 다 일반주택에서
 * 빼야 중과가 꺼지는 세대의 확인 필요 고지(`withTaxIncentiveHouseNotices` 합산 재판정). 겸용 엔진도 같은 leaf를 부른다.
 * 세액은 수정 전과 같다(고지만 늘어난다). 단독 선언 두 대조는 이 세대에서 고지가 없다.
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
import { withIdentityStdInBody } from "../tax-engine/_helpers/mixed-use-identity-std";
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

/** 조정대상지역 · 세대 **2주택** · 겸용주택 양도. */
const MIXED = {
  transferPrice: 3_000_000_000,
  acquisitionPrice: 700_000_000,
  acquisitionDate: "2014-03-15",
  transferDate: "2026-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 3,
  isRegulatedArea: true,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  // 중과 엔진 진입 — `multiHouse`는 `houses`가 있어야 조립된다.
  houses: [house("selling", "2014-03-15"), house("h2", "2015-03-01"), house("h3", "2015-03-01")],
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
    warnings?: string[];
  };
}

async function call(over: Record<string, unknown> = {}): Promise<MixedResult> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withIdentityStdInBody({ ...MIXED, ...over })),
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

const HOUSES = [house("selling", "2014-03-15"), house("h2", "1999-01-01"), house("h3", "2001-05-01")];
const RENTAL = { article: "rental_97", houseId: "h2", houseRentalStartDate: "1999-06-01", requirementsConfirmed: true };
const UNKNOWN_5HO = {
  article: "new_99_3",
  houseId: "h3",
  housingKind: "original_purchase",
  houseContractDate: "2001-03-01",
  houseAcquisitionDate: "2001-05-01",
  originalOutsideMetropolitan: "yes",
  originalNationalHousing: "unknown",
  requirementsConfirmed: true,
};
const ws = (r: MixedResult) => r.multiHouseSurcharge?.warnings ?? [];
const kinds = (r: MixedResult) => ({
  rental3ho: ws(r).some((w) => w.includes("§167의3①3호") && w.includes("확인이 필요합니다")),
  five: ws(r).filter((w) => w.startsWith("확인 필요: 주택 수 제외로 선언한 감면주택이") && w.includes("국민주택(모름·미답)")).length,
  combined: ws(r).some((w) => w.startsWith("확인 필요: 위 3호 임대주택 확인과 5호 감면주택 확인은 둘 다")),
});

describe("L17 겸용주택 × 3호 미확인 + 5호 「모름」 합산 재판정", () => {
  it("MX-L17-1 둘이 함께 → 중과 유지 · 3호·5호·보충 고지 · 세액 불변", async () => {
    const none = await call({ houses: HOUSES });
    const both = await call({ houses: HOUSES, specialHouseExclusions: [RENTAL, UNKNOWN_5HO] });
    expect(both.multiHouseSurcharge?.surchargeApplicable).toBe(true);
    expect(both.total.determinedTax, "세액 불변 — 수정 전(고지만 없던 경로)과 같은 실측값").toBe(1_225_449_785);
    expect(kinds(none)).toEqual({ rental3ho: false, five: 0, combined: false });
    expect(kinds(both)).toEqual({ rental3ho: true, five: 1, combined: true });
  });
  it("MX-L17-2 대조 — 단독 선언은 이 세대에서 결론을 못 가르므로 고지 없음", async () => {
    for (const only of [[RENTAL], [UNKNOWN_5HO]]) {
      const r = await call({ houses: HOUSES, specialHouseExclusions: only });
      expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(true);
      expect(kinds(r)).toEqual({ rental3ho: false, five: 0, combined: false });
    }
  });
});
