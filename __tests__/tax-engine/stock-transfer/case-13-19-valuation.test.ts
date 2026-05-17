/**
 * 케이스 13, 14, 19, 27 — 비상장 보충 평가 분기
 *
 * 케이스 13:  부동산과다보유 §165⑤ 가중치 반전 (2/5 + 3/5)
 * 케이스 14:  순자산 단독 4사유 (§165④3 가~라목)
 * 케이스 19:  시기별 평가 연혁 5분기 (1998↓ · 2007.2.28.~)
 * 케이스 27:  순자산 단독 시 80% 하한 미적용
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function baseUnlistedInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.20,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0.20,
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
    totalIssuedShares: 10_000,

    acquisitionCause: "purchase",

    transferPriceMode: "actual",
    perShareTransferPrice: 500_000,

    acquisitionMode: "estimated",
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,

    // 비상장 보충 평가 입력 (양도일 + 취득일 직전 사업연도)
    transferYearNetIncomePerShare: 30_000,
    transferYearNetAssetPerShare: 200_000,
    acquisitionYearNetIncomePerShare: 20_000,
    acquisitionYearNetAssetPerShare: 150_000,

    expenseMode: "estimated",

    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    isFraudulent: false,
    isInternationalTransaction: false,

    realEstateGroupBasicDeductionUsed: 0,

    ...overrides,
  };
}

// 기본 양도가 = 500,000 × 1,000 = 500,000,000

// ============================================================
// 케이스 13 — 부동산과다보유법인 가중치 반전 (§165⑤)
// ============================================================

describe("케이스 13 — 부동산과다보유법인 가중치 반전 (순손익 2/5 + 순자산 3/5)", () => {
  // transferNi=30,000, transferNa=200,000
  // 정상: (30,000×3 + 200,000×2)/5 = (90,000 + 400,000)/5 = 490,000/5 = 98,000
  // 반전: (30,000×2 + 200,000×3)/5 = (60,000 + 600,000)/5 = 660,000/5 = 132,000
  // floor80 (정상): 200,000×0.8=160,000 > 98,000 → 하한 발동 → 160,000
  // floor80 (반전): 200,000×0.8=160,000 > 132,000 → 하한 발동 → 160,000
  //
  // acquisitionNi=20,000, acquisitionNa=150,000
  // 정상: (20,000×3 + 150,000×2)/5 = 96,000/5 = ... = 120,000/5 = ...
  //   = (60,000 + 300,000)/5 = 360,000/5 = 72,000 → floor=72,000
  // 반전: (20,000×2 + 150,000×3)/5 = (40,000 + 450,000)/5 = 98,000 → floor=98,000
  //
  // 환산취득가:
  //   정상 (양도기준시가=160,000, 취득기준시가=72,000):
  //     500,000,000 × 72,000 / 160,000 = 225,000,000
  //   반전 (양도기준시가=160,000, 취득기준시가=98,000):
  //     500,000,000 × 98,000 / 160,000 = 306,250,000

  it("C13-01: 정상 가중치 (3/5 + 2/5) 환산취득가", () => {
    const result = calculateStockTransferTax(baseUnlistedInput({
      isHeavyRealEstateForValuation: false,
    }));
    // 양도기준시가 = 160,000 (80% 하한 발동)
    // 취득기준시가 = 72,000 (정상 가중치)
    // 환산취득가 = 500,000,000 × 72,000 / 160,000 = 225,000,000
    expect(result.acquisitionPrice).toBe(225_000_000);
  });

  it("C13-02: 가중치 반전 (2/5 + 3/5) 환산취득가 — 취득기준시가 증가", () => {
    const result = calculateStockTransferTax(baseUnlistedInput({
      isHeavyRealEstateForValuation: true,
    }));
    // 양도기준시가 = 160,000 (80% 하한 - 반전 가중치도 132,000 < 160,000)
    // 취득기준시가 = 98,000 (반전 가중치)
    // 환산취득가 = 500,000,000 × 98,000 / 160,000 = 306,250,000
    expect(result.acquisitionPrice).toBe(306_250_000);
  });

  it("C13-03: 가중치 반전 시 valuationDetail.method = weighted_avg", () => {
    const result = calculateStockTransferTax(baseUnlistedInput({
      isHeavyRealEstateForValuation: true,
    }));
    expect(result.valuationDetail?.method).toBe("weighted_avg");
  });

  it("C13-04: 가중치 반전 시 warnings에 반전 사유 포함", () => {
    const result = calculateStockTransferTax(baseUnlistedInput({
      isHeavyRealEstateForValuation: true,
    }));
    // warnings 또는 appliedRules에 반전 관련 텍스트 포함
    const allRules = [...result.appliedRules, ...result.warnings].join(" ");
    expect(allRules).toMatch(/가중치반전|부동산과다보유/);
  });
});

// ============================================================
// 케이스 14 — 순자산 단독 4사유 (§165④3 가~라목)
// ============================================================

describe("케이스 14 — 순자산 단독 평가 4사유 (§165④3 가~라목)", () => {
  // 순자산 단독: 취득기준시가 = acquisitionNa = 150,000
  //             양도기준시가 = transferNa   = 200,000
  // 환산취득가 = 500,000,000 × 150,000 / 200,000 = 375,000,000

  const netAssetOnlyInputBase = baseUnlistedInput({
    transferYearNetIncomePerShare: 30_000,
    transferYearNetAssetPerShare: 200_000,
    acquisitionYearNetIncomePerShare: 20_000,
    acquisitionYearNetAssetPerShare: 150_000,
  });

  it("C14-01: 가목 (청산·사망) → 순자산 단독", () => {
    const result = calculateStockTransferTax({
      ...netAssetOnlyInputBase,
      netAssetOnlyReason: "liquidation_or_owner_death",
    });
    expect(result.valuationDetail?.method).toBe("net_asset_only");
    // 환산취득가 = 500,000,000 × 150,000 / 200,000 = 375,000,000
    expect(result.acquisitionPrice).toBe(375_000_000);
  });

  it("C14-02: 나목 (사업개시 전·1년 미만·휴폐업) → 순자산 단독", () => {
    const result = calculateStockTransferTax({
      ...netAssetOnlyInputBase,
      netAssetOnlyReason: "no_business_or_short_or_closed",
    });
    expect(result.valuationDetail?.method).toBe("net_asset_only");
    expect(result.acquisitionPrice).toBe(375_000_000);
  });

  it("C14-03: 다목 (주식 80% 지주회사) → 순자산 단독", () => {
    const result = calculateStockTransferTax({
      ...netAssetOnlyInputBase,
      netAssetOnlyReason: "stock_holding_company",
    });
    expect(result.valuationDetail?.method).toBe("net_asset_only");
    expect(result.acquisitionPrice).toBe(375_000_000);
  });

  it("C14-04: 라목 (잔여 존속기한 3년 이내) → 순자산 단독", () => {
    const result = calculateStockTransferTax({
      ...netAssetOnlyInputBase,
      netAssetOnlyReason: "remaining_term_under_3y",
    });
    expect(result.valuationDetail?.method).toBe("net_asset_only");
    expect(result.acquisitionPrice).toBe(375_000_000);
  });

  it("C14-05: netAssetOnlyReason 없음 → 가중평균 방식", () => {
    const result = calculateStockTransferTax({
      ...netAssetOnlyInputBase,
      netAssetOnlyReason: undefined,
    });
    expect(result.valuationDetail?.method).toBe("weighted_avg");
  });
});

// ============================================================
// 케이스 27 — 순자산 단독 시 80% 하한 미적용
// ============================================================

describe("케이스 27 — 순자산 단독 평가 시 80% 하한 미적용", () => {
  // 순자산 단독 사유: 80% 하한 미적용 (§165④3 — 단서 별도)
  // 가중평균 시: 98,000 < 160,000 → 하한 발동
  // 순자산 단독 시: 하한 없이 순자산가치 그대로 사용

  it("C27-01: 순자산 단독 → netAssetFloorApplied = false", () => {
    const result = calculateStockTransferTax(baseUnlistedInput({
      netAssetOnlyReason: "liquidation_or_owner_death",
    }));
    expect(result.valuationDetail?.netAssetFloorApplied).toBe(false);
  });

  it("C27-02: appliedRules에 80%하한미적용 포함", () => {
    const result = calculateStockTransferTax(baseUnlistedInput({
      netAssetOnlyReason: "no_business_or_short_or_closed",
    }));
    expect(result.appliedRules).toContain("80%하한미적용");
  });

  it("C27-03: 80% 하한 미적용 → 취득기준시가 = 순자산가치 직접", () => {
    // acquisitionNa=150,000 그대로 사용
    // transferNa=200,000 그대로 사용
    // 환산취득가 = 500,000,000 × 150,000 / 200,000 = 375,000,000
    const result = calculateStockTransferTax(baseUnlistedInput({
      netAssetOnlyReason: "liquidation_or_owner_death",
    }));
    expect(result.acquisitionPrice).toBe(375_000_000);
  });

  it("C27-04: 가중평균 시 80% 하한 발동 vs 단독 시 미발동 대비", () => {
    // 가중평균 케이스 (하한 발동)
    const weightedResult = calculateStockTransferTax(baseUnlistedInput({
      netAssetOnlyReason: undefined,
    }));
    expect(weightedResult.valuationDetail?.netAssetFloorApplied).toBe(true);

    // 순자산 단독 케이스 (하한 미발동)
    const netAssetResult = calculateStockTransferTax(baseUnlistedInput({
      netAssetOnlyReason: "liquidation_or_owner_death",
    }));
    expect(netAssetResult.valuationDetail?.netAssetFloorApplied).toBe(false);
  });
});

// ============================================================
// 케이스 19 — 시기별 평가 연혁 5분기
// ============================================================

describe("케이스 19 — 시기별 평가 연혁 (양도일 기준)", () => {
  // 1998년 이하: 순자산 단독 (niWeight=0, naWeight=5)
  // 1999~2007.2.27: 가중평균 (80% 하한 없음)
  // 2007.2.28~: 현행 (가중평균 + 80% 하한)

  it("C19-01: 1998.12.31. 양도 → 순자산 단독 연혁 분기", () => {
    const result = calculateStockTransferTax(baseUnlistedInput({
      transferDate: new Date("1998-12-31"),
      filingDate: new Date("1999-02-28"),
      // 1998 이하: niWeight=0 → 가중평균에서 ni 무시
      // transferNa=200,000이 양도기준시가
      // 환산취득가 = 500,000,000 × acquisitionNa / transferNa
      //           = 500,000,000 × 150,000 / 200,000 = 375,000,000
    }));
    // 1998 연혁: 순자산 단독 (niWeight=0) → 나목처럼 취급하나
    // 중요: 이 분기는 netAssetOnlyReason 없이 시기별 자동 분기
    // 따라서 valuationDetail.method = "weighted_avg" (niWeight=0으로 나오지만 method는 weighted_avg)
    expect(result.acquisitionPrice).toBe(375_000_000);
    expect(result.warnings.join(" ")).toMatch(/1998이하|순자산단독/);
  });

  it("C19-02: 1999.1.1. 양도 → 가중평균 + 80% 하한 없음", () => {
    const result = calculateStockTransferTax(baseUnlistedInput({
      transferDate: new Date("1999-01-01"),
      filingDate: new Date("1999-03-01"),
    }));
    // 1999: 가중평균 (3/5+2/5) 하한 없음
    // weighted = 30,000×3/5 + 200,000×2/5 = 18,000 + 80,000 = 98,000
    // 하한 미적용 → 양도기준시가 = 98,000
    // 취득기준시가 = 20,000×3/5 + 150,000×2/5 = 12,000 + 60,000 = 72,000
    // 환산취득가 = 500,000,000 × 72,000 / 98,000 = floor(367,346,938) = 367,346,938
    expect(result.valuationDetail?.netAssetFloorApplied).toBe(false);
    // 양도기준시가가 98,000 (하한 미발동)이므로 취득가는 다름
    expect(result.acquisitionPrice).toBe(367_346_938);
  });

  it("C19-03: 2007.2.27. 양도 → 가중평균 + 80% 하한 없음", () => {
    const result = calculateStockTransferTax(baseUnlistedInput({
      transferDate: new Date("2007-02-27"),
      filingDate: new Date("2007-04-27"),
    }));
    // 2007.2.27 이전: 80% 하한 없음
    expect(result.valuationDetail?.netAssetFloorApplied).toBe(false);
  });

  it("C19-04: 2007.2.28. 양도 → 현행 가중평균 + 80% 하한", () => {
    const result = calculateStockTransferTax(baseUnlistedInput({
      transferDate: new Date("2007-02-28"),
      filingDate: new Date("2007-04-28"),
    }));
    // 2007.2.28~: 80% 하한 발동 (98,000 < 160,000)
    expect(result.valuationDetail?.netAssetFloorApplied).toBe(true);
  });

  it("C19-05: 2024.6.1. 양도 → 현행 (기본값 — 80% 하한 발동)", () => {
    const result = calculateStockTransferTax(baseUnlistedInput());
    expect(result.valuationDetail?.netAssetFloorApplied).toBe(true);
    // 225,000,000 (정상 가중치 + 하한 발동)
    expect(result.acquisitionPrice).toBe(225_000_000);
  });
});
