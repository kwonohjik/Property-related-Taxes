/**
 * @vitest-environment jsdom
 *
 * 국외주식 ⑤⑥⑦ — 원화 환산 **미리보기가 엔진과 같은 정확값**이고, 결과 산식의 환율이 소수 4자리까지 보인다
 * (계획서 UI U-1~U-6 · §1.3 · 엔진 A-1-1).
 *
 * 함정: `Math.floor(400000 × 1300.10)` = 520,039,999, `Math.floor(100 × 4000 × 1300.10)` = 520,039,999 (정확값 520,040,000).
 * 미리보기 6곳(양도 총액·1주당 / 취득 / 사이드바 2 / 증여자 취득 / 분할 수령 행)이 같은 부동소수 식을 복제하고 있었다 — 한 곳씩 짚는다.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ForeignStockPriceBlock } from "@/components/calc/stock-transfer/ForeignStockPriceBlock";
import { ForeignCarryoverDonorPriceSection } from "@/components/calc/stock-transfer/ForeignCarryoverBlocks";
import { InstallmentReceiptsMatrix } from "@/components/calc/stock-transfer/InstallmentReceiptsMatrix";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import { ForeignStockResultCard } from "@/components/calc/results/ForeignStockResultCard";
import { fxFormula, fmtRate } from "@/components/calc/foreign/fx-formula";
import { useStockTransferStore, createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { ForeignStockResult } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

afterEach(cleanup);

const foreign = (o: Partial<StockTransferFormData> = {}): StockTransferFormData => ({
  ...createInitialStockFormData(),
  securityName: "Example Corp",
  marketType: "foreign_stock",
  shareCount: "4000",
  ...o,
});
const text = () => document.body.textContent ?? "";

describe("U-2·U-3·U-4 ForeignStockPriceBlock — 양도·취득 미리보기", () => {
  it("양도 총액 모드: 400,000 × 1,300.10 → 520,040,000 (부동소수 520,039,999 아님)", () => {
    render(
      <ForeignStockPriceBlock
        form={foreign({ fgTransferPriceMode: "total", totalTransferPriceForeign: "400000", transferExchangeRate: "1300.10" })}
        onChange={() => {}}
      />,
    );
    expect(text()).toContain("양도가액(원화 환산 참고): 520,040,000");
  });

  it("양도 1주당 모드: 100 × 4,000주 × 1,300.10 → 520,040,000", () => {
    render(
      <ForeignStockPriceBlock
        form={foreign({ fgTransferPriceMode: "per_share", perShareTransferPriceForeign: "100", transferExchangeRate: "1300.10" })}
        onChange={() => {}}
      />,
    );
    expect(text()).toContain("양도가액(원화 환산 참고): 520,040,000");
  });

  it("취득 미리보기: 100 × 4,000주 × 1,300.10 → 520,040,000", () => {
    render(
      <ForeignStockPriceBlock
        form={foreign({ perShareAcquisitionPriceForeign: "100", acquisitionExchangeRate: "1300.10" })}
        onChange={() => {}}
      />,
    );
    expect(text()).toContain("취득가액(원화 환산 참고): 520,040,000");
  });

  it("환율 소수 5자리(엔진·⑧이 거부하는 입력)는 미리보기를 숨긴다 — 틀린 숫자를 보이지 않는다", () => {
    render(
      <ForeignStockPriceBlock
        form={foreign({ fgTransferPriceMode: "total", totalTransferPriceForeign: "400000", transferExchangeRate: "1300.12345" })}
        onChange={() => {}}
      />,
    );
    expect(text()).not.toContain("양도가액(원화 환산 참고)");
  });
});

describe("U-6 ForeignCarryoverBlocks — 증여자 취득가액 미리보기", () => {
  it("50 × 4,000주 × 1,300.10 → 260,020,000 (부동소수 260,019,999)", () => {
    render(
      <ForeignCarryoverDonorPriceSection
        form={foreign({
          acquisitionCause: "carryover_gift",
          donorPerShareAcquisitionPriceForeign: "50",
          donorAcquisitionExchangeRate: "1300.10",
        })}
        onChange={() => {}}
      />,
    );
    expect(text()).toContain("증여자 취득가액(원화 환산 참고): 260,020,000");
  });
});

describe("U-1 분할 수령 행 — 주식 호출부가 정확 환산을 넘긴다 (krwOf 필수)", () => {
  it("400,000 × 1,300.10 → 520,040,000 · 합계 상자에도 정확값", () => {
    render(
      <InstallmentReceiptsMatrix
        currencyCode="USD"
        onChange={() => {}}
        rows={[
          { receiptDate: "2026-03-01", amountForeign: "400000", exchangeRate: "1300.10" },
          { receiptDate: "2026-09-01", amountForeign: "100000", exchangeRate: "1200.30" },
        ]}
      />,
    );
    expect(text()).toContain("520,040,000");
    expect(text()).toContain("120,030,000");
    // 합계 640,070,000 (부동소수 행 환산이면 520,039,999 + 120,030,000 = 640,069,999)
    expect(text()).toContain("640,070,000");
    expect(text()).not.toContain("520,039,999");
  });
});

describe("U-5 StockSidebar — 양도가액(환산 참고)", () => {
  beforeEach(() => {
    useStockTransferStore.setState({ savedItems: [], result: null, aggregateResult: null });
  });

  it("총액 모드 400,000 × 1,300.10 → 520,040,000", () => {
    useStockTransferStore.setState({
      formData: foreign({ fgTransferPriceMode: "total", totalTransferPriceForeign: "400000", transferExchangeRate: "1300.10" }),
    });
    render(<StockSidebar currentStep={2} onStepClick={() => {}} />);
    expect(screen.getByText("양도가액(환산 참고)")).toBeTruthy();
    expect(screen.getByText("520,040,000")).toBeTruthy();
  });

  it("1주당 모드 100 × 4,000주 × 1,300.10 → 520,040,000", () => {
    useStockTransferStore.setState({
      formData: foreign({ fgTransferPriceMode: "per_share", perShareTransferPriceForeign: "100", transferExchangeRate: "1300.10" }),
    });
    render(<StockSidebar currentStep={2} onStepClick={() => {}} />);
    expect(screen.getByText("520,040,000")).toBeTruthy();
  });
});

describe("§1.3 결과 산식 — 환율 소수 4자리 표시", () => {
  it("fmtRate: 1300.1234 → «1,300.1234» (toLocaleString 기본은 «1,300.123»으로 잘린다) · 정수·1자리는 그대로", () => {
    expect((1300.1234).toLocaleString("ko-KR")).toBe("1,300.123"); // 함정 고정
    expect(fmtRate(1300.1234)).toBe("1,300.1234");
    expect(fmtRate(1300.1)).toBe("1,300.1");
    expect(fmtRate(1250)).toBe("1,250");
    expect(fmtRate(0.6667)).toBe("0.6667");
  });

  it("fxFormula(주식·부동산 공용): 환율 4자리가 산식에 그대로 보인다", () => {
    expect(fxFormula(400_000, "USD", 1300.1234, 520_048_000)).toBe("USD 400,000 × 1,300.1234 = 520,048,000");
  });

  it("ForeignStockResultCard — 양도·취득·필요경비·외국납부세액 환율이 모두 4자리", () => {
    const result = {
      taxCategory: "foreign_stock",
      isLiable: true,
      transferPriceKrw: 520_048_000,
      acquisitionPriceKrw: 96_000_000,
      necessaryExpensesKrw: 1_000,
      transferGain: 424_000_000,
      basicDeduction: 2_500_000,
      taxBase: 421_500_000,
      appliedRate: 0.2,
      progressiveDeduction: 0,
      incomeTax: 84_300_000,
      localIncomeTax: 8_430_000,
      finalTax: 84_300_000,
      finalLocalTax: 8_430_000,
      totalTax: 92_730_000,
      transferExchangeRate: 1300.1234,
      transferPriceForeign: 400_000,
      transferCurrencyCode: "USD",
      acquisitionExchangeRate: 1000.5678,
      capitalExpenditureExchangeRateApplied: 1111.1111,
      transferCostExchangeRateApplied: 1222.2222,
      foreignTaxPaidKrw: 6_500_000,
      foreignTaxExchangeRate: 1300.5555,
      warnings: [],
      appliedRules: [],
    } as unknown as ForeignStockResult;
    render(<ForeignStockResultCard result={result} />);
    const t = text();
    expect(t).toContain("× 1,300.1234 = 520,048,000");
    expect(t).toContain("1,000.5678");
    expect(t).toContain("자본적지출 1,111.1111");
    expect(t).toContain("양도비 1,222.2222");
    expect(t).toContain("납세일 기준환율 1,300.5555");
    expect(t).not.toContain("1,300.123 ");
  });
});
