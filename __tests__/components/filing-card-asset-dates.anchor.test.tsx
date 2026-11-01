/**
 * anchor — 함께 양도·지분에서 카드로 갈라진 자산(일반건물·겸용)의 신고서·명세서 취득일·보유기간.
 *
 * 카드 id(`land#${자산id}`)에서 폼 자산을 찾지 못해 신고서는 「-」, 명세서는 첫째 자산 값을 냈다. 표시만 틀리고 세액은 맞았다.
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
import { buildRows, type RowDef, type ColumnMode } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
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
const DATE = "취득일자";
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
const SHARE = { ownershipNumerator: "50", ownershipDenominator: "100" };

/** 카드 접미사를 지운 열 이름 → [신고서 취득일, 신고서 보유기간, 명세서 취득일, 명세서 보유기간] */
async function datesOf(assets: A[], total: string, extra: A = {}) {
  const f = mk(assets, { contractTotalPrice: total, ...extra });
  const agg = (await run(f)).aggregated;
  const meta = { properties: agg.properties, aggregated: agg };
  const res = aggregateToFilingResult(agg);
  const rows = buildRows(res, "aggregate", f, f.assets[0], undefined, undefined, undefined, meta as never);
  const items = buildStatementItems(res, f, f.assets[0], meta as never, undefined);
  return { ids: agg.properties.map((p: Body) => p.propertyId) as string[], tax: agg.totalTax as number, form: row(rows, DATE).values, hold: row(rows, "보유기간").values, stmt: items.get("acquisitionDate")!.perAsset!.map((x: Body) => x.value), stmtHold: items.get("holdingPeriod")!.perAsset!.map((x: Body) => x.value) };
}

describe("카드로 갈라진 자산 — 신고서·명세서 취득일·보유기간이 그 자산의 값이다", () => {
  it("토지 먼저 + 일반건물 — 「-」·첫째 자산 날짜가 아니다", async () => {
    const d = await datesOf([N(), G()], "2500000000");
    for (const id of d.ids.slice(1)) { expect(d.form[id]).toBe("2000-06-01"); expect(d.hold[id]).toBe("25년 8월"); }
    expect(d.form[d.ids[0]]).toBe("2015-06-01");
    expect(d.stmt).toEqual(["2015-06-01", "2000-06-01", "2000-06-01"]);
    expect(d.stmtHold).toEqual(["10년 8월", "25년 8월", "25년 8월"]);
  });
  it("일반건물 단독 — 접미사 없는 카드는 그 자산의 날짜(대조군)", async () => {
    const f = mk([G({ landAcquisitionDate: "1995-06-01", hasSeperateLandAcquisitionDate: true, landAcquisitionPrice: "200,000,000", buildingAcquisitionPrice: "300,000,000" })], { contractTotalPrice: "2000000000" });
    const agg = (await run(f)).aggregated;
    const rows = buildRows(aggregateToFilingResult(agg), "aggregate", f, f.assets[0], undefined, undefined, undefined, { properties: agg.properties, aggregated: agg } as never);
    expect(agg.properties.map((p: Body) => p.propertyId)).toEqual(["land", "building"]);
    expect(row(rows, DATE).values.land).toBe("1995-06-01");
    expect(row(rows, DATE).values.building).toBe("2000-06-01");
  });
  it("입력 순서만 바꾸면 날짜·세액이 같다", async () => {
    const a = await datesOf([N(), G()], "2500000000");
    const b = await datesOf([G(), N()], "2500000000");
    expect(b.tax).toBe(a.tax);
    expect(b.stmt).toEqual(["2000-06-01", "2000-06-01", "2015-06-01"]);
  });
  it("일반건물 둘 — 둘째가 첫째 날짜를 빌리지 않는다", async () => {
    const d = await datesOf([G(), G({ acquisitionDate: "2010-06-01", landAcquisitionDate: "2010-06-01", addressJibun: "서울 강남구 테스트동 8-1" })], "4000000000");
    expect(d.stmt).toEqual(["2000-06-01", "2000-06-01", "2010-06-01", "2010-06-01"]);
    expect(d.ids.map((i) => d.form[i])).toEqual(["2000-06-01", "2000-06-01", "2010-06-01", "2010-06-01"]);
    expect(d.ids.map((i) => d.hold[i])).toEqual(["25년 8월", "25년 8월", "15년 8월", "15년 8월"]);
  });
  it("토지·건물 취득일이 다른 일반건물 둘째 — 카드마다 자기 파트 날짜", async () => {
    const d = await datesOf([N(), G({ landAcquisitionDate: "1995-06-01", hasSeperateLandAcquisitionDate: true, landAcquisitionPrice: "200,000,000", buildingAcquisitionPrice: "300,000,000" })], "2500000000");
    expect(d.stmt).toEqual(["2015-06-01", "1995-06-01", "2000-06-01"]);
    expect(d.form[d.ids[1]]).toBe("1995-06-01");
    expect(d.form[d.ids[2]]).toBe("2000-06-01");
  });
  it("일반건물 지분 — 명세서도 신고서처럼 지분마다 자기 날짜", async () => {
    const d = await datesOf([G(SHARE), G({ ...SHARE, acquisitionDate: "2010-06-01", landAcquisitionDate: "2010-06-01" })], "2000000000", { assetSplitMode: "fractional", bundledSaleMode: "actual" });
    expect(d.stmt).toEqual(["2000-06-01", "2000-06-01", "2010-06-01", "2010-06-01"]);
    expect(d.ids.map((i) => d.form[i])).toEqual(d.stmt);
  });
  it.each([["둘째", 1], ["첫째", 0]] as const)("겸용주택 %s — 파트 카드 4장 모두 그 자산의 날짜", async (_n, pos) => {
    const d = await datesOf(pos === 1 ? [N(), MU()] : [MU(), N()], "1000000000");
    const cards = d.ids.filter((i) => i.startsWith("mu-"));
    expect(cards.length).toBe(4);
    for (const id of cards) { expect(d.form[id]).toBe("2010-03-15"); expect(d.hold[id]).toBe("15년 11월"); }
  });

  const SEP = { isMixedUseHouse: true, assetKind: "housing", acquisitionDate: "2010-03-15", landAcquisitionDate: "1995-01-01", hasSeperateLandAcquisitionDate: true } as never;
  it.each([["mu-house-land#x", "1995-01-01"], ["mu-comm-land#x", "1995-01-01"], ["mu-nbl#x", "1995-01-01"], ["mu-house-bld#x", "2010-03-15"], ["mu-comm-bld#x", "2010-03-15"]])("겸용 별개 취득 — %s = %s", (pid, date) => {
    expect(getAcqDateForCard(SEP, pid)).toBe(date);
  });
  it("겸용 토지 날짜가 비면 건물 날짜(④와 같은 식)", () => {
    expect(getAcqDateForCard({ ...(SEP as object), landAcquisitionDate: "" } as never, "mu-house-land#x")).toBe("2010-03-15");
  });
  it("겸용 토지·건물 날짜가 다른 둘째 자산 — 화면 경로에서도 카드마다 자기 파트 날짜", async () => {
    const d = await datesOf([N(), MU({ landAcquisitionDate: "1995-01-01", hasSeperateLandAcquisitionDate: true, landAcquisitionPrice: "200,000,000", buildingAcquisitionPrice: "300,000,000" })], "1000000000");
    const of = (b: string) => d.form[d.ids.find((i) => i.startsWith(b))!];
    expect(of("mu-house-land")).toBe("1995-01-01");
    expect(of("mu-comm-land")).toBe("1995-01-01");
    expect(of("mu-house-bld")).toBe("2010-03-15");
    expect(of("mu-comm-bld")).toBe("2010-03-15");
  });
  it("겸용이 아닌 자산은 카드 이름과 무관", () => {
    expect(getAcqDateForCard({ ...(SEP as object), isMixedUseHouse: false } as never, "mu-house-land#x")).toBe("2010-03-15");
  });
});
