/**
 * anchor — 동일세대 상속 겸용주택도 조특법 §99의4① 「농어촌주택등 취득 전에 보유하던」 순서를 세대 보유 개시일로 본다(V-4 · 2026-11-11).
 * 계획서 `docs/00-pm/mixed-use-inherit-same-household-holding.plan.md` V-4 · 일반 경로 anchor `__tests__/calc/new-99-4-same-household-inheritance-order.anchor.test.ts`.
 *
 * 일반 경로 `resolveHceGeneralHouseAcquisitionDate`는 동일세대 상속이면 피상속인과 동일세대로 보유하기 시작한 날을 쓴다
 * (기준-2017-법령해석재산-0222 — 「1세대를 기준으로 판단」). 겸용 경로(§99의4 판정 · §155⑳ 구성)는 증여 세대 통산만 봐서,
 * 같은 사실에서 일반 비과세 0 ↔ 겸용 §99의4 불성립·과세 165,514,800이었다(mock). 「조세특례제한법」 §99의4①은 일반주택의 형태를 제한하지 않는다.
 * 시료: 상속 2018-09-01 · 농어촌주택 2012-05-01 · 양도 2024-03-01 · 2주택(양도 주택 + 농어촌).
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
  adjacentArea994: "no" as const,
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



const INH = (start: string, same = true) => ({
  marriageMerge: undefined, isFirstTransferredInMerge: undefined, householdHousingCount: 2, residencePeriodMonths: 0,
  acquisitionCause: "inheritance", acquisitionDate: "2018-09-01", inheritanceStartDate: "2018-09-01", decedentAcquisitionDate: "2000-01-01",
  decedentSameHouseholdBeforeInheritance: same, decedentCohabitationHoldingStartDate: start,
  houses: [H("selling", "2018-09-01"), H("rural", "2012-05-01", { region: "non_capital" })],
});
const MU = { ...MIXED_USE, landAcquisitionDate: "2018-09-01", buildingAcquisitionDate: "2018-09-01", residencePeriodYears: 0 };
const both = async (start: string, same = true) => {
  const over = INH(start, same);
  const g = await post({ ...COMMON, ...over, propertyType: "housing" });
  const m = await post(withIdentityStdInBody({ ...COMMON, ...over, propertyType: "mixed-use-house", mixedUse: MU }));
  return {
    general: { eligible: g.new994Detail?.isEligible, exempt: g.isExempt, tax: g.totalTax },
    mixed: { eligible: m.new994Detail?.isEligible, exempt: m.housingPart?.isExempt, tax: m.total?.totalPayable },
  };
};

describe("V-4 — 동일세대 상속 겸용의 §99의4 순서 = 일반 경로", () => {
  it("동일세대 개시 2005(농어촌 2012 앞) — 일반·겸용 모두 특례 성립 · 비과세 0 (종전 겸용 과세 165,514,800)", async () => {
    expect(await both("2005-03-01")).toEqual({
      general: { eligible: true, exempt: true, tax: 0 },
      mixed: { eligible: true, exempt: true, tax: 0 },
    });
  });

  it.each([
    ["동일세대 개시 2013(농어촌 뒤)", "2013-01-01", true],
    ["별도세대(개시일 입력이 있어도 통산 안 함)", "2005-03-01", false],
  ] as const)("🔴 짝: %s — 일반·겸용 모두 불성립(종전과 같다)", async (_n, start, same) => {
    expect(await both(start, same)).toEqual({
      general: { eligible: false, exempt: false, tax: 250_371_000 },
      mixed: { eligible: false, exempt: false, tax: 165_514_800 },
    });
  });
});
