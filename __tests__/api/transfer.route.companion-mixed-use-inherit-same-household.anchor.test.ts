/**
 * anchor — 함께 양도(컴패니언) 겸용주택 · 동일세대 상속 보유 통산(「소득세법 시행령」 §154⑧3호).
 * 계획서 `docs/00-pm/mixed-use-inherit-same-household-holding.plan.md` V-1.
 *
 * 파트 카드는 카드마다 단건 엔진이 같은 item의 `decedent*`로 §154①을 판정해 주택 카드는 종전에도 통산이 됐다. 그런데 상가 카드의
 * 주택 취급(§154③ 본문)은 겸용 서브엔진 결론을 따르는데, 서브엔진이 통산을 못 해 상가 카드만 과세됐다 — 한 건물 안에서 판정이 갈렸다.
 * 종전(2026-11-04 실측 · mock 세율): 동일세대 104,251,859(상가 토지·건물 카드 과세) / 수정 후 27,329,500(토지 컴패니언분만).
 *
 * 공통: 주 자산 토지(매매 2015-03-01) + 컴패니언 겸용(상속 2022-10-01 · 동거 보유 2015-01-01) · 양도 2023-09-18 · 비조정 · 1세대.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"), shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()); });
async function pipeline(form: TransferFormData) {
  let captured: unknown = null; const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => { captured = JSON.parse(init?.body ?? "{}"); return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) }; }) as unknown as typeof fetch;
  try { await callTransferTaxAPI(form); } catch { /* */ }
  global.fetch = orig;
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(captured), headers: { "content-type": "application/json" } }));
  return { body: captured as Record<string, unknown>, status: res.status, json: (await res.json()) as Record<string, unknown> };
}
const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, regionCode: "4682025021", addressJibun: "경남 테스트군 1-1",
  residentialFloorArea: "100", nonResidentialFloorArea: "60", buildingFootprintArea: "100", mixedUseTotalLandArea: "200",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: false,
  acquisitionCause: "inheritance", acquisitionDate: "2022-10-01", inheritanceStartDate: "2022-10-01", inheritanceAssetKind: "house_individual",
  publishedValueAtInheritance: "600000000", fixedAcquisitionPrice: "600000000", decedentAcquisitionDate: "2015-01-01",
  residenceInputMode: "direct", residencePeriodMonthsAsset: "0", residencePeriods: [],
  actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "500000000",
};
const LAND = {
  assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", useEstimatedAcquisition: false, addressJibun: "경남 테스트군 2-1", regionCode: "4682025021",
  fixedAcquisitionPrice: "100000000", actualSalePrice: "200000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000", landArea: "300", landNature: "standalone",
};
const form = (same: boolean, mixedFirst: boolean) => {
  const m = { ...makeDefaultAsset(mixedFirst ? 1 : 2), ...MIXED, decedentSameHouseholdBeforeInheritance: same, decedentCohabitationHoldingStartDate: same ? "2015-01-01" : "", decedentCohabitationResidenceMonths: same ? "60" : "" };
  const l = { ...makeDefaultAsset(mixedFirst ? 2 : 1), ...LAND };
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(), assets: mixedFirst ? [m, l] : [l, m],
    transferDate: "2023-09-18", filingDate: "2023-12-31", contractTotalPrice: "1200000000", householdHousingCount: "1", isOneHousehold: true, residencePeriodMonths: "0",
    // NH-14 — 첫 자산이 토지이고 함께 양도 주택(겸용)이 있으면 «세대·주택 현황» 칸이 열려 두 확인이 필요하다. 세액은 불변.
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  } as unknown as TransferFormData);
};
type Agg = { totalTax: number; properties: { propertyId: string; isExempt?: boolean }[] };
const run = async (same: boolean) => {
  const f = form(same, false);
  expect([0, 1, 2, 3].flatMap((st) => collectStepIssues(st, f).map((i) => i.message))).toEqual([]);
  const r = await pipeline(f);
  expect(r.status).toBe(200);
  const agg = (r.json as { data: { aggregated: Agg } }).data.aggregated;
  return { total: agg.totalTax, cards: agg.properties.slice(1).map((p) => `${p.propertyId.split("#")[0]}:${p.isExempt}`) };
};
describe("컴패니언 겸용 · 동일세대 상속 — 주택 · 상가 카드가 한 판정을 따른다", () => {
  it("동일세대 → 주택 · 상가 카드 모두 비과세 · 세액은 토지 컴패니언분만", async () => {
    expect(await run(true)).toEqual({
      total: 27_329_500,
      cards: ["mu-house-land:true", "mu-house-bld:true", "mu-comm-land:true", "mu-comm-bld:true"],
    });
  });
  it("🔴 짝: 별도세대 → 통산 없음 · 전 카드 과세(종전과 같다)", async () => {
    expect(await run(false)).toEqual({
      total: 208_837_200,
      cards: ["mu-house-land:false", "mu-house-bld:false", "mu-comm-land:false", "mu-comm-bld:false"],
    });
  });
});
