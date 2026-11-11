/**
 * 전자신고 세액공제 적용 범위 anchor (V-21 · Q-2 a)
 *
 * 계획서: docs/00-pm/stock-prelim-credit-v19.plan.md
 * 조특령 §104의5① — 양도소득세는 소득세법 §105 **예정신고**만, 2021-02-17 이후 양도분부터(공포 제31444호 부칙 제2조②).
 * 전자신고를 켰는데 공제 대상이 아니면 고지를 싣는다(조용한 0 금지). 신고 단위는 편집기 종목의 신고 유형 + 가장 늦은 양도일.
 */
import { describe, it, expect } from "vitest";
import {
  calculateStockTransferTax,
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import {
  ELECTRONIC_FILING_CREDIT_NOT_APPLIED_NOTICE,
  isElectronicFilingCreditApplicable,
} from "@/lib/tax-engine/data/electronic-filing-credit-scope";
import type { StockTransferInput, StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function si(o: Partial<StockTransferInput> = {}): StockTransferInput {
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
    acquisitionDate: new Date("2018-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 400_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 100_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: true,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}
const single = (o: Partial<StockTransferInput>) =>
  calculateStockTransferTax(si(o)) as StockTransferResult;
const NOTICE = ELECTRONIC_FILING_CREDIT_NOT_APPLIED_NOTICE;

describe("EC-1 단건 — 예정신고 + 2021-02-17 이후만 공제", () => {
  it("EC-1-1 예정신고 · 2024 양도 → 20,000 공제 · 고지 없음(대조군)", () => {
    const r = single({});
    expect(r.electronicFilingCredit).toBe(20_000);
    expect(r.warnings ?? []).not.toContain(NOTICE);
  });
  it("EC-1-2 확정신고 → 공제 0 · 고지", () => {
    const r = single({ filingType: "final" });
    expect(r.electronicFilingCredit).toBe(0);
    expect(r.finalTax).toBe(r.calculatedTax);
    expect(r.warnings ?? []).toContain(NOTICE);
  });
  it("EC-1-3 수정신고 → 공제 0 · 고지", () => {
    const r = single({ filingType: "revised" });
    expect(r.electronicFilingCredit).toBe(0);
    expect(r.warnings ?? []).toContain(NOTICE);
  });
  it("EC-1-4 예정신고 · 2020-06-01 양도 → 공제 0 · 고지", () => {
    const r = single({ transferDate: new Date("2020-06-01"), priorYearEndDate: new Date("2019-12-31"), filingDate: new Date("2020-08-31") });
    expect(r.electronicFilingCredit).toBe(0);
    expect(r.warnings ?? []).toContain(NOTICE);
  });
  it("EC-1-5 경계 — 2021-02-16 양도는 0 · 2021-02-17 양도는 20,000", () => {
    const base = { priorYearEndDate: new Date("2020-12-31"), filingDate: new Date("2021-08-31") };
    expect(single({ ...base, transferDate: new Date("2021-02-16") }).electronicFilingCredit).toBe(0);
    expect(single({ ...base, transferDate: new Date("2021-02-17") }).electronicFilingCredit).toBe(20_000);
  });
  it("EC-1-6 전자신고를 켜지 않았으면 확정신고여도 고지가 없다", () => {
    const r = single({ filingType: "final", isElectronicFiling: false });
    expect(r.electronicFilingCredit).toBe(0);
    expect(r.warnings ?? []).not.toContain(NOTICE);
  });
  it("EC-1-7 판정 함수 — 양도일이 없으면 대상이 아니다", () => {
    expect(isElectronicFilingCreditApplicable("preliminary", undefined)).toBe(false);
    expect(isElectronicFilingCreditApplicable("preliminary", "2021-02-17")).toBe(true);
  });
});

const A = si();
const B = si({ perShareTransferPrice: 300_000, transferDate: new Date("2024-09-01") });

describe("EC-2 합산 — 신고 단위 1회, 같은 게이트", () => {
  it("EC-2-1 예정신고 합산 → 20,000 공제 · 고지 없음", () => {
    const g = calculateStockTransferTaxAggregate([A, B], "aggregate");
    expect(g.electronicFilingCredit).toBe(20_000);
    expect(g.totalFinalTax).toBe(g.totalCalculatedTax - 20_000);
    expect(g.electronicFilingCreditNotice).toBeUndefined();
  });
  it("EC-2-2 확정신고 합산 → 공제 0 · 결정세액 = 산출세액 합계 · 고지 echo 1회", () => {
    const g = calculateStockTransferTaxAggregate([si({ filingType: "final" }), si({ filingType: "final", perShareTransferPrice: 300_000, transferDate: new Date("2024-09-01") })], "aggregate");
    expect(g.electronicFilingCredit).toBe(0);
    expect(g.totalFinalTax).toBe(g.totalCalculatedTax);
    expect(g.electronicFilingCreditNotice).toBe(NOTICE);
    // 종목 행에는 같은 고지가 남지 않는다(신고 단위 1회)
    for (const it of g.items) expect(it.warnings ?? []).not.toContain(NOTICE);
  });
  it("EC-2-3 건별(each_item) 확정신고도 같다", () => {
    const g = calculateStockTransferTaxAggregate([si({ filingType: "final" }), si({ filingType: "final", transferDate: new Date("2024-09-01") })], "each_item");
    expect(g.electronicFilingCredit).toBe(0);
    expect(g.electronicFilingCreditNotice).toBe(NOTICE);
    for (const it of g.items) expect(it.warnings ?? []).not.toContain(NOTICE);
  });
  it("EC-2-4 신고 안에 2021-02-17 이후 양도분이 섞이면 가장 늦은 양도일로 판정해 공제한다", () => {
    const old = si({ transferDate: new Date("2020-12-01"), priorYearEndDate: new Date("2019-12-31") });
    const nw = si({ transferDate: new Date("2021-03-01"), priorYearEndDate: new Date("2020-12-31") });
    const g = calculateStockTransferTaxAggregate([old, nw], "aggregate");
    expect(g.electronicFilingCredit).toBe(20_000);
  });
  it("EC-2-5 전자신고를 켜지 않은 확정신고 합산 → 고지 echo 없음", () => {
    const g = calculateStockTransferTaxAggregate([si({ filingType: "final", isElectronicFiling: false }), si({ filingType: "final", isElectronicFiling: false, transferDate: new Date("2024-09-01") })], "aggregate");
    expect(g.electronicFilingCreditNotice).toBeUndefined();
  });
});
