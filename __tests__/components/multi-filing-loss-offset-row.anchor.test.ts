/**
 * anchor: 다자산 합산 신고서 — **양도차손 통산 전용 행 · 비교과세 표시 · 세율군 세율**
 *
 * 계획서: `docs/00-pm/multi-filing-loss-offset-row-and-comparative-tax-display.plan.md`
 *
 * 제보(2026-10-02): 미등기 −20,000,000이 주택 1년미만(70%)에 19,000,000을 먼저 흡수하고 잔액
 * 1,000,000이 60:140으로 안분된 합산에서 ① 통산이 「감면후 소득금액」 각주로만 있었고
 * ② 5단계 산출세액이 방법 A·B 비교를 보이지 않았으며 ③ 40% 군이 70%로 표시됐다.
 * 세액(63,688,000)은 처음부터 맞았다 — 표시층 결함이다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import {
  comparativeTaxView,
  describeComparativeDecision,
  describeComparativeTax,
  groupRateText,
} from "@/components/calc/results/transfer/comparative-tax-display";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

function item(id: string, o: Partial<TransferTaxItemInput>): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 1,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}
const agg = (properties: TransferTaxItemInput[]) =>
  calculateTransferTaxAggregate({ taxYear: 2026, annualBasicDeductionUsed: 0, properties }, rates);

/** 제보 4자산 — P1 누진 60M · P2 미등기 −20M · P3 토지 1~2년 40% 140M · P4 주택 1년 미만 70% 19M */
const reported = () =>
  agg([
    item("P1", { transferDate: D("2026-03-02"), acquisitionDate: D("2023-07-21"), transferPrice: 250_000_000, acquisitionPrice: 190_000_000 }),
    item("P2", { transferDate: D("2026-06-03"), acquisitionDate: D("2021-03-22"), transferPrice: 100_000_000, acquisitionPrice: 120_000_000, isUnregistered: true }),
    item("P3", { transferDate: D("2026-10-20"), acquisitionDate: D("2025-07-01"), transferPrice: 300_000_000, acquisitionPrice: 160_000_000 }),
    item("P4", { propertyType: "housing", transferDate: D("2026-10-25"), acquisitionDate: D("2026-01-08"), transferPrice: 400_000_000, acquisitionPrice: 381_000_000 }),
  ]);

/** 차손이 다 흡수되지 않는다 — U2 −20M 중 U1 5M만 통산, 15M 소멸 */
const withExpiry = () =>
  agg([
    item("U1", { transferDate: D("2026-03-02"), acquisitionDate: D("2023-07-21"), transferPrice: 105_000_000, acquisitionPrice: 100_000_000 }),
    item("U2", { transferDate: D("2026-06-03"), acquisitionDate: D("2021-03-22"), transferPrice: 100_000_000, acquisitionPrice: 120_000_000, isUnregistered: true }),
  ]);

/** 통산이 없다 — 두 자산 모두 이익 */
const noLoss = () =>
  agg([
    item("N1", { transferDate: D("2026-03-02"), acquisitionDate: D("2023-07-21"), transferPrice: 150_000_000, acquisitionPrice: 100_000_000 }),
    item("N2", { transferDate: D("2026-06-03"), acquisitionDate: D("2021-03-22"), transferPrice: 130_000_000, acquisitionPrice: 100_000_000 }),
  ]);

type Row = { label: string; values: Record<string, number | string | null>; notes?: Record<string, string> };
const filingRows = (a: ReturnType<typeof agg>) =>
  buildAggregateRows(aggregateToFilingResult(a), { properties: a.properties, aggregated: a } as never, createDefaultTransferFormData()) as unknown as Row[];
const rowOf = (rows: Row[], label: string) => rows.find((r) => r.label === label);
const OFFSET = "양도차손 통산 (§102②·영 §167의2)";
const EXPIRED = "통산되지 못한 차손 소멸 (이월 불가)";

describe("A 신고서 — 양도차손 통산 전용 행", () => {
  it("A-0 격자: 제보 시나리오가 실제로 통산된다(같은 70% 먼저 · 잔액 안분)", () => {
    const r = reported();
    expect(r.unusedLoss).toBe(0);
    expect(r.lossOffsetTable.map((x) => [x.toPropertyId, x.amount])).toEqual([["P4", 19_000_000], ["P1", 300_000], ["P3", 700_000]]);
  });

  it("A-1 🔴 통산 행: 차손 자산 +20,000,000 · 받은 자산 −(P1 300,000 · P3 700,000 · P4 19,000,000) · 합계 0", () => {
    const row = rowOf(filingRows(reported()), OFFSET)!;
    expect(row, "통산 전용 행이 없다").toBeDefined();
    expect(row.values).toMatchObject({ P1: -300_000, P2: 20_000_000, P3: -700_000, P4: -19_000_000, total: 0 });
  });

  it("A-2 🔴 가로 항등식: 모든 열에서 양도소득금액 + 통산 + 소멸 = 통산 후", () => {
    for (const a of [reported(), withExpiry()]) {
      const rows = filingRows(a);
      const income = rowOf(rows, "양도소득금액")!.values;
      const offset = rowOf(rows, OFFSET)?.values ?? {};
      const expired = rowOf(rows, EXPIRED)?.values ?? {};
      for (const p of a.properties) {
        const col = p.propertyId;
        expect(
          (income[col] as number) + ((offset[col] as number) ?? 0) + ((expired[col] as number) ?? 0),
          `${col} 열`,
        ).toBe(p.incomeAfterOffset);
      }
      expect(
        (income.total as number) + ((offset.total as number) ?? 0) + ((expired.total as number) ?? 0),
        "합계 열",
      ).toBe(a.totalIncomeAfterOffset);
    }
  });

  it("A-3 🔴 소멸 시나리오: 통산 U2 +5,000,000 · 소멸 U2 +15,000,000 · 합계 양도소득금액 = 칸의 합", () => {
    const a = withExpiry();
    expect(a.unusedLoss).toBe(15_000_000);
    const rows = filingRows(a);
    expect(rowOf(rows, OFFSET)!.values).toMatchObject({ U1: -5_000_000, U2: 5_000_000, total: 0 });
    expect(rowOf(rows, EXPIRED)!.values).toMatchObject({ U2: 15_000_000, total: 15_000_000 });
    expect(rowOf(rows, "양도소득금액")!.values).toMatchObject({ U1: 5_000_000, U2: -20_000_000, total: -15_000_000 });
  });

  it("A-4 🟢 통산이 없으면 두 행 모두 만들지 않는다(0으로 채우지 않는다)", () => {
    const rows = filingRows(noLoss());
    expect(rowOf(rows, OFFSET)).toBeUndefined();
    expect(rowOf(rows, EXPIRED)).toBeUndefined();
  });

  it("A-4b 🟢 소멸이 0이면 소멸 행만 없다", () => {
    const rows = filingRows(reported());
    expect(rowOf(rows, OFFSET)).toBeDefined();
    expect(rowOf(rows, EXPIRED)).toBeUndefined();
  });

  it("A-5 🔴 「감면후 소득금액」 행에 결손금 각주가 없다 — 통산은 전용 행이 말한다", () => {
    const row = rowOf(filingRows(reported()), "감면후 소득금액")!;
    expect(row.notes).toBeUndefined();
    expect(row.values).toMatchObject({ P1: 59_700_000, P2: 0, P3: 139_300_000, P4: 0, total: 199_000_000 });
  });

  it("A-6 통산 행은 「양도소득금액」 바로 뒤에 온다", () => {
    const labels = filingRows(reported()).map((r) => r.label);
    expect(labels.indexOf(OFFSET)).toBe(labels.indexOf("양도소득금액") + 1);
  });

  it("A-7 명세서 「양도소득금액」 자산별 산식: 차손 자산은 통산액과 소멸액을 가른다", () => {
    const a = withExpiry();
    const meta = { properties: a.properties, aggregated: a } as never;
    const per = buildStatementItems(aggregateToFilingResult(a), createDefaultTransferFormData(), undefined, meta, undefined).get("incomeAmount")!.perAsset!;
    const u2 = per.find((x) => x.label.includes("U2"))!;
    expect(u2.formula).toContain("5,000,000이 다른 자산의 양도소득금액에서 공제(통산)");
    expect(u2.formula).toContain("통산되지 못한 15,000,000은 소멸");
    expect(u2.formula, "소멸분을 통산이라 적으면 안 된다").not.toContain("20,000,000이 다른");
  });
});

describe("B 5단계 산출세액 — 비교과세", () => {
  const statement = (a: ReturnType<typeof agg>, key: string) =>
    buildStatementItems(aggregateToFilingResult(a), createDefaultTransferFormData(), undefined, { properties: a.properties, aggregated: a } as never, undefined).get(key)!;

  it("B-1 🔴 제보: 방법 A·B 금액과 「큰 금액」 결정이 적힌다", () => {
    const a = reported();
    expect(a.calculatedTaxByGeneral).toBe(54_730_000);
    expect(a.calculatedTaxByGroups).toBe(63_688_000);
    const f = String(statement(a, "calculatedTax").formula);
    expect(f).toContain("54,730,000");
    expect(f).toContain("63,688,000");
    expect(f).toContain("큰 금액인 세율군별 63,688,000");
  });

  it("B-2 🔴 채택액이 최대가 아니면(감면 차감 후 결정) 「큰 금액」이라 하지 않는다", () => {
    const v = comparativeTaxView({ comparedTaxApplied: "groups", calculatedTaxByGroups: 90, calculatedTaxByGeneral: 100 })!;
    expect(v.reason).toBe("after_reduction");
    const t = describeComparativeDecision(v);
    expect(t).toContain("감면세액을 뺀 세액이 더 큰");
    expect(t).not.toContain("큰 금액인");
  });

  it("B-2b 전체 누진이 채택되면 그 쪽 라벨로 적는다", () => {
    const v = comparativeTaxView({ comparedTaxApplied: "general", calculatedTaxByGroups: 90, calculatedTaxByGeneral: 100 })!;
    expect(describeComparativeTax(v)).toContain("큰 금액인 전체 누진세율 100");
  });

  it("B-3 🟢 비교과세가 없으면 비교 블록이 없다", () => {
    const a = noLoss();
    expect(a.comparedTaxApplied).toBe("none");
    expect(comparativeTaxView(a)).toBeNull();
    expect(String(statement(a, "calculatedTax").formula)).not.toContain("방법 A");
  });
});

describe("C 세율군 세율", () => {
  const group = (a: ReturnType<typeof agg>, g: string) => a.groupTaxes.find((x) => x.group === g)!;

  it("C-1 🔴 단기 군(40% 자산 + 통산으로 0원이 된 70% 자산)은 40%다", () => {
    const g = group(reported(), "short_term");
    expect(g.groupTaxBase).toBe(139_300_000);
    expect(g.appliedRate).toBe(0.4);
  });

  it("C-1b 🟢 과세표준 0원 군은 자기 세율을 그대로 보인다(미등기 70%)", () => {
    const g = group(reported(), "unregistered");
    expect(g.groupTaxBase).toBe(0);
    expect(g.appliedRate).toBe(0.7);
  });

  it("C-2 🟢 세액은 불변이다", () => {
    const r = reported();
    expect(r.calculatedTax).toBe(63_688_000);
    expect(r.taxBase).toBe(196_500_000);
    expect(group(r, "short_term").groupCalculatedTax).toBe(55_720_000);
    expect(r.comparedTaxApplied).toBe("groups");
  });

  it("C-3 카드 층: 과세표준 > 0인 호가 둘이고 세율이 다르면 단일 세율을 찍지 않는다", () => {
    const a = agg([
      item("S1", { transferDate: D("2026-10-20"), acquisitionDate: D("2025-07-01"), transferPrice: 300_000_000, acquisitionPrice: 160_000_000 }),
      item("S2", { propertyType: "housing", transferDate: D("2026-10-25"), acquisitionDate: D("2026-01-08"), transferPrice: 400_000_000, acquisitionPrice: 381_000_000 }),
    ]);
    const g = group(a, "short_term");
    expect(g.groupTaxBase).toBeGreaterThan(0);
    expect(Math.floor(g.groupTaxBase * g.appliedRate) - g.progressiveDeduction).not.toBe(g.groupCalculatedTax);
    expect(groupRateText(g)).toBe("(호별 합계)");
  });

  it("C-4 카드 층: 엔진이 거짓 최고세율(0.7)을 실어도 카드는 40%로 위장하지 않는다", () => {
    const g = { ...group(reported(), "short_term"), appliedRate: 0.7 };
    expect(groupRateText(g)).toBe("(호별 합계)");
    expect(groupRateText({ ...g, appliedRate: 0.4 })).toBe("(40.0%)");
    expect(groupRateText(group(reported(), "unregistered"))).toBe("(70.0%)");
  });
});
