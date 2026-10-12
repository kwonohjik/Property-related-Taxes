/**
 * 겸용주택 × ⑥ 「주택 수 제외(조특법 감면주택)」 → 중과 영 §167의10①10호 (결정 #16 공백).
 *
 * 단건(`runMultiHouseSurchargeStep`)과 **같은 leaf**(`linkTaxIncentiveHouse5ho`)를 겸용 엔진도 부르는가 — 확인된 영 §167의3①5호
 * 조문(§99의2)을 명부 행 id와 함께 ⑥으로만 선언하면(5호 표시 없음) 다른 주택이 5호 주택이라 10호로 중과가 꺼진다.
 * 행 id 없는 선언·3호 조문(§97)은 잇지 않는다. 세율은 mock(`makeMockRatesWithHouseEngine`) · 2026-06-01 양도(한시 유예 종료 후).
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
  householdHousingCount: 2,
  isRegulatedArea: true,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
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

/** h2 = §99의2 신축주택등(2013 최초 매매계약 · 2013-08 취득) */
const HOUSES = [house("selling", "2014-03-15"), house("h2", "2013-08-01")];
const SPECIAL_99_2 = { article: "unsold_99_2", houseContractDate: "2013-06-01", isNationalHousing: false, requirementsConfirmed: true };

describe("겸용주택 × ⑥ 확인된 5호 조문 → 10호", () => {
  it("MX-1 §99의2 ⑥(행 id) → 10호 배제 — 5호 표시와 같은 세액", async () => {
    const linked = await call({ houses: HOUSES, specialHouseExclusions: [{ ...SPECIAL_99_2, houseId: "h2" }] });
    expect(linked.total.determinedTax, "실측 — 연결 전(5호 표시 없음) 1,092,117,027").toBe(740_503_139);
    expect(linked.multiHouseSurcharge?.exclusionReasons?.map((x) => x.type)).toEqual(["only_general_two_house"]);
    expect(linked.multiHouseSurcharge?.surchargeApplicable).toBe(false);
    const chip = await call({
      houses: [HOUSES[0], { ...HOUSES[1], isUnsoldHousing: true }],
      specialHouseExclusions: [{ ...SPECIAL_99_2, houseId: "h2" }],
    });
    expect(linked.total.determinedTax).toBe(chip.total.determinedTax);
  });
  it("MX-2 대조 — 행 id 없는 선언은 잇지 않는다 → 2주택 중과, 세액이 다르다", async () => {
    const unlinked = await call({ houses: HOUSES, specialHouseExclusions: [SPECIAL_99_2] });
    const linked = await call({ houses: HOUSES, specialHouseExclusions: [{ ...SPECIAL_99_2, houseId: "h2" }] });
    expect(unlinked.total.determinedTax).toBe(1_092_117_027);
    expect(unlinked.multiHouseSurcharge?.surchargeApplicable).toBe(true);
    expect(unlinked.total.determinedTax).toBeGreaterThan(linked.total.determinedTax);
  });
  it("MX-3 3호(§97) ⑥은 잇지 않는다 → 중과 + 확인 필요 고지", async () => {
    const r = await call({
      houses: [HOUSES[0], house("h2", "1999-01-01")],
      specialHouseExclusions: [{ article: "rental_97", houseId: "h2", houseRentalStartDate: "1999-06-01", requirementsConfirmed: true }],
    });
    expect(r.total.determinedTax).toBe(1_092_117_027);
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(true);
    expect((r.multiHouseSurcharge?.warnings ?? []).some((w) => w.includes("§167의3①3호") && w.includes("확인이 필요합니다"))).toBe(true);
  });
});
