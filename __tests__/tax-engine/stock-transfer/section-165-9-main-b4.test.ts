/**
 * B-4 §165⑨ 본체 — 양도·취득 기준시가 동일 시 §81④ 1호 월할 가산
 *
 * 시행령 §165⑨: 법 §99①3·4에 따라 산정한 양도 당시 기준시가 == 취득 당시 기준시가인 경우,
 *   보유기간·기준시가 상승률 고려 §81④ 계산 가액을 양도 당시 기준시가로 한다.
 * 소칙 §81④ 1호(동일 사업연도 취득·양도): 양도당시 기준시가 = 직전사업연도 기준시가
 *   + (직전 − 전전) × (보유월수 ÷ 직전사업연도 월수). 1개월 미만 절상.
 *
 * 실효 범위 = §99①4(비상장) — §81④ 1호 산식이 사업연도 기준시가 모수이므로 비상장만.
 * 상장(§99①3 종가평균)은 §81④ 2호(보정 없음) — M-8 정보성 warning.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calcAccrualMonths, apply81_4Accrual } from "@/lib/tax-engine/stock-transfer/apply-81-4-accrual";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function baseUnlistedInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
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

    acquisitionDate: new Date("2024-01-15"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 10_000,

    acquisitionCause: "purchase",

    transferPriceMode: "actual",
    perShareTransferPrice: 200_000,

    acquisitionMode: "estimated",
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,

    // 양도·취득 직전 사업연도 평가 동일 (동일 사업연도 취득·양도)
    // weighted = (100,000×3 + 100,000×2)/5 = 100,000. floor80 = 80,000 < 100,000 → 하한 미발동
    transferYearNetIncomePerShare: 100_000,
    transferYearNetAssetPerShare: 100_000,
    acquisitionYearNetIncomePerShare: 100_000,
    acquisitionYearNetAssetPerShare: 100_000,

    expenseMode: "estimated",

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

// 양도가 = 200,000 × 1,000 = 200,000,000
// 양도·취득 기준시가 = 100,000 (동일)

// ============================================================
// Pre-Do BASELINE — 현행 동작 고정 (갭 실증)
// ============================================================
describe("B4 Pre-Do BASELINE — 현행 equal-기준시가 (보정 없음)", () => {
  it("B4-BASELINE: 동일 기준시가 → 환산취득가 = 양도가 · 차익 0 (현행 갭)", () => {
    const r = calculateStockTransferTax(baseUnlistedInput());
    // 환산취득가 = 양도가 × (100,000/100,000) = 양도가
    expect(r.acquisitionPrice).toBe(200_000_000);
    // 개산공제 = 취득기준시가 총액(100,000×1,000) × 1% = 1,000,000
    expect(r.estimatedDeduction).toBe(1_000_000);
    // 양도차익 = 200,000,000 − 200,000,000 − 1,000,000 = −1,000,000 (현행: 음수 미보정 갭)
    expect(r.transferIncome).toBe(-1_000_000);
    // 현행: §165⑨ 보정 미존재
    expect(r.valuationDetail?.section1659Detail).toBeUndefined();
  });
});

// ============================================================
// B4-ENGINE — §165⑨ 본체 보정
// ============================================================
describe("B4 §165⑨ 본체 — 비상장 동일 기준시가 §81④ 1호", () => {
  // 공통: prior=transferStd=acqStd=100,000, 양도가=200,000,000
  // 보유월수 m: 취득 2024-01-15 → 양도 2024-06-01 = 5개월(절상)

  it("B4-ENGINE-1 (M-1): 기준시가 다름 → 현행 환산 (보정 미발동·회귀 0)", () => {
    const r = calculateStockTransferTax(
      baseUnlistedInput({
        // 취득연도 평가 ≠ 양도연도 평가
        acquisitionYearNetIncomePerShare: 80_000,
        acquisitionYearNetAssetPerShare: 80_000,
        unlistedSameBizYearToggle: true,
        prePriorYearNetIncomePerShare: 50_000,
        prePriorYearNetAssetPerShare: 50_000,
      }),
    );
    // transferStd=100,000 ≠ acqStd=80,000 → 트리거 미성립
    expect(r.valuationDetail?.section1659Detail).toBeUndefined();
    // 환산취득가 = 200,000,000 × 80,000/100,000 = 160,000,000 (현행 산식)
    expect(r.acquisitionPrice).toBe(160_000_000);
  });

  it("B4-ENGINE-2 (M-2): 동일 + 토글 ON + 전전입력 → 상향 보정·양(+)차익", () => {
    const r = calculateStockTransferTax(
      baseUnlistedInput({
        unlistedSameBizYearToggle: true,
        prePriorYearNetIncomePerShare: 50_000,
        prePriorYearNetAssetPerShare: 50_000,
      }),
    );
    const d = r.valuationDetail?.section1659Detail;
    expect(d).toBeDefined();
    expect(d!.prior).toBe(100_000);
    expect(d!.prePrior).toBe(50_000);
    expect(d!.holdingMonths).toBe(5);
    expect(d!.priorBizYearMonths).toBe(12);
    // adjusted = floor((100,000×12 + (100,000−50,000)×5)/12) = floor(1,450,000/12) = 120,833
    expect(d!.adjusted).toBe(120_833);
    // 환산취득가 = floor(200,000,000 × 100,000 / 120,833) = 165,517,697 (< 양도가)
    expect(r.acquisitionPrice).toBe(165_517_697);
    expect(r.acquisitionPrice).toBeLessThan(200_000_000);
    // 양도차익 = 200,000,000 − 165,517,697 − 1,000,000(개산공제) = 33,482,303 (양수 — 보정 효과)
    expect(r.transferIncome).toBe(33_482_303);
    expect(r.transferIncome).toBeGreaterThan(0);
  });

  it("B4-ENGINE-3 (M-3): 동일 + 토글 OFF → 보정 없음(2호)·warning", () => {
    const r = calculateStockTransferTax(
      baseUnlistedInput({ unlistedSameBizYearToggle: false }),
    );
    expect(r.valuationDetail?.section1659Detail).toBeUndefined();
    expect(r.acquisitionPrice).toBe(200_000_000); // 보정 없음
    expect(r.transferIncome).toBe(-1_000_000);
    expect(r.warnings.some((w) => w.includes("§81④ 2호"))).toBe(true);
  });

  it("B4-ENGINE-4 (M-5): 전전 > 직전 (하락) → adjusted < prior·환산비율 > 1", () => {
    const r = calculateStockTransferTax(
      baseUnlistedInput({
        unlistedSameBizYearToggle: true,
        prePriorYearNetIncomePerShare: 150_000,
        prePriorYearNetAssetPerShare: 150_000,
      }),
    );
    const d = r.valuationDetail?.section1659Detail;
    expect(d).toBeDefined();
    // adjusted = floor((100,000×12 + (100,000−150,000)×5)/12) = floor(950,000/12) = 79,166
    expect(d!.adjusted).toBe(79_166);
    expect(d!.adjusted).toBeLessThan(d!.prior);
    // 환산비율 > 1 → 환산취득가 > 양도가
    expect(r.acquisitionPrice).toBeGreaterThan(200_000_000);
  });

  it("B4-ENGINE-5 (M-6): adjusted ≤ 0 → 보정 미적용·warning", () => {
    const r = calculateStockTransferTax(
      baseUnlistedInput({
        unlistedSameBizYearToggle: true,
        prePriorYearNetIncomePerShare: 400_000,
        prePriorYearNetAssetPerShare: 400_000,
      }),
    );
    // adjusted = floor((1,200,000 + (100,000−400,000)×5)/12) = floor(−300,000/12) = −25,000 ≤ 0
    expect(r.valuationDetail?.section1659Detail).toBeUndefined();
    expect(r.acquisitionPrice).toBe(200_000_000); // 현행 환산 유지
    expect(r.warnings.some((w) => w.includes("§81④ 보정 평가액이 0 이하"))).toBe(true);
  });

  /**
   * 🔄 **2026-08-09 뒤집힘** — 종전 제목은 "80% 하한 양도측만 발동 → 최종 상이 → 트리거 미성립"이었다.
   *
   * 그 테스트는 **취득측 하한 미적용을 검증한 것이 아니라 전제로 이용**했다. §165④1 단서를
   * 양도·취득 양쪽에 적용하도록 고치자 두 기준시가가 **같아져 §165⑨이 성립**한다.
   *
   * ⭐ **그게 옳은 결과다.** §165⑨은 「양도 당시 기준시가와 취득 당시 기준시가가 **같은 경우**」
   *   §81④ 월할 가산을 적용하라는 규정인데, 종전에는 하한을 한쪽에만 걸어 두 값이
   *   **인위적으로 달라져** 트리거가 막혀 있었다. 즉 하나의 결함이 §165⑨ 경로까지 잠갔다.
   */
  it("B4-ENGINE-6 (M-7): 하한이 양쪽에 걸려 기준시가가 같아지면 §165⑨이 성립한다", () => {
    // NI=10,000 NA=100,000 → weighted=(10,000×3+100,000×2)/5=46,000, floor80=80,000 → 양쪽 다 80,000
    const r = calculateStockTransferTax(
      baseUnlistedInput({
        transferYearNetIncomePerShare: 10_000,
        transferYearNetAssetPerShare: 100_000,
        acquisitionYearNetIncomePerShare: 10_000,
        acquisitionYearNetAssetPerShare: 100_000,
        unlistedSameBizYearToggle: true,
        prePriorYearNetIncomePerShare: 30_000,
        prePriorYearNetAssetPerShare: 30_000,
      }),
    );

    expect(r.valuationDetail?.netAssetFloorApplied).toBe(true);
    expect(r.valuationDetail?.acquisitionNetAssetFloorApplied).toBe(true);
    // §81④ 1호: 직전 80,000 + (직전 80,000 − 전전 30,000) × (보유 5개월 ÷ 12) = 100,833
    expect(r.valuationDetail?.section1659Detail).toMatchObject({
      prior: 80_000,
      prePrior: 30_000,
      holdingMonths: 5,
      priorBizYearMonths: 12,
      adjusted: 100_833,
    });
  });

  it("B4-BOUNDARY-1: 보유월수 1개월 미만 → 1개월 절상", () => {
    const r = calculateStockTransferTax(
      baseUnlistedInput({
        acquisitionDate: new Date("2024-05-20"),
        transferDate: new Date("2024-06-01"),
        unlistedSameBizYearToggle: true,
        prePriorYearNetIncomePerShare: 50_000,
        prePriorYearNetAssetPerShare: 50_000,
      }),
    );
    expect(r.valuationDetail?.section1659Detail?.holdingMonths).toBe(1);
  });
});

// ============================================================
// B4-SHARED — 공유 헬퍼 (post-listing 회귀 보호)
// ============================================================
describe("B4-SHARED — apply-81-4-accrual 공유 헬퍼", () => {
  it("B4-SHARED-1: calcAccrualMonths 절상 + apply81_4Accrual 산식", () => {
    // 5개월 (취득→양도)
    expect(calcAccrualMonths(new Date("2024-01-15"), new Date("2024-06-01"))).toBe(5);
    // 1개월 미만 절상
    expect(calcAccrualMonths(new Date("2024-05-20"), new Date("2024-06-01"))).toBe(1);
    // §81④ 1호 산식 — 사례 48 prior=28,451·prePrior=20,000·m=3·d=12
    expect(apply81_4Accrual(28_451, 20_000, 3, 12).adjusted).toBe(
      Math.floor((28_451 * 12 + (28_451 - 20_000) * 3) / 12),
    );
    // 음수 상승률 단일 floor 방향
    expect(apply81_4Accrual(100_000, 150_000, 5, 12).adjusted).toBe(79_166);
  });
});

// ============================================================
// B4-LISTED — 상장 종가평균 동일 (§81④ 2호 정보성)
// ============================================================
describe("B4-LISTED — 상장 동일 종가평균 §81④ 2호", () => {
  function baseListedInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
    return {
      ...baseUnlistedInput(),
      marketType: "kospi",
      acquisitionMode: "estimated",
      acquisitionDatePriceAvg1Month: 50_000,
      transferDatePriceAvg1Month: 50_000,
      ...overrides,
    };
  }

  it("B4-LISTED-1 (M-8): 상장 양도·취득 종가평균 동일 → §81④ 2호 warning·보정 없음", () => {
    const r = calculateStockTransferTax(baseListedInput());
    // 상장은 §81④ 1호 산식(사업연도 모수) 미적용 → 보정 없음
    expect(r.valuationDetail?.section1659Detail).toBeUndefined();
    expect(r.warnings.some((w) => w.includes("§81④ 2호"))).toBe(true);
  });
});
