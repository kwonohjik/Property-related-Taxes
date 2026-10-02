/**
 * anchor — §97③ 감가상각비 **결과 표시 축**: 신고서 양식 · 계산 상세 명세서 · 다건 자산 열
 *
 * 계획서: `docs/00-pm/transfer-depreciation-and-capex-display.plan.md` §3.2 (Phase B-⑦)
 *
 * 서식(시행규칙 별지 제84호서식): 부표3 ⑤ 계(= ①+③−④ 감가상각비)가 부표1 ⑫ 취득가액이다.
 * 신고서에는 그 한 칸뿐이므로 취득가액 칸은 **공제 후** 값이고, 공제 사실은 행 고지로 알린다.
 * 명세서 산식은 「실지거래가액 − 감가상각비」로 적어 값이 스스로를 만들게 한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { buildAggregateMeta } from "@/components/calc/results/transfer/build-aggregate-meta";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const rates = makeMockRates();

const ACTUAL: Partial<TransferTaxInput> = {
  propertyType: "building",
  transferPrice: 500_000_000,
  transferDate: new Date("2026-06-03"),
  acquisitionDate: new Date("2019-09-10"),
  acquisitionPrice: 300_000_000,
  capitalExpenditure: 10_000_000,
  transferExpense: 2_000_000,
  expenses: 12_000_000,
  isOneHousehold: false,
  householdHousingCount: 0,
  residencePeriodMonths: 0,
  isNonBusinessLand: false,
};
const ESTIMATED: Partial<TransferTaxInput> = {
  ...ACTUAL,
  transferPrice: 400_000_000,
  acquisitionPrice: 0,
  useEstimatedAcquisition: true,
  standardPriceAtAcquisition: 150_000_000,
  standardPriceAtTransfer: 300_000_000,
  capitalExpenditure: undefined,
  transferExpense: undefined,
  expenses: 0,
};

function formOf(price: string): TransferFormData {
  return {
    transferDate: "2026-06-03",
    filingDate: "2026-08-31",
    contractTotalPrice: price,
    assets: [{ ...makeDefaultAsset(1), assetKind: "building", acquisitionDate: "2019-09-10", actualSalePrice: price }],
  } as unknown as TransferFormData;
}

type Row = { label: string; values: Record<string, number | string | null>; roseNotes?: Record<string, string> };

function flatten(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatten).join("");
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? flatten(props.children) : "";
}

function single(over: Partial<TransferTaxInput>, price: string) {
  const result = calculateTransferTax(baseTransferInput(over as Partial<TransferTaxInput>), rates);
  const fd = formOf(price);
  const { mode } = deriveColumns(result);
  const rows = buildRows(result, mode, fd, fd.assets[0], Number(price)) as never as Row[];
  const row = (label: string) => {
    const r = rows.find((x) => x.label === label);
    expect(r, `행 「${label}」이 없다`).toBeDefined();
    return r!;
  };
  const n = (label: string) => Number(row(label).values["total"] ?? 0);
  const items = buildStatementItems(result, fd, fd.assets[0], undefined, Number(price));
  const num = (k: string) => Number(items.get(k)?.value ?? 0);
  return {
    result,
    row,
    n,
    stmt: {
      transfer: num("transferPrice"),
      acq: num("acquisitionPrice"),
      exp: num("expenses"),
      gain: num("transferGain"),
      acqFormula: flatten(items.get("acquisitionPrice")?.formula),
    },
  };
}

// ── 실가 ────────────────────────────────────────────────────────────
describe("D1-1 단건 실가 — 취득가액은 공제 후 값", () => {
  const dep = (v: number) => ({ ...ACTUAL, depreciationAmount: v });

  it("🔴 신고서 — 취득가액 260,000,000 · 필요경비 12,000,000 · 양도차익 228,000,000", () => {
    const { n } = single(dep(40_000_000), "500000000");
    expect(n("취득가액")).toBe(260_000_000);
    expect(n("필요경비")).toBe(12_000_000);
    expect(n("전체 양도차익")).toBe(228_000_000);
    expect(n("양도가액") - n("취득가액") - n("필요경비")).toBe(n("전체 양도차익"));
  });

  it("🔴 취득가액 행에 공제 고지가 붙는다 (한 칸뿐인 서식이라 사실을 알려야 한다)", () => {
    const { row } = single(dep(40_000_000), "500000000");
    expect(row("취득가액").roseNotes?.total).toContain("감가상각비 40,000,000");
    expect(row("취득가액").roseNotes?.total).toContain("§97③");
  });

  it("긍정 짝 — 감가상각비 0이면 고지가 없고 종전 값", () => {
    const { n, row } = single(dep(0), "500000000");
    expect(n("취득가액")).toBe(300_000_000);
    expect(row("취득가액").roseNotes?.total).toBeUndefined();
  });

  it("🔴 명세서 — 값이 신고서와 같고 산식이 「실지거래가액 − 감가상각비」다", () => {
    const { n, stmt } = single(dep(40_000_000), "500000000");
    expect(stmt.acq).toBe(n("취득가액"));
    expect(stmt.transfer - stmt.acq - stmt.exp).toBe(stmt.gain);
    expect(stmt.acqFormula).toContain("300,000,000");
    expect(stmt.acqFormula).toContain("감가상각비 40,000,000");
    expect(stmt.acqFormula).toContain("§97③");
  });
});

// ── 환산 ────────────────────────────────────────────────────────────
describe("D1-2 단건 환산 본문 — 취득가액 칸은 환산취득가액 − 감가상각비", () => {
  const est = (v: number) => ({ ...ESTIMATED, depreciationAmount: v });

  it("🔴 신고서 — 취득가액 180,000,000 · 필요경비(개산공제) 4,500,000 · 양도차익 215,500,000", () => {
    const { n, result } = single(est(20_000_000), "400000000");
    expect(result.estimatedBase, "echo는 공제 전").toBe(200_000_000);
    expect(n("취득가액")).toBe(180_000_000);
    expect(n("필요경비")).toBe(4_500_000);
    expect(n("양도가액") - n("취득가액") - n("필요경비")).toBe(n("전체 양도차익"));
    expect(n("전체 양도차익")).toBe(215_500_000);
  });

  it("🔴 명세서 — 같은 값·같은 항등식, 산식에 공제가 보인다", () => {
    const { n, stmt } = single(est(20_000_000), "400000000");
    expect(stmt.acq).toBe(n("취득가액"));
    expect(stmt.exp).toBe(n("필요경비"));
    expect(stmt.transfer - stmt.acq - stmt.exp).toBe(stmt.gain);
    expect(stmt.acqFormula).toContain("환산취득가 200,000,000");
    expect(stmt.acqFormula).toContain("감가상각비 20,000,000");
  });

  it("긍정 짝 — 감가상각비 0이면 종전 (환산취득가액 200,000,000)", () => {
    const { n } = single(est(0), "400000000");
    expect(n("취득가액")).toBe(200_000_000);
  });
});

// ── swap ────────────────────────────────────────────────────────────
describe("D1-3 단서(swap) — 공제하지 않고 비교 근거에 감가상각비가 보인다", () => {
  const swap = {
    ...ESTIMATED,
    capitalExpenditure: 190_000_000,
    transferExpense: 0,
    expenses: 190_000_000,
    depreciationAmount: 20_000_000,
  };

  it("🔴 swap — 취득가액 칸은 종전 표시(자본적지출), 공제 고지는 없다", () => {
    const { n, row, result } = single(swap, "400000000");
    expect(result.swapApplied).toBe(true);
    expect(n("취득가액")).toBe(190_000_000);
    expect(n("필요경비")).toBe(0);
    expect(row("취득가액").roseNotes?.total).toBeUndefined();
    expect(n("양도가액") - n("취득가액") - n("필요경비")).toBe(n("전체 양도차익"));
  });

  it("🔴 명세서 비교 근거 — (환산취득가액 − 감가상각비 + 개산공제) 산술이 자기 값을 만든다", () => {
    const { stmt } = single(swap, "400000000");
    expect(stmt.acqFormula).toContain("환산취득가액 200,000,000 − 감가상각비 20,000,000 + 개산공제 4,500,000 = 184,500,000");
    expect(stmt.acqFormula).toContain("< 190,000,000");
  });
});

// ── 다건 ────────────────────────────────────────────────────────────
describe("D1-4 다건 — 자산 열도 공제 후 값", () => {
  const item = (id: string, over: Partial<TransferTaxInput>) => ({
    ...(baseTransferInput(over as Partial<TransferTaxInput>) as never as Record<string, unknown>),
    propertyId: id,
    propertyLabel: id,
  });

  function agg(a: Partial<TransferTaxInput>, price: string) {
    const r = calculateTransferTaxAggregate(
      { taxYear: 2026, annualBasicDeductionUsed: 0, properties: [item("A1", a)] } as never,
      rates,
    );
    const fd = formOf(price);
    const properties = r.properties.map((p) => ({ propertyId: p.propertyId, form: fd }));
    const meta = buildAggregateMeta(r, properties as never);
    const filing = aggregateToFilingResult(r);
    const rows = buildAggregateRows(filing, meta as never, fd) as never as Row[];
    const cell = (label: string) => Number(rows.find((x) => x.label === label)?.values["A1"] ?? 0);
    const items = buildStatementItems(filing, fd, fd.assets[0], meta as never, undefined);
    return { cell, items };
  }

  it("🔴 실가 — 신고서 자산 열·명세서 합계가 260,000,000 · 12,000,000", () => {
    const { cell, items } = agg({ ...ACTUAL, depreciationAmount: 40_000_000 }, "500000000");
    expect(cell("취득가액")).toBe(260_000_000);
    expect(cell("필요경비")).toBe(12_000_000);
    expect(cell("양도가액") - cell("취득가액") - cell("필요경비")).toBe(cell("전체 양도차익"));
    expect(Number(items.get("acquisitionPrice")?.value)).toBe(260_000_000);
    expect(Number(items.get("expenses")?.value)).toBe(12_000_000);
  });

  it("🔴 환산 본문 — 자산 열 취득가액 180,000,000", () => {
    const { cell } = agg({ ...ESTIMATED, depreciationAmount: 20_000_000 }, "400000000");
    expect(cell("취득가액")).toBe(180_000_000);
    expect(cell("필요경비")).toBe(4_500_000);
    expect(cell("양도가액") - cell("취득가액") - cell("필요경비")).toBe(cell("전체 양도차익"));
  });
});
