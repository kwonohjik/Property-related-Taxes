/**
 * 가산세 신고-단위 산정 anchor — 부동산 정본(`transfer-tax-penalty.ts`) 재사용
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Phase A′ · §9)
 *
 * ## 이 파일이 고정하는 것
 *
 * · **국세기본법 §47조의3①** — 가산세 base 는 「과소신고**납부세액등**」이다. 산출세액 전액이
 *   아니라 **당초 신고한 납부세액·기납부세액·이자상당가산액을 뺀** 금액이다.
 * · **적용 단위는 신고 1건** — 「국세의 과세표준 **신고**」 단위로 걸리므로 종목마다 매기고
 *   합산하는 것이 아니라 **신고 단위 결정세액에 1회** 매긴다.
 * · **국외주식도 같은 신고 단위** — 소득세법 §118의8 이 §105~§107·§110~§112(예정·확정신고·납부)를
 *   준용한다. 종전에는 국외 종목의 가산세가 **0으로 고정**돼 혼합 신고에서 통째로 빠졌다.
 * · **국세기본법 §47조의4 납부지연가산세** — 미납세액 × 경과일수 × 1일 10만분의 22
 *   (국기령 §27조의4①). 종전에는 `latePaymentPenalty = 0` placeholder 였다.
 *
 * ## 실측 격자 (Phase 0 P-5·P-6)
 *
 * 국내(kospi 대주주 · 소득 100,000,000) + 국외(소득 100,000,000):
 *   기본공제 2,500,000 은 §103② 「먼저 양도한 자산」이라 3월 양도인 **국외 종목**에 간다.
 *   국내 과세표준 100,000,000 × 20% = 20,000,000 · 국외 97,500,000 × 20% = 19,500,000
 *   ⇒ 신고 단위 산출세액 **39,500,000**
 */

import { describe, it, expect } from "vitest";
import {
  calculateStockTransferTax,
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

/** 국내 종목 — 전자신고 OFF 로 공제 축을 제거한다(가산세 base 만 본다) */
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
    filingViolation: "under_report",
    isFraudulent: true,
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

// ============================================================
// PU-1 — 국외 종목이 가산세 base 에 들어간다 (소득세법 §118의8)
// ============================================================

describe("PU-1 국내+국외 혼합 과소신고(부정 40%) — 국외 소득분도 가산세 base 다", () => {
  const agg = calculateStockTransferTaxAggregate([dom(), fx(100_000_000)]);

  it("PU-1-1: 신고 단위 산출세액 = 39,500,000 (국내 20,000,000 + 국외 19,500,000)", () => {
    expect(agg.totalCalculatedTax).toBe(39_500_000);
  });

  it("PU-1-2: 가산세 = 39,500,000 × 40% = 15,800,000 — 국외분이 빠지지 않는다", () => {
    expect(agg.totalUnderReportPenalty).toBe(15_800_000);
  });

  it("PU-1-3: 종목별 가산세는 전부 0 — 신고 단위 1회 산정이라 종목에 귀속되지 않는다", () => {
    expect(agg.items.map((r) => r.underReportPenalty)).toEqual([0, 0]);
  });

  it("PU-1-3b: 종목별 **조문 표시도** 걷힌다 — 값 0인데 40% 배지가 남으면 안 된다", () => {
    const penaltyRules = agg.items.flatMap((r) =>
      (r.warnings ?? []).filter((w) => w.includes("국세기본법 §47")),
    );
    expect(penaltyRules).toEqual([]);
  });

  it("PU-1-4: 결정세액 = 39,500,000 + 15,800,000 = 55,300,000", () => {
    expect(agg.totalFinalTax).toBe(55_300_000);
  });
});

// ============================================================
// PU-2 — 신고 단위이므로 종목을 어떻게 쪼개도 가산세가 같다
// ============================================================

describe("PU-2 단건 ↔ 다종목 항등식", () => {
  const one = calculateStockTransferTaxAggregate([dom()]);
  const two = calculateStockTransferTaxAggregate([
    dom({ shareCount: 500 }),
    dom({ shareCount: 500, transferDate: new Date("2024-09-01") }),
  ]);

  it("PU-2-1: 1종목 가산세 = 19,500,000 × 40% = 7,800,000", () => {
    expect(one.totalUnderReportPenalty).toBe(7_800_000);
  });

  it("PU-2-2: 2종목으로 쪼개도 가산세가 같다", () => {
    expect(two.totalUnderReportPenalty).toBe(one.totalUnderReportPenalty);
  });

  it("PU-2-3: 단건 엔진과 aggregate 단일 종목의 가산세가 같다", () => {
    const single = calculateStockTransferTax(dom());
    expect(single.underReportPenalty).toBe(one.totalUnderReportPenalty);
  });
});

// ============================================================
// PU-3 — base 는 「과소신고납부세액등」 (국세기본법 §47조의3①)
// ============================================================

describe("PU-3 당초 신고세액·기납부세액이 base 에서 빠진다", () => {
  it("PU-3-1: 당초 신고세액 10,000,000 → base 9,500,000 × 40% = 3,800,000", () => {
    const r = calculateStockTransferTax(dom({ originalFiledTax: 10_000_000 }));
    expect(r.underReportPenalty).toBe(3_800_000);
  });

  it("PU-3-2: 기납부세액 5,000,000 → base 14,500,000 × 40% = 5,800,000", () => {
    const r = calculateStockTransferTax(dom({ priorPaidTax: 5_000_000 }));
    expect(r.underReportPenalty).toBe(5_800_000);
  });

  it("PU-3-3: 이자상당가산액은 base 에서 제외된다 (§47조의3① 괄호)", () => {
    const r = calculateStockTransferTax(dom({ interestSurcharge: 1_500_000 }));
    expect(r.underReportPenalty).toBe(7_200_000); // (19,500,000 − 1,500,000) × 40%
  });

  it("PU-3-4: base 가 음수면 0 으로 clamp — 가산세 0", () => {
    const r = calculateStockTransferTax(dom({ originalFiledTax: 99_000_000 }));
    expect(r.underReportPenalty).toBe(0);
  });

  it("PU-3-5: 정상신고면 신규 필드와 무관하게 0", () => {
    const r = calculateStockTransferTax(
      dom({ filingViolation: "none", isFraudulent: false, originalFiledTax: 1_000_000 }),
    );
    expect(r.underReportPenalty).toBe(0);
  });
});

// ============================================================
// PU-4 — 납부지연가산세 §47조의4 (국기령 §27조의4① 1일 10만분의 22)
// ============================================================

describe("PU-4 납부지연가산세", () => {
  it("PU-4-1: 미납 10,000,000 · 기한 2024-08-31 · 납부 2024-10-01 → 31일 × 0.022% = 68,200", () => {
    const r = calculateStockTransferTax(
      dom({
        unpaidTax: 10_000_000,
        paymentDeadline: new Date("2024-08-31"),
        actualPaymentDate: new Date("2024-10-01"),
      }),
    );
    expect(r.latePaymentPenalty).toBe(68_200);
  });

  it("PU-4-2: 기한 당일 납부 → 경과일 0 → 가산세 0", () => {
    const r = calculateStockTransferTax(
      dom({
        unpaidTax: 10_000_000,
        paymentDeadline: new Date("2024-08-31"),
        actualPaymentDate: new Date("2024-08-31"),
      }),
    );
    expect(r.latePaymentPenalty).toBe(0);
  });

  it("PU-4-3: 납부지연가산세도 결정세액에 들어간다", () => {
    const r = calculateStockTransferTax(
      dom({
        unpaidTax: 10_000_000,
        paymentDeadline: new Date("2024-08-31"),
        actualPaymentDate: new Date("2024-10-01"),
      }),
    );
    // 산출 19,500,000 + 신고불성실 7,800,000 + 납부지연 68,200
    expect(r.finalTax).toBe(27_368_200);
  });

  it("PU-4-4: 다종목에서도 납부지연은 신고 단위 1회", () => {
    const agg = calculateStockTransferTaxAggregate([
      dom({
        unpaidTax: 10_000_000,
        paymentDeadline: new Date("2024-08-31"),
        actualPaymentDate: new Date("2024-10-01"),
      }),
      fx(100_000_000),
    ]);
    expect(agg.totalLatePaymentPenalty).toBe(68_200);
  });
});
