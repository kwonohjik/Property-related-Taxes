/**
 * anchor — **겸용 경로도 조특법 §99의4 D5 합가 맥락을 일반 경로와 같게 넘긴다** (재검증 S14a-13 · X1-5 축, PR5b).
 *
 * 일반 경로(`transfer-tax-house-exclusion-step.ts`의 `new994MergeOrderOf`)는 합가일 + 명부(`mergeOrigin`)를
 * `resolveHouseCountExclusion`의 `mergeOrder`로 넘겨, §99의4 「일반주택 취득 후 농어촌주택 취득」 순서를 합가 상대 세대
 * 기준으로 본다. 겸용 경로는 같은 함수를 `mergeOrder: undefined`로 불러 순서 판정이 경로마다 갈렸다 —
 * 같은 세대 사실에서 일반은 isEligible=true·세액 0, 겸용은 isEligible=false(ACQUISITION_ORDER)·과세표준 401,596,001.
 * 「조세특례제한법」 §99의4①은 일반주택의 형태(겸용 여부)를 제한하지 않는다.
 *
 * ⚠️ 혼인·동거봉양 합가일이 둘 다 있을 때 어느 쪽을 따르는지는 `new994MergeOrderOf`가 혼인 우선으로 정하고 있다(확인 필요 —
 *    종전 동작 유지). 이 anchor는 그 규칙을 바꾸지 않고 **두 경로가 같은 함수를 쓴다**는 것만 고정한다.
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

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine()));

const RURAL = {
  type: "new_99_4_rural",
  houseId: "rural",
  ruralHouseAcquisitionDate: "2012-05-01",
  ruralHouseStdPrice: 100_000_000,
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};
const H = (id: string, acquisitionDate: string, over: object = {}) => ({
  id,
  region: "capital",
  acquisitionDate,
  officialPrice: 300_000_000,
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...over,
});
/** 혼인합가 상대 세대의 일반주택(2010) + §99의4 농어촌주택(2012-05-01)이 양도 주택(2015)보다 먼저 취득된 3주택 세대. */
const COMMON = {
  transferPrice: 1_000_000_000,
  transferDate: "2024-03-01",
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2015-03-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 3,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 60,
  marriageMerge: { marriageDate: "2020-06-15" },
  isFirstTransferredInMerge: true,
  sellingHouseId: "selling",
  houses: [
    H("selling", "2015-03-01", { mergeOrigin: "seller_side" }),
    H("gen", "2010-01-01", { mergeOrigin: "counterpart_side" }),
    H("rural", "2012-05-01", { region: "non_capital", mergeOrigin: "counterpart_side" }),
  ],
  reductions: [RURAL],
};
const MIXED_USE = {
  isMixedUseHouse: true as const,
  residentialFloorArea: 60,
  nonResidentialFloorArea: 40,
  buildingFootprintArea: 50,
  totalLandArea: 100,
  landAcquisitionDate: "2015-03-01",
  buildingAcquisitionDate: "2015-03-01",
  transferStandardPrice: { housingPrice: 300_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
  acquisitionStandardPrice: { housingPrice: 150_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 1_000_000 },
  residencePeriodYears: 5,
  zoneType: "general_residential" as const,
  // ④가 세대 주택 수 2 초과일 때 싣는 값 — 「일반 비과세 아님」
  isOneHouseExempt: false,
};

async function post(body: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.result;
}
const general = (over: Record<string, unknown> = {}) => post({ ...COMMON, ...over, propertyType: "housing" });
const mixed = (over: Record<string, unknown> = {}) =>
  post(withIdentityStdInBody({ ...COMMON, ...over, propertyType: "mixed-use-house", mixedUse: MIXED_USE }));

describe("S14a-13 / X1-5 — 겸용 경로의 §99의4 D5 합가 맥락", () => {
  it("혼인합가 상대 세대 기준이면 §99의4 취득 순서가 충족 — 일반·겸용 모두 isEligible=true", async () => {
    const g = await general();
    expect(g.new994Detail.isEligible, "대조: 일반 경로").toBe(true);
    expect(g.isExempt).toBe(true);
    const m = await mixed();
    expect(m.new994Detail.isEligible).toBe(true);
    // 주택 수 3 → §99의4로 2 → §155⑤ 혼인합가 의제로 1세대1주택 — 겸용 주택분도 비과세
    expect(m.housingPart.isExempt).toBe(true);
  });

  it("대조 — 합가가 없으면 순서가 충족되지 않는다(일반·겸용 같은 결론)", async () => {
    const over = { marriageMerge: undefined, isFirstTransferredInMerge: undefined };
    const g = await general(over);
    expect(g.new994Detail.isEligible).toBe(false);
    const m = await mixed(over);
    expect(m.new994Detail.isEligible).toBe(false);
  });

  it("대조 — 동거봉양 합가일도 같은 함수(`new994MergeOrderOf`)를 탄다", async () => {
    const over = { marriageMerge: undefined, parentalCareMerge: { mergeDate: "2020-06-15", parentAge: "over_60" as const } };
    const g = await general(over);
    const m = await mixed(over);
    expect(m.new994Detail.isEligible).toBe(g.new994Detail.isEligible);
    expect(m.new994Detail.isEligible).toBe(true);
  });
});
