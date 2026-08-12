/**
 * 별지 제84호서식 — 다종목 표시 anchor
 *
 * 계획서: docs/02-design/features/foreign-stock-118-6-limit-bc-apportionment.plan.md (Phase 6 잔여)
 *
 * ## 왜 필요한가
 *
 * 서식 표는 `StockAggregateMeta`(종목별 열 + 합계 열)를 **받을 수 있게 만들어져 있었지만
 * 아무도 넘기지 않아 dead code**였다(2026-08-12 실측 — `StockFilingFormTable result={result}` 뿐).
 * 종목이 2건 이상인데 aggregate를 안 넘기면 서식이 **마지막 종목만** 보여주어 실제 신고 내용과
 * 달라진다.
 *
 * 또한 별지 제84호서식 ⑫란(외국납부세액공제)에 대응하는 행이 **아예 없었다**.
 */

import { describe, it, expect } from "vitest";
import {
  deriveColumns,
  buildRows,
  type StockAggregateMeta,
} from "@/components/calc/stock-transfer/StockFilingFormTableHelpers";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { StockTransferAggregateResult } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";

/** 최소 결과 — 표가 읽는 필드만 채운다 */
function res(over: Partial<StockTransferResult> = {}): StockTransferResult {
  return {
    taxCategory: "unlisted_non_major",
    appliedSection94: "①3나_본문",
    section94_2Applied: false,
    isExempt: false,
    transferPrice: 100_000_000,
    acquisitionPrice: 50_000_000,
    acquisitionMode: "actual",
    usedEstimatedAcquisition: false,
    basicDeductionGroup: "stock",
    expenses: 0,
    expenseMode: "actual",
    transferIncome: 50_000_000,
    basicDeduction: 2_500_000,
    taxBase: 47_500_000,
    appliedRate: 0.2,
    calculatedTax: 9_500_000,
    underReportPenalty: 0,
    latePaymentPenalty: 0,
    electronicFilingCredit: 0,
    finalTax: 9_500_000,
    localIncomeTax: 950_000,
    holdingPeriodMonths: 36,
    holdingPeriodDays: 1_095,
    isShortTermHolding: false,
    lthdStartDate: null,
    acquiredBeforeListing: false,
    clause1BucketTaxBase: 0,
    clause1BucketTax: 0,
    clause9TaxBase: 0,
    clause9Tax: 0,
    warnings: [],
    appliedRules: [],
    ...over,
  } as StockTransferResult;
}

/** 국외주식 결과 — foreignDetail 포함 */
function foreignRes(over: Partial<StockTransferResult> = {}): StockTransferResult {
  return res({
    taxCategory: "foreign_stock",
    appliedSection94: "①3다",
    appliedRules: ["국외주식§118②준용"],
    foreignDetail: {
      appliedRules: [],
      stockName: "Apple",
      countryCode: "US",
      shareCount: 100,
      transferExchangeRate: 1,
      acquisitionExchangeRate: 1,
      foreignTaxPaidKrw: 12_000_000,
      foreignTaxCreditLimit: 9_750_000,
      foreignTaxCreditApplied: 9_750_000,
    },
    ...over,
  });
}

function meta(items: StockTransferResult[]): StockAggregateMeta {
  const aggregated = {
    items,
    totalTransferIncome: items.reduce((s, r) => s + r.transferIncome, 0),
    basicDeductionByGroup: {
      stock: items.reduce((s, r) => s + r.basicDeduction, 0),
      real_estate_and_other_asset: 0,
    },
    totalTaxBase: items.reduce((s, r) => s + r.taxBase, 0),
    totalCalculatedTax: items.reduce((s, r) => s + r.calculatedTax, 0),
    totalUnderReportPenalty: 0,
    electronicFilingCredit: 0,
    totalFinalTax: items.reduce((s, r) => s + r.finalTax, 0),
    totalLocalIncomeTax: 0,
  } as unknown as StockTransferAggregateResult;
  return { items, aggregated };
}

const labels = (rows: ReturnType<typeof buildRows>) => rows.map((r) => r.label);

describe("FF-1 다종목 열 — aggregate를 넘기면 종목별 열이 생긴다", () => {
  it("FF-1-1 단건은 합계 열 하나뿐", () => {
    const { columns } = deriveColumns(res(), undefined);
    expect(columns.map((c) => c.key)).toEqual(["total"]);
  });

  it("FF-1-2 2종목이면 합계 + 종목 2열", () => {
    const m = meta([res(), foreignRes()]);
    const { columns } = deriveColumns(res(), m);
    expect(columns).toHaveLength(3);
    expect(columns[0].key).toBe("total");
  });

  it("FF-1-3 [경계] 1종목짜리 aggregate는 단건과 같다 — 열을 늘리지 않는다", () => {
    const { columns } = deriveColumns(res(), meta([res()]));
    expect(columns.map((c) => c.key)).toEqual(["total"]);
  });
});

describe("FF-2 ⑫ 외국납부세액공제 행 (§118의6①1호)", () => {
  it("FF-2-1 국외 종목이 있으면 행이 생긴다", () => {
    const m = meta([res(), foreignRes()]);
    const { columns } = deriveColumns(res(), m);
    const rows = buildRows(res(), columns, m);
    expect(labels(rows).some((l) => l.includes("외국납부세액공제"))).toBe(true);
  });

  it("FF-2-2 [음성 대조군] 국내 종목만이면 행이 없다 — 빈 행으로 서식을 늘리지 않는다", () => {
    const m = meta([res(), res()]);
    const { columns } = deriveColumns(res(), m);
    const rows = buildRows(res(), columns, m);
    expect(labels(rows).some((l) => l.includes("외국납부세액공제"))).toBe(false);
  });

  it("FF-2-3 합계는 종목별 공제액의 합이다", () => {
    const m = meta([res(), foreignRes()]);
    const { columns } = deriveColumns(res(), m);
    const rows = buildRows(res(), columns, m);
    const row = rows.find((r) => r.label.includes("외국납부세액공제"))!;
    expect(row.values["total"]).toBe(9_750_000);
  });

  it("FF-2-4 단건 국외주식에서도 행이 생긴다 (aggregate 없이)", () => {
    const single = foreignRes();
    const { columns } = deriveColumns(single, undefined);
    const rows = buildRows(single, columns, undefined);
    const row = rows.find((r) => r.label.includes("외국납부세액공제"));
    expect(row?.values["total"]).toBe(9_750_000);
  });
});

describe("FF-3 ③ 세율구분 그룹 (작성요령 4번)", () => {
  it("FF-3-1 🔑 국외주식과 국내 비대주주 비중소가 **같은 20% 그룹**이다", () => {
    const m = meta([res(), foreignRes()]);
    const { columns } = deriveColumns(res(), m);
    const rows = buildRows(res(), columns, m);
    const row = rows.find((r) => r.label.includes("세율구분 그룹"))!;
    const itemKeys = columns.filter((c) => c.key !== "total").map((c) => c.key);
    expect(row.values[itemKeys[0]]).toContain("20%");
    expect(row.values[itemKeys[1]]).toContain("20%");
  });

  it("FF-3-2 세율이 다르면 그룹도 다르다 — 30% 종목", () => {
    const short = res({ appliedRate: 0.3, taxCategory: "unlisted_major", isShortTermHolding: true });
    const m = meta([res(), short]);
    const { columns } = deriveColumns(res(), m);
    const rows = buildRows(res(), columns, m);
    const row = rows.find((r) => r.label.includes("세율구분 그룹"))!;
    const itemKeys = columns.filter((c) => c.key !== "total").map((c) => c.key);
    expect(row.values[itemKeys[0]]).toContain("20%");
    expect(row.values[itemKeys[1]]).toContain("30%");
  });

  it("FF-3-3 단건에는 이 행이 없다 — 합산할 상대가 없다", () => {
    const { columns } = deriveColumns(res(), undefined);
    const rows = buildRows(res(), columns, undefined);
    expect(labels(rows).some((l) => l.includes("세율구분 그룹"))).toBe(false);
  });
});
