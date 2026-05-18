/**
 * 상장주식 환산취득가 시행령 §163⑨ 산식 검증 (LE-1 ~ LE-8)
 *
 * Bug 수정 PR:
 *   A. 환산취득가 산식 누락 — 양도시 기준시가를 그대로 취득가로 사용하던 버그
 *   B. 개산공제 §163⑥4 base를 양도시 기준시가로 잘못 계산 + 환산 모드에서 자동 적용 누락
 *
 * 산식 (시행령 §163⑨):
 *   환산취득가 = 양도가 × (취득시 기준시가 / 양도시 기준시가)
 *   개산공제 (§163⑥4) = 취득기준시가 총액 × 1%
 *
 * 본 PR에서 §97② 단서 swap은 미적용 — KoreanLaw 검증 후 후속 PR 검토.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function baseInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: false,            // 비대주주 (기본)
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    isOnMarketTransaction: false,         // 장외 (과세) — LE-1~7 anchor는 산출세액 확인 위해 과세 분기
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: new Date("2018-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 50_000,
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: 50_000,
    acquisitionDatePriceAvg1Month: 30_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "estimated",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...overrides,
  };
}

describe("LE — 상장주식 환산취득가 시행령 §163⑨ 산식", () => {
  // ──────────────────────────────────────────────────────────
  // LE-1 ★ Pre-Do — 환산비율 0.6 케이스
  //   양도가 50,000,000 × (30,000 / 50,000) = 30,000,000
  //   개산공제 = 30,000 × 1,000 × 1% = 300,000
  //   양도차익 = 50M − 30M − 300K = 19,700,000
  //   기본공제 250만 → 과세표준 17,200,000
  //   × 비중소 20% = 산출세액 3,440,000
  // ──────────────────────────────────────────────────────────
  it("LE-1: 환산비율 0.6 → 취득가 30M · 개산공제 300K · 산출세액 3,440,000", () => {
    const r = calculateStockTransferTax(
      baseInput({
        transferDatePriceAvg1Month: 50_000,
        acquisitionDatePriceAvg1Month: 30_000,
      })
    );
    expect(r.transferPrice).toBe(50_000_000);
    expect(r.acquisitionPrice).toBe(30_000_000);
    expect(r.expenses).toBe(300_000);
    expect(r.transferIncome).toBe(19_700_000);
    expect(r.basicDeduction).toBe(2_500_000);
    expect(r.taxBase).toBe(17_200_000);
    expect(r.calculatedTax).toBe(3_440_000);
    expect(r.valuationDetail?.method).toBe("monthly_avg_listed");
    expect(r.valuationDetail?.finalPerShareValue).toBe(30_000);
  });

  // ──────────────────────────────────────────────────────────
  // LE-2 — 환산비율 0.5
  //   양도가 50M × 0.5 = 25M, 개산공제 = 20K × 1000 × 1% = 200K
  //   양도차익 = 50M − 25M − 200K = 24,800,000
  //   과세표준 22,300,000 × 20% = 4,460,000
  // ──────────────────────────────────────────────────────────
  it("LE-2: 환산비율 0.5 → 취득가 25M · 개산공제 200K · 산출세액 4,460,000", () => {
    const r = calculateStockTransferTax(
      baseInput({
        transferDatePriceAvg1Month: 40_000,
        acquisitionDatePriceAvg1Month: 20_000,
        perShareTransferPrice: 50_000,
      })
    );
    expect(r.acquisitionPrice).toBe(25_000_000);
    expect(r.expenses).toBe(200_000);
    expect(r.transferIncome).toBe(24_800_000);
    expect(r.taxBase).toBe(22_300_000);
    expect(r.calculatedTax).toBe(4_460_000);
  });

  // ──────────────────────────────────────────────────────────
  // LE-3 — 환산비율 1.0 (음수 양도차익 처리)
  //   양도가 50M × 1.0 = 50M, 개산공제 = 50K × 1000 × 1% = 500K
  //   양도차익 = 50M − 50M − 500K = -500,000
  //   transferIncome max(0, -500K) = 0
  // ──────────────────────────────────────────────────────────
  it("LE-3: 환산비율 1.0 + 개산공제로 음수 → transferIncome 0 (max 처리)", () => {
    const r = calculateStockTransferTax(
      baseInput({
        transferDatePriceAvg1Month: 50_000,
        acquisitionDatePriceAvg1Month: 50_000,
      })
    );
    expect(r.acquisitionPrice).toBe(50_000_000);
    expect(r.expenses).toBe(500_000);
    // STEP 5에서 음수 → max(0, ·) 처리
    expect(r.transferIncome).toBeLessThanOrEqual(0);
    expect(r.taxBase).toBe(0);
    expect(r.calculatedTax).toBe(0);
  });

  // ──────────────────────────────────────────────────────────
  // LE-4 — 환산비율 0.75 (소수점 누적 차단 검증)
  //   양도가 60M × 0.75 = 45,000,000
  //   개산공제 = 45,000 × 1000 × 1% = 450,000
  // ──────────────────────────────────────────────────────────
  it("LE-4: 환산비율 0.75 → 취득가 45M · 개산공제 450K", () => {
    const r = calculateStockTransferTax(
      baseInput({
        perShareTransferPrice: 60_000,
        transferDatePriceAvg1Month: 60_000,
        acquisitionDatePriceAvg1Month: 45_000,
      })
    );
    expect(r.transferPrice).toBe(60_000_000);
    expect(r.acquisitionPrice).toBe(45_000_000);
    expect(r.expenses).toBe(450_000);
    expect(r.valuationDetail?.finalPerShareValue).toBe(45_000);
  });

  // ──────────────────────────────────────────────────────────
  // LE-5 — 양도시 기준시가 0 (방어 처리)
  //   환산 산식 분모 0 → 환산취득가 0, 개산공제 0
  // ──────────────────────────────────────────────────────────
  it("LE-5: 양도시 기준시가 0 → 방어 처리 (취득가 0)", () => {
    const r = calculateStockTransferTax(
      baseInput({
        transferDatePriceAvg1Month: 0,
        acquisitionDatePriceAvg1Month: 30_000,
      })
    );
    expect(r.acquisitionPrice).toBe(0);
    expect(r.expenses).toBe(0);
  });

  // ──────────────────────────────────────────────────────────
  // LE-6 — 취득시 기준시가 0 (방어 처리)
  //   환산 산식 분자 0 → 환산취득가 0, 개산공제 base 0
  // ──────────────────────────────────────────────────────────
  it("LE-6: 취득시 기준시가 0 → 방어 처리 (취득가 0)", () => {
    const r = calculateStockTransferTax(
      baseInput({
        transferDatePriceAvg1Month: 50_000,
        acquisitionDatePriceAvg1Month: 0,
      })
    );
    expect(r.acquisitionPrice).toBe(0);
    expect(r.expenses).toBe(0);
  });

  // ──────────────────────────────────────────────────────────
  // LE-7 — 환산 모드 + actualExpenses 입력 시 무시 (Bug-B 자동 개산공제)
  //   expenseMode="actual" + actualExpenses=1,000,000이어도 개산공제 300,000 강제
  //   + warning 노출
  // ──────────────────────────────────────────────────────────
  it("LE-7: 환산 모드 + actualExpenses 입력 → 개산공제만 적용 + warning", () => {
    const r = calculateStockTransferTax(
      baseInput({
        transferDatePriceAvg1Month: 50_000,
        acquisitionDatePriceAvg1Month: 30_000,
        expenseMode: "actual",
        actualExpenses: 1_000_000,
      })
    );
    expect(r.acquisitionPrice).toBe(30_000_000);
    expect(r.expenses).toBe(300_000); // 개산공제 강제 (실비 1M 무시)
    expect(r.warnings.some((w) => w.includes("환산취득가 모드"))).toBe(true);
  });

  // ──────────────────────────────────────────────────────────
  // LE-8 — 비과세 분기 + 환산 (장내 비대주주)
  //   finalTax=0, calculatedTax echo (정보용)
  // ──────────────────────────────────────────────────────────
  it("LE-8: 비과세 분기 (장내) + 환산 → finalTax=0 + 산출세액 정보용 3,440,000 echo", () => {
    const r = calculateStockTransferTax(
      baseInput({
        isOnMarketTransaction: true,
        transferDatePriceAvg1Month: 50_000,
        acquisitionDatePriceAvg1Month: 30_000,
      })
    );
    expect(r.isExempt).toBe(true);
    expect(r.taxCategory).toBe("listed_non_major_in_market");
    expect(r.acquisitionPrice).toBe(30_000_000);
    expect(r.expenses).toBe(300_000);
    expect(r.calculatedTax).toBe(3_440_000);
    expect(r.finalTax).toBe(0);
    expect(r.localIncomeTax).toBe(0);
  });
});
