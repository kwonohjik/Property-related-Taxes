/**
 * 가산세 축 anchor — 리뷰 2026-08-28 #10·#19
 *
 * 둘 다 **「§47조의4는 §47조의2·3에 종속되지 않는다」**를 놓친 데서 나온다.
 *
 * ── #10 다종목 신고축 선택 오류 ────────────────────────────────────────────────
 *   `pickFilingAxisInput`이 국내 분기에서 `filingViolation` **값을 보지 않고** 첫 국내
 *   종목을 그대로 대표로 삼았다. UI는 `[...savedItems, formData]`로 **편집 중 종목을 항상
 *   마지막**에 붙이므로, 확정된 국내 종목이 하나라도 있으면 지금 화면에서 선언한 위반은
 *   결코 신고축이 되지 못한다. Step3 안내문은 「합산 결정세액에 한 번 산정」이라 적어
 *   아무 종목에서나 선언해도 되는 것처럼 읽힌다.
 *
 *   국외 fallback도 `filingViolation`만 봐서, **정상신고 + 납부지연**인 전(全)국외 신고는
 *   축을 못 골라 `computeFilingUnitPenalty`가 `{filing:0, late:0}`으로 조기반환한다 —
 *   같은 입력을 국외 **단건**으로 넣으면 계산되므로 **종목 개수만으로 세액이 갈렸다**.
 *
 *   근거: 국세기본법 §47조의4①1호는 「법정납부기한까지 납부하지 아니하거나 적게 납부한
 *        경우」로 §47조의2·§47조의3을 요건으로 하지 않는다 · 소득세법 §110①(확정신고 직접 적용).
 *
 * ── #19 「정상신고 + 납부지연」에 입력 경로가 없다 ──────────────────────────────
 *   `unpaidTax`·`paymentDeadline`·`actualPaymentDate`의 입력 위젯이 `PenaltyDetailBlock`
 *   한 곳뿐인데 그 블록이 `filingViolation !== "none"` 게이트 **안**에 있었다.
 *   ④는 게이트 없이 전송하고 엔진은 `filingViolation`을 읽지 않으므로 양방향 결함이 된다:
 *     (a) 축을 되돌리면 화면에서 칸은 사라지는데 **세액은 남는다**(정정할 화면이 없다)
 *     (b) 가장 흔한 「정상신고 + 납부지연」은 **입력할 방법이 아예 없다**
 *   부동산 정본은 같은 블록을 게이트 **밖 형제 div**에 둔다(`transfer-tax/steps/Step6.tsx`).
 *
 *   PA-PICK-1~4  (#10)
 *   PA-LATE-1~3  (#19 — 엔진·축 쪽. UI 게이트는 컴포넌트 테스트에서 고정)
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

/** 국내 종목 — 전자신고 OFF (공제 축 제거) */
function dom(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: 0.03,
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
    acquisitionDate: new Date("2022-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 110_000,
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

/** 국외 종목 — 환율 1 고정, 외국납부세액 없음 */
function fx(gain: number, o: Partial<ForeignStockInput> = {}): ForeignStockInput {
  return {
    marketType: "foreign_stock",
    yearsResidentInKorea: 10,
    isListedForeignCorp: true,
    stockName: "Corp",
    countryCode: "US",
    shareCount: 1,
    transferDate: new Date("2024-03-01"),
    transferPriceMode: "total",
    totalTransferPriceForeign: gain + 1_000_000,
    transferCurrencyCode: "USD",
    transferExchangeRate: 1,
    acquisitionDate: new Date("2021-01-02"),
    acquisitionMode: "actual",
    perShareAcquisitionPriceForeign: 1_000_000,
    acquisitionCurrencyCode: "USD",
    acquisitionExchangeRate: 1,
    capitalExpenditureForeign: 0,
    transferCostForeign: 0,
    hasForeignTax: false,
    foreignTaxMethod: "credit",
    isElectronicFiling: false,
    ...o,
  };
}

/** 납부지연 3필드 — 미납 10,000,000 · 기한 2024-08-31 · 납부 2024-10-01 */
const LATE = {
  unpaidTax: 10_000_000,
  paymentDeadline: new Date("2024-08-31"),
  actualPaymentDate: new Date("2024-10-01"),
} as const;

// ============================================================
// #10 — 신고축 선택
// ============================================================

describe("PA-PICK (#10): 신고축은 「선언한 종목」이 대표다", () => {
  it("PA-PICK-1: 국내 2종목 — 뒤 종목이 선언했으면 그 선언이 축이 된다", () => {
    const agg = calculateStockTransferTaxAggregate([
      dom(),
      dom({ filingViolation: "under_report", isFraudulent: true }),
    ]);
    // 신고 단위 산출세액 × 40%
    expect(agg.totalUnderReportPenalty).toBe(Math.floor(agg.totalCalculatedTax * 0.4 / 10) * 10);
    expect(agg.totalUnderReportPenalty).toBeGreaterThan(0);
  });

  it("PA-PICK-2: 종목 순서를 뒤집어도 같다 (순서 의존 제거)", () => {
    const a = calculateStockTransferTaxAggregate([
      dom(),
      dom({ filingViolation: "under_report", isFraudulent: true }),
    ]);
    const b = calculateStockTransferTaxAggregate([
      dom({ filingViolation: "under_report", isFraudulent: true }),
      dom(),
    ]);
    expect(a.totalUnderReportPenalty).toBe(b.totalUnderReportPenalty);
  });

  it("PA-PICK-3: 아무도 선언하지 않으면 신고불성실 0 (회귀 가드)", () => {
    const agg = calculateStockTransferTaxAggregate([dom(), dom()]);
    expect(agg.totalUnderReportPenalty).toBe(0);
  });

  it("PA-PICK-4: 선언 종목의 base 차감 필드(당초신고세액)도 함께 채택된다", () => {
    // 같은 축 객체가 originalFiledTax·priorPaidTax·fraudulentPortion까지 결정한다.
    const withBase = calculateStockTransferTaxAggregate([
      dom(),
      dom({ filingViolation: "under_report", originalFiledTax: 5_000_000 }),
    ]);
    const withoutBase = calculateStockTransferTaxAggregate([
      dom(),
      dom({ filingViolation: "under_report" }),
    ]);
    expect(withBase.totalUnderReportPenalty).toBeLessThan(withoutBase.totalUnderReportPenalty);
  });
});

// ============================================================
// #10(b)·#19 — 납부지연은 신고불성실과 독립이다
// ============================================================

describe("PA-LATE (#19): §47조의4는 §47조의2·3을 요건으로 하지 않는다", () => {
  it("PA-LATE-1: 국내 — 정상신고 + 납부지연이 계산된다", () => {
    const agg = calculateStockTransferTaxAggregate([dom({ ...LATE })]);
    expect(agg.totalUnderReportPenalty).toBe(0);
    expect(agg.totalLatePaymentPenalty).toBe(66_000);
  });

  it("PA-LATE-2: 전(全)국외 — 정상신고 + 납부지연도 계산된다", () => {
    // 종전에는 축을 못 골라 `{filing:0, late:0}`으로 조기반환했다.
    const agg = calculateStockTransferTaxAggregate([
      fx(100_000_000, { ...LATE, filingViolation: "none" }),
    ]);
    expect(agg.totalLatePaymentPenalty).toBe(66_000);
  });

  it("PA-LATE-3: 같은 입력이면 단건과 다종목이 같다 (종목 개수로 세액이 갈리지 않는다)", () => {
    const single = calculateStockTransferTax(
      fx(100_000_000, { ...LATE, filingViolation: "none" }),
    );
    const agg = calculateStockTransferTaxAggregate([
      fx(100_000_000, { ...LATE, filingViolation: "none" }),
    ]);
    expect(agg.totalLatePaymentPenalty).toBe(single.latePaymentPenalty);
  });
});
