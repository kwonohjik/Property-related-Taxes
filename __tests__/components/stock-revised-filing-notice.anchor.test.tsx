/**
 * @vitest-environment jsdom
 *
 * 주식 «수정신고» 고지 — 화면 anchor (V-14 · Q-1 a · Q-2 항상)
 *
 * 판정·echo는 `__tests__/tax-engine/stock-transfer/revised-filing-notice.anchor.test.ts`가 본다. 여기서는 ① Step3 에 안내 카드가 배선됐는지
 * (수정신고를 고를 때만, 가산세 선언과 무관) ② 합산 결과 카드가 echo 를 **그리는지**를 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { REVISED_FILING_NOT_COMPUTED_NOTICE } from "@/lib/tax-engine/data/revised-filing-notice";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { StockAggregateSummaryCard } from "@/components/calc/results/StockAggregateSummaryCard";

afterEach(cleanup);

const form = (o: Partial<StockTransferFormData> = {}): StockTransferFormData => ({
  ...createInitialStockFormData(), marketType: "kospi", transferDate: "2024-06-01", ...o,
});
const NOTICE_ID = "stock-revised-filing-notice";

describe("RV-3 Step3 안내 카드", () => {
  it("RV-3-1 수정신고를 고르면 카드가 뜬다 — 추가납부세액·§48②1호 미계산을 말한다", () => {
    render(<Step3 form={form({ filingType: "revised" })} onChange={() => {}} />);
    const t = screen.getByTestId(NOTICE_ID).textContent ?? "";
    expect(t).toContain("추가납부세액");
    expect(t).toContain("국세기본법 §48②1호");
    expect(t).toContain("당초");
  });
  it("RV-3-2 가산세 위반을 선언한 수정신고에서도 같다(Q-2 항상)", () => {
    render(<Step3 form={form({ filingType: "revised", filingViolation: "under_report" })} onChange={() => {}} />);
    expect(screen.getByTestId(NOTICE_ID)).toBeTruthy();
  });
  it("RV-3-3 확정·예정신고에는 카드가 없다(대조군)", () => {
    for (const ft of ["final", "preliminary"] as const) {
      render(<Step3 form={form({ filingType: ft })} onChange={() => {}} />);
      expect(screen.queryByTestId(NOTICE_ID)).toBeNull();
      cleanup();
    }
  });
});

describe("RV-4 합산 결과 카드", () => {
  const inp = (o: Partial<StockTransferInput> = {}) =>
    ({
      marketType: "kospi", isMajorShareholder: true, selfShareRatio: 0.03, selfMarketCap: 0,
      isLargestShareholderGroup: false, combinedShareRatio: 0, combinedMarketCap: 0,
      priorYearEndDate: new Date("2023-12-31"), isQualifyingBlockShareholder: false,
      isHeavyRealEstateForRate: false, isHeavyRealEstateForValuation: false, isSmallMediumEnterprise: false,
      isMidsizeEnterprise: false, isListedSmallShareholder: false, isVentureCompany: false, isKOTCTrading: false,
      acquisitionDate: new Date("2022-01-01"), transferDate: new Date("2024-06-01"), shareCount: 100,
      totalIssuedShares: 1_000_000, acquisitionCause: "purchase", transferPriceMode: "actual",
      perShareTransferPrice: 400_000, acquisitionMode: "actual", perShareAcquisitionPrice: 100_000,
      acquiredBeforeListing: false, tradingHaltAtTransfer: false, bookLost: false, expenseMode: "actual",
      actualExpenses: 0, filingType: "revised", filingDate: new Date("2025-06-20"), isElectronicFiling: false,
      filingViolation: "none", isFraudulent: false, isInternationalTransaction: false,
      realEstateGroupBasicDeductionUsed: 0, ...o,
    }) as StockTransferInput;

  it("RV-4-1 수정신고 합산 → 카드에 고지가 보인다", () => {
    const agg = calculateStockTransferTaxAggregate([inp(), inp({ transferDate: new Date("2024-09-01") })], "aggregate");
    render(<StockAggregateSummaryCard aggregate={agg} names={["가", "나"]} />);
    expect(screen.getByTestId("stock-revised-filing-result-notice").textContent).toBe(REVISED_FILING_NOT_COMPUTED_NOTICE);
  });
  it("RV-4-2 확정신고 합산이면 없다(대조군)", () => {
    const agg = calculateStockTransferTaxAggregate([inp({ filingType: "final" }), inp({ filingType: "final", transferDate: new Date("2024-09-01") })], "aggregate");
    render(<StockAggregateSummaryCard aggregate={agg} names={["가", "나"]} />);
    expect(screen.queryByTestId("stock-revised-filing-result-notice")).toBeNull();
  });
});
