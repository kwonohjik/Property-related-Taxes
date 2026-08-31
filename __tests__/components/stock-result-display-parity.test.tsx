/**
 * @vitest-environment jsdom
 *
 * 결과 표시 anchor — 리뷰 2026-08-28 #26·#27·#29 + §32 표시 2건
 *
 * 다섯 결함 모두 **세액은 맞는데 화면·인쇄물이 틀린** 부류다. 그래서 이 파일은
 * 「엔진 값과 화면 값이 같은가」·「항등식이 성립하는가」를 직접 잰다.
 * `PrintSection`에 포함되는 산식·서식이라 인쇄물로 나간다.
 *
 * ── #26 다종목 결과뷰가 prop 5개를 떨어뜨린다 ────────────────────────────────
 *   Step4의 aggregate 분기에만 `transferActualInputMode`·`perShareTransferPrice`·
 *   `unlistedValuationMode`·`acqFaceValueOnly`·`kiwoomLastFetchedAt`이 없었다.
 *   결과뷰 기본값이 `"per_share"`/`0`인데 스토어 기본값은 `"total"`이라 **두 fallback이 반대** —
 *   다종목은 입력 방식과 무관하게 per_share 분기를 타고
 *   「1주당 양도가액 **0** × N주 = 5억」처럼 항등식이 깨진 산식을 인쇄했다.
 *
 * ── #27 누진세율 산식 카드가 대주주 20/25% 표를 하드코딩한다 ──────────────────
 *   렌더 게이트가 `progressiveDeduction > 0` 하나뿐이라 기타자산 §55 8단계(§104①1호)와
 *   §104①9호 NBL도 이 카드를 탔다. 「과세표준 × 25% − 누진공제」 좌변이 우변과 맞지 않고
 *   구간 합도 세액과 달라 **항등식이 2중으로 깨졌다**.
 *   근거: 소득세법 §55① · §104①1호 · §104①9호 · §104①11호 가목2)
 *
 * ── #29 기본공제 합계가 주식 그룹만 더한다 ──────────────────────────────────
 *   `totalTaxBase`는 두 그룹 공제를 모두 차감한 값인데 요약카드·사이드바는
 *   `byGroup.stock`만 읽어 「양도소득금액 − 기본공제 = 과세표준」이 어긋났다.
 *   같은 화면의 별지 제84호서식 20행은 두 그룹을 더해 **값이 갈렸다**.
 *   근거: 소득세법 §103①1호(부동산·기타자산 그룹) · §103①2호(주식 그룹)
 *
 * ── §32 신고서 표에 내부 enum id 노출 ───────────────────────────────────────
 *   열 라벨이 `종목 ${i+1} (${item.taxCategory})` — 바로 아래 `taxCategoryLabel`을
 *   호출조차 하지 않아 「종목 1 (listed_major)」로 인쇄됐다.
 *
 *   RD-PROG-1~4  (#27)
 *   RD-DEDUCT-1~3 (#29)
 *   RD-COL-1~2   (§32 enum id)
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProgressiveTaxBreakdown } from "@/components/calc/results/StockTransferTaxResultViewHelpers";
import { StockAggregateSummaryCard } from "@/components/calc/results/StockAggregateSummaryCard";
import { deriveColumns } from "@/components/calc/stock-transfer/StockFilingFormTableHelpers";
import { sumBasicDeductionByGroup } from "@/lib/tax-engine/stock-transfer/stock-basic-deduction-total";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { StockTransferAggregateResult } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";

afterEach(cleanup);

function res(o: Partial<StockTransferResult> = {}): StockTransferResult {
  return {
    taxCategory: "listed_major",
    taxBase: 0,
    appliedRate: 0,
    progressiveDeduction: undefined,
    calculatedTax: 0,
    ...o,
  } as StockTransferResult;
}

/** 화면에 찍힌 숫자를 텍스트에서 뽑는다 — 항등식 검산용 */
function numbersIn(text: string): number[] {
  return (text.match(/[\d,]{4,}/g) ?? []).map((s) => Number(s.replace(/,/g, "")));
}

// ============================================================
// #27 — 누진세율 산식 카드
// ============================================================

describe("RD-PROG (#27): 산식은 실제 적용 세율·누진공제로 만든다", () => {
  it("RD-PROG-1: 기타자산 §55 8단계 — 항등식이 성립한다", () => {
    // 과세표준 500,000,000 · 40% · 누진공제 25,940,000 → 174,060,000
    const r = res({
      taxCategory: "other_asset_heavy_re",
      taxBase: 500_000_000,
      appliedRate: 0.4,
      progressiveDeduction: 25_940_000,
      calculatedTax: 174_060_000,
    });
    const { container } = render(<ProgressiveTaxBreakdown result={r} />);
    const text = container.textContent ?? "";
    expect(text).toContain("40%");
    expect(text).not.toContain("25%");
    // 3억 2단 구간 분해는 §104①11 가목2) 전용이라 여기서는 없어야 한다
    expect(text).not.toContain("3억 이하 분");
    expect(numbersIn(text)).toContain(174_060_000);
  });

  it("RD-PROG-2: 기타자산 200,000,000 — 누진공제 항이 빠지지 않는다", () => {
    // 38% · 누진공제 19,940,000 → 56,060,000 (종전 else 분기는 「× 38% = 56,060,000」)
    const r = res({
      taxCategory: "other_asset_block_shareholder",
      taxBase: 200_000_000,
      appliedRate: 0.38,
      progressiveDeduction: 19_940_000,
      calculatedTax: 56_060_000,
    });
    const { container } = render(<ProgressiveTaxBreakdown result={r} />);
    const text = container.textContent ?? "";
    expect(text).toContain("38%");
    expect(text).toContain("누진공제");
    expect(numbersIn(text)).toContain(19_940_000);
  });

  it("RD-PROG-3: §104①9호 NBL — 실제 50%가 인쇄된다", () => {
    const r = res({
      taxCategory: "other_asset_heavy_re_nbl",
      taxBase: 500_000_000,
      appliedRate: 0.5,
      progressiveDeduction: 25_940_000,
      calculatedTax: 224_060_000,
    });
    const { container } = render(<ProgressiveTaxBreakdown result={r} />);
    expect(container.textContent).toContain("50%");
  });

  it("RD-PROG-4: 대주주 2단 표에서는 구간 분해가 남는다 (회귀 가드)", () => {
    // 497,500,000 × 25% − 15,000,000 = 109,375,000
    const r = res({
      taxCategory: "listed_major",
      taxBase: 497_500_000,
      appliedRate: 0.25,
      progressiveDeduction: 15_000_000,
      calculatedTax: 109_375_000,
    });
    const { container } = render(<ProgressiveTaxBreakdown result={r} />);
    const text = container.textContent ?? "";
    expect(text).toContain("3억 이하 분");
    expect(text).toContain("3억 초과 분");
    expect(text).toContain("§104①11호 가목2)");
    expect(numbersIn(text)).toContain(109_375_000);
  });
});

// ============================================================
// #29 — 기본공제 합계
// ============================================================

describe("RD-DEDUCT (#29): 기본공제 합계는 두 그룹을 더한다 (§103①)", () => {
  const agg = {
    items: [
      res({ transferIncome: 50_000_000, basicDeduction: 2_500_000, taxBase: 47_500_000, appliedRate: 0.2, calculatedTax: 9_500_000 }),
      res({ taxCategory: "other_asset_heavy_re", transferIncome: 50_000_000, basicDeduction: 2_500_000, taxBase: 47_500_000, appliedRate: 0.15, calculatedTax: 5_940_000 }),
    ],
    totalTransferIncome: 100_000_000,
    basicDeductionByGroup: { stock: 2_500_000, real_estate_and_other_asset: 2_500_000 },
    totalTaxBase: 95_000_000,
    totalCalculatedTax: 15_440_000,
    totalUnderReportPenalty: 0,
    totalLatePaymentPenalty: 0,
    totalFinalTax: 15_440_000,
    totalLocalIncomeTax: 1_544_000,
    totalSecuritiesTransactionTax: { totalTax: 0 },
  } as unknown as StockTransferAggregateResult;

  it("RD-DEDUCT-1: leaf — 두 그룹 합계", () => {
    expect(sumBasicDeductionByGroup(agg.basicDeductionByGroup)).toBe(5_000_000);
  });

  it("RD-DEDUCT-2: 요약카드 항등식 — 양도소득금액 − 기본공제 = 과세표준", () => {
    render(<StockAggregateSummaryCard aggregate={agg} names={["가", "나"]} />);
    const deduction = sumBasicDeductionByGroup(agg.basicDeductionByGroup);
    expect(agg.totalTransferIncome - deduction).toBe(agg.totalTaxBase);
    // 화면 tfoot에 그 값이 실제로 찍힌다
    expect(screen.getAllByText("5,000,000원").length).toBeGreaterThan(0);
  });

  it("RD-DEDUCT-3: 주식 그룹만 더한 값(2,500,000)은 tfoot에 남지 않는다", () => {
    const { container } = render(<StockAggregateSummaryCard aggregate={agg} names={["가", "나"]} />);
    const tfoot = container.querySelector("tfoot");
    expect(tfoot?.textContent).toContain("5,000,000원");
    expect(tfoot?.textContent).not.toContain("2,500,000원");
  });
});

// ============================================================
// §32 — 신고서 열 라벨에 내부 enum id 노출
// ============================================================

describe("RD-COL (§32): 신고서 열 라벨에 내부 id가 나가지 않는다", () => {
  const items = [
    res({ taxCategory: "listed_major" }),
    res({ taxCategory: "other_asset_heavy_re_nbl" }),
  ];
  const aggregate = { items, aggregated: {} as StockTransferAggregateResult };

  it("RD-COL-1: enum id 문자열이 라벨에 없다", () => {
    const { columns } = deriveColumns(items[0], aggregate);
    const labels = columns.map((c) => c.label).join(" | ");
    expect(labels).not.toContain("listed_major");
    expect(labels).not.toContain("other_asset_heavy_re_nbl");
  });

  it("RD-COL-2: 한국어 분류명이 들어간다", () => {
    const { columns } = deriveColumns(items[0], aggregate);
    const labels = columns.map((c) => c.label).join(" | ");
    expect(labels).toContain("상장 대주주");
    expect(labels).toContain("부동산과다보유");
  });
});
