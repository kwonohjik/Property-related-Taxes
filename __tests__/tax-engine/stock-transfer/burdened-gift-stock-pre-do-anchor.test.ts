/**
 * Pre-Do Anchor — 주식 부담부증여 양도소득세 §159 안분
 *
 * 설계: docs/02-design/features/gift-stock-burdened-transfer-tax.engine.design.md
 *
 * anchor-1 (S-01): 비상장 실지 — 클라이언트 B/C 안분 후 actual 주입. actual 개산공제 0(D2).
 * anchor-2 (S-02): 비상장 환산 — ★현행 엔진이 burdenedGiftDebtRatio 없이 B/C 안분 안 함을 실증
 *                  (§165④ 보충평가 = 취득시점 전체 → 과대 취득가/음수 양도차익) → (A)안 필요성 확정.
 */
import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function baseUnlistedInput(
  overrides: Partial<StockTransferInput> = {},
): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: false,
    selfShareRatio: 0.02,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0.02,
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
    acquisitionDate: new Date("2020-01-15"),
    transferDate: new Date("2025-06-01"),
    shareCount: 10_000,
    totalIssuedShares: 50_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "total", // 총액 직접 입력 (default per_share 회피)
    transferTotalPrice: 400_000_000, // §159 양도가액 = 채무 B (단일자산 평가 10억의 40%)
    acquisitionMode: "actual",
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    transferYearNetIncomePerShare: 50_000,
    transferYearNetAssetPerShare: 50_000,
    acquisitionYearNetIncomePerShare: 50_000,
    acquisitionYearNetAssetPerShare: 50_000,
    expenseMode: "actual",
    filingType: "preliminary",
    filingDate: new Date("2025-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...overrides,
  };
}

describe("[Pre-Do anchor-1] 비상장 실지 — 클라이언트 안분 후 actual 주입 (S-01)", () => {
  it("양도가액 4억 − 취득가 8천만(안분) − 개산공제 0(actual) = 양도차익 3.2억", () => {
    // §159: 취득가액 = 증여자취득가 2억 × (채무 4억 / 증여가 10억) = 8천만 (클라이언트 안분)
    const r = calculateStockTransferTax(
      baseUnlistedInput({
        acquisitionMode: "actual",
        perShareAcquisitionPrice: 8_000, // 8천만 / 1만주
      }),
    );
    console.log("[A-1] transferPrice:", r.transferPrice, "acquisitionPrice:", r.acquisitionPrice, "transferIncome:", r.transferIncome);
    expect(r.transferPrice).toBe(400_000_000);
    expect(r.acquisitionPrice).toBe(80_000_000);
    // D2: actual 모드 개산공제 0 → 양도차익 = 4억 − 8천만 = 3.2억
    expect(r.transferIncome).toBe(320_000_000);
  });
});

describe("[Pre-Do anchor-2] ★ 비상장 환산 — acquisitionPrice 양도가 기반 자동 안분 / estimatedBase만 누락 (S-02)", () => {
  it("acquisitionPrice는 양도가(=채무B) 기반 환산 → 자동 안분(ratio 곱 금지·이중안분). 개산공제 base만 안분 누락", () => {
    // totalAcquisitionPrice = 양도가(4억) × (취득기준/양도기준 = 1) = 4억 (stock-valuation-unlisted.ts:44)
    //   → §159 취득가액 = 전체환산취득가(10억×1) × B/C(0.4) = 4억과 일치 (양도가 선형성 → 자동 안분).
    //   ★ 여기에 burdenedGiftDebtRatio(0.4)를 곱하면 1.6억 = 이중 안분 오류!
    const r = calculateStockTransferTax(
      baseUnlistedInput({
        acquisitionMode: "estimated",
        expenseMode: "estimated",
      }),
    );
    console.log("[A-2] transferPrice:", r.transferPrice, "acquisitionPrice:", r.acquisitionPrice, "transferIncome:", r.transferIncome);
    // ① acquisitionPrice = 양도가 기반 자동 안분 (§159 정답) → ratio 곱 금지
    expect(r.acquisitionPrice).toBe(400_000_000);
    // ② 개산공제 base(estimatedBase = acquisitionStdPriceTotal = 보충평가 전체 5억)는 양도가 무관 → 안분 누락.
    //    개산공제 = 5억 × 1% = 5백만 (전체 기준, 과대). 안분 정답 = 5억 × 0.4 × 1% = 2백만.
    //    transferIncome = 4억 − 4억 − 5백만 = -5백만 (개산공제 과대 실증)
    expect(r.transferIncome).toBe(-5_000_000);
    // → 환류: burdenedGiftDebtRatio는 estimatedBase(개산공제 base)에만 적용. acquisitionPrice 미적용.
  });
});
