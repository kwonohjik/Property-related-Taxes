/**
 * 신고서 양식 — 비과세 자산 gross 양도차익(echo) + 감면세액 컬럼 cap 버그 수정 앵커.
 *
 * 계획서: docs/02-design/features/transfer-filing-form-exempt-gain-reduction-cap.plan.md
 * 버그①: 비과세 주택 컬럼 전체·비과세 양도차익 0 (엔진 transferGain=0) → exemptGrossGain echo로 정정.
 * 버그②: 감면세액 컬럼이 reductionAggregated(미cap) 표시 → refCalculatedTax−refDeterminedTax로 자기일관.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { AggregateTransferInput, TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

const rates = makeMockRates();

// 1세대1주택 비과세 주택 (500,000,000 취득 300,000,000 → gross 200,000,000)
const houseItem: TransferTaxItemInput = {
  propertyId: "house",
  propertyLabel: "주택",
  propertyType: "housing",
  transferPrice: 500_000_000,
  transferDate: new Date("2024-06-01"),
  acquisitionPrice: 300_000_000,
  acquisitionDate: new Date("2016-06-01"),
  expenses: 0,
  householdHousingCount: 1,
  residencePeriodMonths: 60,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  useEstimatedAcquisition: false,
  reductions: [],
};

// 8년 자경 농지 §69 (300,000,000 취득 100,000,000 → gain 200,000,000)
const farmItem: TransferTaxItemInput = {
  propertyId: "farm",
  propertyLabel: "농지",
  propertyType: "land",
  transferPrice: 300_000_000,
  transferDate: new Date("2024-06-01"),
  acquisitionPrice: 100_000_000,
  acquisitionDate: new Date("2008-06-01"),
  expenses: 0,
  householdHousingCount: 1,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  useEstimatedAcquisition: false,
  reductions: [{ type: "self_farming", farmingYears: 20 }],
};

const aggInput: AggregateTransferInput = {
  taxYear: 2024,
  properties: [houseItem, farmItem],
  annualBasicDeductionUsed: 0,
};

// RowDef는 key가 아닌 label로 식별 (rowOrder [engineKey, label] 매핑).
const ROW_LABELS: Record<string, string> = {
  transferGain: "전체 양도차익",
  exemptGain: "비과세 양도차익",
  taxableGain: "과세대상 양도차익",
  acquisitionPrice: "취득가액",
  calculatedTax: "산출세액",
  reductionTax: "감면세액",
  determinedTax: "결정세액",
};
function rowVal(rows: ReturnType<typeof buildAggregateRows>, key: string, col: string) {
  const r = rows.find((x) => x.label === ROW_LABELS[key]);
  return r?.values[col as keyof typeof r.values] ?? null;
}

describe("신고서 양식 비과세 gross + 감면 cap (Pre-Do anchor)", () => {
  // A-0: 엔진 echo — 단건 1세대1주택 비과세
  it("A-0 엔진 exemptGrossGain echo — 비과세 gross 노출, transferGain 0 유지", () => {
    const r = calculateTransferTax(baseTransferInput(), rates);
    expect(r.isExempt).toBe(true);
    expect(r.transferGain).toBe(0); // 불변 (blast radius 0)
    // 500,000,000 − 300,000,000 = 200,000,000
    expect(r.exemptGrossGain).toBe(200_000_000);
  });

  // A-1: 집계 표시 — 비과세 주택 컬럼 전체/비과세 양도차익
  it("A-1 집계 비과세 주택 컬럼 — 전체=비과세=gross, 과세대상 0", () => {
    const agg = calculateTransferTaxAggregate(aggInput, rates);
    const house = agg.properties.find((p) => p.propertyId === "house")!;
    expect(house.isExempt).toBe(true);

    const meta: AggregateMeta = { properties: agg.properties, aggregated: agg };
    const rows = buildAggregateRows(aggregateToFilingResult(agg), meta, undefined);

    expect(rowVal(rows, "transferGain", "house")).toBe(200_000_000);
    expect(rowVal(rows, "exemptGain", "house")).toBe(200_000_000);
    expect(rowVal(rows, "taxableGain", "house")).toBe(0);
  });

  // A-2: 집계 합계 — 비과세 gross 포함
  it("A-2 집계 합계 전체 양도차익 = 주택 gross + 농지 gain", () => {
    const agg = calculateTransferTaxAggregate(aggInput, rates);
    const farm = agg.properties.find((p) => p.propertyId === "farm")!;
    const meta: AggregateMeta = { properties: agg.properties, aggregated: agg };
    const rows = buildAggregateRows(aggregateToFilingResult(agg), meta, undefined);

    const totalGain = rowVal(rows, "transferGain", "total") as number;
    expect(totalGain).toBe(200_000_000 + farm.transferGain);
    expect(rowVal(rows, "exemptGain", "total")).toBe(200_000_000);
  });

  // A-3: 감면세액 cap — 농지 컬럼 감면 ≤ 산출, 산출−감면=결정 자기일관
  it("A-3 농지 감면세액 ≤ 산출세액 + 산출−감면=결정 자기일관", () => {
    const agg = calculateTransferTaxAggregate(aggInput, rates);
    const meta: AggregateMeta = { properties: agg.properties, aggregated: agg };
    const rows = buildAggregateRows(aggregateToFilingResult(agg), meta, undefined);

    const calc = rowVal(rows, "calculatedTax", "farm") as number;
    const reduction = rowVal(rows, "reductionTax", "farm") as number;
    const determined = rowVal(rows, "determinedTax", "farm") as number;

    expect(reduction).toBeLessThanOrEqual(calc); // 감면 ≤ 산출
    expect(calc - reduction).toBe(determined); // 산출 − 감면 = 결정 (자기일관)
  });

  // A-5: 비-비과세(농지) 회귀 — 엔진 transferGain 유지, 과세대상 0 아님
  it("A-5 비-비과세 자산은 엔진 transferGain·과세대상 유지 (echo 분기 미적용)", () => {
    const agg = calculateTransferTaxAggregate(aggInput, rates);
    const farm = agg.properties.find((p) => p.propertyId === "farm")!;
    expect(farm.isExempt).toBe(false);
    const meta: AggregateMeta = { properties: agg.properties, aggregated: agg };
    const rows = buildAggregateRows(aggregateToFilingResult(agg), meta, undefined);
    expect(rowVal(rows, "transferGain", "farm")).toBe(farm.transferGain); // 200,000,000
    expect(rowVal(rows, "taxableGain", "farm") as number).toBeGreaterThan(0);
  });

  // A-6: 단건 비과세 신고서 — 전체·비과세 양도차익 + 취득가액 정상 복원
  it("A-6 단건 비과세 — 전체/비과세=gross, 과세대상 0, 취득가액 실제값", () => {
    const r = calculateTransferTax(baseTransferInput(), rates);
    // 단건 모드 buildRows (aggregate 없음). transferPriceOverride=양도가액.
    const rows = buildRows(r, "single", undefined, undefined, 500_000_000);
    expect(rowVal(rows, "transferGain", "total")).toBe(200_000_000);
    expect(rowVal(rows, "exemptGain", "total")).toBe(200_000_000);
    expect(rowVal(rows, "taxableGain", "total")).toBe(0);
    // 취득가액 = 500,000,000 − 200,000,000(gross) − 0 = 300,000,000 (양도가액 아님)
    expect(rowVal(rows, "acquisitionPrice", "total")).toBe(300_000_000);
  });

  // A-7: blast radius — 집계 totalTransferGain은 비과세 자산 0 기여 (PDF·:444 불변)
  it("A-7 aggregated.totalTransferGain 비과세 자산 0 기여 (transferGain 불변)", () => {
    const agg = calculateTransferTaxAggregate(aggInput, rates);
    const farm = agg.properties.find((p) => p.propertyId === "farm")!;
    // house(비과세) transferGain=0 → total = farm.transferGain (200M), gross 400M 아님
    expect(agg.totalTransferGain).toBe(farm.transferGain);
    expect(agg.totalTransferGain).not.toBe(400_000_000);
  });
});
