/**
 * anchor — §97②2호 **단서**(swap) 축에서 **네 행이 검산된다**.
 *
 * 계획서: `docs/00-pm/transfer-swap-97-2-display.plan.md`
 *
 * ## 축
 *
 * 「소득세법」 §97②2호 단서: 취득가액을 **환산취득가액으로 하는 경우**로서
 * 가목(환산취득가액 + 개산공제) < 나목(자본적지출 + 양도비)이면 **나목의 금액을 필요경비로**
 * 한다. ⇒ 필요경비 전체가 나목이고 **환산취득가액은 차감 성분이 아니다**
 * (`transfer-tax-helpers.ts:396` `acqCostForGain = swap ? 0 : …`).
 *
 * ## 🔴 이 축에는 안전망이 없었다
 *
 * 형제 anchor `estimated-acq-capex-identity.anchor.test.ts`(#069)가 같은 항등식을 고정하지만
 * E-0에서 **swap 축을 명시적으로 배제**한다(`expect(result.swapApplied).toBeFalsy()`).
 * 그래서 계산 명세서가 `환산취득가액 + 자본적지출`을 취득가액으로 인쇄하는 결함이
 * 초록 뒤에 살아남았다 — 실측(양도 400,000,000 · 환산 200,000,000 · 개산공제 4,500,000 ·
 * 자본적지출 230,000,000):
 *
 *   · 신고서 양식 — 취득가액 230,000,000 · 필요경비 –    ⇒ 400 − 230 − 0 = 170 ✅
 *   · 계산 명세서 — 취득가액 **430,000,000** · 필요경비 0 ⇒ 400 − 430 − 0 = **−30** ❌
 *
 * 같은 화면의 두 카드가 **200,000,000** 어긋났다(사용자 제보 2026-09-15).
 *
 * ## 정본 축
 *
 * 신고서 표시 관행(자본적지출은 취득가액 칸에 합산·필요경비 칸은 양도비만)을 swap에 적용하면
 * 취득가액 = 자본적지출 + (엔진 차감분 0) · 필요경비 = 양도비다. 현행 **단건 신고서가 이미
 * 그 축**이고(`FilingFormTableHelpers.ts:372` `swapApplied ? null`), 사용자 확인 화면이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const rates = makeMockRates();

const TRANSFER = 400_000_000;
const STD_ACQ = 150_000_000;
const STD_TRANSFER = 300_000_000;
/** 환산취득가 = 400,000,000 × (150,000,000 / 300,000,000) */
const EST_BASE = 200_000_000;
/** 개산공제 = 150,000,000 × 3% (시행령 §163⑥) */
const EST_DEDUCTION = 4_500_000;
/** 가목 = 환산 + 개산공제 */
const GAMOK = EST_BASE + EST_DEDUCTION;

const BASE: Partial<TransferTaxInput> = {
  propertyType: "housing",
  transferPrice: TRANSFER,
  transferDate: new Date("2026-06-03"),
  acquisitionDate: new Date("2019-09-10"),
  useEstimatedAcquisition: true,
  standardPriceAtAcquisition: STD_ACQ,
  standardPriceAtTransfer: STD_TRANSFER,
  isOneHousehold: false,
  householdHousingCount: 2,
  residencePeriodMonths: 0,
  isNonBusinessLand: false,
};

interface Grid {
  id: string;
  capEx: number;
  transferExpense: number;
  /** 단서가 발동하는가 — 대조군 판별용 */
  swap: boolean;
}

const GRIDS: Grid[] = [
  // 나목 230,000,000 > 가목 204,500,000 → 발동 (제보 시나리오)
  { id: "S1 자본적지출 230,000,000 (제보 시나리오)", capEx: 230_000_000, transferExpense: 0, swap: true },
  // 나목 250,000,000 > 가목 → 발동 (양도비 포함)
  { id: "S2 자본적지출 230,000,000 + 양도비 20,000,000", capEx: 230_000_000, transferExpense: 20_000_000, swap: true },
  // 나목 20,000,000 < 가목 → **대조군**(본문 축 — #069가 지키는 구간)
  { id: "S3 대조군 — 본문(자본적지출 20,000,000)", capEx: 20_000_000, transferExpense: 0, swap: false },
];

function resultOf(g: Grid, over: Partial<TransferTaxInput> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      ...BASE,
      capitalExpenditure: g.capEx,
      transferExpense: g.transferExpense,
      expenses: g.capEx + g.transferExpense,
      ...over,
    } as Partial<TransferTaxInput>),
    rates,
  );
}

function formOf(g: Grid): TransferFormData {
  return {
    transferDate: "2026-06-03",
    filingDate: "2026-08-31",
    contractTotalPrice: String(TRANSFER),
    assets: [
      {
        ...makeDefaultAsset(1),
        acquisitionDate: "2019-09-10",
        useEstimatedAcquisition: true,
        actualSalePrice: String(TRANSFER),
        standardPriceAtAcq: String(STD_ACQ),
        standardPriceAtTransfer: String(STD_TRANSFER),
        capitalExpenditure: String(g.capEx),
        transferExpense: String(g.transferExpense),
      },
    ],
  } as unknown as TransferFormData;
}

/** 단건 신고서 + 명세서를 같은 result로 구동한다. */
function cards(g: Grid, over: Partial<TransferTaxInput> = {}) {
  const result = resultOf(g, over);
  const fd = formOf(g);
  const { mode } = deriveColumns(result);
  const rows = buildRows(result, mode, fd, fd.assets[0], TRANSFER) as never as {
    label: string;
    values: Record<string, number | string | null>;
  }[];
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
      transfer: num("transferPrice"),
      acq: num("acquisitionPrice"),
      exp: num("expenses"),
      gain: num("transferGain"),
      acqFormula: flatten(items.get("acquisitionPrice")?.formula),
      expFormula: flatten(items.get("expenses")?.formula),
    },
  };
}

/** ReactNode(Frac 포함)를 문자열로 눌러 담는다. */
function flatten(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatten).join("");
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? flatten(props.children) : "";
}

// ── A-1 엔진 축 (구별력) ────────────────────────────────────────────
describe("A-1 — 엔진이 단서를 채택했다", () => {
  for (const g of GRIDS.filter((x) => x.swap)) {
    it(`${g.id} — 필요경비 = 자본적지출 + 양도비, 환산취득가액 미차감`, () => {
      const { result } = cards(g);
      expect(result.swapApplied).toBe(true);
      expect(result.estimatedBase).toBe(EST_BASE);
      expect(result.estimatedDeduction).toBe(EST_DEDUCTION);
      expect(result.expenses).toBe(g.capEx + g.transferExpense);
      expect(result.swapComparison).toEqual({
        estimatedSide: GAMOK,
        directSide: g.capEx + g.transferExpense,
        chosen: "direct",
      });
      // 환산취득가액이 차감되지 않는다 — 양도차익 = 양도가액 − 나목
      expect(result.transferGain).toBe(TRANSFER - (g.capEx + g.transferExpense));
    });
  }

  it("S3 대조군 — 본문 축에서는 단서가 서지 않는다", () => {
    const { result } = cards(GRIDS[2]);
    expect(result.swapApplied).toBeFalsy();
    expect(result.expenses).toBe(EST_DEDUCTION);
    expect(result.transferGain).toBe(TRANSFER - EST_BASE - EST_DEDUCTION);
  });
});

// ── A-2 신고서 항등식 ──────────────────────────────────────────────
describe("A-2 신고서 양식 — 양도가액 − 취득가액 − 필요경비 = 전체 양도차익", () => {
  for (const g of GRIDS.filter((x) => x.swap)) {
    it(`${g.id}`, () => {
      const { n } = cards(g);
      expect(n("양도가액") - n("취득가액") - n("필요경비")).toBe(n("전체 양도차익"));
      expect(n("취득가액"), "자본적지출이 취득가액 칸에 실린다").toBe(g.capEx);
      expect(n("필요경비"), "필요경비 칸은 양도비만").toBe(g.transferExpense);
    });
  }
});

// ── A-3 🔴 명세서 항등식 + 신고서와 같은 수 ────────────────────────
describe("A-3 계산 명세서 — 신고서와 같은 값·같은 항등식", () => {
  for (const g of GRIDS.filter((x) => x.swap)) {
    it(`🔴 ${g.id}`, () => {
      const { n, stmt } = cards(g);
      expect(stmt.acq, "명세서 취득가액이 신고서와 같다").toBe(n("취득가액"));
      expect(stmt.exp, "명세서 필요경비가 신고서와 같다").toBe(n("필요경비"));
      expect(stmt.transfer - stmt.acq - stmt.exp).toBe(stmt.gain);
      // 환산취득가액이 취득가액 값에 섞이지 않는다(종전 430,000,000)
      expect(stmt.acq).not.toBe(EST_BASE + g.capEx);
    });
  }
});

// ── A-4 🔴 다건 ────────────────────────────────────────────────────
describe("A-4 다건(aggregate) — 자산 열도 같은 축", () => {
  const swapItem = (id: string) => ({
    ...(baseTransferInput({
      ...BASE,
      capitalExpenditure: 230_000_000,
      transferExpense: 0,
      expenses: 230_000_000,
    } as Partial<TransferTaxInput>) as never as Record<string, unknown>),
    propertyId: id,
    propertyLabel: id,
  });
  const plainItem = (id: string) => ({
    ...(baseTransferInput({
      propertyType: "land",
      transferPrice: 300_000_000,
      acquisitionPrice: 100_000_000,
      transferDate: new Date("2026-06-03"),
      acquisitionDate: new Date("2015-01-01"),
      isOneHousehold: false,
      householdHousingCount: 0,
      expenses: 0,
    } as Partial<TransferTaxInput>) as never as Record<string, unknown>),
    propertyId: id,
    propertyLabel: id,
  });

  function agg() {
    const r = calculateTransferTaxAggregate(
      {
        taxYear: 2026,
        annualBasicDeductionUsed: 2_500_000,
        properties: [swapItem("A1"), plainItem("A2")],
      } as never,
      rates,
    );
    const fd = formOf(GRIDS[0]);
    const meta = { properties: r.properties, aggregated: r } as never;
    const rows = buildRows(r as never, "aggregate", fd, fd.assets[0], undefined, undefined, undefined, meta) as never as {
      label: string;
      values: Record<string, number | string | null>;
    }[];
    const cell = (label: string, col: string) => {
      const row = rows.find((x) => x.label === label);
      expect(row, `행 「${label}」이 없다`).toBeDefined();
      return Number(row!.values[col] ?? 0);
    };
    return { r, cell, meta, fd };
  }

  it("🔴 swap 자산 열에서 항등식이 성립한다", () => {
    const { cell } = agg();
    expect(cell("양도가액", "A1") - cell("취득가액", "A1") - cell("필요경비", "A1")).toBe(
      cell("전체 양도차익", "A1"),
    );
    expect(cell("취득가액", "A1"), "자본적지출이 취득가액 칸에 실린다").toBe(230_000_000);
    expect(cell("필요경비", "A1")).toBe(0);
  });

  it("🔴 엔진 echo가 swap에서 취득가액 0을 낸다 (다필지·겸용주택과 같은 축)", () => {
    const { r } = agg();
    const p = r.properties[0];
    expect(p.acquisitionPrice).toBe(0);
    expect(p.necessaryExpense, "역산 필요경비가 나목 금액이다").toBe(230_000_000);
  });

  it("대조군 — swap 아닌 자산은 종전 축 그대로", () => {
    const { cell } = agg();
    expect(cell("양도가액", "A2") - cell("취득가액", "A2") - cell("필요경비", "A2")).toBe(
      cell("전체 양도차익", "A2"),
    );
    expect(cell("취득가액", "A2")).toBe(100_000_000);
  });
});

// ── A-5 🔴 비과세 축 ───────────────────────────────────────────────
describe("A-5 비과세(1세대1주택) + swap", () => {
  const exemptOver: Partial<TransferTaxInput> = {
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
  };

  it("🔴 swap echo가 조기반환 경로에서도 살아 있다", () => {
    const { result } = cards(GRIDS[0], exemptOver);
    expect(result.isExempt).toBe(true);
    expect(result.swapApplied, "조기반환이 echo를 떨어뜨리면 안 된다").toBe(true);
    expect(result.swapComparison).toEqual({
      estimatedSide: GAMOK,
      directSide: 230_000_000,
      chosen: "direct",
    });
  });

  it("🔴 신고서가 gross 축에서 항등식을 만족한다", () => {
    const { n, result } = cards(GRIDS[0], exemptOver);
    expect(result.exemptGrossGain).toBe(TRANSFER - 230_000_000);
    expect(n("양도가액") - n("취득가액") - n("필요경비")).toBe(n("전체 양도차익"));
    expect(n("취득가액")).toBe(230_000_000);
  });

  it("대조군 — 비과세 + 본문(swap 미발동)은 종전 환산 축 그대로", () => {
    const { n, result } = cards(GRIDS[2], exemptOver);
    expect(result.isExempt).toBe(true);
    expect(result.swapApplied).toBeFalsy();
    expect(n("취득가액"), "본문은 환산취득가액 그 자체").toBe(EST_BASE);
    expect(n("필요경비"), "본문은 개산공제 그 자체").toBe(EST_DEDUCTION);
  });
});

// ── A-6 🔴 산식이 값과 일치한다 ────────────────────────────────────
describe("A-6 명세서 산식 — 거짓 등식을 만들지 않는다", () => {
  it("🔴 취득가액 산식이 환산 비율식을 그리지 않는다", () => {
    const { stmt } = cards(GRIDS[0]);
    // 종전: "환산취득가 200,000,000 = 양도가액 400,000,000 × (150,000,000/300,000,000) + 자본적지출 230,000,000"
    expect(stmt.acqFormula).toContain("자본적지출 230,000,000");
    expect(stmt.acqFormula).toContain("§97②2호 단서");
    expect(stmt.acqFormula).not.toContain("환산취득가 200,000,000 =");
  });

  it("🔴 단서 비교 근거(가목·나목)가 노출된다", () => {
    const { stmt } = cards(GRIDS[0]);
    expect(stmt.acqFormula, "개산공제").toContain(EST_DEDUCTION.toLocaleString());
    expect(stmt.acqFormula, "가목 합계").toContain(GAMOK.toLocaleString());
    expect(stmt.acqFormula, "환산취득가액은 차감하지 않는다는 사실").toContain("차감하지 않습니다");
  });

  it("대조군 — 본문 축 산식은 종전 그대로(환산 비율식 유지)", () => {
    const { stmt } = cards(GRIDS[2]);
    expect(stmt.acqFormula).toContain("환산취득가");
    expect(stmt.acqFormula).not.toContain("§97②2호 단서");
  });
});

// ── A-7 회귀 0 — 본문 축은 #069 그대로 ─────────────────────────────
describe("A-7 대조군 — 본문(환산) 축은 종전 값이 유지된다", () => {
  it("신고서·명세서 모두 환산취득가액 · 개산공제", () => {
    const { n, stmt } = cards(GRIDS[2]);
    expect(n("취득가액")).toBe(EST_BASE);
    expect(n("필요경비")).toBe(EST_DEDUCTION);
    expect(stmt.acq).toBe(EST_BASE);
    expect(stmt.exp).toBe(EST_DEDUCTION);
    expect(stmt.transfer - stmt.acq - stmt.exp).toBe(stmt.gain);
  });

  it("V-6 — 감정가액·매매사례가액 모드는 단서 대상이 아니다", () => {
    for (const method of ["appraisal", "salesCase"] as const) {
      const result = calculateTransferTax(
        baseTransferInput({
          ...BASE,
          useEstimatedAcquisition: false,
          acquisitionMethod: method,
          appraisalValue: EST_BASE,
          similarSalesValue: EST_BASE,
          acquisitionPrice: EST_BASE,
          capitalExpenditure: 230_000_000,
          transferExpense: 0,
          expenses: 230_000_000,
        } as Partial<TransferTaxInput>),
        rates,
      );
      expect(result.usedEstimatedAcquisition, `${method}: 추계 축이다`).toBe(true);
      expect(result.swapApplied, `${method}: 단서는 환산 전용이다`).toBeFalsy();
    }
  });
});

// ── A-8 사이드바 합계 ──────────────────────────────────────────────
describe("A-8 사이드바 — 엔진 축(취득가액 0 · 필요경비 전액)을 따른다", () => {
  it("🔴 swap이면 환산취득가액을 취득가액으로 싣지 않는다", () => {
    const g = GRIDS[0];
    const result = resultOf(g);
    const { rows } = computeTransferPerAssetSummary(formOf(g), {
      mode: "single",
      result,
    } as never);
    // 종전: acqPrice 200,000,000 + expense 230,000,000 → 합 430,000,000이 실제 차감액과 어긋났다.
    expect(rows[0].acqPrice, "환산취득가액은 차감되지 않는다").toBe(0);
    // ⚠️ 사이드바 `expense`는 폼 입력 합(자본적지출 + 양도비)에서 오며 swap에서 엔진
    //    `expenses`와 **같은 수**다. 구별력은 `acqPrice`가 담당한다.
    expect(rows[0].expense).toBe(230_000_000);
    // 0이면 사이드바 렌더러가 그 행을 값으로 그리지 않는다(거짓 수를 보이지 않는다).
    expect(rows[0].acqPending).toBe(false);
  });

  it("대조군 — 본문(swap 미발동)은 환산취득가액을 그대로 싣는다", () => {
    const g = GRIDS[2];
    const result = resultOf(g);
    const { rows } = computeTransferPerAssetSummary(formOf(g), {
      mode: "single",
      result,
    } as never);
    expect(rows[0].acqPrice).toBe(EST_BASE);
    // ⚠️ 본문 축에서 사이드바 `expense`는 **폼 입력값**(20,000,000)이다 — 엔진이 차감한
    //    개산공제(4,500,000)가 아니다. swap과 무관한 **기존 동작**이라 건드리지 않는다(별건).
    expect(rows[0].expense).toBe(20_000_000);
  });
});
