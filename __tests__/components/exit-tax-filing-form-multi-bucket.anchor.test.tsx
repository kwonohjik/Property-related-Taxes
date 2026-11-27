/**
 * 국외전출세 — 세율 구분 ≥2 결과는 25행 표의 단일 세율 칸에 담지 않는다.
 *
 * PR-4에서는 «표시 보류» 안내만 보였으나, U3(V-7 대조 — 2027.1.1. 개정 별지 제84호가 ③ 세율구분별 열을 둔다)에서
 * 구분별 열 표(`ExitTaxBucketFilingTable`)로 바뀌었다. 구분이 하나이면 종전처럼 25행 서식을 그린다.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxHolding, ExitTaxInput } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

vi.mock("@/components/calc/results/useStockFilingHeaderMeta", () => ({
  useStockFilingHeaderMeta: () => ({}),
}));
vi.mock("@/components/calc/stock-transfer/StockFilingFormTable", () => ({
  StockFilingFormTable: () => <div data-testid="filing-table-stub" />,
}));

import { ExitTaxFilingFormSection } from "@/components/calc/results/ExitTaxFilingFormSection";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const h1: ExitTaxHolding = {
  id: "h1", stockName: "H1", marketType: "kosdaq", shareCount: 10_000, acquisitionDate: utc(2015, 1, 1),
  perShareAcquisitionPrice: 10_000, departureDayValuationMode: "market_price", departureDayMarketPrice: 50_000,
};
const f1: ExitTaxHolding = {
  id: "f1", stockName: "F1", marketType: "foreign_stock", isListedForeignCorp: true, shareCount: 1_000,
  acquisitionDate: utc(2018, 1, 1), perShareAcquisitionPrice: 480_000,
  departureDayValuationMode: "market_price", departureDayMarketPrice: 1_400_000,
};
const base = (holdings: ExitTaxHolding[], over: Partial<ExitTaxInput> = {}): ExitTaxInput => ({
  marketType: "exit_tax", yearsResidentLast10: 10, departureDate: utc(2027, 1, 1), isMajorShareholder: true,
  holdings, deferralRequested: false, deferralReason: "none", foreignTaxExclusionReason: "none",
  hasFiledHoldingsReport: true, reenteredWithin5Years: false, ...over,
});

describe("ExitTaxFilingFormSection — 구분 ≥2", () => {
  it("구분 2개 → 25행 표 대신 세율구분별 열 표(표시 보류 안내 없음)", () => {
    const result = calculateExitTax(
      base([h1, f1], { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } }),
    );
    expect(result.bucketDetails).toHaveLength(2);
    render(<ExitTaxFilingFormSection result={result} departureDate="2027-01-01" />);
    expect(screen.queryByTestId("filing-table-stub")).toBeNull();
    expect(screen.queryByText("별지 제84호서식 표시 보류")).toBeNull();
    expect(screen.getByTestId("exit-tax-bucket-filing-table")).toBeTruthy();
  });

  it("구분 1개 → 종전처럼 서식 표", () => {
    const result = calculateExitTax(base([h1]));
    render(<ExitTaxFilingFormSection result={result} departureDate="2027-01-01" />);
    expect(screen.getByTestId("filing-table-stub")).toBeTruthy();
  });
});
