/**
 * anchor — 함께 양도 사이드바 취득가액 = 엔진 표시 echo(필요경비와 같은 축).
 *
 * 안분 행(`allocatedAcquisitionPrice`)은 입력값이라 환산 자산·첫째 자산의 감정·매매사례는 0이다.
 * 그것을 읽어 계산 후에도 취득가액이 「-」로 남았다. ⑧→④→route→사이드바 실제 경로(mock 세율).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });

type A = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any>;
const mk = (assets: A[]) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, contractTotalPrice: "1000000000",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;

async function run(f: TransferFormData) {
  const issue = [0, 1, 2, 3].map((st) => validateStepDetailed(st, f)).find(Boolean) ?? null;
  expect(issue, JSON.stringify(issue)).toBeNull();
  let body: Body = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "bundled", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const json = (await res.json()) as { data?: Body; error?: Body };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data as Body;
}

const LAND = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 5-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", transferType: "regular", acquisitionDate: "2000-06-01",
  actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", fixedAcquisitionPrice: "100,000,000", acquisitionArea: "100", transferArea: "100", standardPriceAtTransfer: "500000000", ...o,
});
const OTHER = LAND({ acquisitionDate: "2015-06-01", fixedAcquisitionPrice: "300,000,000" });
const EST = { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtAcq: "200000000" };
const BLD = { assetKind: "building", landNature: "", acquisitionArea: "", transferArea: "" };
const SHARE = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };
const DEEMED = { acquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1984-06-01" };

/** [이름, 입력, 취득가액, 필요경비, 자리(0 첫째·1 둘째)] */
const GRID: Array<[string, A, number, number, Array<0 | 1>]> = [
  ["환산", EST, 200_000_000, 6_000_000, [0, 1]],
  ["건물 환산", { ...BLD, ...EST }, 200_000_000, 6_000_000, [0, 1]],
  ["건물 환산 + 감가상각비 — 한 번만 공제", { ...BLD, ...EST, depreciationAmount: "10,000,000" }, 190_000_000, 6_000_000, [0, 1]],
  ["지분 1/2 환산", { ...EST, ...SHARE }, 133_333_333, 3_000_000, [0, 1]],
  ["감정", { isAppraisalAcquisition: true, fixedAcquisitionPrice: "150,000,000", standardPriceAtAcq: "100000000" }, 150_000_000, 3_000_000, [0, 1]],
  ["매매사례 — 첫째 자산만 가능", { isSalesCaseAcquisition: true, fixedAcquisitionPrice: "", similarSalesValue: "170,000,000", standardPriceAtAcq: "100000000" }, 170_000_000, 3_000_000, [0]],
  ["의제취득일 전 ① 채택", { ...EST, ...DEEMED, preDeemedActualPrice: "100,000,000", pre1990Enabled: false }, 200_000_000, 6_000_000, [0, 1]],
  ["의제취득일 전 ② 채택", { ...EST, ...DEEMED, preDeemedActualPrice: "300,000,000", pre1990Enabled: false }, 304_234_724, 0, [0, 1]],
  // 대조군 — 종전에도 맞았고 그대로다
  ["실가", {}, 100_000_000, 0, [0, 1]],
  ["건물 실가 + 감가상각비 — 한 번만 공제", { ...BLD, depreciationAmount: "10,000,000" }, 90_000_000, 0, [0, 1]],
  ["지분 1/2 실가", { ...SHARE }, 50_000_000, 0, [0, 1]],
  ["환산 + 자본적지출 §97②2호 단서 — 취득가액 0", { ...EST, directExpenses: "450,000,000", capitalExpenditure: "450,000,000" }, 0, 450_000_000, [0, 1]],
  ["증여", { acquisitionCause: "gift", fixedAcquisitionPrice: "190,000,000", acquisitionDate: "2010-01-01" }, 190_000_000, 0, [0, 1]],
];

describe("함께 양도 계산 후 사이드바 — 취득가액·필요경비가 신고서 echo와 같다", () => {
  for (const [name, o, acq, exp, positions] of GRID) for (const pos of positions) {
    it(`${name} · ${pos === 0 ? "첫째" : "둘째"} 자산`, async () => {
      const me = LAND(o);
      const f = mk(pos === 0 ? [me, OTHER] : [OTHER, me]);
      const d = await run(f);
      const side = computeTransferPerAssetSummary(f, d as never).rows[pos];
      const echo = d.aggregated.properties[pos] as Body;
      expect(side.acqPrice).toBe(acq);
      expect(side.expense).toBe(exp);
      expect(side.acqPending).toBe(false);
      expect(side.acqPrice).toBe(echo.acquisitionPrice);
      expect(side.expense).toBe(echo.necessaryExpense);
      // 양도가액 − 취득가액 − 필요경비 = 양도차익
      expect(side.salePrice - side.acqPrice - side.expense).toBe(echo.transferGain);
    });
  }

  const HOUSE: A = { addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", transferType: "regular", acquisitionDate: "2015-06-01", actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", fixedAcquisitionPrice: "300,000,000", standardPriceAtTransfer: "500000000", buildingFootprintArea: "100", appurtenantLandZone: "metropolitan_residential" };
  const EXCESS = { landNature: "appurtenant", acquisitionArea: "1000", transferArea: "1000" };
  const GB = (o: A = {}): A => ({
    addressJibun: "서울 강남구 테스트동 3-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", transferType: "regular", acquisitionDate: "2000-06-01", landAcquisitionDate: "2000-06-01",
    actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", standardPriceAtTransfer: "500000000", fixedAcquisitionPrice: "200,000,000", gbLandArea: "205", gbBuildingArea: "200", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", ...o,
  });
  const MIXED = (o: A = {}): A => ({
    addressJibun: "서울 강남구 테스트동 4-1", assetKind: "housing", isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedUseTotalLandArea: "200", buildingFootprintArea: "100", acquisitionCause: "purchase", transferType: "regular", acquisitionDate: "2015-06-01",
    actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", standardPriceAtTransfer: "500000000", fixedAcquisitionPrice: "700,000,000", mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true, ...o,
  });
  const EST_ONLY = { useEstimatedAcquisition: true, fixedAcquisitionPrice: "" };
  /** [이름, 자산들, 자리, 카드 수, 취득가액, 필요경비] — 한 자산이 카드로 갈라지면 카드 합 */
  const CARDS: Array<[string, A[], 0 | 1, number, number, number]> = [
    ["배율 초과 부수토지 환산", [HOUSE, LAND({ ...EXCESS, ...EST })], 1, 2, 200_000_000, 12_000_000],
    ["배율 초과 부수토지 실가(대조군)", [HOUSE, LAND(EXCESS)], 1, 2, 100_000_000, 0],
    ["일반건물 환산 · 둘째", [OTHER, GB(EST_ONLY)], 1, 2, 250_000_000, 10_650_000],
    ["일반건물 환산 · 첫째", [GB(EST_ONLY), OTHER], 0, 2, 250_000_000, 10_650_000],
    ["일반건물 실가 · 둘째(대조군)", [OTHER, GB()], 1, 2, 200_000_000, 0],
    ["겸용주택 환산 · 둘째", [OTHER, MIXED(EST_ONLY)], 1, 4, 250_000_000, 18_000_000],
    ["겸용주택 환산 · 첫째", [MIXED(EST_ONLY), OTHER], 0, 4, 250_000_000, 18_000_000],
  ];
  for (const [name, assets, pos, n, acq, exp] of CARDS) {
    it(name, async () => {
      const f = mk(assets);
      const d = await run(f);
      const id = pos === 0 ? "primary" : f.assets[1].assetId;
      const cards = (d.aggregated.properties as Body[]).filter((p) => String(p.propertyId).includes(id));
      const side = computeTransferPerAssetSummary(f, d as never).rows[pos];
      expect(cards.length).toBe(n);
      expect(side.acqPrice).toBe(acq);
      expect(side.expense).toBe(exp);
      expect(side.acqPrice).toBe(cards.reduce((t, p) => t + p.acquisitionPrice, 0));
      expect(side.expense).toBe(cards.reduce((t, p) => t + p.necessaryExpense, 0));
    });
  }

  /** 합성 결과 — route 없이 분기만 본다 */
  const synth = (asset: A, properties: Body[], rows: Body[] = []) => {
    const f = mk([OTHER, asset]);
    const id = f.assets[1].assetId;
    const toId = (x: string) => x.replace("$", id);
    const result = {
      mode: "bundled",
      apportionment: { apportioned: [
        { assetId: "primary", allocatedSalePrice: 500_000_000, allocatedAcquisitionPrice: 300_000_000, allocatedExpenses: 0, saleMode: "actual" },
        { assetId: id, allocatedSalePrice: 500_000_000, allocatedAcquisitionPrice: 100_000_000, allocatedExpenses: 1_000_000, saleMode: "actual" },
        ...rows.map((r) => ({ allocatedExpenses: 0, saleMode: "actual", ...r, assetId: toId(r.assetId) })),
      ] },
      aggregated: { properties: properties.map((p) => ({ transferPrice: 0, ...p, propertyId: toId(p.propertyId) })) },
    };
    return computeTransferPerAssetSummary(f, result as never).rows[1];
  };

  it("엔진 값이 없으면 안분 행 · 감가상각비를 여기서 공제한다", () => {
    const side = synth(LAND({ ...BLD, depreciationAmount: "10,000,000" }), []);
    expect(side.acqPrice).toBe(90_000_000);
    expect(side.expense).toBe(1_000_000);
  });
  it("매입분 꼬리 카드는 카드 합에 넣지 않고 한 번만 더한다", () => {
    const side = synth(LAND(), [
      { propertyId: "land#$", acquisitionPrice: 40_000_000, necessaryExpense: 1_000_000 },
      { propertyId: "land__purchased#$", acquisitionPrice: 7_000_000, necessaryExpense: 700_000 },
      { propertyId: "$__purchased", acquisitionPrice: 5_000_000, necessaryExpense: 500_000 },
    ], [{ assetId: "$__purchased", allocatedSalePrice: 1_000_000, allocatedAcquisitionPrice: 5_000_000 }]);
    expect(side.acqPrice).toBe(45_000_000);
    expect(side.expense).toBe(1_500_000);
  });
  it("남의 카드는 합치지 않는다", () => {
    const side = synth(LAND(), [
      { propertyId: "land#primary", acquisitionPrice: 9_000_000, necessaryExpense: 9_000 },
      { propertyId: "primary__excess", acquisitionPrice: 9_000_000, necessaryExpense: 9_000 },
      { propertyId: "$__excess", acquisitionPrice: 30_000_000, necessaryExpense: 3_000 },
      { propertyId: "building#$", acquisitionPrice: 20_000_000, necessaryExpense: 2_000 },
    ]);
    expect(side.acqPrice).toBe(50_000_000);
    expect(side.expense).toBe(5_000);
  });

  it("계산 전 — 환산은 종전대로 「계산 후 표시」", () => {
    const f = mk([OTHER, LAND(EST)]);
    const side = computeTransferPerAssetSummary(f, null).rows[1];
    expect(side.acqPrice).toBe(0);
    expect(side.acqPending).toBe(true);
  });
});
