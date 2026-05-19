/**
 * F-15·F-16 — 대차주식·사모펀드 간접소유 자동 가산 anchor (PHF-01~06)
 *
 * 시행령 §157 (2013.2.15. 이후 양도분) — 대주주 판정 시 자동 합산:
 *   F-15: 본인 대여 중 대차주식
 *   F-16: 사모펀드 간접소유 주식
 *
 * 교재 §3장 이미지 51 Check Point ⑧·⑨.
 *
 * 핵심 정책:
 *   - 시행일자 가드: transferDate >= 2013-02-15 미달이면 가산 미적용
 *   - 지분율 가산만 자동 — 시가총액은 가격 외부 의존이라 사용자 책임
 *   - 가산 적용 시 appliedThreshold.shareAugmentationApplied === true echo
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function makeInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kosdaq",
    isMajorShareholder: false,
    selfShareRatio: 0.015, // 1.5% — 코스닥 임계 2% 미달
    selfMarketCap: 1_000_000_000, // 10억 — 코스닥 50억 미달
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
    acquisitionDate: new Date("2022-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1000,
    totalIssuedShares: 100_000,
    acquisitionCause: "purchase",
    cumulativeTransferRatio: undefined,
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

describe("F-15·F-16 — 대차/사모펀드 자동 가산 (시행령 §157 2013.2.15.~)", () => {
  describe("PHF-01: 양도일 2013.2.15. 이전 → 가산 미적용", () => {
    it("transferDate=2013-02-14, lentShares=2000 (지분율 2%) → 비대주주 유지", () => {
      const result = calculateStockTransferTax(makeInput({
        transferDate: new Date("2013-02-14"),
        acquisitionDate: new Date("2010-01-01"),
        priorYearEndDate: new Date("2012-12-31"),
        lentSharesCount: 2000, // 2% — 임계 도달
        // 2013 이전이라 가산 미적용
      }));
      expect(result.appliedThreshold?.shareAugmentationApplied).toBe(false);
      expect(result.appliedThreshold?.augmentedShares).toBe(0);
      // 가산 미적용 — 비대주주 유지 (selfShareRatio 1.5% < 코스닥 임계 2%)
      expect(result.taxCategory).toBe("listed_non_major_in_market");
    });
  });

  describe("PHF-02: 양도일 2013.2.15. 정확히 → 가산 적용", () => {
    it("transferDate=2013-02-15, lentShares=600 (0.6%) → 비대주주 유지 (1.5+0.6=2.1%이나 시기별 임계와 별개로 표시)", () => {
      const result = calculateStockTransferTax(makeInput({
        transferDate: new Date("2013-02-15"),
        acquisitionDate: new Date("2010-01-01"),
        priorYearEndDate: new Date("2012-12-31"),
        lentSharesCount: 600,
      }));
      expect(result.appliedThreshold?.shareAugmentationApplied).toBe(true);
      expect(result.appliedThreshold?.augmentedShares).toBe(600);
    });
  });

  describe("PHF-03: F-15 대차주식 가산으로 비대주주→대주주 전환 (코스닥 2024)", () => {
    it("selfShareRatio=1.5% + lentShares=600 (0.6%) → 합계 2.1% ≥ 코스닥 2% → 대주주", () => {
      const result = calculateStockTransferTax(makeInput({
        marketType: "kosdaq",
        selfShareRatio: 0.015,
        selfMarketCap: 0, // 시총 0
        totalIssuedShares: 100_000,
        lentSharesCount: 600,
        transferDate: new Date("2024-06-01"),
        priorYearEndDate: new Date("2023-12-31"),
      }));
      expect(result.appliedThreshold?.shareAugmentationApplied).toBe(true);
      expect(result.appliedThreshold?.augmentedShares).toBe(600);
      expect(result.taxCategory).toBe("listed_major"); // 대주주 전환
    });
  });

  describe("PHF-04: F-16 사모펀드 가산으로 비대주주→대주주 전환", () => {
    it("selfShareRatio=1.5% + pefIndirect=600 (0.6%) → 합계 2.1% ≥ 코스닥 2% → 대주주", () => {
      const result = calculateStockTransferTax(makeInput({
        marketType: "kosdaq",
        selfShareRatio: 0.015,
        selfMarketCap: 0,
        totalIssuedShares: 100_000,
        pefIndirectSharesCount: 600,
      }));
      expect(result.appliedThreshold?.shareAugmentationApplied).toBe(true);
      expect(result.appliedThreshold?.augmentedShares).toBe(600);
      expect(result.taxCategory).toBe("listed_major");
    });
  });

  describe("PHF-05: F-15·F-16 합산 가산", () => {
    it("lent=500 + pef=500 (총 1000=1%) → selfShareRatio 1.5% + 1.0% = 2.5% ≥ 코스닥 2% → 대주주", () => {
      const result = calculateStockTransferTax(makeInput({
        marketType: "kosdaq",
        selfShareRatio: 0.015,
        selfMarketCap: 0,
        totalIssuedShares: 100_000,
        lentSharesCount: 500,
        pefIndirectSharesCount: 500,
      }));
      expect(result.appliedThreshold?.shareAugmentationApplied).toBe(true);
      expect(result.appliedThreshold?.augmentedShares).toBe(1000); // lent + pef
      expect(result.taxCategory).toBe("listed_major");
    });
  });

  describe("PHF-06: 가산 미달 시 비대주주 유지", () => {
    it("selfShareRatio=1.5% + lent=300 (0.3%) → 1.8% < 코스닥 2% → 비대주주 (장내 비과세)", () => {
      const result = calculateStockTransferTax(makeInput({
        marketType: "kosdaq",
        selfShareRatio: 0.015,
        selfMarketCap: 0,
        totalIssuedShares: 100_000,
        lentSharesCount: 300,
        isMajorShareholder: false,
      }));
      expect(result.appliedThreshold?.shareAugmentationApplied).toBe(true);
      expect(result.appliedThreshold?.augmentedShares).toBe(300);
      expect(result.taxCategory).toBe("listed_non_major_in_market");
      expect(result.isExempt).toBe(true);
    });
  });

  describe("PHF-07: 입력 0 또는 미입력 → 가산 미적용", () => {
    it("lent=0, pef=0 → shareAugmentationApplied=false", () => {
      const result = calculateStockTransferTax(makeInput({
        lentSharesCount: 0,
        pefIndirectSharesCount: 0,
      }));
      expect(result.appliedThreshold?.shareAugmentationApplied).toBe(false);
      expect(result.appliedThreshold?.augmentedShares).toBe(0);
    });

    it("optional 필드 미지정 → 기본 false 동작", () => {
      const result = calculateStockTransferTax(makeInput());
      expect(result.appliedThreshold?.shareAugmentationApplied).toBe(false);
    });
  });
});
