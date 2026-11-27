/**
 * @vitest-environment jsdom
 *
 * 국외전출세 ⑥ 사이드바 — 전부 제외 결과(`isLiable false`)에도 «제외된 국외주식등 간주양도가액»이 보인다 (14지점 점검 F6)
 *
 * 그 줄이 `if (r.isLiable)` 안쪽에 있어, 국외주식이 전부 제외된 결과(엔진이 `holdingDetails`를 echo하는데도)에서만 사라졌다.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import { useStockTransferStore, createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxHolding, ExitTaxInput } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

afterEach(cleanup);

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const h1: ExitTaxHolding = {
  id: "h1", stockName: "H1", marketType: "kosdaq", shareCount: 10_000, acquisitionDate: utc(2015, 1, 1),
  perShareAcquisitionPrice: 10_000, departureDayValuationMode: "market_price", departureDayMarketPrice: 50_000,
};
/** 5억 이하 국외주식 → 제외(foreign_total_le_500m). 간주양도가액 = 10주 × 200 = 2,000 */
const f2: ExitTaxHolding = {
  id: "f2", stockName: "F2", marketType: "foreign_stock", isListedForeignCorp: true, shareCount: 10,
  acquisitionDate: utc(2018, 1, 1), perShareAcquisitionPrice: 100,
  departureDayValuationMode: "market_price", departureDayMarketPrice: 200,
};
const base = (holdings: ExitTaxHolding[], over: Partial<ExitTaxInput> = {}): ExitTaxInput => ({
  marketType: "exit_tax", yearsResidentLast10: 10, departureDate: utc(2027, 1, 1), isMajorShareholder: true,
  holdings, deferralRequested: false, deferralReason: "none", foreignTaxExclusionReason: "none",
  hasFiledHoldingsReport: true, reenteredWithin5Years: false, ...over,
});

const LABEL = "제외된 국외주식등 간주양도가액";
function mount(result: ReturnType<typeof calculateExitTax>) {
  useStockTransferStore.setState({
    formData: { ...createInitialStockFormData(), marketType: "exit_tax", etDepartureDate: "2027-01-01" },
    savedItems: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: result as any,
    aggregateResult: null,
  });
  render(<StockSidebar currentStep={1} onStepClick={() => {}} />);
}

describe("F6 사이드바 제외 줄", () => {
  beforeEach(() => useStockTransferStore.setState({ result: null }));

  it("전부 제외(isLiable false) → 줄이 보이고 값은 엔진 echo 합(2,000)", () => {
    const r = calculateExitTax(base([f2]));
    expect(r.isLiable).toBe(false);
    mount(r);
    const row = screen.getByText(LABEL).closest("div");
    expect(row?.textContent).toContain("2,000");
  });

  it("일부 제외(isLiable true) → 종전대로 보인다(회귀)", () => {
    const r = calculateExitTax(base([h1, f2]));
    expect(r.isLiable).toBe(true);
    mount(r);
    expect(screen.queryByText(LABEL)).not.toBeNull();
  });

  it("거주 5년 미만 not_liable(holdingDetails 비어 있음) → 줄 없음(0원 행 금지)", () => {
    const r = calculateExitTax(base([f2], { yearsResidentLast10: 3 }));
    expect(r.isLiable).toBe(false);
    mount(r);
    expect(screen.queryByText(LABEL)).toBeNull();
  });
});
