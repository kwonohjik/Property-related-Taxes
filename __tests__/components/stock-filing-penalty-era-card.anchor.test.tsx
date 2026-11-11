/**
 * @vitest-environment jsdom
 *
 * 신고불성실가산세 2015.7.1. 전 양도분 시기 고지 — 합산 결과 카드 표시 anchor (V-18 · Q-2 a)
 *
 * 계획서: docs/00-pm/stock-penalty-base-guideline-v15.plan.md · 판정·echo는
 * `__tests__/tax-engine/stock-transfer/filing-penalty-base-era.anchor.test.ts`가 본다. 여기서는 합산 결과 카드가 echo를 **그리는지**를 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { FILING_PENALTY_BASE_ERA_NOTICE } from "@/lib/tax-engine/data/filing-penalty-base-era";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { StockAggregateSummaryCard } from "@/components/calc/results/StockAggregateSummaryCard";

afterEach(cleanup);

/** 비상장 대주주(비중소기업) 장기 — 종목당 양도소득 400,000,000 (주당 5,000,000 − 1,000,000 × 100주) */
function major(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2024-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2021-01-01"),
    transferDate: new Date("2025-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 5_000_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 1_000_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2025-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}


const items = (d1: string, d2: string, violation: "none" | "non_report" = "non_report") => [
  major({ transferDate: new Date(d1), filingViolation: violation, filingDate: new Date("2016-01-31") }),
  major({ transferDate: new Date(d2), filingViolation: violation, filingDate: new Date("2016-01-31") }),
];

describe("PD-1 합산 결과 카드", () => {
  it("PD-1-1 종전 양도일 + 무신고 → 가산세 행 아래에 시기 고지가 보인다", () => {
    const agg = calculateStockTransferTaxAggregate(items("2015-03-02", "2015-06-20"), "aggregate");
    render(<StockAggregateSummaryCard aggregate={agg} names={["가", "나"]} />);
    expect(screen.getByTestId("stock-penalty-era-notice").textContent).toBe(FILING_PENALTY_BASE_ERA_NOTICE);
  });

  it("PD-1-2 현행 양도일이면 고지가 없다(대조군)", () => {
    const agg = calculateStockTransferTaxAggregate(items("2015-07-01", "2016-01-04"), "aggregate");
    expect(agg.totalUnderReportPenalty).toBeGreaterThan(0);
    render(<StockAggregateSummaryCard aggregate={agg} names={["가", "나"]} />);
    expect(screen.queryByTestId("stock-penalty-era-notice")).toBeNull();
  });

  it("PD-1-3 위반 선언이 없으면(가산세 0) 고지가 없다", () => {
    const agg = calculateStockTransferTaxAggregate(items("2015-03-02", "2015-06-20", "none"), "aggregate");
    render(<StockAggregateSummaryCard aggregate={agg} names={["가", "나"]} />);
    expect(screen.queryByTestId("stock-penalty-era-notice")).toBeNull();
  });
});
