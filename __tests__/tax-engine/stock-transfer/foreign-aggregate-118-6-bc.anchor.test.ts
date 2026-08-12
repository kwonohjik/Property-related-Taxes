/**
 * 국외주식 다종목 aggregate — §118의6①1호 B/C 안분 anchor
 *
 * 계획서: docs/02-design/features/foreign-stock-118-6-limit-bc-apportionment.plan.md (Phase 4 · §5 매트릭스)
 *
 * ## 이 파일이 고정하는 것
 *
 * 국외주식이 다종목 `items` 경로에 편입되면서 **처음으로 관측 가능해진** 동작들이다:
 *   · §102①2호 — 국내·국외주식 **양도차손 통산** (같은 호)
 *   · §103①2호·② — 기본공제 250만원 **공동 그룹**, 먼저 양도한 자산부터
 *   · §104①12호나목 — 국외 종목 **20% 단일세율** (국내 세율 분기를 타면 안 된다)
 *   · §118의6①1호 — 외국납부세액 공제한도 **A × B / C**
 *
 * ## 실측값 (2026-08-12)
 *
 * 종목 A(3월)·B(9월), 각 양도차익 50,000,000, A만 외국세 12,000,000:
 *
 * | | A | B | 계 |
 * |---|---:|---:|---:|
 * | 양도소득금액 (B항) | 50,000,000 | 50,000,000 | **C = 100,000,000** |
 * | 기본공제 (§103② 먼저 양도) | 2,500,000 | 0 | 2,500,000 |
 * | 과세표준 | 47,500,000 | 50,000,000 | 97,500,000 |
 * | 산출세액 (20%) | 9,500,000 | 10,000,000 | **A항 = 19,500,000** |
 * | **한도 A×B/C** | **9,750,000** | 9,750,000 | 19,500,000 |
 * | 공제 | 9,750,000 | 0 | 9,750,000 |
 *
 * ⇒ 결정세액 **9,750,000**. 종전(한도 = 산출세액 전액)이면 공제 12,000,000 → 7,500,000으로
 *   **2,250,000 과대공제**였다.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

/** 환율 1로 고정해 원화 환산 축을 제거한다 — 양도차익 = total − 1,000,000 */
function fx(gain: number, o: Partial<ForeignStockInput> = {}): ForeignStockInput {
  return {
    marketType: "foreign_stock",
    yearsResidentInKorea: 10,
    isListedForeignCorp: true,
    stockName: "Corp",
    countryCode: "US",
    shareCount: 1,
    transferDate: new Date("2025-03-01"),
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

/** 외국세를 낸 국외 종목 */
function withForeignTax(gain: number, tax: number, o: Partial<ForeignStockInput> = {}) {
  return fx(gain, {
    hasForeignTax: true,
    foreignTaxPaidForeign: tax,
    foreignTaxCurrencyCode: "USD",
    foreignTaxExchangeRate: 1,
    ...o,
  });
}

// ============================================================
// FA-1 — 2종목 동액 이익, 한 종목만 외국세
// ============================================================

describe("FA-1 국외 2종목 — 한도가 A×B/C로 갈린다 (한도 = 산출세액 전액이 아니다)", () => {
  const A = withForeignTax(50_000_000, 12_000_000, {
    stockName: "A",
    transferDate: new Date("2025-03-01"),
  });
  const B = fx(50_000_000, { stockName: "B", transferDate: new Date("2025-09-01") });
  const r = calculateStockTransferTaxAggregate([A, B], "aggregate");

  it("FA-1-0 [픽스처 가드] 두 종목 모두 국외주식으로 인식되고 20% 세율이다", () => {
    expect(r.items.map((x) => x.taxCategory)).toEqual(["foreign_stock", "foreign_stock"]);
    expect(r.items.map((x) => x.appliedRate)).toEqual([0.2, 0.2]);
    expect(r.items.map((x) => x.transferIncome)).toEqual([50_000_000, 50_000_000]);
  });

  it("FA-1-1 §103①2호·② — 기본공제 250만원은 **한 번만**, 먼저 양도한 3월 종목에", () => {
    expect(r.items.map((x) => x.basicDeduction)).toEqual([2_500_000, 0]);
    expect(r.basicDeductionByGroup.stock).toBe(2_500_000);
  });

  it("FA-1-2 산출세액 — A항 = 19,500,000", () => {
    expect(r.items.map((x) => x.calculatedTax)).toEqual([9_500_000, 10_000_000]);
    expect(r.totalCalculatedTax).toBe(19_500_000);
  });

  it("FA-1-3 🔑 한도 = 19,500,000 × 50,000,000 / 100,000,000 = 9,750,000", () => {
    expect(r.items[0].foreignDetail?.foreignTaxCreditLimit).toBe(9_750_000);
    // 종전 결함이면 한도가 산출세액 전액(9,500,000) 또는 A 전액(19,500,000)이었다.
    expect(r.items[0].foreignDetail?.foreignTaxCreditLimit).not.toBe(19_500_000);
  });

  it("FA-1-4 공제 = min(12,000,000, 9,750,000) = 9,750,000 · 결정세액 9,750,000", () => {
    expect(r.items[0].foreignDetail?.foreignTaxCreditApplied).toBe(9_750_000);
    expect(r.totalFinalTax).toBe(9_750_000);
    // 종전(한도 = 산출세액 전액)이면 12,000,000 전액 공제 → 7,500,000. 2,250,000 과대.
    expect(r.totalFinalTax).not.toBe(7_500_000);
  });

  it("FA-1-5 지방소득세는 **공제 후** 세액 기준 — floor10(9,750,000 × 10%)", () => {
    expect(r.totalLocalIncomeTax).toBe(975_000);
  });

  it("FA-1-6 외국세를 안 낸 종목은 한도·공제가 없다 (undefined)", () => {
    expect(r.items[1].foreignDetail?.foreignTaxCreditLimit).toBeUndefined();
    expect(r.items[1].foreignDetail?.foreignTaxCreditApplied).toBeUndefined();
  });

  it("FA-1-7 📌 한도가 자기 산출세액을 넘어 Σ종목 finalTax ≠ 총계 — **의도된 것**", () => {
    // 한도 9,750,000 > 그 종목 산출세액 9,500,000. §118의6①1호 본문이 「**해당 과세기간의**
    // 양도소득 산출세액에서 공제」라 공제 대상이 과세기간 전체이므로 자르지 않는다.
    // 전자신고세액공제가 이미 같은 구조다(종목별 값과 별개로 합산 1회).
    const itemSum = r.items.reduce((s, x) => s + x.finalTax, 0);
    expect(itemSum).toBe(10_000_000);
    expect(r.totalFinalTax).toBe(9_750_000);
    expect(itemSum - r.totalFinalTax).toBe(250_000);
  });
});

// ============================================================
// FA-2 — 국외 단건은 종전과 같아야 한다 (N-2 회귀)
// ============================================================

describe("FA-2 [회귀] 국외 단건은 B = C라 한도 = 산출세액 — 종전 값 그대로", () => {
  const only = withForeignTax(50_000_000, 12_000_000, { stockName: "A" });
  const r = calculateStockTransferTaxAggregate([only], "aggregate");

  it("FA-2-1 한도 = 산출세액 9,500,000", () => {
    expect(r.items[0].calculatedTax).toBe(9_500_000);
    expect(r.items[0].foreignDetail?.foreignTaxCreditLimit).toBe(9_500_000);
  });

  it("FA-2-2 공제 = 9,500,000 · 결정세액 0", () => {
    expect(r.items[0].foreignDetail?.foreignTaxCreditApplied).toBe(9_500_000);
    expect(r.totalFinalTax).toBe(0);
  });
});

// ============================================================
// FA-3 — §102①2호 통산: 국외 손실이 국외 이익과 통산된다
// ============================================================

describe("FA-3 §102①2호 — 국외 종목 간 양도차손 통산 후 B/C", () => {
  const win = withForeignTax(60_000_000, 20_000_000, {
    stockName: "WIN",
    transferDate: new Date("2025-03-01"),
  });
  // 손실 종목 — 취득가 1,000,000 · 양도가 600,000 ⇒ 차손 −400,000
  const lose: ForeignStockInput = {
    ...fx(0, { stockName: "LOSE", transferDate: new Date("2025-05-01") }),
    totalTransferPriceForeign: 600_000,
  };
  const r = calculateStockTransferTaxAggregate([win, lose], "aggregate");

  it("FA-3-1 통산 후 이익 종목의 양도소득금액이 차손만큼 줄어든다", () => {
    expect(r.items[0].transferIncome).toBe(59_600_000);
    expect(r.items[1].transferIncome).toBe(0);
  });

  it("FA-3-2 통산 후 값이 C가 된다 — 손실 종목 B = 0이라 한도 전액이 이익 종목에", () => {
    // C = 59,600,000 · A = (59,600,000 − 2,500,000) × 20% = 11,420,000
    expect(r.totalCalculatedTax).toBe(11_420_000);
    expect(r.items[0].foreignDetail?.foreignTaxCreditLimit).toBe(11_420_000);
  });

  it("FA-3-3 손실 종목은 한도가 없다", () => {
    expect(r.items[1].foreignDetail?.foreignTaxCreditLimit).toBeUndefined();
  });
});

// ============================================================
// FA-4 — 국내주식과 혼합: C에 국내주식이 들어가면 안 된다
// ============================================================

describe("FA-4 국내주식 혼합 — C는 **국외자산만**, 기본공제는 **공동 그룹**", () => {
  const foreignA = withForeignTax(50_000_000, 12_000_000, {
    stockName: "F",
    transferDate: new Date("2025-09-01"),
  });
  const domestic = {
    marketType: "unlisted" as const,
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
    transferDate: new Date("2025-03-01"),   // 국외보다 **먼저** → §103② 기본공제를 가져간다
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase" as const,
    transferPriceMode: "actual" as const,
    perShareTransferPrice: 500_000,
    acquisitionMode: "actual" as const,
    perShareAcquisitionPrice: 100_000,       // 소득 40,000,000
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual" as const,
    actualExpenses: 0,
    filingType: "preliminary" as const,
    filingDate: new Date("2025-05-31"),
    isElectronicFiling: false,
    filingViolation: "none" as const,
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
  };
  const r = calculateStockTransferTaxAggregate([domestic, foreignA], "aggregate");

  it("FA-4-1 §103①2호 공동 그룹 — 250만원이 **국내 종목**(먼저 양도)에 간다", () => {
    expect(r.basicDeductionByGroup.stock).toBe(2_500_000);
    expect(r.items[0].basicDeduction).toBe(2_500_000);
    expect(r.items[1].basicDeduction).toBe(0);
  });

  it("FA-4-2 🔑 C는 국외 종목만 — 국내 40,000,000이 섞이지 않는다", () => {
    // 국외 단독: B = C = 50,000,000 ⇒ 한도 = 국외 산출세액 전액 10,000,000
    expect(r.items[1].calculatedTax).toBe(10_000_000);
    expect(r.items[1].foreignDetail?.foreignTaxCreditLimit).toBe(10_000_000);
  });

  it("FA-4-3 국내 종목은 20% (§104①11호나목2) — 국외 분기에 삼켜지지 않았다", () => {
    expect(r.items[0].appliedRate).toBe(0.2);
    expect(r.items[0].taxBase).toBe(37_500_000);
    expect(r.items[0].calculatedTax).toBe(7_500_000);
    expect(r.items[0].foreignDetail).toBeUndefined();
  });
});
