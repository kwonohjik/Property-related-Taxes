/**
 * K-OTC 비과세 결과 조립 anchor — 리뷰 2026-08-28 §32
 *
 * `buildExemptResult`는 **spread 없는 명시 매핑**이라 필드를 빠뜨려도 tsc가 잡지 못한다.
 * 실제로 `holdingPeriodMonths`·`holdingPeriodDays`가 **0 하드코딩**이고
 * `postListingDetail`은 바로 위에서 계산해 취득가액에 쓰고도 버려지고 있었다.
 *
 * 형제 비과세 경로(`applyExemptZeroing`)는 spread라 전부 보존한다 —
 * **같은 비과세인데 두 경로가 비대칭**이었다.
 *
 * 인쇄되는 결함은 **별지 제84호서식 「05. 보유기간」이 "0개월"**로 나가는 것과,
 * `PostListingDetailCard` 게이트가 절반만 충족해 환산 산식 카드가 통째로 사라지는 것이다.
 * 세액에는 영향이 없다(비과세라 전부 0).
 *
 *   EX-FIELD-1~4
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function base(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: true,
    isKOTCTrading: true,
    acquisitionDate: new Date("2005-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 50_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 10_000,
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

describe("EX-FIELD (§32): 비과세 조기반환 경로도 표시 필드를 채운다", () => {
  it("EX-FIELD-1: 전제 — K-OTC 벤처 비과세로 조기반환 경로를 탄다", () => {
    const r = calculateStockTransferTax(base());
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("kotc_venture");
    expect(r.finalTax).toBe(0);
  });

  it("EX-FIELD-2: 보유기간이 0이 아니다 — 별지 제84호서식 「05. 보유기간」", () => {
    const r = calculateStockTransferTax(base());
    expect(r.holdingPeriodMonths).toBeGreaterThan(0);
    expect(r.holdingPeriodDays).toBeGreaterThan(0);
  });

  it("EX-FIELD-3: 과세 경로와 **같은 값**이다 (비과세 여부는 보유기간을 바꾸지 않는다)", () => {
    // 비과세 플래그만 끄면 과세 경로를 탄다 — 보유기간은 같아야 한다.
    const exempt = calculateStockTransferTax(base());
    const taxed = calculateStockTransferTax(
      base({ isVentureCompany: false, isKOTCTrading: false }),
    );
    expect(exempt.holdingPeriodMonths).toBe(taxed.holdingPeriodMonths);
    expect(exempt.holdingPeriodDays).toBe(taxed.holdingPeriodDays);
  });

  it("EX-FIELD-4: 취득 후 상장 환산 상세가 버려지지 않는다", () => {
    const withListing = base({
      acquisitionMode: "estimated",
      acquiredBeforeListing: true,
      listingDate: new Date("2010-06-01"),
      transferDatePriceAvg1Month: 50_000,
      listingDatePriceAvg1Month: 10_000,
      listingYearNetIncomePerShare: 5_000,
      listingYearNetAssetPerShare: 5_000,
      acquisitionYearNetIncomePerShare: 4_000,
      acquisitionYearNetAssetPerShare: 4_000,
    });
    const r = calculateStockTransferTax(withListing);
    expect(r.isExempt).toBe(true);
    expect(r.postListingDetail).toBeDefined();
  });
});
