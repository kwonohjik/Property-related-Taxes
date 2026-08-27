/**
 * @vitest-environment jsdom
 *
 * ⑦ 다종목 합산 요약 카드 — 증권거래세 합계 · 신고 단위 가산세
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Phase D · A-2)
 *
 * ## 왜 이 파일이 필요한가
 *
 * 엔진은 `totalSecuritiesTransactionTax` 를 **계산하고 anchor 2건이 그 값을 지키는데**
 * (Phase 0 P-3 뮤테이션 실측), **UI 참조가 0건**이었다 — 계산은 맞는데 화면에 안 나왔다.
 * 「dead 필드」가 아니라 **표시 누락**이다.
 *
 * 신고 단위 가산세(Phase A′ 산물)도 결정세액에 **포함만 되고 내역이 안 보였다**.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StockAggregateSummaryCard } from "@/components/calc/results/StockAggregateSummaryCard";
import type { StockTransferAggregateResult } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

afterEach(cleanup);

function itemRes(over: Partial<StockTransferResult> = {}): StockTransferResult {
  return {
    transferIncome: 30_000_000,
    basicDeduction: 2_500_000,
    taxBase: 27_500_000,
    appliedRate: 0.2,
    calculatedTax: 5_500_000,
    underReportPenalty: 0,
    latePaymentPenalty: 0,
    electronicFilingCredit: 0,
    finalTax: 5_500_000,
    localIncomeTax: 550_000,
    ...over,
  } as unknown as StockTransferResult;
}

function agg(over: Partial<StockTransferAggregateResult> = {}): StockTransferAggregateResult {
  return {
    items: [itemRes(), itemRes()],
    totalTransferIncome: 60_000_000,
    basicDeductionByGroup: { stock: 2_500_000, real_estate_and_other_asset: 0 },
    totalTaxBase: 57_500_000,
    totalCalculatedTax: 11_500_000,
    totalUnderReportPenalty: 1_152_000,
    totalLatePaymentPenalty: 68_200,
    electronicFilingCredit: 0,
    totalFinalTax: 12_720_200,
    totalLocalIncomeTax: 1_150_000,
    totalSecuritiesTransactionTax: {
      securitiesTransactionTax: 105_000,
      agriculturalTax: 90_000,
      totalTax: 195_000,
    },
    ...over,
  } as unknown as StockTransferAggregateResult;
}

describe("AS-1 증권거래세 합계가 화면에 나온다 (종전 UI 참조 0건)", () => {
  it("AS-1-1: 합계 195,000 과 내역(증권거래세분·농특세)이 보인다", () => {
    render(<StockAggregateSummaryCard aggregate={agg()} names={["가", "나"]} />);
    expect(screen.getByText("195,000원")).toBeTruthy();
    expect(screen.getByText("105,000원")).toBeTruthy();
    expect(screen.getByText("90,000원")).toBeTruthy();
  });

  it("AS-1-2: **양도소득세와 별도 납부**임을 말한다 — 합계에 더하면 안 된다", () => {
    render(<StockAggregateSummaryCard aggregate={agg()} names={["가", "나"]} />);
    expect(screen.getByText(/별도로 납부/)).toBeTruthy();
    // 납부세액 합계는 양도세 + 지방세만 — 증권거래세는 별도 세목
    expect(screen.getByText("13,870,200원")).toBeTruthy(); // 12,720,200 + 1,150,000
  });

  it("AS-1-3: 증권거래세가 0이면 카드를 만들지 않는다 — 빈 카드로 화면을 늘리지 않는다", () => {
    const zero = agg({
      totalSecuritiesTransactionTax: {
        securitiesTransactionTax: 0,
        agriculturalTax: 0,
        totalTax: 0,
      },
    } as Partial<StockTransferAggregateResult>);
    render(<StockAggregateSummaryCard aggregate={zero} names={["가", "나"]} />);
    expect(screen.queryByText(/증권거래세/)).toBeNull();
  });
});

describe("AS-2 신고 단위 가산세 내역이 보인다 (Phase A′ 산물)", () => {
  it("AS-2-1: 신고불성실·납부지연이 각각 표시된다", () => {
    render(<StockAggregateSummaryCard aggregate={agg()} names={["가", "나"]} />);
    expect(screen.getByText("1,152,000원")).toBeTruthy();
    expect(screen.getByText("68,200원")).toBeTruthy();
  });

  it("AS-2-2: **신고 1건 단위 1회**임을 말한다", () => {
    render(<StockAggregateSummaryCard aggregate={agg()} names={["가", "나"]} />);
    expect(screen.getByText(/신고 1건 단위/)).toBeTruthy();
  });

  it("AS-2-3: 가산세가 0이면 행을 만들지 않는다", () => {
    const zero = agg({ totalUnderReportPenalty: 0, totalLatePaymentPenalty: 0 });
    render(<StockAggregateSummaryCard aggregate={zero} names={["가", "나"]} />);
    expect(screen.queryByText(/신고불성실/)).toBeNull();
  });
});
