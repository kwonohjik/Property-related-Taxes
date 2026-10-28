/**
 * anchor — 이월과세 × 당초 증여 채무 부분(매입분) PR-2 **UI 쪽**: 폼 → ④ → ⑧ → ⑫ → route → 엔진 → ⑥ 사이드바 · ⑦ 결과 면.
 * 엔진 설계는 `transfer.route.carryover-debt-parts.anchor.test.ts`가 잠그고, 여기는 UI 설계서(`carryover-gift-debt-purchased-part-parts.ui.design.md`)의 결정을 잠근다.
 *
 *  · UI-1 K-2 격자 — 증여세 칸 3상태 × 토글: ⑧이 통과하면 route가 200이고 채무가 와이어·엔진에 닿는다 (UI 통과 ↔ 서버 차단 모순 없음).
 *  · UI-2 ⑥ 사이드바 — 계산 후 취득가액·필요경비가 엔진 차감과 같다 (토글 OFF 이월과세 일반건물 포함 · Q-UI-8) / 이월과세가 아닌 일반건물은 소스 불변 (V-13).
 *  · UI-3 ⑦ 결과 면 — 상세명세서 조각 산식·한 줄 고지 · 신고서 열 · PDF 어댑터 echo (A 채택일 때만).
 * 세액은 `makeMockRates()` 기준이다.
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { purchasedPartResultEchoes } from "@/lib/tax-engine/result-purchased-part-echoes";
import { gbBlockViewsOf } from "@/components/calc/results/transfer/gb-result-block-views";
import { getAcqDateForCard } from "@/components/calc/results/transfer/FilingFormTableDateHelpers";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const formOf = (assets: unknown[], over: Record<string, unknown> = {}): TransferFormData =>
  ({ ...createDefaultTransferFormData(), assets, transferDate: "2026-03-01", filingDate: "2026-05-31", contractTotalPrice: "1,000,000,000", householdHousingCount: "2", isOneHousehold: false, ...over }) as unknown as TransferFormData;

async function bodyOf(f: TransferFormData): Promise<Body> {
  let captured: Body = {};
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try { await callTransferTaxAPI(f); } catch { /* body 만 필요하다 */ }
  global.fetch = orig;
  return captured;
}
async function post(captured: Body) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...captured, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: TransferAPIResult & { aggregated?: { determinedTax: number; properties: PerPropertyBreakdown[] } }; error?: { message?: string; fieldErrors?: Record<string, string[]> } };
  return { status: res.status, data: json.data, det: (json.data as { aggregated?: { determinedTax: number } } | undefined)?.aggregated?.determinedTax, message: json.error?.message, fieldErrors: Object.keys(json.error?.fieldErrors ?? {}) };
}
const issuesOf = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)) as Array<{ field?: string; message?: string }>;
async function run(f: TransferFormData) { const body = await bodyOf(f); return { body, ...(await post(body)), issues: issuesOf(f).map((i) => i.field ?? "") }; }
const props = (r: { data?: unknown }) => ((r.data as { aggregated?: { properties: PerPropertyBreakdown[] } })?.aggregated?.properties ?? []);
const ids = (r: { data?: unknown }) => props(r).map((p) => p.propertyId);

const gbBase = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building",
    acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2021-03-01",
    useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbZoneType: "general_residential",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", ...over,
  }) as AssetForm;
const co = (o: Record<string, unknown> = {}) =>
  ({ ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "150,000,000", giftDateValuation: "400,000,000",
    giftTaxCalculated: "30,000,000", giftTaxBase: "1,000,000,000", donorRelation: "lineal", donorSameHousehold: "no", giftDebtAssumed: true, giftAssumedDebt: "100,000,000", ...o }) as never;
const landOnly = (o: Record<string, unknown> = {}, a: Partial<AssetForm> = {}) => gbBase({ acquisitionCause: "carryover_gift", carryover: co(o), ...a });
const buildingOnly = (o: Record<string, unknown> = {}, a: Partial<AssetForm> = {}) =>
  gbBase({ gbBuildingAcquisitionCause: "carryover_gift", carryover: { ...CARRYOVER_DEFAULTS }, buildingCarryover: co(o), ...a });

describe("UI-1 ★ K-2 격자 — 증여세 칸 3상태 × 토글 (⑧ 통과 ⇒ 채무가 와이어·엔진에 닿는다)", () => {
  it("산출세액 3천만 · 과세가액 10억 + 토글 ON → 141,690,000 · 꼬리 land__purchased (엔진 anchor와 같은 값)", async () => {
    const f = formOf([landOnly()]);
    const r = await run(f);
    expect(r.issues).toEqual([]);
    expect([r.status, r.det]).toEqual([200, 141_690_000]);
    expect(ids(r)).toEqual(["land", "building", "land__purchased"]);
  });

  it("★ 산출세액 0 · 과세가액 10억 + 토글 ON → ⑧ 통과 · part 모양 + 채무 · 꼬리 카드가 생긴다 (종전: engine 모양이라 채무 침묵 누락)", async () => {
    const f = formOf([landOnly({ giftTaxCalculated: "0" })]);
    const r = await run(f);
    expect(r.issues).toEqual([]);
    expect(r.body.generalBuildingValuation.carryoverGiftEvent).toMatchObject({ giftTaxCalculated: 0, giftTaxBase: 1_000_000_000 });
    expect(r.body.generalBuildingValuation.landCarryoverPart.giftAssumedDebt).toBe(100_000_000);
    expect(r.body.generalBuildingValuation.landCarryoverTaxation).toBeUndefined();
    expect(r.status, r.message).toBe(200);
    expect(ids(r)).toContain("land__purchased");
    // 상당액 0 — 증여분 필요경비에 증여세 상당액이 없다(산출세액 0)
    const gift = props(r).find((p) => p.propertyId === "land")!;
    expect(gift.carryoverTaxationDetail?.scenarioA?.giftTaxAddedToExpense).toBe(0);
  });

  it("산출세액 빈칸 + 토글 ON → ⑧이 막는다(carryover.giftTaxCalculated) — 막지 않으면 engine 모양으로 내려가 채무가 사라진다", async () => {
    const f = formOf([landOnly({ giftTaxCalculated: "" })]);
    const r = await run(f);
    expect(r.issues).toContain("carryover.giftTaxCalculated");
    // 이 본문을 서버에 그대로 보내면 200이지만 채무 꼬리가 없다 — ⑧이 유일한 안전망이다
    expect(r.status).toBe(200);
    expect(ids(r)).not.toContain("land__purchased");
  });

  it("두 칸 비움 + 토글 ON → ⑧이 막는다(carryover.giftTaxBase) / 토글 OFF → 통과(회귀 0)", async () => {
    expect((await run(formOf([landOnly({ giftTaxCalculated: "", giftTaxBase: "" })]))).issues).toContain("carryover.giftTaxBase");
    const off = await run(formOf([landOnly({ giftDebtAssumed: false, giftTaxCalculated: "", giftTaxBase: "" })]));
    expect(off.issues).toEqual([]);
    expect(off.status).toBe(200);
  });

  it("건물만 이월과세 · 산출세액 0 → 건물 파트에 채무 · 꼬리 building__purchased · 앵커는 buildingCarryover.*", async () => {
    const f = formOf([buildingOnly({ giftTaxCalculated: "0" })]);
    const r = await run(f);
    expect(r.issues).toEqual([]);
    expect(r.body.generalBuildingValuation.buildingCarryoverPart.giftAssumedDebt).toBe(100_000_000);
    expect(ids(r)).toContain("building__purchased");
    expect((await run(formOf([buildingOnly({ giftTaxCalculated: "" })]))).issues).toContain("buildingCarryover.giftTaxCalculated");
  });
});

describe("UI-2 ⑥ 사이드바 — 계산 후 취득가액·필요경비 = 엔진이 차감한 값", () => {
  const sum = (r: { data?: unknown }, k: "acquisitionPrice" | "necessaryExpense") => props(r).reduce((s, p) => s + p[k], 0);
  const sidebar = (f: TransferFormData, r: { data?: unknown }) => computeTransferPerAssetSummary(f, r.data as TransferAPIResult).rows[0];

  it("★ 토지만 이월과세 · 토글 ON → 취득가액 462,500,000 · 필요경비 12,750,000 (엔진 차감 합 · 꼬리 포함)", async () => {
    const f = formOf([landOnly()]);
    const r = await run(f);
    expect([sum(r, "acquisitionPrice"), sum(r, "necessaryExpense")]).toEqual([462_500_000, 12_750_000]);
    const row = sidebar(f, r);
    expect([row.salePrice, row.acqPrice, row.expense, row.acqPending, row.expensePending]).toEqual([1_000_000_000, 462_500_000, 12_750_000, false, false]);
  });

  it("★ 토글 OFF인 이월과세 일반건물도 엔진 차감과 같다 — 종전: 취득가액 5억 · 필요경비 600만 (Q-UI-8)", async () => {
    const f = formOf([landOnly({ giftDebtAssumed: false })]);
    const r = await run(f);
    expect([r.status, r.det]).toEqual([200, 156_620_000]);
    expect([sum(r, "acquisitionPrice"), sum(r, "necessaryExpense")]).toEqual([400_000_000, 15_000_000]);
    const row = sidebar(f, r);
    expect([row.acqPrice, row.expense]).toEqual([400_000_000, 15_000_000]);
  });

  it.each([
    ["건물만 이월과세 · 채무", formOf([buildingOnly()])],
    ["둘 다 이월과세 · 채무", formOf([gbBase({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: co(), buildingCarryover: co() })])],
    ["r = 1(채무 = 평가액)", formOf([landOnly({ giftAssumedDebt: "400,000,000", donorCapitalExpenditure: "" })])],
  ])("%s → 사이드바 = Σ aggregated.properties", async (_n, f) => {
    const r = await run(f);
    expect(r.issues).toEqual([]);
    expect(r.status, r.message).toBe(200);
    const row = sidebar(f, r);
    expect([row.acqPrice, row.expense]).toEqual([sum(r, "acquisitionPrice"), sum(r, "necessaryExpense")]);
  });

  /** V-13 — 이월과세가 아닌 일반건물은 소스가 바뀌지 않는다: 안분 행(`apportioned`) 합 그대로. */
  it.each([
    ["환산 단건", formOf([gbBase()])],
    ["실가 일괄", formOf([gbBase({ useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual", fixedAcquisitionPrice: "300,000,000" } as never)])],
    ["환산 · 자본적지출(§97②2호 swap)", formOf([gbBase({ capitalExpenditure: "150,000,000", transferExpense: "5,000,000" })])],
    ["실가 일괄 · 감가상각비(§97③)", formOf([gbBase({ useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual", fixedAcquisitionPrice: "300,000,000", depreciationAmount: "20,000,000" } as never)])],
    ["환산 · 지분 50%", formOf([gbBase({ ownershipNumerator: "50", ownershipDenominator: "100" })])],
  ])("이월과세 아님 — %s: 사이드바 = 안분 행 합(종전 소스)", async (_n, f) => {
    const r = await run(f);
    expect(r.status, r.message).toBe(200);
    const apportioned = (r.data as { apportionment: { apportioned: Array<{ allocatedAcquisitionPrice: number; allocatedExpenses: number }> } }).apportionment.apportioned;
    const row = sidebar(f, r);
    expect(row.acqPrice).toBe(apportioned.reduce((s, p) => s + p.allocatedAcquisitionPrice, 0));
    expect(row.expense).toBe(apportioned.reduce((s, p) => s + p.allocatedExpenses, 0));
  });
});

describe("UI-3 ⑦ 결과 면 — 상세명세서·신고서·PDF 어댑터", () => {
  async function results(f: TransferFormData) {
    const r = await run(f);
    const agg = (r.data as { aggregated: Parameters<typeof aggregateToFilingResult>[0] }).aggregated;
    const meta = { properties: agg.properties, aggregated: agg } as never;
    const result = aggregateToFilingResult(agg);
    return { r, agg, meta, result, items: buildStatementItems(result, f, undefined, meta, undefined) };
  }

  it("★ A 채택 + 채무 → 증여분·매입분 행 산식이 echo 값과 같다 · 한 줄 고지(T1) · 어댑터 echo", async () => {
    const f = formOf([landOnly()]);
    const { items, result, agg } = await results(f);
    const tr = items.get("transferPrice")!.perAsset!;
    expect(tr.find((x) => x.label.includes("(증여분)"))).toMatchObject({ value: 375_000_000 });
    expect(tr.find((x) => x.label.includes("(증여분)"))!.formula).toContain("= 375,000,000");
    expect(tr.find((x) => x.label.includes("(매입분)"))!.formula).toBe("매입분 양도가액 = 양도가액 500,000,000 − 증여분 양도가액 375,000,000 = 125,000,000");
    const acq = items.get("acquisitionPrice")!;
    expect(acq.perAsset!.find((x) => x.label.includes("(매입분)"))!.formula).toContain("매입분 취득가액 = 당초 증여 때 인수한 채무 100,000,000");
    expect(acq.perAsset!.find((x) => x.label.includes("(증여분)"))!.formula).toContain("당초 증여자 취득가액 150,000,000 ×");
    expect(acq.note).toContain("양도로 보는 부분(매입분)으로 나누어 계산했습니다");
    expect(result.purchasedPartEchoes).toHaveLength(1);
    expect(purchasedPartResultEchoes(agg.properties)).toHaveLength(1);
  });

  it("채무 없음(토글 OFF) → 고지·echo 없음 (T0) · 건물 카드 산식은 종전 그대로", async () => {
    const { items, result } = await results(formOf([landOnly({ giftDebtAssumed: false })]));
    expect(items.get("acquisitionPrice")!.note).toBeUndefined();
    expect(result.purchasedPartEchoes).toBeUndefined();
    expect(items.get("transferPrice")!.perAsset!.map((x) => x.formula)).not.toContain(undefined);
  });

  it("★ 신고서 집계 열 — 꼬리 열(land__purchased)도 폼 자산 메타·열 날짜를 받는다 (증여분 = 증여자 취득일 · 매입분 = 증여 등기접수일)", async () => {
    const f = formOf([landOnly()]);
    const { meta } = await results(f);
    const rows = buildAggregateRows({} as never, meta, f);
    const row = (label: string) => rows.find((x) => x.label.trim() === label)!.values;
    expect(row("취득일자")).toMatchObject({ land: "2005-06-15", building: "2021-03-01", land__purchased: "2021-03-01" });
    expect(row("취득가액")).toMatchObject({ land: 112_500_000, land__purchased: 100_000_000, total: 462_500_000 });
  });

  it("★ 신고서 집계 — 꼬리 열은 일반건물 계산 파트 열이다: 세율·산출세액 칸을 증여분 열과 같이 비운다 (독립 신고 단위처럼 세액을 따로 보이지 않는다)", async () => {
    const f = formOf([landOnly()]);
    const { meta } = await results(f);
    const rows = buildAggregateRows({} as never, meta, f);
    const row = (label: string) => rows.find((x) => x.label.trim() === label)!.values;
    for (const label of ["산출세액", "세율"]) {
      expect(row(label).land__purchased, label).toEqual(row(label).land);
      expect(row(label).land__purchased ?? null, label).toBeNull();
    }
  });

  it("getAcqDateForCard — 꼬리 카드는 부모 카드의 파트 취득일 (토지 꼬리 = 토지 취득일 · 건물 꼬리 = 건물 취득일)", () => {
    const a = gbBase({ acquisitionDate: "2021-03-01", landAcquisitionDate: "2015-01-01", hasSeperateLandAcquisitionDate: true } as never);
    expect(getAcqDateForCard(a, "land")).toBe("2015-01-01");
    expect(getAcqDateForCard(a, "land__purchased")).toBe("2015-01-01");
    expect(getAcqDateForCard(a, "building__purchased")).toBe("2021-03-01");
    expect(getAcqDateForCard(a, "land__purchased#1")).toBe("2015-01-01");
  });

  it("★ 지분 40% × 채무 — 파트 취득가액 블록이 꼬리를 합친다 (증여분 9천만 + 매입분 6천만 = 1.5억)", async () => {
    const share = (id: string, num: string, over: Partial<AssetForm> = {}) => gbBase({ assetId: id, ownershipNumerator: num, ownershipDenominator: "100", acquisitionDate: "2009-03-01", ...over });
    const shareB = share("share-b", "40", { acquisitionDate: "2021-03-01", acquisitionCause: "carryover_gift",
      carryover: co({ donorAcquisitionPrice: "300,000,000", donorCapitalExpenditure: "40,000,000", giftDateValuation: "600,000,000", giftTaxCalculated: "80,000,000", giftTaxBase: "1,200,000,000", giftAssumedDebt: "150,000,000" }) });
    const f = formOf([share("share-a", "60"), shareB]);
    const r = await run(f);
    expect(r.status, r.message).toBe(200);
    expect(ids(r)).toContain("land__purchased#1");
    const d = r.data as unknown as { aggregated: AggregateTransferResult; apportionment: never };
    const views = gbBlockViewsOf(d.aggregated, d.apportionment, f);
    const shareView = views[0].shares!.find((s) => s.key === "1")!;
    const gift = props(r).find((p) => p.propertyId === "land#1")!.acquisitionPrice;
    const tail = props(r).find((p) => p.propertyId === "land__purchased#1")!.acquisitionPrice;
    expect([gift, tail]).toEqual([90_000_000, 60_000_000]);
    expect(shareView.partAcquisitionPrice("land")).toBe(150_000_000);
    // 꼬리 없는 지분 A는 그대로
    expect(views[0].shares!.find((s) => s.key === "0")!.partAcquisitionPrice("land")).toBe(props(r).find((p) => p.propertyId === "land#0")!.acquisitionPrice);
  });
});
