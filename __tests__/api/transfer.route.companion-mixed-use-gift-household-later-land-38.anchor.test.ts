/**
 * 결정 #38 후속 anchor — 증여받은 겸용주택(증여자와 계속 같은 세대 · 세대 보유 시작일 2000)에서 **주택보다 나중에 취득한 부수토지**는
 * 세대 통산을 받지 않는다(「소득세법 시행령」 §154① — 그 토지를 취득한 날부터 센다). 두 경로가 같은 답을 내야 한다:
 *
 * - 단건 겸용(5-a-2 — 컴패니언 없음): 겸용 엔진 `laterLandExemptExcluded`(실제 취득일 비교) → 토지분 비과세 제외 + 경고.
 * - 파트 카드(주 자산이 겸용인 함께 양도 묶음): 카드마다 단건 엔진이 §154①을 판정한다. 카드는 primary의 `giftHouseholdBasis`를 물려받아
 *   종전엔 토지 카드 기산도 2000이 되어 비과세됐다(이 PR이 겸용에 사실을 싣기 시작하면서 새로 열린 조합).
 *
 * route 경유(⑧ → ④ → ⑫ → ⑭). 양도 2024-06-01 · 건물 증여 2023-09-01 · 토지 2023-10-01(보유 8개월).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
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
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
type Form = ReturnType<typeof createDefaultTransferFormData>;
beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()); });
const issues = (f: Form) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));
async function run(f: Form) {
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ data: {} }), { status: 200 }); }));
  try { await callTransferTaxAPI(f).catch(() => undefined); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
}
const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50",
  mixedUseTotalLandArea: "600", mixedZoneType: "general_residential", mixedTransferHousingPrice: "900000000", mixedTransferCommercialBuildingPrice: "300000000",
  mixedTransferLandPricePerSqm: "2000000", mixedAcqHousingPrice: "300000000", mixedAcqCommercialBuildingPrice: "100000000", mixedAcqLandPricePerSqm: "1000000",
};
const GIFT_SAME = {
  acquisitionCause: "gift", acquisitionDate: "2023-09-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "400000000",
  donorAcquisitionDate: "2000-01-01", giftDonorRelation: "other", giftSameHousehold: "yes", giftHouseholdHoldingStartDate: "2000-01-01",
};
const LATER_LAND = {
  landAcquisitionDate: "2023-10-01", hasSeperateLandAcquisitionDate: true, mixedAcqLandPricePerSqmAtBuildingAcq: "1500000",
  landAcquisitionPrice: "250000000", buildingAcquisitionPrice: "150000000",
};
function form(over: Record<string, unknown>, withCompanion: boolean): Form {
  const prim = { ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 2-1", residenceInputMode: "direct", residencePeriods: [],
    standardPriceAtTransfer: "500000000", actualSalePrice: "600000000", ...MIXED, ...GIFT_SAME, ...over };
  const land = { ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", landType: "building_site", isNonBusinessLand: false,
    landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000", standardPriceAtTransfer: "500000000", standardPriceAtAcq: "250000000" };
  return withIdentityHousingBuildingStdOnForm({ ...createDefaultTransferFormData(), assets: withCompanion ? [prim, land] : [prim], transferDate: "2024-06-01",
    filingDate: "2024-08-31", contractTotalPrice: "1200000000", householdHousingCount: "1", isOneHousehold: true, householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0" } as unknown as Form);
}
const LATER_WARN = "주택보다 나중에 취득한 부수토지는 그 토지를 취득한 날부터 보유기간을 계산해";

async function single(over: Record<string, unknown>) {
  const f = form(over, false);
  expect(issues(f)).toEqual([]);
  const r = await run(f);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  return r.json.data.result as { housingPart: { laterLandExemptExcluded?: true }; warnings: string[] };
}
async function bundled(over: Record<string, unknown>) {
  const f = form(over, true);
  expect(issues(f)).toEqual([]);
  const r = await run(f);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  const props = r.json.data.aggregated.properties as { propertyId: string; isExempt: boolean }[];
  const exempt = (id: string) => props.find((p) => p.propertyId === `${id}#primary`)?.isExempt;
  return { houseLand: exempt("mu-house-land"), houseBld: exempt("mu-house-bld"), commLand: exempt("mu-comm-land"), commBld: exempt("mu-comm-bld") };
}

describe("증여 세대 통산 × 나중 취득 부수토지 — 단건 겸용과 파트 카드가 같은 답", () => {
  it("[ML-1] 토지 2023-10(건물 증여 2023-09 뒤) · 같은 세대 2000 — 단건: 토지분 비과세 제외 · 파트 카드: 토지 카드 과세(건물 카드는 통산 비과세)", async () => {
    const s = await single(LATER_LAND);
    expect(s.housingPart.laterLandExemptExcluded).toBe(true);
    expect(s.warnings.some((w) => w.includes(LATER_WARN))).toBe(true);

    const b = await bundled(LATER_LAND);
    expect(b.houseLand).toBe(false);
    expect(b.houseBld).toBe(true);
    // §154③ 본문으로 주택이 된 상가 — 토지분은 나중 토지라 제외, 건물분은 통산 비과세(단건 `exemptCommercialPartAsHouse`와 같다).
    expect(b.commLand).toBe(false);
    expect(b.commBld).toBe(true);
  }, 60_000);

  it("[ML-2] 대조: 토지·건물 같은 날 증여 — 단건: 토지 제외 없음 · 파트 카드: 토지 카드도 통산 비과세", async () => {
    const s = await single({});
    expect(s.housingPart.laterLandExemptExcluded).toBeUndefined();
    expect(s.warnings.some((w) => w.includes(LATER_WARN))).toBe(false);

    const b = await bundled({});
    expect(b).toEqual({ houseLand: true, houseBld: true, commLand: true, commBld: true });
  }, 60_000);
});
