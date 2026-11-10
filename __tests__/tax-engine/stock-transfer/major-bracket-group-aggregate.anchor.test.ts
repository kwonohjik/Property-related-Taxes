/**
 * 다종목 aggregate — 대주주 §104①11호 가목 2) **3억원 구간은 과세기간 합계에 1회** anchor
 *
 * 계획서: docs/00-pm/stock-major-shareholder-bracket-unit.plan.md (Q-1 a · Q-2 a · Q-3 a, 2026-11-11)
 *
 * ## 결함 (구현 전)
 *
 * `calculateStockTransferTaxAggregate` STEP 3가 종목마다 `applyStockTaxRate`를 불러 **3억 구간이 종목 수만큼
 * 반복**됐다. 같은 과세기간에 가목 2) 대주주 종목이 2건 이상이면 합계 산출세액이 과소했다.
 *
 * | 시료 | 구현 전 | 구현 후(법문) | 차 |
 * |---|---:|---:|---:|
 * | 대주주 2종목 (과세표준 397,500,000 + 400,000,000) | 169,375,000 | 184,375,000 | 15,000,000 |
 * | 대주주 3종목 (197,500,000 + 200,000,000 + 200,000,000) | 119,500,000 | 134,375,000 | 14,875,000 |
 *
 * ## 법령·서식 근거
 * 소득세법 §104① 본문(「해당 과세기간의 양도소득과세표준」) · §92②③ · §102①2호 · §103①2호 ·
 * 별지 제84호서식 작성방법 4번(세율이 같은 자산을 합산) · 국세청 재산세과-3820(2008.11.17.).
 *
 * ## 설계 (Q-2 a)
 * 종목 행(`items[]`)은 **종목 단독 산출**로 그대로 둔다(`Σ items.calculatedTax ≠ totalCalculatedTax`일 수
 * 있다 — 기타자산 §104⑤와 같은 규약). 합계에만 보정을 싣고 `majorProgressiveGroupTax` echo로 드러낸다.
 * 종목에 세액을 안분하지 않는다(역안분 재제안 금지).
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type {
  StockTransferInput,
  AcquisitionLot,
  TransferLot,
} from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

/** 비상장 대주주(비중소기업) 장기 — 종목당 양도소득 400,000,000 (주당 5,000,000 − 1,000,000 × 100주) */
function major(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
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
    transferDate: new Date("2025-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 5_000_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 1_000_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2025-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}

const D1 = new Date("2025-03-01");
const D2 = new Date("2025-06-01");
const D3 = new Date("2025-09-01");

describe("MB-1 대주주 2종목 — 3억 구간은 합계 과세표준에 1회", () => {
  const r = calculateStockTransferTaxAggregate(
    [major({ transferDate: D1 }), major({ transferDate: D2 })],
    "aggregate",
  );

  it("MB-1-1 합계 산출세액 184,375,000 = 797,500,000 × 25% − 15,000,000 (구현 전 169,375,000)", () => {
    expect(r.totalTaxBase).toBe(797_500_000);
    expect(r.totalCalculatedTax).toBe(184_375_000);
  });

  it("MB-1-2 종목 행은 단독 산출 그대로 — 안분하지 않는다 (Q-2 a)", () => {
    expect(r.items.map((x) => x.calculatedTax)).toEqual([84_375_000, 85_000_000]);
    expect(r.items.map((x) => x.taxBase)).toEqual([397_500_000, 400_000_000]);
  });

  it("MB-1-3 echo — 합산 과세표준·단순 합·합산 세액·보정액", () => {
    expect(r.majorProgressiveGroupTax).toEqual({
      itemCount: 2,
      aggregatedTaxBase: 797_500_000,
      itemSumTax: 169_375_000,
      aggregatedTax: 184_375_000,
      adjustment: 15_000_000,
    });
  });

  it("MB-1-4 결정세액·지방소득세·정산이 합계 산출세액에서 파생된다", () => {
    expect(r.totalFinalTax).toBe(184_375_000);
    expect(r.totalLocalIncomeTax).toBe(18_437_500);
  });
});

describe("MB-2 대주주 3종목 — 어느 종목도 3억 미만이어도 합계가 3억을 넘으면 보정", () => {
  const r = calculateStockTransferTaxAggregate(
    [
      major({ perShareTransferPrice: 3_000_000, transferDate: D1 }),
      major({ perShareTransferPrice: 3_000_000, transferDate: D2 }),
      major({ perShareTransferPrice: 3_000_000, transferDate: D3 }),
    ],
    "aggregate",
  );

  it("MB-2-1 합계 134,375,000 = 597,500,000 × 25% − 15,000,000 (구현 전 119,500,000)", () => {
    expect(r.totalTaxBase).toBe(597_500_000);
    expect(r.totalCalculatedTax).toBe(134_375_000);
    expect(r.items.map((x) => x.calculatedTax)).toEqual([39_500_000, 40_000_000, 40_000_000]);
    expect(r.majorProgressiveGroupTax?.adjustment).toBe(14_875_000);
    expect(r.majorProgressiveGroupTax?.itemCount).toBe(3);
  });
});

describe("MB-3 중소기업 대주주도 가목 2) — 같은 호", () => {
  it("MB-3-1 중소기업 대주주 2종목도 184,375,000", () => {
    const r = calculateStockTransferTaxAggregate(
      [
        major({ isSmallMediumEnterprise: true, transferDate: D1 }),
        major({ isSmallMediumEnterprise: true, transferDate: D2 }),
      ],
      "aggregate",
    );
    expect(r.totalCalculatedTax).toBe(184_375_000);
    expect(r.majorProgressiveGroupTax?.adjustment).toBe(15_000_000);
  });
});

describe("MB-3b 상장 대주주 + 비상장 대주주 — 같은 가목 2)이고 서식 세율구분 1-63 한 칸이다", () => {
  it("MB-3b-1 전제(분류) — 상장 대주주·비상장 대주주 / 합계 184,375,000", () => {
    const r = calculateStockTransferTaxAggregate(
      [
        major({ marketType: "kospi", selfMarketCap: 10_000_000_000, transferDate: D1 }),
        major({ transferDate: D2 }),
      ],
      "aggregate",
    );
    expect(r.items.map((x) => x.taxCategory)).toEqual(["listed_major", "unlisted_major"]);
    expect(r.totalCalculatedTax).toBe(184_375_000);
    expect(r.majorProgressiveGroupTax?.itemCount).toBe(2);
  });
});

describe("MB-4 보정이 없어야 하는 입력 — echo 자체가 없다", () => {
  it("MB-4-1 단건은 그대로 84,375,000", () => {
    const r = calculateStockTransferTaxAggregate([major({ transferDate: D1 })], "aggregate");
    expect(r.totalCalculatedTax).toBe(84_375_000);
    expect(r.majorProgressiveGroupTax).toBeUndefined();
  });

  it("MB-4-2 합계가 3억 이하인 2종목 — 20% 선형이라 합쳐도 같다(39,500,000)", () => {
    const r = calculateStockTransferTaxAggregate(
      [
        major({ perShareTransferPrice: 2_000_000, transferDate: D1 }),
        major({ perShareTransferPrice: 2_000_000, transferDate: D2 }),
      ],
      "aggregate",
    );
    expect(r.totalCalculatedTax).toBe(39_500_000);
    expect(r.majorProgressiveGroupTax).toBeUndefined();
  });

  it("MB-4-3 대주주 + 비대주주(나목 20%) — 다른 호라 합산 대상이 아니다(164,375,000)", () => {
    const r = calculateStockTransferTaxAggregate(
      [
        major({ transferDate: D1 }),
        major({ isMajorShareholder: false, selfShareRatio: 0, transferDate: D2 }),
      ],
      "aggregate",
    );
    expect(r.items.map((x) => x.calculatedTax)).toEqual([84_375_000, 80_000_000]);
    expect(r.totalCalculatedTax).toBe(164_375_000);
    expect(r.majorProgressiveGroupTax).toBeUndefined();
  });

  it("MB-4-4 대주주 장기 + 대주주 1년 미만 비중소(가목 1) 30% 단일) — 단기는 구간이 없다(114,375,000)", () => {
    const r = calculateStockTransferTaxAggregate(
      [
        major({ transferDate: D1 }),
        major({
          acquisitionDate: new Date("2025-01-05"),
          perShareTransferPrice: 2_000_000,
          transferDate: D2,
          filingDate: new Date("2025-10-31"),
        }),
      ],
      "aggregate",
    );
    expect(r.items.map((x) => x.appliedRate)).toEqual([0.25, 0.3]);
    expect(r.totalCalculatedTax).toBe(114_375_000);
    expect(r.majorProgressiveGroupTax).toBeUndefined();
  });
});

describe("MB-5 분할 로트 — 종목 안 단기분은 가목 1)이라 합산 대상은 장기분 과세표준뿐", () => {
  // 종목 X: 장기 lot a(1000주 @100,000) + 단기 lot b(500주 @100,000) → 1,500주 @800,000 양도.
  //   장기 이익 700,000,000 · 단기 이익 350,000,000.
  const lotA: AcquisitionLot = {
    id: "a",
    acquisitionDate: new Date("2022-01-10"),
    shareCount: 1000,
    perShareAcquisitionPrice: 100_000,
    acquisitionCause: "purchase",
  };
  const lotB: AcquisitionLot = {
    id: "b",
    acquisitionDate: new Date("2025-03-01"),
    shareCount: 500,
    perShareAcquisitionPrice: 100_000,
    acquisitionCause: "purchase",
  };
  const t1: TransferLot = {
    id: "t1",
    transferDate: new Date("2025-07-01"),
    shareCount: 1500,
    perShareTransferPrice: 800_000,
  };
  const splitX = major({
    transferDate: new Date("2025-07-01"),
    shareCount: 1500,
    perShareTransferPrice: 800_000,
    perShareAcquisitionPrice: 100_000,
    costAllocationMethod: "fifo",
    acquisitionLots: [lotA, lotB],
    transferLots: [t1],
    filingDate: new Date("2025-08-31"),
  });
  const r = calculateStockTransferTaxAggregate(
    [major({ transferDate: D1 }), splitX],
    "aggregate",
  );

  it("MB-5-1 합산 과세표준 = 대주주 단독 종목 과세표준 + X의 **장기분** 과세표준 (단기분 제외)", () => {
    const x = r.items[1];
    const shortBase = Math.floor((x.taxBase * 350_000_000) / 1_050_000_000);
    const longBase = x.taxBase - shortBase;
    expect(r.majorProgressiveGroupTax?.aggregatedTaxBase).toBe(r.items[0].taxBase + longBase);
  });

  it("MB-5-2 합계 = Σ 종목 단독 산출 + (합산 누진 − 종목별 누진 합)", () => {
    const x = r.items[1];
    const shortBase = Math.floor((x.taxBase * 350_000_000) / 1_050_000_000);
    const longBase = x.taxBase - shortBase;
    const f = (b: number) => (b <= 300_000_000 ? Math.floor(b * 0.2) : Math.floor(b * 0.25) - 15_000_000);
    const ten = (n: number) => Math.floor(n / 10) * 10;
    const adjustment = ten(f(r.items[0].taxBase + longBase)) - ten(f(r.items[0].taxBase)) - ten(f(longBase));
    expect(adjustment).toBeGreaterThan(0);
    expect(r.majorProgressiveGroupTax?.adjustment).toBe(adjustment);
    expect(r.totalCalculatedTax).toBe(
      ten(r.items.reduce((s, i) => s + i.calculatedTax, 0) + adjustment),
    );
  });
});

describe("MB-6 양도차손 통산(§102②) 후 과세표준을 합산한다", () => {
  it("MB-6-1 합계 = 통산 후 대주주 과세표준 합 × 25% − 15,000,000", () => {
    const r = calculateStockTransferTaxAggregate(
      [
        major({ transferDate: D1 }),
        major({ transferDate: D2 }),
        // 차손 종목: 100주 × (1,000,000 − 3,000,000) = −200,000,000
        major({ perShareTransferPrice: 1_000_000, perShareAcquisitionPrice: 3_000_000, transferDate: D3 }),
      ],
      "aggregate",
    );
    const gainBases = r.items.filter((i) => i.taxBase > 0).map((i) => i.taxBase);
    expect(gainBases.length).toBe(2);
    const sum = gainBases.reduce((s, b) => s + b, 0);
    expect(sum).toBeGreaterThan(300_000_000);
    expect(r.totalCalculatedTax).toBe(Math.floor(sum * 0.25) - 15_000_000);
    expect(r.majorProgressiveGroupTax?.aggregatedTaxBase).toBe(sum);
  });
});

describe("MB-7 외국납부세액공제 한도(§118의6①1호)는 대주주 합산 보정과 독립", () => {
  const fx = (gain: number, o: Partial<ForeignStockInput> = {}): ForeignStockInput => ({
    marketType: "foreign_stock",
    yearsResidentInKorea: 10,
    isListedForeignCorp: true,
    stockName: "F",
    countryCode: "US",
    shareCount: 1,
    transferDate: new Date("2025-02-01"),
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
    hasForeignTax: true,
    foreignTaxPaidForeign: 5_000_000,
    foreignTaxCurrencyCode: "USD",
    foreignTaxExchangeRate: 1,
    foreignTaxMethod: "credit",
    isElectronicFiling: false,
    ...o,
  });

  it("MB-7-1 같은 소득의 대주주 2종목 ↔ 비대주주 2종목: 국외 종목 한도가 같다(A는 국외 종목 자기 산출세액)", () => {
    const withMajors = calculateStockTransferTaxAggregate(
      [fx(50_000_000), major({ transferDate: D1 }), major({ transferDate: D2 })],
      "aggregate",
    );
    const withNonMajors = calculateStockTransferTaxAggregate(
      [
        fx(50_000_000),
        major({ isMajorShareholder: false, selfShareRatio: 0, transferDate: D1 }),
        major({ isMajorShareholder: false, selfShareRatio: 0, transferDate: D2 }),
      ],
      "aggregate",
    );
    const limitA = withMajors.items[0].foreignDetail?.foreignTaxCreditLimit;
    const limitB = withNonMajors.items[0].foreignDetail?.foreignTaxCreditLimit;
    expect(limitA).toBeDefined();
    expect(limitA).toBe(limitB);
    // 보정은 대주주 쪽에만 있다.
    expect(withMajors.majorProgressiveGroupTax?.adjustment).toBe(15_000_000);
    expect(withNonMajors.majorProgressiveGroupTax).toBeUndefined();
  });
});
