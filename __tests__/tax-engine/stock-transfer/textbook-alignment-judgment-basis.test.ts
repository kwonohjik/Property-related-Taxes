/**
 * F-09/F-10/F-14/F-23 — 판정 기준일 override anchor (PHS-01~07)
 *
 * 시행령 §157④ + 2010 소령 157⑧ — 합병·분할·신설법인 특수 판정 기준일:
 *   F-09 합병등기일 (피합병법인 주주 신주 교부 후 양도)
 *   F-10 분할등기일 (분할 전 법인 분할등기일 현재 보유 현황)
 *   F-14 분할신설법인 — 분할 전 분할법인 직전사업연도 종료일
 *   F-23 설립등기일 (신설법인 직전사업연도 미존재 시)
 *
 * 교재 §3장 이미지 50·51 Check Point ②③⑦⑯.
 *
 * 🔑 **축 정정 (리뷰 2026-08-28 #2)** — `judgmentDateOverride`는 **보유현황 측정 시점**이지
 *    개정본 적용 시기가 아니다. §157⑤는 「합병등기일 현재 **주식보유 현황**에 따른다」로
 *    지분율·시총을 **어느 시점의 값으로 볼지**만 옮긴다. 어느 임계 금액이 유효한지는
 *    **부칙**이 「양도하는 분부터」로 정한다. 그래서 임계표 행은 **양도일**이 고르고,
 *    override는 `judgmentBasis` echo(결과 카드 라벨·입력 안내)로만 남는다.
 *
 * 핵심 검증:
 *   - judgmentDateOverride 는 임계표 행 선택을 **바꾸지 않는다**
 *   - judgmentBasis 가 echo 됨
 *   - default(미지정) 시 기존 priorYearEndDate 동작 유지
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function makeInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: 0.011,
    selfMarketCap: 6_000_000_000,
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

describe("F-09/F-10/F-14/F-23 — 판정 기준일 override (합병·분할·신설법인)", () => {
  describe("PHS-01: judgmentBasis 미지정 → priorYearEndDate 사용 (default)", () => {
    it("override 없음 → 2024-12-31 priorYearEndDate 기준 코스피 1%/50억 적용", () => {
      const result = calculateStockTransferTax(makeInput());
      expect(result.appliedThreshold?.judgmentBasis).toBe("default");
      expect(result.appliedThreshold?.shareRatio).toBe(0.01);
      expect(result.appliedThreshold?.marketCap).toBe(5_000_000_000);
    });
  });

  describe("PHS-02: F-09 합병등기일 override는 임계 행을 바꾸지 않는다", () => {
    it("양도일 2024-06-01 + judgmentDateOverride=2016-04-01 → 여전히 2024 행 (1%/50억)", () => {
      const result = calculateStockTransferTax(makeInput({
        priorYearEndDate: new Date("2024-12-31"),
        judgmentDateOverride: new Date("2016-04-01"),
        judgmentBasis: "merger",
      }));
      expect(result.appliedThreshold?.judgmentBasis).toBe("merger");
      // 임계 행은 **양도일**(2024-06-01)이 고른다 — override는 측정 시점 축이다.
      expect(result.appliedThreshold?.shareRatio).toBe(0.01);
      expect(result.appliedThreshold?.marketCap).toBe(5_000_000_000);
      expect(result.appliedThreshold?.fromDate).toBe("2024-01-01");
    });

    it("시기를 바꾸는 것은 양도일이다 — 양도일 2016-06-01 → 2016.4.1. 행 (1%/25억)", () => {
      const result = calculateStockTransferTax(makeInput({
        acquisitionDate: new Date("2013-01-01"),
        transferDate: new Date("2016-06-01"),
        filingDate: new Date("2016-08-31"),
        priorYearEndDate: new Date("2015-12-31"),
        judgmentDateOverride: new Date("2016-04-01"),
        judgmentBasis: "merger",
      }));
      expect(result.appliedThreshold?.shareRatio).toBe(0.01);
      expect(result.appliedThreshold?.marketCap).toBe(2_500_000_000);
      expect(result.appliedThreshold?.fromDate).toBe("2016-04-01");
    });
  });

  describe("PHS-03: F-10 분할등기일 override도 마찬가지", () => {
    it("kosdaq / 양도일 2024-06-01 + override=2019-12-31 → 2024 행 (2%/50억)", () => {
      const result = calculateStockTransferTax(makeInput({
        marketType: "kosdaq",
        priorYearEndDate: new Date("2024-12-31"),
        judgmentDateOverride: new Date("2019-12-31"),
        judgmentBasis: "split",
      }));
      expect(result.appliedThreshold?.judgmentBasis).toBe("split");
      expect(result.appliedThreshold?.shareRatio).toBe(0.02);
      expect(result.appliedThreshold?.marketCap).toBe(5_000_000_000);
    });
  });

  describe("PHS-04: F-14 분할신설법인 override도 마찬가지", () => {
    it("kospi / 양도일 2024-06-01 + override=2017-12-31 → 2024 행 (1%/50억)", () => {
      const result = calculateStockTransferTax(makeInput({
        priorYearEndDate: new Date("2024-12-31"),
        judgmentDateOverride: new Date("2017-12-31"),
        judgmentBasis: "split_new_entity",
      }));
      expect(result.appliedThreshold?.judgmentBasis).toBe("split_new_entity");
      expect(result.appliedThreshold?.shareRatio).toBe(0.01);
      expect(result.appliedThreshold?.marketCap).toBe(5_000_000_000);
    });
  });

  describe("PHS-05: F-23 설립등기일 기준 (신설법인)", () => {
    it("priorYearEndDate=2024-12-31, judgmentDateOverride=2024-03-01 (incorporation) → 2024-01-01 행", () => {
      const result = calculateStockTransferTax(makeInput({
        priorYearEndDate: new Date("2024-12-31"),
        judgmentDateOverride: new Date("2024-03-01"),
        judgmentBasis: "incorporation",
      }));
      expect(result.appliedThreshold?.judgmentBasis).toBe("incorporation");
      expect(result.appliedThreshold?.shareRatio).toBe(0.01);
      expect(result.appliedThreshold?.marketCap).toBe(5_000_000_000);
    });
  });

  describe("PHS-06: override 일자가 없어도 임계 행은 양도일이 고른다", () => {
    it("judgmentBasis만 있고 override 미지정 → 양도일 2021-06-01 → 2020.4.1. 행 (10억)", () => {
      const result = calculateStockTransferTax(makeInput({
        acquisitionDate: new Date("2018-01-01"),
        transferDate: new Date("2021-06-01"),
        filingDate: new Date("2021-08-31"),
        priorYearEndDate: new Date("2020-12-31"),
        judgmentBasis: "merger",
      }));
      // judgmentBasis는 echo만 되고 임계는 양도일 기준
      expect(result.appliedThreshold?.judgmentBasis).toBe("merger");
      expect(result.appliedThreshold?.marketCap).toBe(1_000_000_000);
      expect(result.appliedThreshold?.fromDate).toBe("2020-04-01");
    });
  });

  describe("PHS-07: 비상장 + F-23 설립등기일 + 벤처기업 분기 동시 적용", () => {
    it("unlisted + incorporation + isVentureCompany=true → 벤처 40억 임계 적용", () => {
      const result = calculateStockTransferTax(makeInput({
        marketType: "unlisted",
        selfMarketCap: 3_500_000_000,
        priorYearEndDate: new Date("2024-12-31"),
        judgmentDateOverride: new Date("2023-06-15"),
        judgmentBasis: "incorporation",
        isVentureCompany: true,
        // 🔴 2026-08-28(리뷰 #14) — 40억 예외는 「§178①에 따라 **거래되는**」 벤처기업 주식이다.
        //   이 anchor 의 쟁점은 **판정 기준일 override × 벤처 분기의 동시 적용**이므로,
        //   법문이 40억을 주는 조합으로 픽스처를 맞춘다.
        isKOTCTrading: true,
      }));
      expect(result.appliedThreshold?.judgmentBasis).toBe("incorporation");
      expect(result.appliedThreshold?.isVentureRule).toBe(true);
      expect(result.appliedThreshold?.marketCap).toBe(4_000_000_000);
      expect(result.appliedThreshold?.ruleSource).toBe("§167의8①2호_벤처");
    });
  });
});
