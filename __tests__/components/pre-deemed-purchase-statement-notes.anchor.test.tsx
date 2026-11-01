/**
 * anchor — 의제취득일 전 «매수» 영 §176조의2④ 신고서 양식·상세명세서 표시 (V-6)
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §14
 *
 * 취득일 칸은 의제취득일 + 실제 취득일 주석(사용자 결정) · 취득가액 칸은 채택값 + ①·② 주석.
 * 시료: 1984.6. 실가 1억 → ② 101,411,574 (mock 세율 · ⑧→④→route→표시 빌더).
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
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
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
const PRICE = "취득가액";
const LAND = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 5-1", assetKind: "land", acquisitionCause: "purchase", transferType: "regular", acquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1984-06-01",
  actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", fixedAcquisitionPrice: "100,000,000", acquisitionArea: "100", transferArea: "100", ...o,
});
/** 1985 토지 환산 — 1990.1.1. 등급 칸(㎡당 2,000,000 × 100㎡ = 2억) · 양도시 5억 → ① 2억 */
const EST: A = { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtAcq: "200000000", standardPriceAtTransfer: "500000000", pre1990Enabled: false };
const single = async (a: A, mode: ColumnMode = "single") => {
  const f = mk([a], { contractTotalPrice: "500000000" });
  const r = (await run(f)).result ?? (await run(f));
  return { r, rows: buildRows(r, mode, f, f.assets[0]), items: buildStatementItems(r, f, f.assets[0], undefined, undefined) };
};
const textOf = (n: unknown): string => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return textOf((n as { props?: { children?: unknown } }).props?.children);
};

describe("단건 — 취득일 칸 의제일 + 실제 취득일 주석 · 취득가액 칸 채택값 + 주석", () => {
  it("실가 ② 채택", async () => {
    const { rows, items } = await single(LAND());
    expect(String(row(rows, DATE).values.total)).toContain("1985");
    expect(row(rows, DATE).notes?.total).toContain("실제 취득일 1984-06-01");
    expect(row(rows, PRICE).values.total).toBe(101_411_574);
    expect(row(rows, PRICE).notes?.total).toContain("② 채택: 실지거래가액 100,000,000 + 생산자물가상승분 1,411,574 = 101,411,574 (① 미산정)");
    expect(textOf(items.get("acquisitionDate")?.formula)).toContain("실제 취득일 1984-06-01");
    expect(textOf(items.get("acquisitionPrice")?.formula)).not.toContain("실제 거래가액");
    expect(textOf(items.get("acquisitionPrice")?.formula)).toContain("101,411,574");
    expect(items.get("acquisitionPrice")?.note).toContain("② 채택");
  });
  it("환산 + 실가 3억 ② 채택 — ① 값도 밝힌다", async () => {
    const { rows } = await single(LAND({ ...EST, preDeemedActualPrice: "300,000,000" }));
    expect(row(rows, PRICE).values.total).toBe(304_234_724);
    expect(row(rows, PRICE).notes?.total).toContain("(① 200,000,000)");
  });
  it("환산 + 실가 1억 ① 채택 — 칸은 ① · ② 값을 밝힌다", async () => {
    const { rows } = await single(LAND({ ...EST, preDeemedActualPrice: "100,000,000" }));
    expect(row(rows, PRICE).values.total).toBe(200_000_000);
    expect(row(rows, PRICE).notes?.total).toContain("① 채택: 의제취득일 현재 200,000,000");
    expect(row(rows, PRICE).notes?.total).toContain("= 101,411,574");
  });
  it("비교 없는 자산 — 주석 없음", async () => {
    const { rows, items } = await single(LAND({ acquisitionDate: "1995-01-01", preDeemedOriginalAcquisitionDate: "" }));
    expect(row(rows, DATE).notes).toBeUndefined();
    expect(row(rows, PRICE).notes).toBeUndefined();
    expect(textOf(items.get("acquisitionPrice")?.formula)).toContain("실제 거래가액");
    expect(textOf(items.get("acquisitionDate")?.formula)).toContain("사용자 입력");
  });
});

describe("함께 양도 — 채택값이 표시 칸에 닿는다(입력값 1억 아님)", () => {
  it("둘째 자산 실가 ② · 필요경비에 차액을 밀어 넣지 않는다 · 취득일 자기 값", async () => {
    const f = mk([LAND({ acquisitionDate: "2015-06-01", preDeemedOriginalAcquisitionDate: "", fixedAcquisitionPrice: "300,000,000", actualSalePrice: "500,000,000", standardPriceAtTransfer: "500000000" }), LAND({ actualSalePrice: "500,000,000", standardPriceAtTransfer: "500000000" })], { contractTotalPrice: "1000000000" });
    const d = await run(f);
    const agg = d.aggregated;
    const p = agg.properties[1];
    expect(p.acquisitionPrice).toBe(101_411_574);
    expect(p.necessaryExpense).toBe(0);
    // 사이드바도 같은 echo를 읽는다 — 차액이 필요경비로 또 나오지 않는다
    const side = computeTransferPerAssetSummary(f, d as never).rows[1];
    expect(side.acqPrice).toBe(101_411_574);
    expect(side.expense).toBe(0);
    const meta = { properties: agg.properties, aggregated: agg };
    const res = aggregateToFilingResult(agg);
    const rows = buildRows(res, "aggregate", f, f.assets[0], undefined, undefined, undefined, meta as never);
    expect(row(rows, PRICE).values[p.propertyId]).toBe(101_411_574);
    expect(row(rows, DATE).notes?.[p.propertyId]).toContain("실제 취득일 1984-06-01");
    expect(row(rows, PRICE).notes?.[p.propertyId]).toContain("② 채택");
    expect(row(rows, DATE).notes?.primary).toBeUndefined();
    const items = buildStatementItems(res, f, f.assets[0], meta as never, undefined);
    const dates = items.get("acquisitionDate")!.perAsset!;
    expect(dates[0].value).toContain("2015");
    expect(dates[1].value).toContain("1985");
    expect(dates[1].formula).toContain("실제 취득일");
    expect(items.get("acquisitionPrice")!.perAsset![1].formula).toContain("② 채택");
  });
});

describe("지분 단건 명세서 — 양도가액은 지분분", () => {
  it("1/2 · 1995 취득 — 신고서 표와 같은 값", async () => {
    const f = mk([LAND({ acquisitionDate: "1995-01-01", preDeemedOriginalAcquisitionDate: "", ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes", fixedAcquisitionPrice: "200,000,000" })], { contractTotalPrice: "500000000" });
    const r = (await run(f)).result;
    const rows = buildRows(r, "single", f, f.assets[0]);
    const items = buildStatementItems(r, f, f.assets[0], undefined, undefined);
    expect(row(rows, "양도가액").values.total).toBe(250_000_000);
    expect(items.get("transferPrice")?.value).toBe(row(rows, "양도가액").values.total);
    expect(items.get("acquisitionPrice")?.value).toBe(row(rows, PRICE).values.total);
  });
});

const HOUSE = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 5-1", assetKind: "housing", acquisitionCause: "purchase", transferType: "regular", hasSeperateLandAcquisitionDate: true, usePreHousingDisclosure: false,
  landAcquisitionDate: "1985-01-01", acquisitionDate: "1990-03-01", preDeemedOriginalLandAcquisitionDate: "1984-06-01",
  actualSalePrice: "1,000,000,000", fixedSalePrice: "1,000,000,000", landTransferPrice: "500,000,000", buildingTransferPrice: "500,000,000", saleSplitMode: "actual",
  landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "100,000,000", buildingAcquisitionPrice: "400,000,000",
  acquisitionArea: "200", transferArea: "200", houseSizeType: "regular", standardPriceAtTransfer: "500000000", landStandardPriceAtTransfer: "250000000", buildingStandardPriceAtTransfer: "250000000", ...o,
});
const GB = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", transferType: "regular",
  acquisitionDate: "1985-01-01", landAcquisitionDate: "1985-01-01", preDeemedOriginalAcquisitionDate: "1984-06-01",
  actualSalePrice: "1,000,000,000", fixedSalePrice: "1,000,000,000", fixedAcquisitionPrice: "500,000,000",
  gbLandArea: "205", gbBuildingArea: "200", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000",
  ...o,
});
const RIGHT = (o: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 7-1", assetKind: "right_to_move_in", redevSubject: "right", redevApprovalLawBasis: "urban_renovation_art_74", redevOriginalAssetType: "land",
  redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01", redevRightsValue: "500000000", redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no",
  isSuccessorRightToMoveIn: false, useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000", redevSettlementAmount: "100000000", redevLandArea: "200",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "purchase", acquisitionDate: "1985-01-01",
  preDeemedOriginalAcquisitionDate: "1984-06-01", ...o,
});

describe("다른 경로", () => {
  it("분리 토지 파트 — 토지 열에 주석 · 건물 열 없음", async () => {
    const f = mk([HOUSE()], { contractTotalPrice: "1000000000" });
    const r = (await run(f)).result;
    const rows = buildRows(r, "split-2col", f, f.assets[0]);
    expect(row(rows, DATE).notes?.land).toContain("실제 취득일 1984-06-01");
    expect(row(rows, DATE).notes?.building).toBeUndefined();
    expect(row(rows, PRICE).notes?.land).toContain("토지 소득세법 시행령 §176조의2 ④ ② 채택");
    expect(row(rows, PRICE).notes?.building).toBeUndefined();
    const items = buildStatementItems(r, f, f.assets[0], undefined, undefined);
    expect(items.get("acquisitionPrice")?.note).toContain("토지");
    expect(textOf(items.get("acquisitionDate")?.formula)).toContain("실제 취득일");
  });
  it("재개발 원조합원 입주권 — 합계 열 주석", async () => {
    const f = mk([RIGHT()], { contractTotalPrice: "1300000000" });
    const r = (await run(f)).result;
    const rows = buildRows(r, "redev-right-pay", f, f.assets[0]);
    expect(row(rows, DATE).notes?.total).toContain("실제 취득일 1984-06-01");
    expect(row(rows, PRICE).notes?.total).toContain("= 101,411,574");
  });
  it("일반건물 일괄 — 토지·건물 카드 열에 주석", async () => {
    const f = mk([GB()], { contractTotalPrice: "1000000000" });
    const d = await run(f);
    const agg = d.aggregated;
    const meta = { properties: agg.properties, aggregated: agg };
    const rows = buildRows(aggregateToFilingResult(agg), "aggregate", f, f.assets[0], undefined, undefined, undefined, meta as never);
    const ids = agg.properties.map((p: Body) => p.propertyId);
    expect(ids.some((id: string) => id.startsWith("land"))).toBe(true);
    for (const id of ids) {
      expect(row(rows, DATE).notes?.[id]).toContain("실제 취득일 1984-06-01");
      expect(row(rows, PRICE).notes?.[id]).toContain("= 507,057,874");
    }
    const items = buildStatementItems(aggregateToFilingResult(agg), f, f.assets[0], meta as never, undefined);
    expect(items.get("acquisitionDate")!.perAsset![0].formula).toContain("실제 취득일");
  });
  it("일반건물 지분 — 지분마다 자기 값", async () => {
    const SHARE = (n: string, o: A = {}) => GB({ ownershipNumerator: n, ownershipDenominator: "100", ...o });
    const f = mk([SHARE("50"), SHARE("50", { preDeemedOriginalAcquisitionDate: "1984-09-01" })], { assetSplitMode: "fractional", bundledSaleMode: "actual", contractTotalPrice: "1000000000" });
    const agg = (await run(f)).aggregated;
    const meta = { properties: agg.properties, aggregated: agg };
    const rows = buildRows(aggregateToFilingResult(agg), "aggregate", f, f.assets[0], undefined, undefined, undefined, meta as never);
    const ids: string[] = agg.properties.map((p: Body) => p.propertyId);
    const of = (suffix: string) => row(rows, DATE).notes?.[ids.find((i) => i.endsWith(suffix))!];
    expect(of("#0")).toContain("1984-06-01");
    expect(of("#1")).toContain("1984-09-01");
  });
  it("일반건물 분리 토지 파트 — 건물 카드 열에는 주석 없음", async () => {
    const f = mk([GB({ hasSeperateLandAcquisitionDate: true, acquisitionDate: "1995-03-01", preDeemedOriginalAcquisitionDate: "", preDeemedOriginalLandAcquisitionDate: "1984-06-01", landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "100,000,000", buildingAcquisitionPrice: "400,000,000", fixedAcquisitionPrice: "" })], { contractTotalPrice: "1000000000" });
    const agg = (await run(f)).aggregated;
    const rows = buildRows(aggregateToFilingResult(agg), "aggregate", f, f.assets[0], undefined, undefined, undefined, { properties: agg.properties, aggregated: agg } as never);
    const ids: string[] = agg.properties.map((p: Body) => p.propertyId);
    expect(row(rows, DATE).notes?.[ids.find((i) => i.startsWith("land"))!]).toContain("1984-06-01");
    expect(row(rows, DATE).notes?.[ids.find((i) => i.startsWith("building"))!]).toBeUndefined();
  });
  it("토지 + 일반건물 함께 양도 — 일반건물 카드 열 주석", async () => {
    const f = mk([LAND({ acquisitionDate: "2015-06-01", preDeemedOriginalAcquisitionDate: "", standardPriceAtTransfer: "500000000", actualSalePrice: "500,000,000" }), GB({ actualSalePrice: "500,000,000", fixedSalePrice: "500,000,000", standardPriceAtTransfer: "500000000" })], { contractTotalPrice: "1000000000" });
    const agg = (await run(f)).aggregated;
    const meta = { properties: agg.properties, aggregated: agg };
    const rows = buildRows(aggregateToFilingResult(agg), "aggregate", f, f.assets[0], undefined, undefined, undefined, meta as never);
    const noted = Object.keys(row(rows, DATE).notes ?? {});
    expect(noted).toEqual(agg.properties.map((p: Body) => p.propertyId).filter((id: string) => id !== "primary"));
    expect(noted.length).toBe(2);
  });
});
