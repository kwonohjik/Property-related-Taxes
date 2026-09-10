/**
 * PAR — 상장 환산취득가 산식은 **두 경로가 같은 함수를 지난다**.
 *
 * 시행령 §176의2②1호의 같은 산식이 두 곳에 각각 구현돼 있었다:
 *
 *   일반 상장 환산   `stock-valuation-listed.ts`  — 인라인 `Math.floor(safeMultiply(...) / ...)`
 *   취득 후 상장 §165⑤ `apply-163-9-conversion.ts`  — `apply163_9Conversion`
 *
 * 같은 조문·같은 floor 정책인데 함수가 둘이면 **한쪽만 고쳐지는 드리프트**가 생긴다.
 * 2026-09-10에 일반 경로가 헬퍼를 쓰도록 합쳤고, 이 anchor가 그 합류를 계약으로 고정한다.
 *
 * ## 무엇을 단언하는가
 *
 * 「분자(1주당 취득기준시가)와 분모(1주당 양도기준시가)가 같으면, **어느 경로로 왔든**
 *  취득가액·개산공제 base가 같다」. 분자를 만드는 방법만 다르다:
 *
 *   일반   → `acquisitionDatePriceAvg1Month`를 그대로 분자로 (모법 §99①3)
 *   §165⑤ → 상장일 이후 1개월 종가평균 × (취득연도 평가 ÷ 상장연도 평가)로 **산출**
 *
 * ⚠️ **뮤테이션 대응**: 둘 중 한 경로의 곱셈·floor을 바꾸면 이 anchor가 깨져야 한다.
 *    (예: `stock-valuation-listed.ts`를 인라인 곱셈으로 되돌리면서 floor 시점을 바꾸면 실패)
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** §165⑤ 픽스처가 만들어내는 1주당 취득기준시가 — PL-1이 고정한 값 */
const ACQ_STD_PER_SHARE = 5_824;
const TRANSFER_STD = 8_659;
const SHARE_COUNT = 5_000;
/** 🔑 나누어떨어지지 않게 — 총액 모드라야 분모 관련 함정(PLD-0)을 피한다 */
const TRANSFER_TOTAL = 44_753_000;

function common(): Partial<StockTransferInput> {
  return {
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    isOnMarketTransaction: true,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: new Date("2005-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: SHARE_COUNT,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "total",
    transferTotalPrice: TRANSFER_TOTAL,
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: TRANSFER_STD,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "estimated",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
  };
}

/** 경로 A — 일반 상장 환산: 분자를 «입력»으로 받는다 */
const generalPath = () =>
  ({
    ...common(),
    acquiredBeforeListing: false,
    acquisitionDatePriceAvg1Month: ACQ_STD_PER_SHARE,
  }) as StockTransferInput;

/** 경로 B — 취득 후 상장 §165⑤: 분자를 «산출»한다 (8,001 × 취득/상장 = 5,824) */
const postListingPath = () =>
  ({
    ...common(),
    acquiredBeforeListing: true,
    listingDate: new Date("2009-08-21"),
    listingDatePriceAvg1Month: 8_001,
    listingYearNetIncomePerShare: 61_570,
    listingYearNetAssetPerShare: 5_352,
    acquisitionYearNetIncomePerShare: 44_520,
    acquisitionYearNetAssetPerShare: 4_348,
  }) as StockTransferInput;

describe("PAR — 상장 환산 산식 두 경로 동치", () => {
  it("PAR-0 (전제): 두 경로의 분자가 실제로 같다", () => {
    const b = calculateStockTransferTax(postListingPath());
    // §165⑤가 «산출»한 분자가 일반 경로에 «입력»한 값과 같아야 비교가 성립한다
    expect(b.valuationDetail?.finalPerShareValue).toBe(ACQ_STD_PER_SHARE);
  });

  it("PAR-1: 분자·분모가 같으면 취득가액이 같다", () => {
    const a = calculateStockTransferTax(generalPath());
    const b = calculateStockTransferTax(postListingPath());
    const expected = Math.floor((TRANSFER_TOTAL * ACQ_STD_PER_SHARE) / TRANSFER_STD);

    expect(a.acquisitionPrice).toBe(expected);
    expect(b.acquisitionPrice).toBe(expected);
  });

  it("PAR-2: §163⑥4 개산공제 base도 같다 (1주당 × 주식수)", () => {
    const a = calculateStockTransferTax(generalPath());
    const b = calculateStockTransferTax(postListingPath());

    expect(a.estimatedBase).toBe(ACQ_STD_PER_SHARE * SHARE_COUNT);
    expect(b.estimatedBase).toBe(ACQ_STD_PER_SHARE * SHARE_COUNT);
    expect(a.expenses).toBe(b.expenses);
  });
});
