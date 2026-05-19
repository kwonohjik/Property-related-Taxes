/**
 * T-TOTAL-1~5 — 양도가액 합계 직접 입력 모드 (transferActualInputMode = "total")
 *
 * 계획서: docs/00-pm/stock-transfer-actual-total-input.plan.md v2
 * 엔진 디자인: docs/02-design/features/stock-transfer-actual-total-input.engine.design.md v2
 *
 * 케이스 인벤토리:
 *   T-TOTAL-1 (C-2): 단순 total 모드 → transferTotalPrice가 transferPrice로 직접 반영
 *   T-TOTAL-2 (C-1 vs C-2): per_share·total 동치성 — 같은 합계일 때 산출세액 동일
 *   T-TOTAL-3 (C-3): 1원 잔돈 보존 — 250,000,001 그대로 transferPrice
 *   T-TOTAL-4 (C-6): split + total Zod 차단 (UI disabled + Zod refine 2중 방어선)
 *   T-TOTAL-5 (C-4): exchange 모드는 transferActualInputMode 무시 (transferPrice는 부동산+채무+현금 합)
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import {
  stockTransferInputSchema,
  addStockRefines,
} from "@/lib/api/stock-transfer-tax-schema";

// ============================================================
// 공용 base input (비상장 대주주 — 본 anchor는 transferPrice 분기만 검증)
// ============================================================

function baseInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.6,
    selfMarketCap: 2_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),
    isSmallMediumEnterprise: true,
    isMidsizeEnterprise: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    isListedSmallShareholder: false,
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2024-06-30"),
    shareCount: 5_000,
    totalIssuedShares: 10_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 50_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 30_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
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

describe("T-TOTAL: 양도가액 합계 직접 입력 모드", () => {
  // ----------------------------------------------------------
  it("T-TOTAL-1: total 모드에서 transferTotalPrice가 transferPrice로 직접 반영된다", () => {
    const result = calculateStockTransferTax(
      baseInput({
        transferActualInputMode: "total",
        transferTotalPrice: 250_000_000,
        perShareTransferPrice: undefined,
      }),
    );
    expect(result.transferPrice).toBe(250_000_000);
  });

  // ----------------------------------------------------------
  it("T-TOTAL-2: per_share와 total이 같은 합계일 때 산출세액이 동일하다", () => {
    const perShareResult = calculateStockTransferTax(
      baseInput({
        transferActualInputMode: "per_share",
        perShareTransferPrice: 50_000, // 50,000 × 5,000 = 250,000,000
      }),
    );
    const totalResult = calculateStockTransferTax(
      baseInput({
        transferActualInputMode: "total",
        transferTotalPrice: 250_000_000,
        perShareTransferPrice: undefined,
      }),
    );
    expect(totalResult.transferPrice).toBe(perShareResult.transferPrice);
    expect(totalResult.calculatedTax).toBe(perShareResult.calculatedTax);
  });

  // ----------------------------------------------------------
  it("T-TOTAL-3: 250,000,001원이 잔돈 없이 그대로 transferPrice가 된다 (per_share와 1원 차이)", () => {
    const totalResult = calculateStockTransferTax(
      baseInput({
        transferActualInputMode: "total",
        transferTotalPrice: 250_000_001,
        perShareTransferPrice: undefined,
      }),
    );
    const perShareResult = calculateStockTransferTax(
      baseInput({
        transferActualInputMode: "per_share",
        perShareTransferPrice: 50_000, // 정수 단가 가정 → 250,000,000
      }),
    );
    expect(totalResult.transferPrice).toBe(250_000_001);
    expect(totalResult.transferPrice - perShareResult.transferPrice).toBe(1);
  });

  // ----------------------------------------------------------
  it("T-TOTAL-4: split 모드 + total 조합은 Zod refine에서 차단된다", () => {
    const schema = addStockRefines(stockTransferInputSchema);
    const parsed = schema.safeParse({
      ...baseInput({
        transferActualInputMode: "total",
        transferTotalPrice: 250_000_000,
        perShareTransferPrice: undefined,
      }),
      // split 모드 활성화 (lot 배열 + costAllocationMethod 명시)
      acquisitionLots: [
        {
          id: "a1",
          acquisitionDate: new Date("2020-01-01"),
          shareCount: 5_000,
          perShareAcquisitionPrice: 30_000,
          acquisitionCause: "purchase",
        },
      ],
      transferLots: [
        {
          id: "t1",
          transferDate: new Date("2024-06-30"),
          shareCount: 5_000,
          perShareTransferPrice: 50_000,
        },
      ],
      costAllocationMethod: "fifo",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const hasTotalBlock = parsed.error.issues.some((i) =>
        i.path.includes("transferActualInputMode"),
      );
      expect(hasTotalBlock).toBe(true);
    }
  });

  // ----------------------------------------------------------
  it("T-TOTAL-5: exchange 모드에서 transferActualInputMode 값은 transferPrice에 영향을 주지 않는다", () => {
    const result = calculateStockTransferTax(
      baseInput({
        transferPriceMode: "exchange",
        exchangePropertyValue: 80_000_000,
        exchangeDebtRelief: 15_000_000,
        exchangeCash: 5_000_000,
        transferActualInputMode: "total", // exchange 분기에서 무시
        transferTotalPrice: 999_999_999, // 무시
        perShareTransferPrice: undefined,
      }),
    );
    expect(result.transferPrice).toBe(100_000_000); // 80M + 15M + 5M
  });
});
