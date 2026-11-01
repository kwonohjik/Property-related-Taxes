/**
 * anchor — 함께 양도에서 일반건물이 첫째 자산이 아니어도 신고서 세액 행은 합계만 표시한다.
 *
 * 파트 열 판정이 첫째 자산만 보아, 토지 먼저 입력하면 일반건물 토지·건물 열에 세율·산출세액이 파트별로 나왔다.
 * 입력 순서만 다른데 표가 달랐고, 그 값의 합은 합계와 맞지 않는다. 세액은 그대로다.
 * ⑧→④→route→표시 빌더 실제 경로(mock 세율).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/calc/transfer-tax" }));
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
import { buildRows, type RowDef } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });

type A = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any>;
const mk = (assets: A[], extra: A = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm), ...extra,
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
const row = (rows: RowDef[], label: string) => rows.find((r) => r.label === label)!;
const LAND = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 5-1", assetKind: "land", acquisitionCause: "purchase", transferType: "regular", acquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1984-06-01",
  actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", fixedAcquisitionPrice: "100,000,000", acquisitionArea: "100", transferArea: "100", ...o,
});
const GB = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", transferType: "regular",
  acquisitionDate: "1985-01-01", landAcquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1984-06-01",
  actualSalePrice: "1,000,000,000", fixedSalePrice: "1,000,000,000", fixedAcquisitionPrice: "500,000,000",
  gbLandArea: "205", gbBuildingArea: "200", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000",
  ...o,
});
const N = (o: A = {}) => LAND({ landNature: "standalone", acquisitionDate: "2015-06-01", preDeemedOriginalAcquisitionDate: "", fixedAcquisitionPrice: "300,000,000", actualSalePrice: "500,000,000", standardPriceAtTransfer: "500000000", ...o });
const G = (o: A = {}) => GB({ actualSalePrice: "2,000,000,000", fixedSalePrice: "2,000,000,000", standardPriceAtTransfer: "2000000000", acquisitionDate: "2000-06-01", landAcquisitionDate: "2000-06-01", preDeemedOriginalAcquisitionDate: "", ...o });
const MU = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 4-1", assetKind: "housing", isMixedUseHouse: true, mixedUseTotalLandArea: "200", buildingFootprintArea: "100", acquisitionCause: "purchase", transferType: "regular", acquisitionDate: "2010-03-15", actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", standardPriceAtTransfer: "500000000",
  residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000", mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true, fixedAcquisitionPrice: "700,000,000", ...o,
});

const TAX_ROWS = ["세율구분 코드", "세율", "산출세액", "감면세액", "결정세액", "가산세액", "총결정세액"];

async function table(assets: A[], total: string) {
  const f = mk(assets, { contractTotalPrice: total });
  const agg = (await run(f)).aggregated;
  const rows = buildRows(aggregateToFilingResult(agg), "aggregate", f, f.assets[0], undefined, undefined, undefined, { properties: agg.properties, aggregated: agg } as never);
  return { ids: agg.properties.map((p: Body) => p.propertyId) as string[], agg, rows };
}

describe("일반건물 파트 열 — 입력 순서와 관계없이 세액 행은 합계만", () => {
  it("토지 먼저 + 일반건물 — 일반건물 열은 비고 토지 열은 남는다", async () => {
    const { ids, rows, agg } = await table([N(), G()], "2500000000");
    const [land, ...gb] = ids;
    expect(gb.map((id) => id.split("#")[0])).toEqual(["land", "building"]);
    for (const id of gb) for (const label of TAX_ROWS) expect(row(rows, label).values[id] ?? null, `${label} ${id}`).toBeNull();
    expect(row(rows, "세율").values[land]).toBe("38%");
    expect(row(rows, "산출세액").values[land]).toBe(40_860_000);
    expect(row(rows, "산출세액").values.total).toBe(agg.calculatedTax);
    expect(row(rows, "양도가액").values[gb[0]]).toBeGreaterThan(0);
  });
  it("입력 순서만 바꾸면 세액 행 값·총 납부세액이 같다", async () => {
    const a = await table([N(), G()], "2500000000");
    const b = await table([G(), N()], "2500000000");
    expect(b.agg.totalTax).toBe(a.agg.totalTax);
    for (const label of TAX_ROWS) {
      const vals = (t: typeof a) => {
        const v = row(t.rows, label).values;
        return { total: v.total ?? null, land: v[t.ids.find((id) => !id.includes("#"))!] ?? v.primary ?? null };
      };
      expect(vals(b), label).toEqual(vals(a));
    }
  });
  it("일반건물이 먼저여도 뒤 토지 자산의 세액은 남는다(대조군)", async () => {
    const { ids, rows } = await table([G(), N()], "2500000000");
    expect(row(rows, "산출세액").values[ids[0]] ?? null).toBeNull();
    expect(row(rows, "산출세액").values[ids[2]]).toBe(40_860_000);
  });
  it("겸용 먼저 + 일반건물 — 일반건물 열만 비고 겸용 파트 열은 그대로다", async () => {
    const { ids, rows } = await table([MU(), G()], "2500000000");
    const gb = ids.filter((id) => /^(land|building)#/.test(id));
    expect(gb).toHaveLength(2);
    for (const id of gb) expect(row(rows, "세율").values[id] ?? null).toBeNull();
    expect(row(rows, "세율").values[ids[0]]).toBe("6%");
  });
  it("토지 자산의 카드 id가 파트 이름과 같아도 일반건물이 아니면 비우지 않는다", () => {
    const f = mk([N({ assetId: "g1", assetKind: "general_building" }), N({ assetId: "n1" })]);
    const card = (propertyId: string) => ({ propertyId, propertyLabel: propertyId, transferPrice: 1, acquisitionPrice: 0, necessaryExpense: 0, capitalExpenditureForDisplay: 0, transferGain: 1, income: 1, incomeAfterOffset: 1, longTermHoldingDeduction: 0, lossOffsetFromSameGroup: 0, lossOffsetFromOtherGroup: 0, appliedRate: 0.1, refCalculatedTax: 7, refDeterminedTax: 7 });
    const aggregated = { basicDeduction: 0, taxBase: 0, calculatedTax: 9, reductionAmount: 0, determinedTax: 9, penaltyTax: 0, localIncomeTax: 0, priorPaidTax: 0, settlementAdditionalPayable: 0, settlementRefund: 0, priorPaidLocalTax: 0, settlementLocalPayable: 0 };
    const rows = buildRows({} as never, "aggregate", f, f.assets[0], undefined, undefined, undefined, { properties: [card("land#n1"), card("land__purchased#g1")], aggregated } as never);
    expect(row(rows, "산출세액").values["land#n1"]).toBe(7);
    expect(row(rows, "산출세액").values["land__purchased#g1"] ?? null).toBeNull();
  });
  it("다건 양도의 일반건물 자산 열은 예정신고 단위라 세액을 싣는다(범위 가드)", () => {
    const f = mk([G()]);
    const card = { propertyId: "prop-1", propertyLabel: "prop-1", transferPrice: 1, acquisitionPrice: 0, necessaryExpense: 0, capitalExpenditureForDisplay: 0, transferGain: 1, income: 1, incomeAfterOffset: 1, longTermHoldingDeduction: 0, lossOffsetFromSameGroup: 0, lossOffsetFromOtherGroup: 0, appliedRate: 0.1, refCalculatedTax: 7, refDeterminedTax: 7 };
    const aggregated = { basicDeduction: 0, taxBase: 0, calculatedTax: 9, reductionAmount: 0, determinedTax: 9, penaltyTax: 0, localIncomeTax: 0, priorPaidTax: 0, settlementAdditionalPayable: 0, settlementRefund: 0, priorPaidLocalTax: 0, settlementLocalPayable: 0 };
    const rows = buildRows({} as never, "aggregate", f, f.assets[0], undefined, undefined, undefined, { properties: [card], aggregated, propertyFormMap: new Map([["prop-1", f]]) } as never);
    expect(row(rows, "산출세액").values["prop-1"]).toBe(7);
  });
});
