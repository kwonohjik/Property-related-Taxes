/**
 * A-3 anchor — 신고서에 §163⑨ 환산취득가액 산식이 드러난다
 *
 * 결함: 「12. 환산 base (취득기준시가)」 한 줄이 **총액**을 보여줬다. 라벨이 「환산…」으로
 * 시작하는데 값은 환산의 base라, 사용자가 환산취득가액으로 오독했다. 정작 환산이 어떻게
 * 계산됐는지(양도가액 × 취득기준시가 ÷ 양도기준시가)는 화면 어디에도 없었다.
 *
 * ⚠️ 단위 함정 — 분자·분모는 **1주당**, `estimatedBase`는 **총액**이다. 섞으면 항등식이 깨진다:
 *      44,750,000 × 29,120,000 ÷ 8,659 ≠ 30,098,625   (총액을 분자로 쓴 경우)
 *      44,750,000 ×      5,824 ÷ 8,659  = 30,098,625   (1주당으로 통일)
 *
 * 안전망 실측(P-5): `resolveTransferStd`의 fallback 분기를 통째로 지워도 반응한 테스트 **0건**.
 *
 * 계획서: docs/00-pm/stock-transfer-stale-result-and-conversion-display.plan.md §2
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { buildRows } from "@/components/calc/stock-transfer/StockFilingFormTableHelpers";
import type { StockTransferInput, StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 사례 48 — 코스닥 취득 후 상장 환산 (교재 「주식-취득후 상장.pdf」) */
function case48(over: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    selfMarketCap: 6_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    priorYearEndDate: new Date("2022-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: true,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: new Date("2004-07-01"),
    transferDate: new Date("2023-02-26"),
    shareCount: 5_000,
    totalIssuedShares: 100_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 8_950,
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: 8_659,
    listingDate: new Date("2018-07-01"),
    listingDatePriceAvg1Month: 8_001,
    acquiredBeforeListing: true,
    tradingHaltAtTransfer: false,
    listingYearNetIncomePerShare: 61_570,
    listingYearNetAssetPerShare: 5_352,
    acquisitionYearNetIncomePerShare: 44_520,
    acquisitionYearNetAssetPerShare: 4_348,
    bookLost: false,
    expenseMode: "estimated",
    filingType: "preliminary",
    ...over,
  } as StockTransferInput;
}

function rowsOf(r: StockTransferResult) {
  return buildRows(r, [{ key: "total", label: "합계" }]);
}
function findRow(r: StockTransferResult, needle: string) {
  return rowsOf(r).find((row) => row.label.includes(needle));
}

describe("A-3 — 환산 산식이 신고서에 분자·분모로 드러난다", () => {
  it("A-3-1: 12-1(분자)·12-2(분모)가 1주당 값으로 채워진다", () => {
    const r = calculateStockTransferTax(case48());
    expect(findRow(r, "12-1")?.values.total).toBe(5_824);
    expect(findRow(r, "12-2")?.values.total).toBe(8_659);
  });

  it("A-3-2: 항등식 floor(① × 12-1 ÷ 12-2) = 11행 취득가액", () => {
    const r = calculateStockTransferTax(case48());
    const transferPrice = Number(findRow(r, "07. 양도가액")?.values.total);
    const numer = Number(findRow(r, "12-1")?.values.total);
    const denom = Number(findRow(r, "12-2")?.values.total);
    const acq = Number(findRow(r, "11. 취득가액")?.values.total);

    expect(Math.floor((transferPrice * numer) / denom)).toBe(acq);
    expect(acq).toBe(30_098_625);
  });

  it("A-3-3: 환산 모드에서 11행 라벨이 환산취득가액임을 밝힌다", () => {
    const r = calculateStockTransferTax(case48());
    expect(findRow(r, "11. 취득가액")?.label).toContain("환산취득가액");
  });

  it("A-3-4: 분모 자동 대체 시 그 사실을 라벨에 병기한다 (거짓 표시 방지)", () => {
    // 양도일 이전 1개월 종가평균 미입력 → 1주당 양도가액으로 자동 대체
    const r = calculateStockTransferTax(case48({ transferDatePriceAvg1Month: undefined }));
    const row = findRow(r, "12-2");
    expect(row?.label).toContain("대체");
    expect(row?.values.total).toBe(8_950); // 1주당 양도가액
  });

  it("A-3-5: 비과세 경로에서도 산식이 빈칸이 아니다", () => {
    // 상장 비대주주 장내 → 비과세. 정보용 취득가액 경로(exempt-informational-acquisition.ts)를 탄다.
    const r = calculateStockTransferTax(
      case48({ isMajorShareholder: false, selfShareRatio: 0, selfMarketCap: 0, isOnMarketTransaction: true }),
    );
    expect(r.isExempt).toBe(true);
    expect(findRow(r, "12-1")?.values.total).toBe(5_824);
    expect(findRow(r, "12-2")?.values.total).toBe(8_659);
  });

  it("A-3-6 (대조군): 실가 취득 모드에서는 환산 행이 비어 있다", () => {
    const r = calculateStockTransferTax(
      case48({ acquisitionMode: "actual", perShareAcquisitionPrice: 3_000, expenseMode: "actual", actualExpenses: 0 }),
    );
    expect(findRow(r, "12-1")?.values.total).toBeNull();
    expect(findRow(r, "12-2")?.values.total).toBeNull();
    expect(findRow(r, "11. 취득가액")?.label).not.toContain("환산취득가액");
  });
});
