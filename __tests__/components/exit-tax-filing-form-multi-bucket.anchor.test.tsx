/**
 * 국외전출세 PR-4 — 세율 구분 ≥2 결과는 별지 제84호서식의 단일 세율 칸에 담지 않는다.
 *
 * 서식 23·24행(단일 세율·누진공제)은 구분이 둘 이상이면 성립하지 않는다. 화면 V-7(2027.1.1. 개정 서식 대조) 전까지
 * 잘못된 «0.0%» 단일 세율을 보이는 대신 «표시 보류» 안내만 보인다. 구분이 하나이면 종전처럼 서식을 그린다.
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
  it("구분 2개 → 서식 표 대신 표시 보류 안내", () => {
    const result = calculateExitTax(
      base([h1, f1], { basicDeductionAllocation: { clause1: 2_500_000, clause2b: 0 } }),
    );
    expect(result.bucketDetails).toHaveLength(2);
    render(<ExitTaxFilingFormSection result={result} departureDate="2027-01-01" />);
    expect(screen.queryByTestId("filing-table-stub")).toBeNull();
    expect(screen.getByText("별지 제84호서식 표시 보류")).toBeTruthy();
  });

  it("구분 1개 → 종전처럼 서식 표", () => {
    const result = calculateExitTax(base([h1]));
    render(<ExitTaxFilingFormSection result={result} departureDate="2027-01-01" />);
    expect(screen.getByTestId("filing-table-stub")).toBeTruthy();
  });
});
