/**
 * anchor — 겸용주택 ⑭: 주택수 제외 축 입력이 route에서 겸용 엔진까지 도달한다 (D4-02)
 *
 * `mixedAsset`은 `data.mixedUse`를 스프레드한 뒤 **폼-전역(top-level) 값을 손으로 열거**해
 * 덧붙이는 구조라, 여기 적지 않으면 그 값이 **조용히 사라진다**(이 파일이 스스로 경고하는 패턴).
 * 엔진 직접호출 anchor(`mixed-use-house-count-exclusion.anchor.test.ts`)는 이 층을 태우지 않는다.
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
import { preloadTaxRates } from "@/lib/db/tax-rates";

/** §99의4 농어촌주택 — 겸용주택(2009 취득)보다 뒤에 취득 ⇒ 취득순서 요건 성립 */
const RURAL = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "2020-05-01",
  ruralHouseStdPrice: 200_000_000,
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};

const MIXED = {
  transferPrice: 1_000_000_000,
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
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 60,
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
    residencePeriodYears: 5,
    zoneType: "general_residential" as const,
    // ④가 폼의 주택 수(2채)로 산정한 값 — 제외가 이걸 뒤집어야 한다
    isOneHouseExempt: false,
  },
};

async function post(over: object = {}) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...MIXED, ...over }),
    }),
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as {
    data: {
      result: {
        warnings: string[];
        new994Detail?: { isEligible: boolean };
        total: { taxBase: number };
      };
    };
  };
  return json.data.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("D4-02 ⑭ — 겸용 route가 주택수 제외 축을 전달한다", () => {
  it("D4-02-R1: §99의4 적격 → 제외 1채 · new994Detail이 결과에 실린다", async () => {
    const r = await post({ reductions: [RURAL] });
    expect(r.new994Detail?.isEligible).toBe(true);
    expect(r.warnings.some((w) => w.includes("주택 수 제외 1채"))).toBe(true);
  });

  it("D4-02-R2 대조군: 감면 미선택이면 제외 0 (구별력)", async () => {
    const r = await post();
    expect(r.new994Detail).toBeUndefined();
    expect(r.warnings.some((w) => w.includes("주택 수 제외"))).toBe(false);
  });

  it("D4-02-R3: 제외가 걸리면 과세표준이 줄어든다 — 표시만 바뀌는 게 아니다", async () => {
    const on = await post({ reductions: [RURAL] });
    const off = await post();
    expect(on.total.taxBase).toBeLessThan(off.total.taxBase);
  });

  it("D4-02-R4 ⑭: 보유 감면주택(모드 2)도 route를 통해 도달한다", async () => {
    const r = await post({
      householdHousingCount: 2,
      specialHouseExclusions: [
        {
          article: "unsold_98_7",
          houseAcquisitionDate: "2012-10-15",
          requirementsConfirmed: true,
        },
      ],
    });
    expect(r.warnings.some((w) => w.includes("주택 수 제외 1채"))).toBe(true);
  });
});
