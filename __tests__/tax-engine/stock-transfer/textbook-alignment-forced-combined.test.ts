/**
 * F-24 — 본인 미보유 자동 강제 합산 anchor (PHC-01~05)
 *
 * 기획재정부 금융세제-327, 2020.12.10. — 직전사업연도 종료일 본인 주식 미보유 시
 * 특수관계 기타주주가 보유한 주식을 포함하여 §157 비율·시가총액 판정.
 *
 * 핵심: `isLargestShareholderGroup` 토글 OFF여도 자동으로 합산 모드 강제.
 *
 * 교재 §3장 이미지 51 Check Point ⑰.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function makeInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: false,
    selfShareRatio: 0,
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

describe("F-24 — 본인 미보유 자동 강제 합산 (기획재정부 금융세제-327, 2020.12.10.)", () => {
  describe("PHC-01: 본인 0% + 합산 1.5% (kospi 임계 1% 초과) → 토글 OFF여도 대주주", () => {
    it("isLargestShareholderGroup=false, combinedShareRatio=0.015 → 자동 강제 합산 → 대주주", () => {
      const result = calculateStockTransferTax(makeInput({
        marketType: "kospi",
        selfShareRatio: 0,
        selfMarketCap: 0,
        isLargestShareholderGroup: false, // 토글 OFF
        combinedShareRatio: 0.015, // 1.5% — 코스피 임계 1% 초과
        combinedMarketCap: 0,
      }));
      expect(result.appliedThreshold?.forcedCombinedJudgment).toBe(true);
      expect(result.taxCategory).toBe("listed_major"); // 자동 합산으로 대주주
    });
  });

  describe("PHC-02: 본인 0% + 합산 시총 60억 (kospi 50억 초과) → 자동 합산 대주주", () => {
    it("combinedMarketCap=6,000,000,000 → forcedCombinedJudgment=true → 대주주", () => {
      const result = calculateStockTransferTax(makeInput({
        marketType: "kospi",
        selfShareRatio: 0,
        selfMarketCap: 0,
        isLargestShareholderGroup: false,
        combinedShareRatio: 0,
        combinedMarketCap: 6_000_000_000,
      }));
      expect(result.appliedThreshold?.forcedCombinedJudgment).toBe(true);
      expect(result.taxCategory).toBe("listed_major");
    });
  });

  describe("PHC-03: 본인 0.5% + 합산 1.5% → 본인 보유분 있음 → 강제 미적용 (토글 OFF면 본인만)", () => {
    it("selfShareRatio=0.005 → forcedCombinedJudgment=false → 1% 임계 미달 비대주주", () => {
      const result = calculateStockTransferTax(makeInput({
        marketType: "kospi",
        selfShareRatio: 0.005, // 본인 0.5%
        selfMarketCap: 0,
        isLargestShareholderGroup: false,
        combinedShareRatio: 0.015,
        combinedMarketCap: 0,
      }));
      expect(result.appliedThreshold?.forcedCombinedJudgment).toBe(false);
      // 본인 0.5% < 코스피 1% 임계 → 비대주주 (장내 비과세)
      expect(result.taxCategory).toBe("listed_non_major_in_market");
    });
  });

  describe("PHC-04: 본인 0% + 합산 0% → 강제 미적용 (합산값도 없음)", () => {
    it("self=0 / combined=0 → forcedCombinedJudgment=false", () => {
      const result = calculateStockTransferTax(makeInput({
        marketType: "kospi",
        selfShareRatio: 0,
        selfMarketCap: 0,
        isLargestShareholderGroup: false,
        combinedShareRatio: 0,
        combinedMarketCap: 0,
      }));
      expect(result.appliedThreshold?.forcedCombinedJudgment).toBe(false);
    });
  });

  describe("PHC-05: 토글 ON 이미 + 본인 0% → 정상 합산 (forcedCombinedJudgment=true)", () => {
    it("isLargestShareholderGroup=true 이미 ON이지만 self=0 → 자동 강제 분기도 true", () => {
      const result = calculateStockTransferTax(makeInput({
        marketType: "kospi",
        selfShareRatio: 0,
        selfMarketCap: 0,
        isLargestShareholderGroup: true,
        combinedShareRatio: 0.02,
      }));
      // 토글이 이미 ON이라 사용자가 명시 합산 의도 — F-24 자동 분기도 OR 조건이라 true
      expect(result.appliedThreshold?.forcedCombinedJudgment).toBe(true);
      expect(result.taxCategory).toBe("listed_major");
    });
  });
});
