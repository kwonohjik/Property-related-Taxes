/**
 * anchor: 환산취득가액 모드에서 **네 행이 검산된다** (결과탭 코드리뷰 Lane 3 · V3 — #069).
 *
 * ## 축
 *
 * §97②2호 **본문**(환산취득가액)에서 엔진은 자본적지출·양도비를 차감하지 않는다 —
 * 필요경비가 필요경비개산공제(§163⑥)로 갈음되기 때문이다. 실측(양도 900,000,000 ·
 * 환산 300,000,000 · 개산공제 3,000,000): 자본적지출 20,000,000·양도비 5,000,000을 넣어도
 * `transferGain`이 597,000,000으로 **한 원도 움직이지 않는다**.
 *
 * 🔴 그런데 표시 두 곳이 실가 모드의 관행(자본적지출을 취득가액 칸으로 옮김)을 그대로 적용했다.
 *   · 신고서 양식 — 취득가액 320,000,000 · 필요경비 8,000,000
 *     ⇒ 900,000,000 − 320,000,000 − 8,000,000 = 572,000,000 ≠ 597,000,000
 *   · 계산명세서 — 취득가액 320,000,000 · 필요경비 **0**(개산공제 3,000,000에서 자본적지출
 *     20,000,000을 또 빼 음수가 clamp됐다) ⇒ 580,000,000 ≠ 597,000,000
 *
 * ⇒ 두 칸은 엔진이 실제로 쓴 값만 담고, 입력했지만 차감되지 않은 금액은 **행 고지**로 알린다.
 *
 * 법령: 소득세법 §97②2호 본문 · 시행령 §163⑥ (필요경비개산공제)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const rates = makeMockRates();

const TRANSFER = 900_000_000;
const EST_BASE = 300_000_000;
const EST_DEDUCTION = 3_000_000;

const BASE: Partial<TransferTaxInput> = {
  propertyType: "housing",
  transferPrice: TRANSFER,
  transferDate: new Date("2024-06-01"),
  acquisitionDate: new Date("2015-06-01"),
  useEstimatedAcquisition: true,
  isOneHousehold: false,
  householdHousingCount: 2,
  residencePeriodMonths: 0,
  isNonBusinessLand: false,
  standardPriceAtAcquisition: 100_000_000,
  standardPriceAtTransfer: 300_000_000,
};

interface Grid {
  id: string;
  capEx: number;
  transferExpense: number;
  /** 폼 legacy 필드(자본적지출 + 양도비 합) */
  directExpenses: number;
}

const GRIDS: Grid[] = [
  { id: "E1 자본적지출 20,000,000", capEx: 20_000_000, transferExpense: 0, directExpenses: 20_000_000 },
  { id: "E2 자본적지출 20,000,000 + 양도비 5,000,000", capEx: 20_000_000, transferExpense: 5_000_000, directExpenses: 25_000_000 },
  { id: "E3 대조군 — 미입력", capEx: 0, transferExpense: 0, directExpenses: 0 },
];

const NOTE_FRAGMENT = "필요경비개산공제로 갈음되어 차감되지 않습니다";

function cards(g: Grid) {
  const result = calculateTransferTax(
    baseTransferInput({
      ...BASE,
      capitalExpenditure: g.capEx,
      transferExpense: g.transferExpense,
      expenses: g.capEx + g.transferExpense,
    } as Partial<TransferTaxInput>),
    rates,
  );
  const { mode } = deriveColumns(result, undefined, undefined, undefined);
  const fd = {
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: String(TRANSFER),
    assets: [
      { ...makeDefaultAsset(1), acquisitionDate: "2015-06-01", directExpenses: String(g.directExpenses) },
    ],
  } as unknown as TransferFormData;
  const rows = buildRows(result, mode, fd) as never as {
    label: string;
    values: Record<string, unknown>;
    roseNotes?: Record<string, string>;
  }[];
  const row = (label: string) => {
    const r = rows.find((x) => x.label === label);
    expect(r, `행 「${label}」이 없다`).toBeDefined();
    return r!;
  };
  const n = (label: string) => Number((row(label).values["total"] as number) ?? 0);
  const items = buildStatementItems(result, fd, undefined, undefined, undefined);
  return {
    result,
    n,
    expenseNote: row("필요경비").roseNotes?.["total"] ?? "",
    stmt: {
      transfer: Number(items.get("transferPrice")?.value ?? 0),
      acq: Number(items.get("acquisitionPrice")?.value ?? 0),
      exp: Number(items.get("expenses")?.value ?? 0),
      gain: Number(items.get("transferGain")?.value ?? 0),
    },
  };
}

// ── E-0 구별력 ───────────────────────────────────────────────────────
describe("E-0 격자 — 엔진이 자본적지출·양도비를 차감하지 않는다", () => {
  for (const g of GRIDS) {
    it(`${g.id} — 양도차익이 입력과 무관하게 같다`, () => {
      const { result } = cards(g);
      expect(result.usedEstimatedAcquisition).toBe(true);
      expect(result.swapApplied, "단서 swap이 걸리면 이 축이 아니다").toBeFalsy();
      expect(result.estimatedBase).toBe(EST_BASE);
      expect(result.expenses, "환산 본문 필요경비는 개산공제뿐이다").toBe(EST_DEDUCTION);
      expect(result.transferGain).toBe(TRANSFER - EST_BASE - EST_DEDUCTION);
    });
  }

  it("E1·E2는 실제로 차감되지 않은 금액이 있다 (대조군 E3와 갈린다)", () => {
    expect(cards(GRIDS[0]).result.capitalExpenditureForDisplay).toBeGreaterThan(0);
    expect(cards(GRIDS[2]).result.capitalExpenditureForDisplay ?? 0).toBe(0);
  });
});

// ── E-1 항등식 ───────────────────────────────────────────────────────
describe("E-1 신고서 양식 — 양도가액 − 취득가액 − 필요경비 = 전체 양도차익", () => {
  for (const g of GRIDS) {
    it(`${g.id}`, () => {
      const { n } = cards(g);
      expect(n("양도가액") - n("취득가액") - n("필요경비")).toBe(n("전체 양도차익"));
      expect(n("취득가액"), "환산취득가액 그 자체여야 한다").toBe(EST_BASE);
      expect(n("필요경비"), "개산공제 그 자체여야 한다").toBe(EST_DEDUCTION);
    });
  }
});

describe("E-2 계산명세서도 같은 값·같은 항등식", () => {
  for (const g of GRIDS) {
    it(`${g.id}`, () => {
      const { n, stmt } = cards(g);
      expect(stmt.acq).toBe(n("취득가액"));
      expect(stmt.exp).toBe(n("필요경비"));
      expect(stmt.transfer - stmt.acq - stmt.exp).toBe(stmt.gain);
    });
  }
});

// ── E-3 고지 ─────────────────────────────────────────────────────────
describe("E-3 차감되지 않은 금액은 행 고지로 남는다", () => {
  it("E1 — 자본적지출 20,000,000", () => {
    const { expenseNote } = cards(GRIDS[0]);
    expect(expenseNote).toContain(NOTE_FRAGMENT);
    expect(expenseNote).toContain("20,000,000");
  });

  it("E2 — 자본적지출 + 양도비 25,000,000", () => {
    const { expenseNote } = cards(GRIDS[1]);
    expect(expenseNote).toContain(NOTE_FRAGMENT);
    expect(expenseNote).toContain("25,000,000");
  });

  it("E3 대조군 — 입력이 없으면 고지도 없다", () => {
    expect(cards(GRIDS[2]).expenseNote).toBe("");
  });
});
