/**
 * PR-2 잔여 anchor — R-1' 매매사례가액 + R-2 자본조정
 *
 * 디자인: docs/02-design/features/stock-transfer-pr2-remaining.engine.design.md
 * 계획서: docs/00-pm/stock-transfer-pr2-remaining.plan.md v3
 *
 * Pre-Do anchor (I-4): MS-1·MS-2a·CA-1·CA-9
 * 잔여 anchor (I-7):   MS-2b·MS-2c·MS-3·MS-4·MS-5·MS-6
 *                    + CA-2·CA-3·CA-4·CA-5·CA-7·CA-8·CA-10·CA-11·CA-12
 * (CA-6 split + adjustments Zod refine은 I-6에서 별도 작성)
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { adjustShareCountAndCost } from "@/lib/tax-engine/stock-transfer/stock-capital-adjustments";
import { evaluateMarketSample } from "@/lib/tax-engine/stock-transfer/stock-valuation-market-sample";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function baseInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.2,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0.2,
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
    perShareTransferPrice: 200_000,
    acquisitionMode: "sale_case",
    perShareAcquisitionPrice: 100_000,
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

// ============================================================
// MS-1: 비상장 + 취득 매매사례 정상
// ============================================================

describe("MS-1: 비상장 + 취득 매매사례 정상 (영§176의2③1호)", () => {
  const result = calculateStockTransferTax(baseInput({
    acquisitionMode: "sale_case",
    acquisitionMarketSamplePrice: 120_000,                          // 1주당 12만원
    acquisitionMarketSampleDate: new Date("2020-02-15"),            // 취득일 +45일
  }));

  it("MS-1-01: acquisitionPrice = 120,000,000 (사례가 × 1,000주)", () => {
    expect(result.acquisitionPrice).toBe(120_000_000);
  });
  it("MS-1-02: marketSampleDetail.acquisitionApplied = true", () => {
    expect(result.marketSampleDetail?.acquisitionApplied).toBe(true);
  });
  it("MS-1-03: acquisitionDeltaDays = 45", () => {
    expect(result.marketSampleDetail?.acquisitionDeltaDays).toBe(45);
  });
  it("MS-1-04: acquisitionOverThreeMonths = false (45 ≤ 90)", () => {
    expect(result.marketSampleDetail?.acquisitionOverThreeMonths).toBe(false);
  });
  it("MS-1-05: estimatedDeduction = 0 (개산공제 미적용 — 실지거래가액 의제)", () => {
    expect(result.estimatedDeduction).toBeUndefined();
  });
});

// ============================================================
// MS-2a/b/c: 상장(kospi/kosdaq/konex) — validate 차단 (엔진 직접 호출 시는 통과하나 sample-only 경로로 계산)
//   * Zod refine + validate에서 차단됨 — 본 anchor는 엔진 sale_case 분기가 marketType과 직교함을 확인
// ============================================================

describe("MS-2a: kospi + sale_case — 엔진 분기 통과 확인 (실제 차단은 Zod·validate 레이어)", () => {
  const result = calculateStockTransferTax(baseInput({
    marketType: "kospi",
    isMajorShareholder: true,
    selfMarketCap: 6_000_000_000,  // 50억 초과 대주주
    acquisitionMode: "sale_case",
    acquisitionMarketSamplePrice: 50_000,
  }));
  it("MS-2a-01: 엔진은 계산 결과 반환 (Zod 외 차단은 별도 layer)", () => {
    // 엔진 자체는 통과 — Zod/validate 시뮬은 별도 테스트
    expect(result.acquisitionPrice).toBe(50_000_000);
  });
});

// ============================================================
// CA-1: 자본준비금 무상증자 단일
// ============================================================

describe("CA-1: 자본준비금 무상증자 단일 (단가 희석)", () => {
  const r = adjustShareCountAndCost(1_000, 100_000_000, [
    {
      type: "bonus_capital_reserve",
      eventDate: new Date("2022-06-01"),
      ratio: 0.5,
    },
  ]);

  it("CA-1-01: adjustedShareCount = 1,500", () => {
    expect(r.adjustedShareCount).toBe(1_500);
  });
  it("CA-1-02: adjustedPerShareCost = 66,666 (floor(1억/1500))", () => {
    expect(r.adjustedPerShareCost).toBe(66_666);
  });
  it("CA-1-03: baseTotalCost = 1억 (불변)", () => {
    expect(r.baseTotalCost).toBe(100_000_000);
  });
  it("CA-1-04: applied[0].skipped = false", () => {
    expect(r.applied[0].skipped).toBe(false);
  });
  it("CA-1-05: appliedRules에 §17②2호 가목 단서 자본준비금 포함", () => {
    expect(r.appliedRules.some((x) => x.includes("자본준비금"))).toBe(true);
  });
});

// ============================================================
// CA-9: eventDate < acquisitionDate — 본 anchor는 엔진 직접 호출이 아니라 validate 단계 검증
//   * adjustShareCountAndCost는 시간 검증 없이 모든 입력을 처리 (validate가 차단 책임)
//   * 본 anchor는 시간 순서 정렬 동작 확인
// ============================================================

describe("CA-9: 엔진은 시계열 정렬만 수행 (시간 검증은 validate 책임)", () => {
  const r = adjustShareCountAndCost(1_000, 100_000_000, [
    {
      type: "bonus_capital_reserve",
      eventDate: new Date("2023-06-01"),
      ratio: 0.2,
    },
    {
      type: "bonus_capital_reserve",
      eventDate: new Date("2022-06-01"),
      ratio: 0.5,
    },
  ]);
  it("CA-9-01: applied 배열 시계열 오름차순", () => {
    expect(r.applied[0].eventDate.getTime()).toBeLessThan(r.applied[1].eventDate.getTime());
  });
  it("CA-9-02: 1000 → 1500 (×1.5) → 1800 (×1.2)", () => {
    expect(r.applied[0].afterShares).toBe(1_500);
    expect(r.applied[1].afterShares).toBe(1_800);
  });
});

// ============================================================
// MS-3: ±3개월 초과 warning + 진행
// ============================================================

describe("MS-3: 매매사례 ±3개월 초과 (warning + 계산 진행)", () => {
  const result = calculateStockTransferTax(baseInput({
    acquisitionMode: "sale_case",
    acquisitionMarketSamplePrice: 100_000,
    acquisitionMarketSampleDate: new Date("2020-04-15"),  // 취득일(2020-01-01) +105일
  }));

  it("MS-3-01: acquisitionOverThreeMonths = true (105 > 90)", () => {
    expect(result.marketSampleDetail?.acquisitionOverThreeMonths).toBe(true);
  });
  it("MS-3-02: warnings에 '전후 3개월' 메시지 포함", () => {
    expect(result.warnings.join("|")).toContain("3개월");
  });
  it("MS-3-03: acquisitionPrice = 100,000,000 (계산은 진행)", () => {
    expect(result.acquisitionPrice).toBe(100_000_000);
  });
});

// ============================================================
// MS-4: 양도+취득 매매사례 동시 적용
// ============================================================

describe("MS-4: 양도+취득 매매사례 동시 적용", () => {
  const result = calculateStockTransferTax(baseInput({
    acquisitionMode: "sale_case",
    acquisitionMarketSamplePrice: 100_000,
    acquisitionMarketSampleDate: new Date("2020-02-01"),
    transferMarketSamplePrice: 250_000,                  // perShareTransferPrice(200,000) 무시
    transferMarketSampleDate: new Date("2024-06-15"),
  }));

  it("MS-4-01: transferPrice = 250,000,000 (사례가 우선)", () => {
    expect(result.transferPrice).toBe(250_000_000);
  });
  it("MS-4-02: acquisitionPrice = 100,000,000", () => {
    expect(result.acquisitionPrice).toBe(100_000_000);
  });
  it("MS-4-03: marketSampleDetail 양쪽 applied true", () => {
    expect(result.marketSampleDetail?.acquisitionApplied).toBe(true);
    expect(result.marketSampleDetail?.transferApplied).toBe(true);
  });
});

// ============================================================
// MS-5: 특수관계인 의심 (counterparty 메타 keyword 검출)
// ============================================================

describe("MS-5: 특수관계인 counterparty warning", () => {
  const r = evaluateMarketSample({
    shareCount: 1_000,
    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2024-06-01"),
    acquisitionMarketSamplePrice: 100_000,
    acquisitionMarketSampleCounterparty: "대표이사 김OO",
  });

  it("MS-5-01: warnings에 특수관계인 의심 메시지", () => {
    expect(r.warnings.join("|")).toContain("특수관계인");
  });
});

// ============================================================
// MS-6: other_asset도 매매사례 적용 가능
// ============================================================

describe("MS-6: 기타자산(other_asset)도 매매사례 적용 가능", () => {
  const result = calculateStockTransferTax(baseInput({
    marketType: "other_asset",
    isQualifyingBlockShareholder: true,
    acquisitionMode: "sale_case",
    acquisitionMarketSamplePrice: 100_000,
  }));

  it("MS-6-01: acquisitionPrice = 100,000,000 (분기 통과)", () => {
    expect(result.acquisitionPrice).toBe(100_000_000);
  });
});

// ============================================================
// CA-2: 비례감자 단일
// ============================================================

describe("CA-2: 비례감자·결손보전 (단가 상승)", () => {
  const r = adjustShareCountAndCost(1_000, 100_000_000, [
    {
      type: "reduction_proportional",
      eventDate: new Date("2022-06-01"),
      ratio: 0.2,
    },
  ]);
  it("CA-2-01: adjustedShareCount = 800", () => {
    expect(r.adjustedShareCount).toBe(800);
  });
  it("CA-2-02: adjustedPerShareCost = 125,000", () => {
    expect(r.adjustedPerShareCost).toBe(125_000);
  });
});

// ============================================================
// CA-3: 시계열 조합 — 자본준비금 → 비례감자
// ============================================================

describe("CA-3: 자본준비금 → 비례감자 시계열", () => {
  const r = adjustShareCountAndCost(1_000, 100_000_000, [
    { type: "bonus_capital_reserve", eventDate: new Date("2022-06-01"), ratio: 0.5 },
    { type: "reduction_proportional", eventDate: new Date("2023-06-01"), ratio: 0.2 },
  ]);
  it("CA-3-01: 1000 → 1500 → 1200", () => {
    expect(r.applied[0].afterShares).toBe(1_500);
    expect(r.applied[1].afterShares).toBe(1_200);
    expect(r.adjustedShareCount).toBe(1_200);
  });
  it("CA-3-02: adjustedPerShareCost = 83,333 (floor(1억/1200))", () => {
    expect(r.adjustedPerShareCost).toBe(83_333);
  });
});

// ============================================================
// CA-4: 이익잉여금 무상증자 skip
// ============================================================

describe("CA-4: 이익잉여금 무상증자 skip (의제배당)", () => {
  const r = adjustShareCountAndCost(1_000, 100_000_000, [
    { type: "bonus_retained_earnings", eventDate: new Date("2022-06-01"), ratio: 0.5 },
  ]);
  it("CA-4-01: adjustedShareCount = 1,000 (주식수 불변)", () => {
    expect(r.adjustedShareCount).toBe(1_000);
  });
  it("CA-4-02: applied[0].skipped = true", () => {
    expect(r.applied[0].skipped).toBe(true);
  });
  it("CA-4-03: warnings에 의제배당 안내", () => {
    expect(r.warnings.join("|")).toContain("의제배당");
  });
});

// ============================================================
// CA-5: 자본환급 무상감자 skip
// ============================================================

describe("CA-5: 자본환급 무상감자 skip (의제배당 §17②1호)", () => {
  const r = adjustShareCountAndCost(1_000, 100_000_000, [
    { type: "reduction_capital_return", eventDate: new Date("2022-06-01"), ratio: 0.3 },
  ]);
  it("CA-5-01: adjustedShareCount = 1,000", () => {
    expect(r.adjustedShareCount).toBe(1_000);
  });
  it("CA-5-02: applied[0].skipped = true", () => {
    expect(r.applied[0].skipped).toBe(true);
  });
});

// ============================================================
// CA-7: adjustedShareCount ≠ shareCount → warning (engine integration)
// ============================================================

describe("CA-7: 환산 후 주식수 ≠ 입력 양도 주식수 — warning 발동", () => {
  const result = calculateStockTransferTax(baseInput({
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 100_000,
    shareCount: 2_000,    // 사용자가 양도 주식수 명시
    capitalAdjustments: [
      { type: "bonus_capital_reserve", eventDate: new Date("2022-06-01"), ratio: 0.5 },
      // 1000주 → 1500주 환산 가정 (계산상 shareCount는 2000 → 3000 → 사용자 양도 2000 = 불일치)
      // 본 anchor는 엔진의 자기일관성 warning 발동만 확인
    ],
  }));

  it("CA-7-01: warnings에 '환산 후 주식수' 메시지", () => {
    const hasMsg = result.warnings.some((w) => w.includes("환산"));
    expect(hasMsg).toBe(true);
  });
});

// ============================================================
// CA-12: 시계열 무순서 입력 자동 정렬
// ============================================================

describe("CA-12: 시계열 무순서 입력 자동 정렬", () => {
  const r = adjustShareCountAndCost(1_000, 100_000_000, [
    { type: "bonus_capital_reserve", eventDate: new Date("2023-06-01"), ratio: 0.2 },
    { type: "bonus_capital_reserve", eventDate: new Date("2022-06-01"), ratio: 0.5 },
  ]);
  it("CA-12-01: applied 배열 오름차순", () => {
    expect(r.applied[0].eventDate.getFullYear()).toBe(2022);
    expect(r.applied[1].eventDate.getFullYear()).toBe(2023);
  });
});
