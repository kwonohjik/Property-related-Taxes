/**
 * anchor: 장기보유특별공제 **보유분·거주분 분리**가 한 소스에서 나온다
 * (결과탭 코드리뷰 Lane 3 · V2 — #015 #067 #068 #085).
 *
 * ## 축
 *
 * 엔진은 표2(1세대1주택 고가주택)·§95⑤(용도변경)에서 정식 sub-step을 emit한다
 * (`transfer-tax-lthd-steps.ts:104-134` — 「보유 기간분 장특」·「거주 기간분 장특」).
 * 상세명세서는 그것을 우선 읽는다: `lthHoldingStep?.amount ?? lthSplit.holdingAmount`.
 *
 * 🔴 그런데 **신고서 양식은 그 sub-step을 한 번도 읽지 않고** UI에서 표2 4%/년으로 다시
 *   안분한다(`splitLtDeduction`). 그래서 같은 화면의 두 카드가 같은 항목을 다른 금액으로
 *   표시했다. §95⑤ 용도변경은 보유분이 「비주택 기간 표1 + 주택 기간 표2」의 **혼합**이라
 *   UI의 균일 4%/년 재안분으로는 재현할 수 없다.
 *
 * ⇒ 여기서는 **3항 항등식**을 고정한다:
 *   신고서 보유분+거주분 === 명세서 보유분+거주분 === `result.longTermHoldingDeduction`
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

const TRANSFER = 2_000_000_000; // 12억 초과 — 고가주택 과세분 발생
const ACQ = 600_000_000;

/** 1세대1주택 고가주택 + 거주 10년 — 엔진이 표2 sub-step을 emit하는 격자. */
function table2House(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    acquisitionDate: D("2012-01-01"),
    transferDate: D("2026-03-01"),
    transferPrice: TRANSFER,
    acquisitionPrice: ACQ,
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 120,
    annualBasicDeductionUsed: 0,
    isNonBusinessLand: false,
    ...o,
  } as Partial<TransferTaxInput>);
}

function formData() {
  return { ...createDefaultTransferFormData(), contractTotalPrice: String(TRANSFER) };
}

type Row = { label: string; values: Record<string, number | string | null> };
function rowTotals(r: ReturnType<typeof calculateTransferTax>) {
  const rows = buildRows(r, "single", formData()) as never as Row[];
  const get = (label: string) => {
    const row = rows.find((x) => x.label === label);
    expect(row, `행 「${label}」이 없다`).toBeDefined();
    return (row!.values.total as number) ?? 0;
  };
  return {
    total: get("장기보유특별공제"),
    holding: get(" 보유 기간분 장특"),
    residence: get(" 거주 기간분 장특"),
  };
}

function itemTotals(r: ReturnType<typeof calculateTransferTax>) {
  const items = buildStatementItems(r, formData(), undefined, undefined, undefined);
  const get = (k: string) => {
    const it = items.get(k);
    expect(it, `항목 「${k}」이 없다`).toBeDefined();
    return (it!.value as number) ?? 0;
  };
  return {
    total: get("ltDeduction"),
    holding: get("ltHoldingPart"),
    residence: get("ltResidencePart"),
  };
}

// ── LT-0 격자 구별력 ─────────────────────────────────────────────────
describe("LT-0 격자 — 엔진이 표2 sub-step을 실제로 emit한다", () => {
  it("보유분·거주분 sub-step이 존재하고 둘 다 0이 아니다", () => {
    const r = calculateTransferTax(table2House(), rates);
    expect(r.longTermHoldingDeduction, "공제가 0이면 아무것도 구별하지 못한다").toBeGreaterThan(0);

    const h = r.steps.find((s) => s.label === "보유 기간분 장특");
    const res = r.steps.find((s) => s.label === "거주 기간분 장특");
    expect(h, "엔진 sub-step이 없으면 이 anchor는 UI 재계산끼리 비교하는 셈이다").toBeDefined();
    expect(res).toBeDefined();
    expect(h!.amount).toBeGreaterThan(0);
    expect(res!.amount).toBeGreaterThan(0);
  });
});

// ── LT-1 3항 항등식 (#015 #068 #085) ──────────────────────────────────
describe("LT-1 신고서·명세서·엔진이 같은 분리를 말한다", () => {
  it("각 카드 안에서 보유분 + 거주분 = 총 장특공제", () => {
    const r = calculateTransferTax(table2House(), rates);
    const rows = rowTotals(r);
    const items = itemTotals(r);

    expect(rows.holding + rows.residence, "신고서 내부 검산").toBe(r.longTermHoldingDeduction);
    expect(items.holding + items.residence, "명세서 내부 검산").toBe(r.longTermHoldingDeduction);
  });

  it("🔴 두 카드의 보유분·거주분이 서로 같다", () => {
    const r = calculateTransferTax(table2House(), rates);
    const rows = rowTotals(r);
    const items = itemTotals(r);

    expect(rows.holding, "보유 기간분이 카드마다 다르다").toBe(items.holding);
    expect(rows.residence, "거주 기간분이 카드마다 다르다").toBe(items.residence);
  });

  it("🔴 두 카드가 **엔진 sub-step** 값을 그대로 쓴다 (UI 재안분이 아니다)", () => {
    const r = calculateTransferTax(table2House(), rates);
    const h = r.steps.find((s) => s.label === "보유 기간분 장특")!;
    const res = r.steps.find((s) => s.label === "거주 기간분 장특")!;

    expect(rowTotals(r).holding).toBe(h.amount);
    expect(rowTotals(r).residence).toBe(res.amount);
    expect(itemTotals(r).holding).toBe(h.amount);
    expect(itemTotals(r).residence).toBe(res.amount);
  });
});

// ── LT-2 표1 자산은 거주분이 없다 (#067) ──────────────────────────────
describe("LT-2 표1 자산에 거주 기간분을 만들어내지 않는다", () => {
  /** 다주택(비1세대1주택) 주택 — 표1만 적용된다. 거주 개월이 길어도 거주분은 0이어야 한다. */
  const table1 = () =>
    calculateTransferTax(
      table2House({ isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 120 }),
      rates,
    );

  it("격자: 엔진이 거주 기간분 sub-step을 emit하지 않는다", () => {
    const r = table1();
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
    expect(r.steps.find((s) => s.label === "거주 기간분 장특")).toBeUndefined();
  });

  it("🔴 두 카드 모두 거주 기간분이 0이다", () => {
    const r = table1();
    expect(rowTotals(r).residence, "신고서가 거주분을 만들어냈다").toBe(0);
    expect(itemTotals(r).residence, "명세서가 거주분을 만들어냈다").toBe(0);
    expect(rowTotals(r).holding).toBe(r.longTermHoldingDeduction);
  });
});
