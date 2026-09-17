/**
 * 주식 양도차손 안내 문구 — **§102①2호(국내·국외 한 호)** anchor
 *
 * 계획서: `docs/00-pm/foreign-stock-loss-notice-102-1-2.plan.md`
 *
 * ## 왜 이 파일이 생겼나
 *
 * 제보 — 국외주식 결과의 「참고 사항」이 「동일 과세기간 **다른 해외주식** 양도차익과 통산 가능」이라
 * 적고 있었다. 법 §102①**2호**는 「제94조제1항제3호에 따른 소득」 **전체**(가·나목 국내 + 다목 국외)를
 * 한 호로 묶고, §102②은 그 호 안에서 「해당 자산 외의 **다른 자산**」의 양도소득금액에서
 * 차손을 **공제한다**(강행). ⇒ 「다른 해외주식」으로 좁힐 근거가 없다.
 *
 * ## 이 파일이 고정하는 두 축
 *
 * 1. **문구**(FN-1~FN-3·FN-6·FN-7) — 법 축을 좁히지 않는가.
 * 2. **동작**(FN-4·FN-5) — 국내 ↔ 국외 통산이 실제로 도는가.
 *    🔴 종전 anchor 는 FA-3(국외↔국외)·FA-4(혼합이지만 **둘 다 이익**)뿐이라
 *    **개정의 핵심인 국내↔국외 통산을 지키는 것이 하나도 없었다**.
 */

import { describe, it, expect } from "vitest";
import {
  calculateStockTransferTax,
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { STOCK_FOREIGN } from "@/lib/tax-engine/legal-codes/stock";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 국외 — 환율 1 고정(원화 환산 축 제거). 취득가 30,000,000 */
function foreign(totalTransferForeign: number, o: Partial<ForeignStockInput> = {}): ForeignStockInput {
  return {
    marketType: "foreign_stock",
    yearsResidentInKorea: 10,
    isListedForeignCorp: true,
    stockName: "Corp",
    countryCode: "US",
    shareCount: 1,
    transferDate: new Date("2025-03-01"),
    transferPriceMode: "total",
    totalTransferPriceForeign: totalTransferForeign,
    transferCurrencyCode: "USD",
    transferExchangeRate: 1,
    acquisitionDate: new Date("2021-01-02"),
    acquisitionMode: "actual",
    perShareAcquisitionPriceForeign: 30_000_000,
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

/** 국내 — 비상장 100주. 취득 1주당 100,000 */
function domestic(perShareTransferPrice: number, o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2024-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2021-01-01"),
    transferDate: new Date("2025-03-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 100_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2025-05-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}

const noticeOf = (warnings: string[]) => warnings.find((w) => w.startsWith("양도손실 발생"));

// ============================================================
// FN-1~FN-3 — 국외 단건 문구
// ============================================================

describe("FN 국외주식 차손 안내 — §102①2호를 좁히지 않는다", () => {
  const loss = calculateStockTransferTax(foreign(10_000_000)); // 차손 −20,000,000

  it("FN-1 🔴 「국내」를 포함하고 「다른 해외주식」으로 좁히지 않는다", () => {
    const n = noticeOf(loss.warnings);
    expect(n).toBeTruthy();
    expect(n).toContain("국내");
    expect(n).toContain("§94①3호");
    expect(n).not.toContain("다른 해외주식");
  });

  it("FN-2 🔴 §102②의 강행성을 살린다 — 「통산 가능」이 아니라 「공제」", () => {
    const n = noticeOf(loss.warnings)!;
    expect(n).toContain("§102②");
    expect(n).toContain("공제");
    expect(n).not.toContain("통산 가능");
  });

  it("FN-3 🔴 차익이면 안내가 없다 (부정형 anchor 의 양성 짝)", () => {
    const gain = calculateStockTransferTax(foreign(50_000_000)); // +20,000,000
    expect(noticeOf(gain.warnings)).toBeUndefined();
  });

  it("FN-3b 🔴 차손 시 §102①2호 근거가 배지로 나간다", () => {
    expect(loss.appliedRules).toContain(STOCK_FOREIGN.SECTION_102_1_2_INCOME_GROUP);
  });
});

// ============================================================
// FN-4·FN-5 — 국내 ↔ 국외 통산 (개정의 핵심 · 종전 anchor 부재)
// ============================================================

describe("FN 국내 ↔ 국외 §102② 통산", () => {
  it("FN-4 🔴 국외 차손이 국내 양도소득금액에서 공제된다", () => {
    // 국내 +40,000,000 · 국외 −20,000,000
    const r = calculateStockTransferTaxAggregate(
      [domestic(500_000), foreign(10_000_000, { transferDate: new Date("2025-05-01") })],
      "aggregate",
    );
    expect(r.items[0].transferIncome).toBe(20_000_000);
    expect(r.items[1].transferIncome).toBe(0);
    expect(r.items[0].lossOffsetFromSameGroup).toBe(20_000_000);
    expect(r.totalCalculatedTax).toBe(3_500_000);
  });

  it("FN-5 🔴 국내 차손이 국외 양도소득금액에서 공제된다 (역방향)", () => {
    // 국내 −5,000,000 · 국외 +20,000,000
    const r = calculateStockTransferTaxAggregate(
      [domestic(50_000), foreign(50_000_000, { transferDate: new Date("2025-05-01") })],
      "aggregate",
    );
    expect(r.items[0].transferIncome).toBe(0);
    expect(r.items[1].transferIncome).toBe(15_000_000);
    expect(r.totalCalculatedTax).toBe(2_500_000);
  });
});

// ============================================================
// FN-6·FN-7 — 국내 단건도 같은 안내 (대칭) · 호가 다르면 붙지 않는다
// ============================================================

describe("FN 국내주식 차손 안내", () => {
  it("FN-6 🔴 국내주식 차손에도 같은 문구가 나온다", () => {
    const r = calculateStockTransferTax(domestic(50_000)); // −5,000,000
    const n = noticeOf(r.warnings);
    expect(n).toBeTruthy();
    expect(n).toContain("§94①3호");
    expect(n).toContain("§102②");
    // ⚠️ 국내 `appliedRules`는 **마커 union**이라 조문 문자열이 못 들어간다(엔진 규약) —
    //    국외처럼 배지를 요구하면 타입이 막는다. 근거는 문장 안에 있다.
  });

  it("FN-7 🔴 기타자산(§102①1호)에는 주식 문구를 붙이지 않는다", () => {
    const r = calculateStockTransferTax(
      domestic(50_000, { marketType: "other_asset", isQualifyingBlockShareholder: true }),
    );
    expect(r.basicDeductionGroup).toBe("real_estate_and_other_asset");
    expect(noticeOf(r.warnings)).toBeUndefined();
  });
});
