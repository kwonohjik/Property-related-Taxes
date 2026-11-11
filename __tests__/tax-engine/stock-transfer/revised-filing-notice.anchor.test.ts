/**
 * 주식 «수정신고» 선택 시 «계산하지 않음» 고지 anchor (V-14 · Q-1 a · Q-2 항상)
 *
 * 계획서: docs/00-pm/stock-revised-filing-v14.plan.md
 * 수정신고를 골라도 엔진은 확정신고와 같은 결과를 낸다(수정신고의 추가납부세액·가산세 감면 §48②1호 미계산). 세액은 바꾸지 않고
 * 그 사실을 알린다 — 단건은 `warnings`, 합산은 `revisedFilingNotice` echo(신고 단위 1회, 종목 행 경고는 걷어낸다).
 */
import { describe, it, expect } from "vitest";
import {
  calculateStockTransferTax,
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { REVISED_FILING_NOT_COMPUTED_NOTICE } from "@/lib/tax-engine/data/revised-filing-notice";
import type { StockTransferInput, StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

function si(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi", isMajorShareholder: true, selfShareRatio: 0.03, selfMarketCap: 0,
    isLargestShareholderGroup: false, combinedShareRatio: 0, combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"), isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false, isHeavyRealEstateForValuation: false, isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false, isListedSmallShareholder: false, isVentureCompany: false, isKOTCTrading: false,
    acquisitionDate: new Date("2022-01-01"), transferDate: new Date("2024-06-01"), shareCount: 100,
    totalIssuedShares: 1_000_000, acquisitionCause: "purchase", transferPriceMode: "actual",
    perShareTransferPrice: 400_000, acquisitionMode: "actual", perShareAcquisitionPrice: 100_000,
    acquiredBeforeListing: false, tradingHaltAtTransfer: false, bookLost: false, expenseMode: "actual",
    actualExpenses: 0, filingType: "final", filingDate: new Date("2025-06-20"), isElectronicFiling: false,
    filingViolation: "none", isFraudulent: false, isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0, ...o,
  } as StockTransferInput;
}
const single = (o: Partial<StockTransferInput>) => calculateStockTransferTax(si(o)) as StockTransferResult;
const NOTICE = REVISED_FILING_NOT_COMPUTED_NOTICE;

describe("RV-1 단건 — 수정신고를 고르면 항상 고지, 세액은 불변", () => {
  it("RV-1-1 수정신고 → warnings 에 고지", () => {
    expect(single({ filingType: "revised" }).warnings ?? []).toContain(NOTICE);
  });
  it("RV-1-2 확정·예정신고 → 고지 없음(대조군)", () => {
    expect(single({ filingType: "final" }).warnings ?? []).not.toContain(NOTICE);
    expect(single({ filingType: "preliminary", filingDate: new Date("2024-08-31") }).warnings ?? []).not.toContain(NOTICE);
  });
  it("RV-1-3 세액 불변 — 같은 입력의 확정신고와 수정신고는 warnings 외 결과가 동일", () => {
    const f = single({ filingType: "final" });
    const r = single({ filingType: "revised" });
    expect({ ...r, warnings: [] }).toEqual({ ...f, warnings: [] });
  });
  it("RV-1-4 과소신고를 선언해도(Q-2 항상) 고지는 그대로 한 번만", () => {
    const r = single({ filingType: "revised", filingViolation: "under_report", originalFiledTax: 5_000_000 });
    expect((r.warnings ?? []).filter((w) => w === NOTICE)).toHaveLength(1);
    expect(r.finalTax).toBe(5_550_000); // 계산은 종전 그대로(§2 실측)
  });
});

const A = si({ filingType: "revised" });
const B = si({ filingType: "revised", perShareTransferPrice: 300_000, transferDate: new Date("2024-09-01") });

describe("RV-2 합산 — 신고 단위 1회 echo", () => {
  it("RV-2-1 수정신고 합산 → revisedFilingNotice echo · 종목 행 경고에는 남지 않는다", () => {
    const g = calculateStockTransferTaxAggregate([A, B], "aggregate");
    expect(g.revisedFilingNotice).toBe(NOTICE);
    for (const it of g.items) expect(it.warnings ?? []).not.toContain(NOTICE);
  });
  it("RV-2-2 건별(each_item)도 같다", () => {
    const g = calculateStockTransferTaxAggregate([A, B], "each_item");
    expect(g.revisedFilingNotice).toBe(NOTICE);
    for (const it of g.items) expect(it.warnings ?? []).not.toContain(NOTICE);
  });
  it("RV-2-3 확정신고 합산 → echo 없음(대조군)", () => {
    const g = calculateStockTransferTaxAggregate([si(), si({ transferDate: new Date("2024-09-01") })], "aggregate");
    expect(g.revisedFilingNotice).toBeUndefined();
  });
  it("RV-2-4 세액 불변 — 합산의 수정신고와 확정신고 합계가 같다", () => {
    const rev = calculateStockTransferTaxAggregate([A, B], "aggregate");
    const fin = calculateStockTransferTaxAggregate([si(), si({ perShareTransferPrice: 300_000, transferDate: new Date("2024-09-01") })], "aggregate");
    expect(rev.totalFinalTax).toBe(fin.totalFinalTax);
    expect(rev.totalCalculatedTax).toBe(fin.totalCalculatedTax);
  });
});

/** 국외주식 — 입력에 신고 유형 필드가 없다(국외주식은 예정신고 대상이 아니다) */
function fx(): ForeignStockInput {
  return {
    marketType: "foreign_stock", yearsResidentInKorea: 10, isListedForeignCorp: true, stockName: "Corp", countryCode: "US",
    shareCount: 1, transferDate: new Date("2024-03-01"), transferPriceMode: "total", totalTransferPriceForeign: 101_000_000,
    transferCurrencyCode: "USD", transferExchangeRate: 1, acquisitionDate: new Date("2021-01-02"), acquisitionMode: "actual",
    perShareAcquisitionPriceForeign: 1_000_000, acquisitionCurrencyCode: "USD", acquisitionExchangeRate: 1,
    capitalExpenditureForeign: 0, transferCostForeign: 0, hasForeignTax: false, foreignTaxMethod: "credit", isElectronicFiling: false,
  };
}

describe("RV-2b 합산 — 국내 수정신고 + 국외 혼합은 종목 순서와 무관하게 고지한다", () => {
  it("RV-2-5 국외가 마지막이어도 신고 유형이 비지 않는다", () => {
    const g = calculateStockTransferTaxAggregate([A, fx()] as (StockTransferInput | ForeignStockInput)[], "aggregate");
    expect(g.revisedFilingNotice).toBe(NOTICE);
  });
  it("RV-2-6 국외가 먼저여도 같다", () => {
    const g = calculateStockTransferTaxAggregate([fx(), A] as (StockTransferInput | ForeignStockInput)[], "aggregate");
    expect(g.revisedFilingNotice).toBe(NOTICE);
  });
  it("RV-2-7 국외만 있는 신고는 신고 유형이 없어 고지하지 않는다", () => {
    const g = calculateStockTransferTaxAggregate([fx()] as (StockTransferInput | ForeignStockInput)[], "aggregate");
    expect(g.revisedFilingNotice).toBeUndefined();
  });
});
