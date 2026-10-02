/**
 * anchor — **실가 모드**에서 자본적지출은 신고서 「필요경비」 칸에 표시된다.
 *
 * 계획서: `docs/00-pm/transfer-depreciation-and-capex-display.plan.md` §3.1 (Phase A)
 *
 * ## 축
 *
 * 「소득세법」 §97①은 필요경비를 1호 취득가액 · **2호 자본적지출액** · 3호 양도비로 가른다.
 * 신고서 서식(시행규칙 별지 제84호서식 부표3)도 자본적지출(⑥)을 「기타 필요경비」(⑬ → 부표1 ⑭)에
 * 넣는다. 그런데 결과탭은 「신고서 양식 표시 관행」이라며 자본적지출을 **취득가액 칸**에 합산하고
 * 필요경비 칸에는 양도비만 적었다 — 사용자 제보 2026-10-02:
 *
 *   양도 50,000,000 · 취득 28,500,000 · 자본적지출 1,000,000 · 양도비 700,000
 *   → 신고서 「취득가액 29,500,000 · 필요경비 700,000」 (기대: 28,500,000 · 1,700,000)
 *
 * ⚠️ 세액은 불변이다 — 엔진은 처음부터 자본적지출을 필요경비로 차감했다(표시층만의 문제).
 *
 * ## 예외 (종전 표시 유지) — 이 파일의 대조군이 지킨다
 *   · §97②2호 **단서**(swap) — PR #1636 에서 사용자가 확인한 화면(취득가액 칸 = 나목).
 *     전용 anchor: `swap-97-2-display-identity.anchor.test.ts`
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildAggregateMeta } from "@/components/calc/results/transfer/build-aggregate-meta";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const rates = makeMockRates();

// 사용자 제보 사례
const TRANSFER = 50_000_000;
const ACQ = 28_500_000;
const CAP_EX = 1_000_000;
const TR_EXP = 700_000;
const GAIN = TRANSFER - ACQ - CAP_EX - TR_EXP; // 19,800,000

const BASE: Partial<TransferTaxInput> = {
  propertyType: "building",
  transferPrice: TRANSFER,
  transferDate: new Date("2026-03-25"),
  acquisitionDate: new Date("2025-01-29"),
  acquisitionPrice: ACQ,
  capitalExpenditure: CAP_EX,
  transferExpense: TR_EXP,
  expenses: CAP_EX + TR_EXP,
  isOneHousehold: false,
  householdHousingCount: 0,
  residencePeriodMonths: 0,
  isNonBusinessLand: false,
};

function formOf(): TransferFormData {
  return {
    transferDate: "2026-03-25",
    filingDate: "2026-05-31",
    contractTotalPrice: String(TRANSFER),
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "building",
        acquisitionDate: "2025-01-29",
        actualSalePrice: String(TRANSFER),
        fixedAcquisitionPrice: String(ACQ),
        capitalExpenditure: String(CAP_EX),
        transferExpense: String(TR_EXP),
      },
    ],
  } as unknown as TransferFormData;
}

type Row = { label: string; values: Record<string, number | string | null> };

function flatten(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatten).join("");
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? flatten(props.children) : "";
}

/** 단건 신고서 + 명세서를 같은 result로 구동한다. */
function single(over: Partial<TransferTaxInput> = {}) {
  const result = calculateTransferTax(baseTransferInput({ ...BASE, ...over } as Partial<TransferTaxInput>), rates);
  const fd = formOf();
  const { mode } = deriveColumns(result);
  const rows = buildRows(result, mode, fd, fd.assets[0], TRANSFER) as never as Row[];
  const n = (label: string) => {
    const row = rows.find((x) => x.label === label);
    expect(row, `행 「${label}」이 없다`).toBeDefined();
    return Number(row!.values["total"] ?? 0);
  };
  const items = buildStatementItems(result, fd, fd.assets[0], undefined, TRANSFER);
  const num = (k: string) => Number(items.get(k)?.value ?? 0);
  return {
    result,
    n,
    stmt: {
      acq: num("acquisitionPrice"),
      exp: num("expenses"),
      gain: num("transferGain"),
      transfer: num("transferPrice"),
      acqFormula: flatten(items.get("acquisitionPrice")?.formula),
      expFormula: flatten(items.get("expenses")?.formula),
    },
  };
}

// ── 엔진 축 — 세액이 달라지지 않는다는 전제 ──────────────────────────
describe("A0-0 엔진 — 자본적지출은 필요경비로 차감된다 (표시 전환의 전제)", () => {
  it("양도차익 = 양도가액 − 취득가액 − (자본적지출 + 양도비)", () => {
    const { result } = single();
    expect(result.transferGain).toBe(GAIN);
    expect(result.expenses).toBe(CAP_EX + TR_EXP);
    expect(result.capitalExpenditureForDisplay).toBe(CAP_EX);
  });
});

// ── 단건 신고서 ─────────────────────────────────────────────────────
describe("A0-1 단건 신고서 양식 — 취득가액 / 필요경비", () => {
  it("🔴 취득가액 28,500,000 · 필요경비 1,700,000 (자본적지출은 필요경비)", () => {
    const { n } = single();
    expect(n("취득가액"), "자본적지출이 취득가액 칸에 얹히지 않는다").toBe(ACQ);
    expect(n("필요경비"), "필요경비 = 자본적지출 + 양도비").toBe(CAP_EX + TR_EXP);
  });

  it("항등식 — 양도가액 − 취득가액 − 필요경비 = 전체 양도차익", () => {
    const { n } = single();
    expect(n("양도가액") - n("취득가액") - n("필요경비")).toBe(n("전체 양도차익"));
    expect(n("전체 양도차익")).toBe(GAIN);
  });

  it("🔴 자본적지출 0이면 종전과 같다 (긍정 짝)", () => {
    const { n } = single({ capitalExpenditure: 0, expenses: TR_EXP });
    expect(n("취득가액")).toBe(ACQ);
    expect(n("필요경비")).toBe(TR_EXP);
  });

  it("🔴 양도비 0 + 자본적지출만 — 필요경비 칸이 비지 않는다", () => {
    const { n } = single({ transferExpense: 0, expenses: CAP_EX });
    expect(n("취득가액")).toBe(ACQ);
    expect(n("필요경비")).toBe(CAP_EX);
  });
});

// ── 계산 명세서 ─────────────────────────────────────────────────────
describe("A0-2 계산 명세서 — 신고서와 같은 값·같은 항등식", () => {
  it("🔴 명세서 취득가액·필요경비가 신고서와 같다", () => {
    const { n, stmt } = single();
    expect(stmt.acq).toBe(ACQ);
    expect(stmt.exp).toBe(CAP_EX + TR_EXP);
    expect(stmt.acq).toBe(n("취득가액"));
    expect(stmt.exp).toBe(n("필요경비"));
    expect(stmt.transfer - stmt.acq - stmt.exp).toBe(stmt.gain);
  });

  it("🔴 취득가액 산식이 자본적지출을 합산하지 않는다", () => {
    const { stmt } = single();
    expect(stmt.acqFormula).toContain(ACQ.toLocaleString());
    expect(stmt.acqFormula, "취득가액 산식에 + 자본적지출이 없다").not.toContain("자본적지출");
  });

  it("🔴 필요경비 산식이 자본적지출과 양도비를 풀어쓴다", () => {
    const { stmt } = single();
    expect(stmt.expFormula).toContain(`자본적지출 ${CAP_EX.toLocaleString()}`);
    expect(stmt.expFormula).toContain(`양도비 ${TR_EXP.toLocaleString()}`);
    expect(stmt.expFormula).not.toContain("취득가액 흡수");
  });

  it("긍정 짝 — 자본적지출 0이면 필요경비 산식은 양도비만", () => {
    const { stmt } = single({ capitalExpenditure: 0, expenses: TR_EXP });
    expect(stmt.expFormula).toContain(`양도비 ${TR_EXP.toLocaleString()}`);
    expect(stmt.expFormula).not.toContain("자본적지출");
  });
});

// ── 다건 ────────────────────────────────────────────────────────────
describe("A0-3 다건(aggregate) — 자산 열도 같은 축", () => {
  const item = (id: string, over: Partial<TransferTaxInput> = {}) => ({
    ...(baseTransferInput({ ...BASE, ...over } as Partial<TransferTaxInput>) as never as Record<string, unknown>),
    propertyId: id,
    propertyLabel: id,
  });

  function agg() {
    const r = calculateTransferTaxAggregate(
      {
        taxYear: 2026,
        annualBasicDeductionUsed: 2_500_000,
        properties: [item("A1"), item("A2", { capitalExpenditure: 0, expenses: TR_EXP })],
      } as never,
      rates,
    );
    const fd = formOf();
    const properties = r.properties.map((p) => ({ propertyId: p.propertyId, form: fd }));
    const meta = buildAggregateMeta(r, properties as never);
    const filing = aggregateToFilingResult(r);
    const rows = buildAggregateRows(filing, meta as never, fd) as never as Row[];
    const cell = (label: string, col: string) => {
      const row = rows.find((x) => x.label === label);
      expect(row, `행 「${label}」이 없다`).toBeDefined();
      return Number(row!.values[col] ?? 0);
    };
    const items = buildStatementItems(filing, fd, fd.assets[0], meta as never, undefined);
    return { r, cell, items };
  }

  it("🔴 자본적지출 있는 자산 열 — 취득가액 28,500,000 · 필요경비 1,700,000", () => {
    const { cell } = agg();
    expect(cell("취득가액", "A1")).toBe(ACQ);
    expect(cell("필요경비", "A1")).toBe(CAP_EX + TR_EXP);
    expect(cell("양도가액", "A1") - cell("취득가액", "A1") - cell("필요경비", "A1")).toBe(cell("전체 양도차익", "A1"));
  });

  it("대조군 — 자본적지출 0인 자산 열은 종전 그대로", () => {
    const { cell } = agg();
    expect(cell("취득가액", "A2")).toBe(ACQ);
    expect(cell("필요경비", "A2")).toBe(TR_EXP);
  });

  it("🔴 명세서 합계·자산별이 신고서 자산 열과 같다", () => {
    const { items, cell } = agg();
    const acq = items.get("acquisitionPrice");
    const exp = items.get("expenses");
    expect(Number(acq?.value), "취득가액 합계 = 28,500,000 × 2 (자본적지출 미합산)").toBe(ACQ * 2);
    expect(Number(exp?.value), "필요경비 합계 = 1,700,000 + 700,000").toBe(CAP_EX + TR_EXP + TR_EXP);
    expect(Number(acq?.value)).toBe(cell("취득가액", "A1") + cell("취득가액", "A2"));
    expect(Number(exp?.value)).toBe(cell("필요경비", "A1") + cell("필요경비", "A2"));
  });
});

// ── 예외 대조군 — swap은 종전 표시 유지 ─────────────────────────────
describe("A0-4 대조군 — §97②2호 단서(swap)는 종전 표시를 유지한다", () => {
  it("swap이면 취득가액 칸 = 자본적지출, 필요경비 칸 = 양도비 (PR #1636)", () => {
    const { n, result } = single({
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 10_000_000,
      standardPriceAtTransfer: 20_000_000,
      acquisitionPrice: 0,
      capitalExpenditure: 30_000_000,
      transferExpense: 700_000,
      expenses: 30_700_000,
    });
    expect(result.swapApplied).toBe(true);
    expect(n("취득가액")).toBe(30_000_000);
    expect(n("필요경비")).toBe(700_000);
  });
});

// ── 예외 대조군 — 이월과세 시나리오 A는 종전 표시를 유지한다 ─────────
describe("A0-5 대조군 — 이월과세 시나리오 A는 종전 표시를 유지한다", () => {
  const DONOR_ACQ = 444_654_088;
  const CO_CAP_EX = 5_000_000;
  const CO_TR_EXP = 1_000_000;
  const GIFT_TAX = 30_000_000;

  function carryover() {
    const result = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 700_000_000,
        transferDate: new Date("2026-02-16"),
        acquisitionPrice: DONOR_ACQ,
        acquisitionDate: new Date("2006-05-21"),
        capitalExpenditure: CO_CAP_EX,
        transferExpense: CO_TR_EXP,
        expenses: 0,
        isOneHousehold: false,
        householdHousingCount: 1,
        acquisitionCause: "carryover_gift",
        carryoverTaxation: {
          giftRegistryDate: new Date("2021-06-19"),
          donorAcquisitionDate: new Date("2006-05-21"),
          useEstimatedAcquisition: false,
          donorAcquisitionPrice: DONOR_ACQ,
          giftTaxAmount: GIFT_TAX,
          giftDateValuation: 666_000_000,
        },
      } as Partial<TransferTaxInput>),
      rates,
    );
    const fd = formOf();
    const { mode } = deriveColumns(result);
    const rows = buildRows(result, mode, fd, fd.assets[0], 700_000_000) as never as Row[];
    const n = (label: string) => Number(rows.find((x) => x.label === label)?.values["total"] ?? 0);
    const items = buildStatementItems(result, fd, fd.assets[0], undefined, 700_000_000);
    const num = (k: string) => Number(items.get(k)?.value ?? 0);
    return { result, n, num, acqFormula: flatten(items.get("acquisitionPrice")?.formula) };
  }

  it("채택 시나리오 A — 취득가액 칸에 자본적지출이 얹힌다 (산식 「취득가액 + 자본적지출」과 값이 같다)", () => {
    const { result, n, num, acqFormula } = carryover();
    expect(result.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(n("취득가액")).toBe(DONOR_ACQ + CO_CAP_EX);
    expect(num("acquisitionPrice")).toBe(n("취득가액"));
    // 값이 산식과 어긋나지 않는다 — 산식은 자본적지출을 취득가액에 더해 적는다.
    expect(acqFormula).toContain(`자본적지출 ${CO_CAP_EX.toLocaleString()}`);
  });

  it("항등식 — 신고서·명세서 모두 성립", () => {
    const { n, num } = carryover();
    expect(n("양도가액") - n("취득가액") - n("필요경비")).toBe(n("전체 양도차익"));
    expect(num("transferPrice") - num("acquisitionPrice") - num("expenses")).toBe(num("transferGain"));
  });
});
