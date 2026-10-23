/**
 * 일반건물 부담부증여 × 이월과세 × 증여자 신축·증축 §114조의2 — 결과 4뷰(카드·상세명세서·신고서·PDF)와 경고 (PR-5c ⑦, 표시 전용 · 세액 불변)
 * 계획서: docs/00-pm/gb-card-built-penalty-114-2.plan.md §3.4·§7
 *
 * 부담부증여 일반건물은 카드(자산)마다 이월과세 detail 이 없고(F27 은 신고단위 A/B 비교) 근거 echo 가 `aggregated.donorBuiltPenalty` 하나로 온다.
 * 5a 가 만든 수집 leaf(`gbResultDonorBuiltEchoes`)·어댑터 echo(`donorBuiltPenaltyEchoes`)에 이 echo 를 얹어 상세명세서·신고서·PDF 가 같은 정본을 읽게 했다.
 * 실제 route(POST) 응답 JSON 을 그대로 4뷰에 먹인다 — 화면이 받는 모양과 같다.
 */
import { describe, it, expect, afterEach, vi, beforeAll } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { BundledAllocationCard, aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";
import { gbResultDonorBuiltEchoes } from "@/lib/tax-engine/gb-result-donor-built-echoes";
import {
  DONOR_BUILT_APPLIED_NOTICE,
  DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE,
  DONOR_BUILT_OUTSIDE_WINDOW_NOTICE,
} from "@/lib/tax-engine/transfer-tax-carryover-donor-display";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";

afterEach(cleanup);

const GB = {
  landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential", acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000,
  actualPriceMode: true, buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2024-05-01", landAcquisitionDate: "2024-05-01",
};
const COMMON = {
  propertyType: "general_building", transferDate: "2026-03-01", transferPrice: 1_000_000_000, acquisitionDate: "2024-05-01", acquisitionPrice: 0, expenses: 0,
  useEstimatedAcquisition: false, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
  isNonBusinessLand: false, isOneHousehold: false, reductions: [], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
  transferType: "burdened_gift", acquisitionCause: "carryover_gift",
};
const CT = (over: object = {}) => ({
  giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: 0, useEstimatedAcquisition: false,
  giftTaxAmount: 0, giftDateValuation: 1_000_000_000, donorRelation: "lineal", ...over,
});
const DB = { buildingType: "new", constructionDate: "2022-01-10" };
const INFO = (basis: object = {}) => ({
  valuationMode: "sangjeungbeop_market", acquisitionMethod: "converted", marketValueAtTransfer: 1_000_000_000,
  lendingDepositTotal: 0, mortgageDebtAmount: 500_000_000, annualRentTotal: 0, mortgageSetAmount: 500_000_000,
  landStdPriceAtTransfer: 200_000_000, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 100_000_000,
  donorRelation: "lineal_descendant",
  carryoverDonorBasis: { landStdPriceAtAcquisition: 10_000_000, buildingStdPriceAtAcquisition: 40_000_000, ...basis },
});

interface Route { aggregated: AggregateTransferResult; apportionment: never; breakdown: never }
async function route(basis: object = {}, db: object | null = DB, ctOver: object = {}): Promise<Route> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...COMMON, carryoverTaxation: CT(ctOver), generalBuildingValuation: GB, burdenedGiftInfo: INFO({ ...(db ? { donorBuilt: db } : {}), ...basis }) }),
  }));
  const json = (await res.json()) as { data?: { aggregated: AggregateTransferResult; apportionment: never; transferBurdenedGiftBreakdown: never }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return { aggregated: json.data!.aggregated, apportionment: json.data!.apportionment, breakdown: json.data!.transferBurdenedGiftBreakdown };
}

let A: Route; // A 채택 · 5년 이내
let NB: Route; // ②3호 B 채택
let OW: Route; // A 채택이지만 5년 경과
let EX: Route; // 이월과세 배제(수용 2년)
let OFF: Route; // donorBuilt 미입력

beforeAll(async () => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  A = await route();
  NB = await route({ landStdPriceAtAcquisition: 60_000_000, buildingStdPriceAtAcquisition: 80_000_000 });
  OW = await route({}, { ...DB, constructionDate: "2020-12-31" });
  EX = await route({}, DB, { exclusionDeclared: { expropriationWithin2Years: true } });
  OFF = await route({}, null);
});

const FORM = createDefaultTransferFormData();
const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collect((el.props as { children?: unknown } | undefined)?.children, out);
  return out;
}
const adapt = (r: Route) => aggregateToFilingResult(r.aggregated);
const pdfText = (r: Route) => collect(TransferSection({ r: adapt(r) as unknown as Record<string, unknown> })).join("\n");
const buildingOf = (r: Route) => r.aggregated.properties.find((p) => p.propertyId === "building")!;
const penaltyRow = (r: Route) =>
  buildAggregateRows(adapt(r), { properties: r.aggregated.properties, aggregated: r.aggregated } as never, FORM).find((row) => row.label === "가산세액")!;
const statement = (r: Route) => text(buildStatementItems(adapt(r), FORM, undefined, undefined, undefined).get("penaltyTax")!.formula);
const cardView = (r: Route) =>
  render(<BundledAllocationCard apportionment={r.apportionment} aggregated={r.aggregated} transferBurdenedGiftBreakdown={r.breakdown} formData={FORM} />).container;

describe("엔진 echo 전제 (route 실경로)", () => {
  it("A: 2,500,000 · B 채택/이월과세 배제/5년 경과: 0 · 미입력: echo 없음", () => {
    expect(A.aggregated.penaltyTax).toBe(2_500_000);
    expect(A.aggregated.donorBuiltPenalty).toMatchObject({ applied: true, base: 50_000_000, penalty: 2_500_000, burdenedGift: { method: "estimated" } });
    expect(NB.aggregated.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
    expect(EX.aggregated.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "carryover_excluded" });
    expect(OW.aggregated.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "outside_penalty_window" });
    for (const r of [NB, EX, OW]) expect(r.aggregated.penaltyTax).toBe(0);
    expect(OFF.aggregated.donorBuiltPenalty).toBeUndefined();
  });
  it("수집 leaf: 집계 echo 를 건물 카드 라벨과 함께 모은다 · 카드 detail 경로와 합쳐도 중복하지 않는다 · 미입력은 빈 배열", () => {
    const e = gbResultDonorBuiltEchoes(A.aggregated.properties, A.aggregated.donorBuiltPenalty);
    expect(e.length).toBe(1);
    expect(e[0].label).toBe(buildingOf(A).propertyLabel);
    expect(e[0].echo.applied).toBe(true);
    expect(gbResultDonorBuiltEchoes(OFF.aggregated.properties, OFF.aggregated.donorBuiltPenalty)).toEqual([]);
  });
  it("어댑터가 echo 를 싣는다 — 미입력이면 키 자체가 없다(회귀 0)", () => {
    expect(adapt(A).donorBuiltPenaltyEchoes?.[0].echo.penalty).toBe(2_500_000);
    expect("donorBuiltPenaltyEchoes" in adapt(OFF)).toBe(false);
  });
});

describe("고지(경고) — 증여자 문구만 · 양도인 본인 신축 문구가 섞이지 않는다", () => {
  it("A: 적용 고지 + 확인 필요 / B·이월과세 배제: 중립 안내 / 5년 경과: 요건 미충족 안내 / 미입력: 흔적 없음", () => {
    expect(A.aggregated.warnings).toContain(DONOR_BUILT_APPLIED_NOTICE);
    expect(A.aggregated.warnings.join("\n")).not.toContain("양도인 본인이 신축한 건물");
    expect(NB.aggregated.warnings).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    expect(EX.aggregated.warnings).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    expect(OW.aggregated.warnings).toContain(DONOR_BUILT_OUTSIDE_WINDOW_NOTICE);
    expect(OFF.aggregated.warnings.join("\n")).not.toContain("증여자 신축");
  });
});

describe("① 결과 카드 (BundledAllocationCard)", () => {
  it("A: 증여자 신축 건물 환산취득가액 가산세 카드 + 산식 + 고지", () => {
    const c = cardView(A);
    const card = c.querySelector('[data-testid="donor-built-penalty-card"]');
    expect(card?.getAttribute("data-applied")).toBe("true");
    const t = card?.textContent ?? "";
    expect(t).toContain("가산세 2,500,000 = 50,000,000 × 5%");
    expect(t).toContain("정면 해석례는 확인하지 못했습니다 — 확인 필요");
  });
  it("B 채택: 중립 안내 카드만 · 미입력: 카드 없음", () => {
    const t = cardView(NB).querySelector('[data-testid="donor-built-penalty-card"]');
    expect(t?.getAttribute("data-applied")).toBe("false");
    expect(t?.textContent).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    cleanup();
    expect(cardView(OFF).querySelector('[data-testid="donor-built-penalty-card"]')).toBeNull();
  });
});

describe("② 상세명세서 (어댑터 경유)", () => {
  it("A: 증여자 신축·증축 + 카드 라벨 + 건물분 기준액 · 5년 경과/미입력은 가산세 없음", () => {
    const f = statement(A);
    expect(f).toContain("§114조의2 증여자 신축·증축 환산취득가액 가산세 2,500,000");
    expect(f).toContain(`[${buildingOf(A).propertyLabel}]`);
    expect(f).toContain("가산세 기준액 = 당초 증여자 건물 환산취득가액 중 채무비율 안분 후 금액 50,000,000");
    expect(statement(OW)).toContain("가산세 없음");
    expect(statement(OFF)).toContain("가산세 없음");
  });
});

describe("③ 신고서 (합산 표)", () => {
  it("A: 가산세액 합계 칸 = 엔진 합계 + 각주가 증여자 신축 근거를 설명한다 / B·배제·5년 경과·미입력은 각주 없음", () => {
    expect(penaltyRow(A).values.total).toBe(2_500_000);
    expect(penaltyRow(A).roseNotes!.total).toContain("증여자 신축 건물 가산세 2,500,000 (= 채무비율 안분 후 건물 환산취득가액 50,000,000 × 5%)");
    expect(penaltyRow(A).roseNotes!.total).toContain(`[${buildingOf(A).propertyLabel}]`);
    for (const r of [NB, EX, OW, OFF]) expect(penaltyRow(r).roseNotes?.total).toBeUndefined();
  });
});

describe("④ PDF", () => {
  it("A: 산식 + 고지 / B·배제: 중립 안내 / 5년 경과: 요건 미충족 안내 / 미입력: 문구 없음", () => {
    const a = pdfText(A);
    expect(a).toContain("가산세 2,500,000 = 50,000,000 × 5%");
    expect(a).toContain(DONOR_BUILT_APPLIED_NOTICE);
    expect(pdfText(NB)).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    expect(pdfText(EX)).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    expect(pdfText(OW)).toContain(DONOR_BUILT_OUTSIDE_WINDOW_NOTICE);
    expect(pdfText(OFF)).not.toContain("증여자 신축");
  });
});
