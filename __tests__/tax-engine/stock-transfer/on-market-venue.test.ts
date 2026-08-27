/**
 * 장내·장외 거래 구분 (§94①3 가목 1) 단서) — 신규 isOnMarketTransaction 필드 검증
 *
 * OM-1 ~ OM-12 매트릭스
 *
 * 핵심 정책:
 *   - silent 비과세 차단: 사용자가 명시적으로 isOnMarketTransaction=true 일 때만 비과세
 *   - 신규 enum taxCategory="listed_off_market_non_major" (KOSPI/KOSDAQ/KONEX + 비대주주 + 장외)
 *   - 비과세 분기에서도 산출세액·과세표준은 정보용 echo. 최종 finalTax만 0.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function baseInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    isOnMarketTransaction: true,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 50_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 30_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...overrides,
  };
}

describe("OM — 장내·장외 거래 매트릭스 (§94①3 가목 1) 단서)", () => {
  // ──────────────────────────────────────────────────────────
  // OM-1: 코스피 비대주주 + 장내 — 비과세 (현행 동작 보존)
  // ──────────────────────────────────────────────────────────
  it("OM-1: 코스피 비대주주 + 장내 → 비과세 + 산출세액 정보용 echo", () => {
    const r = calculateStockTransferTax(
      baseInput({ marketType: "kospi", isOnMarketTransaction: true })
    );
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("non_major_in_market");
    expect(r.taxCategory).toBe("listed_non_major_in_market");
    expect(r.finalTax).toBe(0);
    expect(r.localIncomeTax).toBe(0);
    // 정보용 산식 echo — 산출세액·과세표준 > 0
    expect(r.transferPrice).toBe(50_000_000);
    expect(r.acquisitionPrice).toBe(30_000_000);
    expect(r.taxBase).toBeGreaterThan(0);
    expect(r.calculatedTax).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────
  // OM-2: 코스피 비대주주 + 장외 — 과세 (★ Pre-Do anchor)
  //   양도가 5천만 - 취득가 3천만 = 양도차익 2천만
  //   - 기본공제 250만 = 과세표준 1,750만
  //   × 비중소 20% = 산출세액 3,500,000
  // ──────────────────────────────────────────────────────────
  it("OM-2: 코스피 비대주주 + 장외 → 과세 (산출세액 3,500,000)", () => {
    const r = calculateStockTransferTax(
      baseInput({ marketType: "kospi", isOnMarketTransaction: false })
    );
    expect(r.isExempt).toBe(false);
    expect(r.taxCategory).toBe("listed_off_market_non_major");
    // 2026-08-27 정정: 종전 기대값은 `①3가1)`이었으나 가목 1)은 「**대주주가** 양도하는 것」이다.
    // 비대주주의 장외 양도를 담는 목은 가목 **2)**다 —
    // 「1)에 따른 대주주에 해당하지 아니하는 자가 증권시장에서의 거래에 의하지 아니하고 양도하는 주식등」
    // (소득세법 §94①3 가목 2) · KoreanLaw mst 280405 실측). 세액은 불변이다.
    expect(r.appliedSection94).toBe("①3가2)");
    expect(r.transferPrice).toBe(50_000_000);
    expect(r.acquisitionPrice).toBe(30_000_000);
    expect(r.transferIncome).toBe(20_000_000);
    expect(r.basicDeduction).toBe(2_500_000);
    expect(r.taxBase).toBe(17_500_000);
    expect(r.appliedRate).toBeCloseTo(0.2, 5);
    expect(r.calculatedTax).toBe(3_500_000);
    expect(r.finalTax).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────
  // OM-3: 코스닥 대주주 + 장내 — 과세 (대주주는 venue 무관)
  // ──────────────────────────────────────────────────────────
  it("OM-3: 코스닥 대주주 + 장내 → 과세 (listed_major)", () => {
    const r = calculateStockTransferTax(
      baseInput({
        marketType: "kosdaq",
        isMajorShareholder: true,
        selfShareRatio: 0.05,
        isOnMarketTransaction: true,
      })
    );
    expect(r.isExempt).toBe(false);
    expect(r.taxCategory).toBe("listed_major");
  });

  // ──────────────────────────────────────────────────────────
  // OM-4: 코스닥 대주주 + 장외 — 과세 (역시 listed_major, venue 무관)
  // ──────────────────────────────────────────────────────────
  it("OM-4: 코스닥 대주주 + 장외 → listed_major (isOnMarket 무관)", () => {
    const r = calculateStockTransferTax(
      baseInput({
        marketType: "kosdaq",
        isMajorShareholder: true,
        selfShareRatio: 0.05,
        isOnMarketTransaction: false,
      })
    );
    expect(r.isExempt).toBe(false);
    expect(r.taxCategory).toBe("listed_major");
  });

  // ──────────────────────────────────────────────────────────
  // OM-5: 코넥스 비대주주 + 장내 → 비과세 (회귀 보호)
  // ──────────────────────────────────────────────────────────
  it("OM-5: 코넥스 비대주주 + 장내 → 비과세", () => {
    const r = calculateStockTransferTax(
      baseInput({ marketType: "konex", isOnMarketTransaction: true })
    );
    expect(r.isExempt).toBe(true);
    expect(r.taxCategory).toBe("listed_non_major_in_market");
    expect(r.finalTax).toBe(0);
  });

  // ──────────────────────────────────────────────────────────
  // OM-6: 코넥스 비대주주 + 장외 → 과세 (★ 신규 분기)
  // ──────────────────────────────────────────────────────────
  it("OM-6: 코넥스 비대주주 + 장외 → 과세 (listed_off_market_non_major)", () => {
    const r = calculateStockTransferTax(
      baseInput({ marketType: "konex", isOnMarketTransaction: false })
    );
    expect(r.isExempt).toBe(false);
    expect(r.taxCategory).toBe("listed_off_market_non_major");
    expect(r.calculatedTax).toBeGreaterThan(0);
    expect(r.finalTax).toBeGreaterThan(0);
  });

  // ──────────────────────────────────────────────────────────
  // OM-7: 비상장 + K-OTC 비대주주 → 기존 listed_otc_non_major 보존 (isOnMarket 무시)
  // ──────────────────────────────────────────────────────────
  it("OM-7: K-OTC 비대주주 (unlisted + isKOTCTrading) → unlisted_non_major (isOnMarket 무시)", () => {
    const r = calculateStockTransferTax(
      baseInput({
        marketType: "unlisted",
        isKOTCTrading: true,
        isOnMarketTransaction: false,
      })
    );
    // K-OTC 거래 분류 — marketType=unlisted + isKOTCTrading=true 조합은 unlisted_non_major.
    // (현행 classifySection94 동작 — isOnMarket 신규 분기 영향 없음)
    expect(r.taxCategory).toBe("unlisted_non_major");
  });

  // ──────────────────────────────────────────────────────────
  // OM-8: K-OTC + 중소·중견 소액주주 → kotc_sme_mid_exempt (기존 비과세 보존)
  // ──────────────────────────────────────────────────────────
  it("OM-8: K-OTC + 중소 + 소액주주 → 비과세 (kotc_sme_mid)", () => {
    const r = calculateStockTransferTax(
      baseInput({
        marketType: "unlisted",
        isKOTCTrading: true,
        isSmallMediumEnterprise: true,
        isListedSmallShareholder: true,
      })
    );
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("kotc_sme_mid");
  });

  // ──────────────────────────────────────────────────────────
  // OM-9: 비상장 비대주주 — isOnMarket 영향 없음
  // ──────────────────────────────────────────────────────────
  it("OM-9: 비상장 비대주주 → unlisted_non_major (isOnMarket 무관)", () => {
    const r = calculateStockTransferTax(
      baseInput({ marketType: "unlisted", isOnMarketTransaction: false })
    );
    expect(r.taxCategory).toBe("unlisted_non_major");
    expect(r.isExempt).toBe(false);
  });

  // ──────────────────────────────────────────────────────────
  // OM-11: 코스피 대주주 + 장내 — 회귀 (대주주 우선)
  // ──────────────────────────────────────────────────────────
  it("OM-11: 코스피 대주주 + 장내 → listed_major (venue 무관)", () => {
    const r = calculateStockTransferTax(
      baseInput({
        marketType: "kospi",
        isMajorShareholder: true,
        selfShareRatio: 0.05,
        isOnMarketTransaction: true,
      })
    );
    expect(r.taxCategory).toBe("listed_major");
    expect(r.isExempt).toBe(false);
  });

  // ──────────────────────────────────────────────────────────
  // 기본 default — isOnMarketTransaction 미지정 시 true 동작 (회귀)
  // ──────────────────────────────────────────────────────────
  it("OM-default: isOnMarketTransaction 미지정 → 비과세 (기존 동작 보존)", () => {
    const input = baseInput({ marketType: "kospi" });
    delete (input as Partial<StockTransferInput>).isOnMarketTransaction;
    const r = calculateStockTransferTax(input);
    expect(r.isExempt).toBe(true);
    expect(r.taxCategory).toBe("listed_non_major_in_market");
  });
});
