/**
 * anchor — 이월과세 × 당초 증여 채무 매입분 조각: **매입분 카드의 필요경비 산식** (종전: 이월과세 상세가 없는 카드라 산식 `undefined` — 값만 표시).
 *
 * 매입분은 취득가액이 인수한 채무(실지거래가액)라 「소득세법」 제97조제2항제1호 — 필요경비는 본인 자본적지출(제97조제1항제2호) + 양도비(제3호)뿐이고 개산공제는 없다.
 * 카드 값 그대로 가른다(`capitalExpenditureForDisplay` = 매입분 카드가 싣는 자본적지출 몫). 증여분 카드는 이월과세 A 산식, 증여분이 없는(r = 1) 매입분은 부모 카드(A 카드)가 그린다 — 그쪽은 바뀌지 않는다.
 *
 * 픽스처: 양도 2026-03-01 · 양도가액 1,000,000,000 · 토지 증여 당시 평가액 400,000,000 · 인수한 채무 160,000,000(r = 0.4, 증여분 0.6) · 증여세 산출 30,000,000 / 과세가액 1,000,000,000.
 * 손계산(본인 자본적지출 3,000,003 · 양도비 5,000,000): 환산 카드 비례 토지 몫 자본적지출 floor(3,000,003 × 25,300,000 / 50,600,000) = 1,500,001 · 양도비 2,500,000 →
 *   매입분 = 몫 − 증여분(floor(몫 × 0.6)): 자본적지출 1,500,001 − 900,000 = 600,001 · 양도비 2,500,000 − 1,500,000 = 1,000,000 (합 1,600,001).
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
import { purchasedPartPieceFormula } from "@/lib/tax-engine/transfer-tax-carryover-purchased-part-display";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildAggregateMeta } from "@/components/calc/results/transfer/build-aggregate-meta";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";


const COMMON = {
  propertyType: "general_building", transferDate: "2024-10-11", transferPrice: 330_000_000, acquisitionDate: "2020-03-17", acquisitionPrice: 0, expenses: 0,
  useEstimatedAcquisition: true, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
  isNonBusinessLand: false, isOneHousehold: false, reductions: [] as unknown[], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
};


const wire = (extra: object, debt = 160_000_000) => ({
  landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential", acquisitionLandPricePerSqm: 100_000, acquisitionBuildingStdPrice: 10_000_000,
  buildingAcquisitionCause: "purchase", buildingAcquisitionDate: "2021-03-01", landAcquisitionDate: "2021-03-01", landAcquisitionCause: "carryover_gift",
  carryoverGiftEvent: { giftRegistryDate: "2021-03-01", giftTaxCalculated: 30_000_000, giftTaxBase: 1_000_000_000, donorRelation: "lineal", exclusionDeclared: {} },
  landCarryoverPart: { donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: 150_000_000, giftDateAssetValue: 400_000_000, giftAssumedDebt: debt, useEstimatedAcquisition: false },
  ...extra,
});
async function aggregatedOf(extra: object, debt?: number) {
  const body = { ...COMMON, transferDate: "2026-03-01", transferPrice: 1_000_000_000, totalPropertyTransferPrice: 1_000_000_000, acquisitionDate: "2021-03-01", generalBuildingValuation: wire(extra, debt) };
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data.aggregated;
}
/** 상세명세서 필요경비 항목의 자산별 산식 — 화면이 쓰는 경로(`buildStatementItems`) 그대로. */
function statementExpenseFormulas(a: any): Record<string, string> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const form = { ...createDefaultTransferFormData(), transferDate: "2026-03-01", assets: [{ ...makeDefaultAsset(1), assetKind: "general_building" }] } as never;
  const meta = buildAggregateMeta(a, a.properties.map((p: { propertyId: string }) => ({ propertyId: p.propertyId, form })) as never);
  const item = buildStatementItems(aggregateToFilingResult(a), form, (form as { assets: never[] }).assets[0], meta as never, undefined).get("expenses");
  const out: Record<string, string> = {};
  for (const row of (item?.perAsset ?? []) as Array<{ label: string; formula?: unknown }>) out[row.label] = flat(row.formula);
  return out;
}
function flat(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flat).join("");
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? flat(props.children) : "";
}
const NOTE = "※ 매입분은 취득가액이 인수한 채무(실지거래가액)라 개산공제를 적용하지 않습니다 (§97② 1호)";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()); });

describe("PXF-1 매입분 카드(land__purchased) 필요경비 산식", () => {
  it("본인 자본적지출 3,000,003 · 양도비 5,000,000 → 자본적지출 600,001 + 양도비 1,000,000 = 1,600,001", async () => {
    const a = await aggregatedOf({ capitalExpenditure: 3_000_003, transferExpense: 5_000_000 });
    const card = a.properties.find((p: { propertyId: string }) => p.propertyId === "land__purchased");
    expect(card.necessaryExpense).toBe(1_600_001);
    expect(purchasedPartPieceFormula(a.properties, "land__purchased", "expense")).toBe(`자본적지출 600,001 + 양도비 1,000,000 = 1,600,001 (§97① 2호·3호)\n        ${NOTE}`);
  });

  it("양도비만 5,000,000 → 양도비 1,000,000 (자본적지출 항 없음)", async () => {
    const a = await aggregatedOf({ transferExpense: 5_000_000 });
    expect(purchasedPartPieceFormula(a.properties, "land__purchased", "expense")).toBe(`양도비 1,000,000 = 1,000,000 (§97① 3호)\n        ${NOTE}`);
  });

  it("본인 지출 없음 → 필요경비 없음 (매입분은 개산공제도 없다)", async () => {
    const a = await aggregatedOf({});
    expect(purchasedPartPieceFormula(a.properties, "land__purchased", "expense")).toBe(`필요경비 없음 — 본인 자본적지출·양도비가 없습니다\n        ${NOTE}`);
  });

  it("증여분 카드·다른 카드는 이 산식을 받지 않는다(undefined → 호출부가 각자 산식으로 간다)", async () => {
    const a = await aggregatedOf({ capitalExpenditure: 3_000_003, transferExpense: 5_000_000 });
    expect(purchasedPartPieceFormula(a.properties, "land", "expense")).toBeUndefined();
    expect(purchasedPartPieceFormula(a.properties, "building", "expense")).toBeUndefined();
  });

  it("r = 1(인수한 채무 = 증여 당시 평가액 — 증여분 없음): 매입분이 부모 카드라 이 산식은 없다 — 부모(A) 카드 산식이 그대로 나온다", async () => {
    const a = await aggregatedOf({ capitalExpenditure: 3_000_003, transferExpense: 5_000_000 }, 400_000_000);
    expect(a.properties.some((p: { propertyId: string }) => p.propertyId === "land__purchased")).toBe(false);
    expect(purchasedPartPieceFormula(a.properties, "land", "expense")).toBeUndefined();
  });
});

describe("PXF-2 상세명세서(`buildStatementItems`) — 자산별 필요경비에 매입분 산식이 실린다", () => {
  it("매입분 행에 산식 · 증여분 행은 이월과세 A 산식 · 합 = 증여분 8,700,000 + 매입분 1,600,001", async () => {
    const a = await aggregatedOf({ capitalExpenditure: 3_000_003, transferExpense: 5_000_000 });
    const formulas = Object.entries(statementExpenseFormulas(a));
    const purchased = formulas.find(([, f]) => f.includes("채무(실지거래가액)"));
    expect(purchased, JSON.stringify(formulas)).toBeDefined();
    expect(purchased![1]).toContain("자본적지출 600,001 + 양도비 1,000,000 = 1,600,001");
    const gift = formulas.find(([, f]) => f.includes("증여세 상당액 7,200,000"));
    expect(gift![1]).toContain("양도비 등 1,500,000");
  });
});
