/**
 * @vitest-environment jsdom
 *
 * 주식 «예정신고 + 다반기 합산» 안내 — **결과 화면** 배선 anchor (V-10 · Q-1 a)
 *
 * 계획서: docs/00-pm/stock-prelim-multihalf-v10.plan.md
 * Step3 배선은 `stock-prelim-multi-period-step3.anchor.test.tsx`가 본다. 사용자가 합계를 «납부액»으로 읽는 곳은 결과 화면이라
 * 계산기를 **결과 단계로 렌더**해 안내가 합계 카드 위에 뜨는지 고정한다(실제 엔진 결과를 스토어에 싣는다).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/calc/stock-transfer-tax",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: () => ({ saved: false, error: null }),
}));
vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: { count: async () => 0, findAll: async () => [] },
}));
vi.mock("@/lib/storage/use-user-profile", () => ({
  useUserProfile: () => ({ profile: null, loading: false, refresh: async () => {} }),
}));

import StockTransferTaxCalculator from "@/app/calc/stock-transfer-tax/StockTransferTaxCalculator";
import { useStockTransferStore, createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

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


const form = (o: Partial<StockTransferFormData>): StockTransferFormData => ({
  ...createInitialStockFormData(),
  marketType: "unlisted",
  filingType: "preliminary",
  ...o,
});

function seedResult(filingType: "preliminary" | "final", dates: [string, string]) {
  const inputs = dates.map((d) => major({ transferDate: new Date(d), filingType }));
  const agg = calculateStockTransferTaxAggregate(inputs, "aggregate");
  useStockTransferStore.setState({
    savedItems: [form({ securityName: "가", transferDate: dates[0], filingType })],
    formData: form({ securityName: "나", transferDate: dates[1], filingType }),
    result: agg.items[agg.items.length - 1],
    aggregateResult: agg,
    currentStep: 3,
  });
}

beforeEach(() => useStockTransferStore.getState().reset());
afterEach(cleanup);

describe("PR-1 결과 화면 — 예정 + 다른 반기", () => {
  it("PR-1-1 안내가 뜨고 합계 카드가 그대로 있다(세액 불변)", () => {
    seedResult("preliminary", ["2025-03-01", "2025-09-01"]);
    render(<StockTransferTaxCalculator />);
    const box = screen.getByTestId("stock-prelim-multi-period-notice");
    expect(box.textContent).toContain("2025년 상반기");
    expect(box.textContent).toContain("2025년 하반기");
    expect(screen.getByText(/대주주 «3억원» 구간 합산/)).toBeTruthy();
  });

  it("PR-1-2 같은 반기면 안내가 없다", () => {
    seedResult("preliminary", ["2025-03-01", "2025-05-10"]);
    render(<StockTransferTaxCalculator />);
    expect(screen.queryByTestId("stock-prelim-multi-period-notice")).toBeNull();
  });

  it("PR-1-3 확정신고면 안내가 없다", () => {
    seedResult("final", ["2025-03-01", "2025-09-01"]);
    render(<StockTransferTaxCalculator />);
    expect(screen.queryByTestId("stock-prelim-multi-period-notice")).toBeNull();
  });
});
