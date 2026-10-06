/**
 * 분할·다건 lot 의제취득일 전 매수 anchor 공용 픽스처 — 코스피 대주주(비중소) · 1980-06 매수 · 2025-12-01 양도
 * (`pre-deemed-lots-clause1.anchor` · `pre-deemed-lots-shortterm-apportion.anchor` 공용)
 */

import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

const D = (s: string) => new Date(s);

export function base(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: 0.2,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0.2,
    combinedMarketCap: 0,
    priorYearEndDate: D("2024-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: D("1980-06-01"),
    transferDate: D("2025-12-01"),
    shareCount: 1000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 200_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 10_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: D("2026-02-28"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}
