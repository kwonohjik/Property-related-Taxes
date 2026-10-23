/**
 * 일반건물 건물 파트 이월과세 × 증여자 신축·증축 §114조의2 — 결과 4뷰(카드·상세명세서·신고서·PDF)와 경고 (PR-5a ⑦, 표시 전용 · 세액 불변)
 * 계획서: docs/00-pm/gb-card-built-penalty-114-2.plan.md §7 · V-1
 *
 * ## V-1 실측 (수정 前)
 * 일반건물 결과는 단건 result 가 아니라 `aggregated`(+ 어댑터 `aggregateToFilingResult`)로 4뷰에 간다. 카드(`PropertyCard` → `ValuationDetailCards` →
 * `CarryoverComparisonCard`)와 경고(`aggregated.warnings`)는 건물 카드의 `carryoverTaxationDetail.donorBuiltPenalty` 를 이미 읽지만,
 * 어댑터는 그 detail 을 싣지 않아 `resultDonorBuiltEcho(adapted)` 가 undefined → 상세명세서·신고서·PDF 에는 «증여자 신축» 근거가 없었다
 * (가산세 금액은 일반 «환산취득가액 가산세» 문장으로만 보였다). 어댑터가 카드별 echo 를 `donorBuiltPenaltyEchoes` 로 싣고 세 뷰가 읽게 했다.
 *
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

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { PropertyCard } from "@/components/calc/results/BundledAllocationSubCards";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
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
  buildingAcquisitionCause: "carryover_gift", buildingAcquisitionDate: "2024-05-01",
};
const COMMON = {
  propertyType: "general_building", transferDate: "2026-03-01", transferPrice: 1_000_000_000, acquisitionDate: "2024-05-01", acquisitionPrice: 0, expenses: 0,
  useEstimatedAcquisition: true, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
  isNonBusinessLand: false, isOneHousehold: false, reductions: [], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
};
const ct = (over: object = {}) => ({
  giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: 0, useEstimatedAcquisition: true,
  giftTaxAmount: 0, giftDateValuation: 800_000_000, donorStandardPriceAtAcquisition: 100_000_000, ...over,
});
const DB = { buildingType: "new", constructionDate: "2022-01-10" };

async function agg(ctOver: object = {}, db: object | null = DB): Promise<AggregateTransferResult> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...COMMON, generalBuildingValuation: { ...GB, buildingCarryoverTaxation: { ...ct(ctOver), ...(db ? { donorBuilt: db } : {}) } } }),
  }));
  const json = (await res.json()) as { data?: { aggregated: AggregateTransferResult }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.aggregated;
}

let A: AggregateTransferResult; // A 채택 · 5년 이내
let NB: AggregateTransferResult; // ②3호 B 채택
let OW: AggregateTransferResult; // A 채택이지만 5년 경과
let OFF: AggregateTransferResult; // donorBuilt 미입력

beforeAll(async () => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  A = await agg();
  NB = await agg({ giftDateValuation: 100_000_000 });
  OW = await agg({}, { ...DB, constructionDate: "2020-12-31" });
  OFF = await agg({}, null);
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
const adapt = (a: AggregateTransferResult) => aggregateToFilingResult(a);
const pdfText = (a: AggregateTransferResult) => collect(TransferSection({ r: adapt(a) as unknown as Record<string, unknown> })).join("\n");
const buildingOf = (a: AggregateTransferResult) => a.properties.find((p) => p.propertyId === "building")!;
const buildingOf2 = (a: AggregateTransferResult, id: string) => a.properties.find((p) => p.propertyId === id)!;
const penaltyRow = (a: AggregateTransferResult) =>
  buildAggregateRows(adapt(a), { properties: a.properties, aggregated: a } as never, FORM).find((r) => r.label === "가산세액")!;
const statement = (a: AggregateTransferResult) => text(buildStatementItems(adapt(a), FORM, undefined, undefined, undefined).get("penaltyTax")!.formula);

describe("엔진 echo 전제 (route 실경로)", () => {
  it("A: 12,500,000 · B: 0 · 5년 경과: 0 · 미입력: echo 없음", () => {
    expect(A.penaltyTax).toBe(12_500_000);
    expect(buildingOf(A).carryoverTaxationDetail!.donorBuiltPenalty).toMatchObject({ applied: true, base: 250_000_000, penalty: 12_500_000 });
    expect(NB.penaltyTax).toBe(0);
    expect(buildingOf(NB).carryoverTaxationDetail!.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
    expect(OW.penaltyTax).toBe(0);
    expect(buildingOf(OW).carryoverTaxationDetail!.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "outside_penalty_window" });
    expect(buildingOf(OFF).carryoverTaxationDetail!.donorBuiltPenalty).toBeUndefined();
  });
  it("수집 leaf: 카드별 echo 를 라벨과 함께 모은다 · 미입력은 빈 배열", () => {
    const e = gbResultDonorBuiltEchoes(A.properties);
    expect(e.length).toBe(1);
    expect(e[0].label).toBe(buildingOf(A).propertyLabel);
    expect(e[0].echo.applied).toBe(true);
    expect(gbResultDonorBuiltEchoes(OFF.properties)).toEqual([]);
  });
  it("어댑터가 echo 를 싣는다 — 미입력이면 키 자체가 없다(회귀 0)", () => {
    expect(adapt(A).donorBuiltPenaltyEchoes?.[0].echo.penalty).toBe(12_500_000);
    expect("donorBuiltPenaltyEchoes" in adapt(OFF)).toBe(false);
  });
});

describe("혼합 — 지분 A 는 양도인 본인 신축, 지분 B 는 증여자 신축 (한 결과에 두 가산세)", () => {
  it("상세명세서: 증여자 신축분은 카드별로 밝히고 본인 신축분은 남은 금액으로 둔다 · 합이 총 가산세와 같다", async () => {
    const level = { landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000, zoneType: "general_residential" };
    const sA = { shareId: "a", shareLabel: "60%", ownershipRatio: 0.6, acquisitionDate: "2022-01-10", valuation: { ...level, acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000, buildingAcquisitionCause: "newConstruction", buildingAcquisitionDate: "2022-01-10" } };
    const sB = { shareId: "b", shareLabel: "40%", ownershipRatio: 0.4, acquisitionDate: "2024-05-01", valuation: { ...GB, buildingCarryoverTaxation: { ...ct({ giftDateValuation: 320_000_000 }), donorBuilt: DB } } };
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...COMMON, totalPropertyTransferPrice: 1_000_000_000, acquisitionDate: "2022-01-10", generalBuildingValuation: sA.valuation, generalBuildingShares: [sA, sB] }),
    }));
    const json = (await res.json()) as { data?: { aggregated: AggregateTransferResult }; error?: unknown };
    expect(res.status, JSON.stringify(json.error)).toBe(200);
    const a = json.data!.aggregated;
    const donor = buildingOf2(a, "building#1");
    const own = buildingOf2(a, "building#0");
    expect(donor.penaltyTax).toBe(5_000_000);
    expect(own.penaltyTax).toBeGreaterThan(0);
    expect(a.penaltyTax).toBe((donor.penaltyTax ?? 0) + (own.penaltyTax ?? 0));
    const f = statement(a);
    expect(f).toContain("§114조의2 증여자 신축·증축 환산취득가액 가산세 5,000,000");
    expect(f).toContain(`§114조의2 환산취득가액 가산세 ${(own.penaltyTax ?? 0).toLocaleString()}`); // 본인 신축분 — 남은 금액
  });
});

describe("고지(경고)", () => {
  it("A: 적용 고지 + 확인 필요 / B: 중립 안내 / 5년 경과: 요건 미충족 안내 / 미입력: 흔적 없음", () => {
    expect(A.warnings.join("\n")).toContain(DONOR_BUILT_APPLIED_NOTICE);
    expect(NB.warnings.join("\n")).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    expect(NB.warnings.join("\n")).not.toContain("환산취득가액 가산세를 적용했습니다");
    expect(OW.warnings.join("\n")).toContain(DONOR_BUILT_OUTSIDE_WINDOW_NOTICE);
    expect(OFF.warnings.join("\n")).not.toContain("증여자 신축");
  });
});

describe("① 결과 카드 (PropertyCard → CarryoverComparisonCard)", () => {
  it("A: 증여자 신축 환산취득가액 가산세 + 산식 + 고지", () => {
    const t = render(<PropertyCard breakdown={buildingOf(A)} assetKind="general_building" />).container.textContent ?? "";
    expect(t).toContain("증여자 신축 건물 환산취득가액 가산세");
    expect(t).toContain("가산세 12,500,000 = 250,000,000 × 5%");
    expect(t).toContain("정면 해석례는 확인하지 못했습니다 — 확인 필요");
  });
  it("B: 중립 안내만 · 미입력: 카드 없음", () => {
    const t = render(<PropertyCard breakdown={buildingOf(NB)} assetKind="general_building" />).container.textContent ?? "";
    expect(t).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    cleanup();
    expect(render(<PropertyCard breakdown={buildingOf(OFF)} assetKind="general_building" />).container.textContent ?? "").not.toContain("증여자 신축");
  });
});

describe("② 상세명세서 (어댑터 경유)", () => {
  it("A: 증여자 신축·증축 + 카드 라벨 + 건물 환산취득가액 기준액 · 5년 경과/미입력은 가산세 없음", () => {
    const f = statement(A);
    expect(f).toContain("§114조의2 증여자 신축·증축 환산취득가액 가산세 12,500,000");
    expect(f).toContain(`[${buildingOf(A).propertyLabel}]`);
    expect(f).toContain("가산세 기준액 = 증여자 환산취득가액 250,000,000 (건물)");
    expect(statement(OW)).toContain("가산세 없음");
    expect(statement(OFF)).toContain("가산세 없음");
  });
});

describe("③ 신고서 (합산 표)", () => {
  it("A: 가산세액 합계 칸 = 엔진 합계 + 각주가 증여자 신축 근거를 설명한다 / B·5년 경과·미입력은 각주 없음", () => {
    expect(penaltyRow(A).values.total).toBe(12_500_000);
    expect(penaltyRow(A).roseNotes!.total).toContain("증여자 신축 건물 가산세 12,500,000 (= 건물분 환산취득가액 250,000,000 × 5%)");
    expect(penaltyRow(A).roseNotes!.total).toContain(`[${buildingOf(A).propertyLabel}]`);
    expect(penaltyRow(NB).roseNotes?.total).toBeUndefined();
    expect(penaltyRow(OW).roseNotes?.total).toBeUndefined();
    expect(penaltyRow(OFF).roseNotes?.total).toBeUndefined();
  });
});

describe("④ PDF", () => {
  it("A: 산식 + 고지 / B: 중립 안내 / 5년 경과: 요건 미충족 안내 / 미입력: 문구 없음", () => {
    const a = pdfText(A);
    expect(a).toContain("가산세 12,500,000 = 250,000,000 × 5%");
    expect(a).toContain(DONOR_BUILT_APPLIED_NOTICE);
    expect(pdfText(NB)).toContain(DONOR_BUILT_NOT_APPLIED_CARRYOVER_NOTICE);
    expect(pdfText(OW)).toContain(DONOR_BUILT_OUTSIDE_WINDOW_NOTICE);
    expect(pdfText(OFF)).not.toContain("증여자 신축");
  });
});
