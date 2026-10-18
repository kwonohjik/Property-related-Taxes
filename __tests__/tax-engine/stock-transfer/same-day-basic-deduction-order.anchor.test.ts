/**
 * anchor: 주식·기타자산 다종목 — **같은 날** 양도한 종목 사이의 §103② 기본공제 순서.
 * 계획서: docs/02-design/features/stock-basic-deduction-same-day-order.plan.md
 *
 * §103②은 「먼저 양도한 자산」까지만 정하고 같은 날은 비워 둔다. 재일46014-1685(부동산 질의)를 준용해
 * **신고 세액이 가장 낮은 순서**로 공제한다(부동산 #2220과 같은 기준). 세액이 같으면 입력 내용 기준 정준 순서의 첫 후보.
 * 종전에는 입력 순서였다 — 같은 사실관계인데 종목을 입력한 순서만 바꿔도 세액이 달랐다.
 */
import { describe, it, expect } from "vitest";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";
import { passingBlockShareholderGate } from "./_block-shareholder-fixture";

const DAY = new Date("2024-06-01");

/** 상장 대주주 — 소득 = (양도단가 − 10,000) × 10,000주. `short`면 1년 미만 보유(30%). */
function stock(income: number, o: { short?: boolean; date?: Date } = {}): StockTransferInput {
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
    acquisitionDate: o.short ? new Date("2023-12-01") : new Date("2022-01-01"),
    transferDate: o.date ?? DAY,
    shareCount: 10_000,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 10_000 + income / 10_000,
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
  } as StockTransferInput;
}

/**
 * 기타자산(§94①4호) — `nbl` ≥ 0.5면 §104①9호(+10%p). 소득 = 양도차익.
 * 1호 종목은 취득일을 2019년으로 둔다 — 정준 순서(입력 내용)에서 1호가 앞서게 해, 후보 평가가 없으면 1호가
 * 공제를 받아 **틀린 값**이 나오게 한다(기타자산 세율은 보유기간과 무관 — 둘 다 4년 넘게 보유).
 */
function otherAsset(gain: number, o: { nbl?: number; seed?: number } = {}): StockTransferInput {
  return {
    ...stock(0),
    marketType: "other_asset",
    isMajorShareholder: false,
    selfShareRatio: 0,
    ...passingBlockShareholderGate(DAY),
    acquisitionDate: o.nbl ? new Date("2020-01-01") : new Date("2019-01-01"),
    shareCount: 100,
    perShareAcquisitionPrice: 10_000,
    perShareTransferPrice: gain / 100 + 10_000,
    realEstateGroupBasicDeductionUsed: o.seed ?? 0,
    ...(o.nbl ? { nblRatioOfCorpAssets: o.nbl } : {}),
  } as StockTransferInput;
}

/** 국외주식 — 환율 1, 20% (중소기업 아님). */
function foreign(gain: number): ForeignStockInput {
  return {
    marketType: "foreign_stock",
    yearsResidentInKorea: 10,
    isListedForeignCorp: true,
    stockName: "Corp",
    countryCode: "US",
    shareCount: 1,
    transferDate: DAY,
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
  };
}

type Item = Parameters<typeof calculateStockTransferTaxAggregate>[0][number];
const run = (xs: Item[]) => calculateStockTransferTaxAggregate(xs, "aggregate");
/** 입력 위치와 무관하게 종목별 기본공제를 읽는다 — `items`는 입력 순서다. */
const basicOf = (xs: Item[], r: ReturnType<typeof run>, x: Item) => r.items[xs.indexOf(x)].basicDeduction;

describe("같은 날 양도 — 신고 세액이 가장 낮은 순서(재일46014-1685 준용)", () => {
  it("SD-1: 장기 20% + 단기 30% 같은 날 — 공제는 30% 종목으로, 두 입력 순서 같은 세액", () => {
    const L = stock(10_000_000);
    const S = stock(10_000_000, { short: true });
    for (const xs of [[L, S], [S, L]]) {
      const r = run(xs);
      // 단기에 250만: 7,500,000 × 30% + 10,000,000 × 20% = 4,250,000 (종전 [L, S] 입력은 4,500,000)
      expect(r.totalCalculatedTax).toBe(4_250_000);
      expect(basicOf(xs, r, S)).toBe(2_500_000);
      expect(basicOf(xs, r, L)).toBe(0);
    }
  });

  it("SD-2: 3억 경계 — 한계세율이 둘 다 25%여도 250만 전부가 25% 구간인 종목을 고른다", () => {
    const A = stock(1_000_000);
    const B = stock(301_000_000);
    const C = stock(302_500_000);
    for (const xs of [[A, B, C], [B, A, C], [C, B, A]]) {
      const r = run(xs);
      // C에 250만: 200,000 + (60,000,000 + 1,000,000 × 25%) + 60,000,000 = 120,450,000
      // (B에 주면 100만 × 25% + 150만 × 20%만 줄어 75,000 더 높다 — 「한계세율 먼저」로는 못 고른다)
      expect(r.totalCalculatedTax).toBe(120_450_000);
      expect(basicOf(xs, r, C)).toBe(2_500_000);
    }
  });

  it("SD-3: 기타자산 1호 3억 + 9호 3억 — 공제는 9호(+10%p) 종목으로", () => {
    const N1 = otherAsset(300_000_000);
    const N9 = otherAsset(300_000_000, { nbl: 0.6 });
    for (const xs of [[N1, N9], [N9, N1]]) {
      const r = run(xs);
      expect(r.totalCalculatedTax).toBe(216_920_000); // 종전 [N1, N9] 입력은 217,170,000
      expect(basicOf(xs, r, N9)).toBe(2_500_000);
    }
  });

  it("SD-4: 세액이 같으면 종목별 배분도 입력 순서와 무관하다 (§104⑤ 1호 MAX — 총세액 345,210,000)", () => {
    const N1 = otherAsset(900_000_000);
    const N9 = otherAsset(10_000_000, { nbl: 0.9 });
    const a = run([N1, N9]);
    const b = run([N9, N1]);
    expect(a.totalCalculatedTax).toBe(345_210_000);
    expect(b.totalCalculatedTax).toBe(345_210_000);
    expect(basicOf([N1, N9], a, N1)).toBe(basicOf([N9, N1], b, N1));
    expect(a.otherAssetComparativeTax?.clause2Tax).toBe(b.otherAssetComparativeTax?.clause2Tax);
  });

  it("SD-5: 국외주식 20% + 국내 단기 30% 같은 날 — 공제는 30% 종목으로", () => {
    const F = foreign(10_000_000);
    const S = stock(10_000_000, { short: true });
    for (const xs of [[F, S], [S, F]] as Item[][]) {
      const r = run(xs);
      expect(r.totalCalculatedTax).toBe(4_250_000);
      expect(basicOf(xs, r, S)).toBe(2_500_000);
    }
  });

  it("SD-6: 기타자산 기소진 100만 — 남은 150만을 9호 종목에", () => {
    // 각 500만 — §104⑤ 2호(호별)가 1호(합산 850만 × 6% = 510,000)보다 커서 배분이 세액을 바꾼다.
    // (소득이 크면 1호 합산 누진이 이겨 어느 쪽이 받아도 세액이 같다 — 그건 SD-4)
    const N1 = otherAsset(5_000_000, { seed: 1_000_000 });
    const N9 = otherAsset(5_000_000, { nbl: 0.6, seed: 1_000_000 });
    for (const xs of [[N1, N9], [N9, N1]]) {
      const r = run(xs);
      expect(basicOf(xs, r, N9)).toBe(1_500_000);
      expect(basicOf(xs, r, N1)).toBe(0);
      // 1호 5,000,000 × 6% 300,000 + 9호 3,500,000 × 16% 560,000 = 860,000 (반대면 210,000 + 800,000 = 1,010,000)
      expect(r.totalCalculatedTax).toBe(860_000);
    }
  });
});

describe("후보는 그룹의 **남은** 한도로 만든다", () => {
  it("SD-9: 기타자산 기소진 150만 → 남은 100만 < 두 종목 소득 합 120만 — 9호 60만 전부 + 1호 40만", () => {
    // 한도를 250만으로 잘못 보면 「합계가 한도 안 → 순서 무관」으로 판정해 입력 순서 그대로 둔다.
    const N1 = otherAsset(600_000, { seed: 1_500_000 });
    const N9 = otherAsset(600_000, { nbl: 0.6, seed: 1_500_000 });
    for (const xs of [[N1, N9], [N9, N1]]) {
      const r = run(xs);
      expect(basicOf(xs, r, N9)).toBe(600_000);
      expect(basicOf(xs, r, N1)).toBe(400_000);
      // 1호 200,000 × 6% = 12,000 (반대면 9호 200,000 × 16% = 32,000)
      expect(r.totalCalculatedTax).toBe(12_000);
    }
  });
});

describe("양도일 순서(§103② 본문)는 그대로", () => {
  it("SD-7: 먼저 양도한 20% 종목이 공제를 받는다 — 뒤에 양도한 30% 종목이 세액상 낫더라도", () => {
    const early = stock(10_000_000, { date: new Date("2024-02-01") });
    const late = stock(10_000_000, { short: true });
    for (const xs of [[early, late], [late, early]]) {
      const r = run(xs);
      expect(basicOf(xs, r, early)).toBe(2_500_000);
      expect(r.totalCalculatedTax).toBe(4_500_000);
    }
  });

  it("SD-8: 앞선 날이 100만을 쓰면 같은 날 묶음은 남은 150만을 30% 종목에", () => {
    const jan = stock(1_000_000, { date: new Date("2024-01-15") });
    const L = stock(5_000_000);
    const S = stock(5_000_000, { short: true });
    for (const xs of [[jan, L, S], [S, L, jan]]) {
      const r = run(xs);
      expect(basicOf(xs, r, jan)).toBe(1_000_000);
      expect(basicOf(xs, r, S)).toBe(1_500_000);
      expect(basicOf(xs, r, L)).toBe(0);
      // 0 + 5,000,000 × 20% + 3,500,000 × 30% = 2,050,000
      expect(r.totalCalculatedTax).toBe(2_050_000);
    }
  });
});
