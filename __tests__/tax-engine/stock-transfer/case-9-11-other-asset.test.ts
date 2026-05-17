/**
 * 케이스 9, 10, 11, 16 — K-OTC 비과세 + §94①4 기타자산
 *
 * 케이스 9/17: K-OTC + 벤처기업 비대주주 → 조특법 §14①7호 비과세 (finalTax=0)
 * 케이스 10:  §94①4 다목 과점주주 → §55 누진 (기타자산)
 * 케이스 11:  §94①4 라목 부동산과다보유법인 → §55 누진 (기타자산)
 * 케이스 16:  K-OTC + 중소·중견 소액주주 → §94①3 나목 단서 비과세
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
    priorYearEndDate: new Date("2023-12-31"),

    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,

    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,

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
    isFraudulent: false,
    isInternationalTransaction: false,

    realEstateGroupBasicDeductionUsed: 0,

    ...overrides,
  };
}

// ============================================================
// 케이스 9/17 — K-OTC 벤처기업 비대주주 비과세
// ============================================================

describe("케이스 9/17 — K-OTC 벤처기업 비대주주 (조특법 §14①7호 비과세)", () => {
  const kotcVentureInput = baseInput({
    marketType: "unlisted",
    isKOTCTrading: true,
    isVentureCompany: true,
    isMajorShareholder: false,
    selfShareRatio: 0.005, // 0.5% → 비대주주
    // ★ 중소·중견 소액주주 비과세와 충돌 방지: 벤처 단독으로 테스트
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
  });

  it("C9-01: taxCategory = kotc_venture_exempt", () => {
    const result = calculateStockTransferTax(kotcVentureInput);
    expect(result.taxCategory).toBe("kotc_venture_exempt");
  });

  it("C9-02: isExempt = true", () => {
    const result = calculateStockTransferTax(kotcVentureInput);
    expect(result.isExempt).toBe(true);
  });

  it("C9-03: exemptReason = kotc_venture", () => {
    const result = calculateStockTransferTax(kotcVentureInput);
    expect(result.exemptReason).toBe("kotc_venture");
  });

  it("C9-04: finalTax = 0", () => {
    const result = calculateStockTransferTax(kotcVentureInput);
    expect(result.finalTax).toBe(0);
  });

  it("C9-05: calculatedTax = 0", () => {
    const result = calculateStockTransferTax(kotcVentureInput);
    expect(result.calculatedTax).toBe(0);
  });

  it("C9-06: appliedRules에 KOTC벤처비과세 포함", () => {
    const result = calculateStockTransferTax(kotcVentureInput);
    expect(result.appliedRules).toContain("KOTC벤처비과세");
  });

  it("C9-07: 대주주 K-OTC 벤처 → 과세 (벤처 비과세는 비대주주만)", () => {
    const result = calculateStockTransferTax({
      ...kotcVentureInput,
      isMajorShareholder: true,
      selfShareRatio: 0.20,  // 20% → 비상장 대주주
      // 비상장에서는 시총/지분율로 대주주 판정 안 하고 isMajorShareholder를 사용
    });
    expect(result.isExempt).toBe(false);
    // 비상장에서 K-OTC 벤처이지만 대주주 → unlisted_major로 분류
    // K-OTC 여부에 따라 listed_otc_non_major도 가능하지만 비상장 마켓이므로 unlisted_major
    expect(result.taxCategory).toBe("unlisted_major");
  });
});

// ============================================================
// 케이스 16 — K-OTC 중소·중견 소액주주 비과세
// ============================================================

describe("케이스 16 — K-OTC 중소·중견 소액주주 (§94①3 나목 단서 비과세)", () => {
  const kotcSmeInput = baseInput({
    marketType: "unlisted",
    isKOTCTrading: true,
    isVentureCompany: false,
    isSmallMediumEnterprise: true,
    isListedSmallShareholder: true,
    isMajorShareholder: false,
  });

  it("C16-01: taxCategory = kotc_sme_mid_exempt", () => {
    const result = calculateStockTransferTax(kotcSmeInput);
    expect(result.taxCategory).toBe("kotc_sme_mid_exempt");
  });

  it("C16-02: isExempt = true", () => {
    const result = calculateStockTransferTax(kotcSmeInput);
    expect(result.isExempt).toBe(true);
  });

  it("C16-03: exemptReason = kotc_sme_mid", () => {
    const result = calculateStockTransferTax(kotcSmeInput);
    expect(result.exemptReason).toBe("kotc_sme_mid");
  });

  it("C16-04: finalTax = 0", () => {
    const result = calculateStockTransferTax(kotcSmeInput);
    expect(result.finalTax).toBe(0);
  });

  it("C16-05: 중견기업도 비과세", () => {
    const result = calculateStockTransferTax({
      ...kotcSmeInput,
      isSmallMediumEnterprise: false,
      isMidsizeEnterprise: true,
    });
    expect(result.isExempt).toBe(true);
  });

  it("C16-06: K-OTC + 중소 + 대주주 → 과세 (소액주주 조건 불충족)", () => {
    const result = calculateStockTransferTax({
      ...kotcSmeInput,
      isListedSmallShareholder: false,
      isMajorShareholder: true,
    });
    expect(result.isExempt).toBe(false);
  });

  it("C16-07: K-OTC + 벤처 + 중소 → 벤처 비과세 우선 (중소 비과세도 해당)", () => {
    const result = calculateStockTransferTax({
      ...kotcSmeInput,
      isVentureCompany: true,
      isMajorShareholder: false,
    });
    expect(result.isExempt).toBe(true);
    // 중소 먼저 체크되므로 kotc_sme_mid_exempt
    expect(result.taxCategory).toBe("kotc_sme_mid_exempt");
  });
});

// ============================================================
// 케이스 10 — §94①4 다목 과점주주 → §55 누진 8단계
// ============================================================

describe("케이스 10 — §94①4 다목 과점주주 기타자산 (§55 누진 8단계)", () => {
  // 코스피 상장 + 과점주주 → §94② 우선 → 기타자산(다목) 분류
  const blockShareholderInput = baseInput({
    marketType: "kospi",
    isQualifyingBlockShareholder: true,
    isHeavyRealEstateForRate: false,
    isMajorShareholder: true,
    selfShareRatio: 0.60,
    perShareTransferPrice: 100_000,
    perShareAcquisitionPrice: 50_000,
    shareCount: 1_000,
  });

  it("C10-01: §94② 우선 → taxCategory = other_asset_block_shareholder", () => {
    const result = calculateStockTransferTax(blockShareholderInput);
    expect(result.taxCategory).toBe("other_asset_block_shareholder");
  });

  it("C10-02: section94_2Applied = true", () => {
    const result = calculateStockTransferTax(blockShareholderInput);
    expect(result.section94_2Applied).toBe(true);
  });

  it("C10-03: appliedSection94 = ①4다", () => {
    const result = calculateStockTransferTax(blockShareholderInput);
    expect(result.appliedSection94).toBe("①4다");
  });

  it("C10-04: 기본공제 그룹 = real_estate_and_other_asset", () => {
    const result = calculateStockTransferTax(blockShareholderInput);
    expect(result.basicDeductionGroup).toBe("real_estate_and_other_asset");
  });

  it("C10-05: appliedRules에 §94②우선 포함", () => {
    const result = calculateStockTransferTax(blockShareholderInput);
    expect(result.appliedRules).toContain("§94②우선");
  });

  it("C10-06: §55 누진세율 적용 — 과세표준 5천만원 (15% - 126만)", () => {
    // 양도소득금액 = (100,000-50,000)×1,000 - 2,500,000 = 47,500,000
    // 과세표준 = 47,500,000
    // 세율 15% - 1,260,000 = floor(47,500,000×0.15) - 1,260,000
    //   = 7,125,000 - 1,260,000 = 5,865,000
    const result = calculateStockTransferTax(blockShareholderInput);
    const expectedTaxBase = 47_500_000;
    expect(result.taxBase).toBe(expectedTaxBase);
    expect(result.appliedRate).toBe(0.15);
    expect(result.calculatedTax).toBe(5_865_000);
  });

  // other_asset 직접 선택 (§94② 없이)
  it("C10-07: other_asset 직접 선택 + 과점주주 → §55 누진", () => {
    const result = calculateStockTransferTax(baseInput({
      marketType: "other_asset",
      isQualifyingBlockShareholder: true,
      perShareTransferPrice: 100_000,
      perShareAcquisitionPrice: 50_000,
      shareCount: 1_000,
    }));
    expect(result.taxCategory).toBe("other_asset_block_shareholder");
    expect(result.section94_2Applied).toBe(false);
  });
});

// ============================================================
// 케이스 11 — §94①4 라목 부동산과다보유법인 → §55 누진
// ============================================================

describe("케이스 11 — §94①4 라목 부동산과다보유법인 기타자산", () => {
  const heavyREInput = baseInput({
    marketType: "unlisted",
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: true,
    isMajorShareholder: true,
    selfShareRatio: 0.60,
    perShareTransferPrice: 100_000,
    perShareAcquisitionPrice: 50_000,
    shareCount: 1_000,
  });

  it("C11-01: §94② 우선 → taxCategory = other_asset_heavy_re", () => {
    const result = calculateStockTransferTax(heavyREInput);
    expect(result.taxCategory).toBe("other_asset_heavy_re");
  });

  it("C11-02: appliedSection94 = ①4라", () => {
    const result = calculateStockTransferTax(heavyREInput);
    expect(result.appliedSection94).toBe("①4라");
  });

  it("C11-03: §55 누진세율 적용", () => {
    const result = calculateStockTransferTax(heavyREInput);
    expect(result.appliedRate).toBe(0.15);
  });

  it("C11-04: 과점주주 + 부동산과다보유 동시 → 과점주주 우선 (다목 우선)", () => {
    const result = calculateStockTransferTax({
      ...heavyREInput,
      isQualifyingBlockShareholder: true,
      isHeavyRealEstateForRate: true,
    });
    // classifySection94에서 isQualifyingBlockShareholder 우선
    expect(result.taxCategory).toBe("other_asset_block_shareholder");
    expect(result.appliedSection94).toBe("①4다");
  });
});
