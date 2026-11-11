/**
 * @vitest-environment jsdom
 *
 * 전자신고 세액공제 적용 범위 — 화면 anchor (V-21 · Q-2 a)
 *
 * 계획서: docs/00-pm/stock-prelim-credit-v19.plan.md · 판정·echo는
 * `__tests__/tax-engine/stock-transfer/electronic-filing-credit-scope.anchor.test.ts`가 본다. 여기서는 ① Step3 토글 문구가 범위를 말하는지
 * ② 합산 결과 카드가 고지 echo를 **그리는지**를 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { ELECTRONIC_FILING_CREDIT_NOT_APPLIED_NOTICE } from "@/lib/tax-engine/data/electronic-filing-credit-scope";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { StockAggregateSummaryCard } from "@/components/calc/results/StockAggregateSummaryCard";

afterEach(cleanup);

function inp(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi", isMajorShareholder: true, selfShareRatio: 0.03, selfMarketCap: 0,
    isLargestShareholderGroup: false, combinedShareRatio: 0, combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"), isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false, isHeavyRealEstateForValuation: false, isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false, isListedSmallShareholder: false, isVentureCompany: false, isKOTCTrading: false,
    acquisitionDate: new Date("2018-01-01"), transferDate: new Date("2024-06-01"), shareCount: 100,
    totalIssuedShares: 1_000_000, acquisitionCause: "purchase", transferPriceMode: "actual",
    perShareTransferPrice: 400_000, acquisitionMode: "actual", perShareAcquisitionPrice: 100_000,
    acquiredBeforeListing: false, tradingHaltAtTransfer: false, bookLost: false, expenseMode: "actual",
    actualExpenses: 0, filingType: "final", filingDate: new Date("2025-05-31"), isElectronicFiling: true,
    filingViolation: "none", isFraudulent: false, isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0, ...o,
  } as StockTransferInput;
}

describe("EC-3 화면", () => {
  it("EC-3-1 Step3 전자신고 토글 문구가 예정신고 한정·2021-02-17 이후를 말한다", () => {
    render(
      <Step3
        form={{ ...createInitialStockFormData(), marketType: "unlisted", transferDate: "2025-09-01", filingType: "preliminary" }}
        savedItems={[]}
        onChange={() => {}}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("시행령 §104의5");
    expect(text).toContain("예정신고에만 적용");
    expect(text).toContain("2021년 2월 17일");
  });

  it("EC-3-2 확정신고 합산 + 전자신고 → 카드에 고지가 보인다", () => {
    const agg = calculateStockTransferTaxAggregate([inp(), inp({ transferDate: new Date("2024-09-01") })], "aggregate");
    render(<StockAggregateSummaryCard aggregate={agg} names={["가", "나"]} />);
    expect(screen.getByTestId("stock-electronic-credit-notice").textContent).toBe(ELECTRONIC_FILING_CREDIT_NOT_APPLIED_NOTICE);
  });

  it("EC-3-3 예정신고 합산(공제 적용)이면 고지가 없다(대조군)", () => {
    const agg = calculateStockTransferTaxAggregate(
      [inp({ filingType: "preliminary" }), inp({ filingType: "preliminary", transferDate: new Date("2024-09-01") })],
      "aggregate",
    );
    expect(agg.electronicFilingCredit).toBe(20_000);
    render(<StockAggregateSummaryCard aggregate={agg} names={["가", "나"]} />);
    expect(screen.queryByTestId("stock-electronic-credit-notice")).toBeNull();
  });
});
