/**
 * anchor — 상세명세서 산출세액·결정세액 자산별 펼침에 일반건물 파트 참고값을 싣지 않는다.
 *
 * 파트별 값은 합산 과세의 참고값이라 합이 합계와 맞지 않는다(실측 시료 369,196,760 ≠ 합계 405,435,000). 신고서 표와 같은 규칙이고 세액은 그대로다.
 * 감면세액·가산세는 합계를 나눈 값이라 파트 행을 남긴다.
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
async function statement(assets: A[], total: string) {
  const f = mk(assets, { contractTotalPrice: total });
  const agg = (await run(f)).aggregated;
  const items = buildStatementItems(aggregateToFilingResult(agg), f, f.assets[0], { properties: agg.properties, aggregated: agg } as never, undefined);
  const values = (key: string) => items.get(key)!.perAsset!.map((x: Body) => x.value);
  return { agg, items, values };
}

describe("상세명세서 — 일반건물 파트 참고값을 자산별로 싣지 않는다", () => {
  it("토지 먼저 + 일반건물 — 토지 행만 남고 합계는 그대로다", async () => {
    const s = await statement([N(), G()], "2500000000");
    expect(s.values("calculatedTax")).toEqual([40_860_000]);
    expect(s.values("determinedTax")).toEqual([40_860_000]);
    expect(s.items.get("calculatedTax")!.value).toBe(s.agg.calculatedTax);
    expect(s.items.get("determinedTax")!.value).toBe(s.agg.determinedTax);
  });
  it("일반건물 먼저도 같다 · 총 납부세액 불변", async () => {
    const a = await statement([N(), G()], "2500000000");
    const b = await statement([G(), N()], "2500000000");
    expect(b.values("calculatedTax")).toEqual(a.values("calculatedTax"));
    expect(b.agg.totalTax).toBe(a.agg.totalTax);
  });
  it("일반건물 단독 — 펼칠 행이 없고 합계만 남는다", async () => {
    const s = await statement([G()], "2000000000");
    expect(s.values("calculatedTax")).toEqual([]);
    expect(s.values("determinedTax")).toEqual([]);
    expect(s.items.get("calculatedTax")!.value).toBe(s.agg.calculatedTax);
  });
  it("일반건물 지분 — `land#1` 지분 카드도 싣지 않는다", async () => {
    const SHARE = { ownershipNumerator: "50", ownershipDenominator: "100" };
    const s = await statement([G(SHARE), G({ ...SHARE, acquisitionDate: "2010-06-01", landAcquisitionDate: "2010-06-01" })], "2000000000");
    expect(s.agg.properties.map((p: Body) => p.propertyId)).toEqual(["land#0", "building#0", "land#1", "building#1"]);
    expect(s.values("calculatedTax")).toEqual([]);
  });
  it("감면세액·가산세·위 단계 행은 파트별로 남는다(대조군)", async () => {
    const s = await statement([N(), G()], "2500000000");
    for (const key of ["reductionTax", "penaltyTax", "transferPrice"]) expect(s.values(key), key).toHaveLength(3);
  });
  it("다건 양도의 일반건물 자산은 예정신고 단위라 싣는다(범위 가드)", async () => {
    const f = mk([G()], { contractTotalPrice: "2000000000" });
    const agg = (await run(f)).aggregated;
    const card = { ...agg.properties[0], propertyId: "prop-1", refCalculatedTax: 7 };
    const items = buildStatementItems(aggregateToFilingResult(agg), f, f.assets[0], { properties: [card], aggregated: agg, propertyFormMap: new Map([["prop-1", f]]) } as never, undefined);
    expect(items.get("calculatedTax")!.perAsset!.map((x: Body) => x.value)).toEqual([7]);
  });
});
