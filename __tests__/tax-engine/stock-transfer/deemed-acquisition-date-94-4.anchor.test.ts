/**
 * 의제취득일 — 주식(§94①3호) 1986.1.1. / 기타자산(§94①4호) 1985.1.1.
 *
 * 계획서 `docs/00-pm/stock-deemed-date-other-asset-and-conversion-citation.plan.md` §6 (Y-1)
 *
 * 영 §162⑥⑦ (현행 MST 290841):
 *   ⑥1호 「1984년 12월 31일 이전에 취득한 법 제94조제1항제2호 및 제4호의 자산」 → ⑦1호 1985년 1월 1일
 *   ⑥3호 「1985년 12월 31일 이전에 취득한 법 제94조제1항제3호의 자산」       → ⑦3호 1986년 1월 1일
 * 사전-2015-법령해석재산-0242: 「1985.1.1.(… 의제취득일) 전에 취득한 … 제94조 제1항 제4호 다목 …
 *   기타자산에 해당하는 비상장 주식」 — 4호 «주식»에도 1985.1.1.이다.
 *
 * 4호 여부는 `marketType`이 아니라 **분류 결과**다 — §94②(3호 + 라목·다목)도 4호다.
 *
 * 세액은 바뀌지 않는다(계획서 §4 probe) — 날짜는 보유기간에만 쓰이고 1985년 취득분은 어느 쪽이든
 * 1년 이상이다. Y1-7이 그 불변을 고정한다.
 *
 *   Y1-1   기타자산 1984-06-01 → 「의제취득일적용(기타자산)」
 *   Y1-1b  기타자산 1985-06-01 → 의제 아님 (4호 의제일 이후)
 *   Y1-1c  기타자산 경계 1984-12-31 / 1985-01-01
 *   Y1-1d  비상장 3호 1985-06-01 → 「의제취득일적용」(⑦3호) 그대로
 *   Y1-1e  비상장 + 라목(§94②) 1985-06-01 → 의제 아님
 *   Y1-5   매매사례 ±3개월 기준일 = 의제취득일 (영 §176의2④1호 「의제취득일 현재 제3항제1호」)
 *   Y1-7   세액 불변
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

const DEEMED_3 = "의제취득일적용";
const DEEMED_4 = "의제취득일적용(기타자산)";

/** 기타자산(라목) · 양도 2,000,000/주 × 100주 · 실가 취득 100,000/주 · 대주주 */
function base(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "other_asset",
    isMajorShareholder: true,
    selfShareRatio: 0.2,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0.2,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2024-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: true,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("1984-06-01"),
    transferDate: new Date("2025-12-01"),
    shareCount: 100,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 2_000_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 100_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2026-02-28"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}

const UNLISTED_3HO: Partial<StockTransferInput> = { marketType: "unlisted", isHeavyRealEstateForRate: false };
const UNLISTED_94_2: Partial<StockTransferInput> = { marketType: "unlisted", isHeavyRealEstateForRate: true };

describe("Y1-1: 기타자산 의제취득일 1985.1.1. (영 §162⑥1호·⑦1호)", () => {
  it("1984-06-01 → 의제(기타자산)", () => {
    const r = calculateStockTransferTax(base());
    expect(r.appliedRules).toContain(DEEMED_4);
    expect(r.appliedRules).not.toContain(DEEMED_3);
  });
  it("Y1-1b: 1985-06-01 → 의제 아님 (주식 기준 1986.1.1.이 아니다)", () => {
    const r = calculateStockTransferTax(base({ acquisitionDate: new Date("1985-06-01") }));
    expect(r.appliedRules).not.toContain(DEEMED_4);
    expect(r.appliedRules).not.toContain(DEEMED_3);
  });
  it("Y1-1c: 경계 — 1984-12-31은 의제 · 1985-01-01은 아님", () => {
    expect(calculateStockTransferTax(base({ acquisitionDate: new Date("1984-12-31") })).appliedRules).toContain(DEEMED_4);
    const onDay = calculateStockTransferTax(base({ acquisitionDate: new Date("1985-01-01") }));
    expect(onDay.appliedRules).not.toContain(DEEMED_4);
    expect(onDay.appliedRules).not.toContain(DEEMED_3);
  });
});

describe("Y1-1d: 주식(3호) 의제취득일 1986.1.1. (영 §162⑥3호·⑦3호) — 종전 그대로", () => {
  it("비상장 3호 1985-06-01 → 「의제취득일적용」", () => {
    const r = calculateStockTransferTax(base({ ...UNLISTED_3HO, acquisitionDate: new Date("1985-06-01") }));
    expect(r.appliedRules).toContain(DEEMED_3);
    expect(r.appliedRules).not.toContain(DEEMED_4);
  });
  it("비상장 3호 1986-01-01 → 의제 아님", () => {
    const r = calculateStockTransferTax(base({ ...UNLISTED_3HO, acquisitionDate: new Date("1986-01-01") }));
    expect(r.appliedRules).not.toContain(DEEMED_3);
  });
});

describe("Y1-1e: §94② — 비상장 + 라목은 4호 (분류 결과로 판정)", () => {
  it("1985-06-01 → 의제 아님", () => {
    const r = calculateStockTransferTax(base({ ...UNLISTED_94_2, acquisitionDate: new Date("1985-06-01") }));
    expect(r.taxCategory).toBe("other_asset_heavy_re");
    expect(r.appliedRules).not.toContain(DEEMED_3);
    expect(r.appliedRules).not.toContain(DEEMED_4);
  });
  it("1984-06-01 → 의제(기타자산)", () => {
    const r = calculateStockTransferTax(base({ ...UNLISTED_94_2, acquisitionDate: new Date("1984-06-01") }));
    expect(r.appliedRules).toContain(DEEMED_4);
  });
});

describe("Y1-5: 매매사례 ±3개월 기준일 = 의제취득일 (영 §176의2④1호)", () => {
  const SAMPLE: Partial<StockTransferInput> = {
    acquisitionMode: "sale_case",
    acquisitionMarketSamplePrice: 100_000,
    acquisitionMarketSampleDate: new Date("1986-02-01"),
  };
  it("3호 1985-06-01 취득 · 사례일 1986-02-01 → 1986-01-01과 31일 · 경고 없음", () => {
    const r = calculateStockTransferTax(base({ ...UNLISTED_3HO, ...SAMPLE, acquisitionDate: new Date("1985-06-01") }));
    expect(r.marketSampleDetail?.acquisitionDeltaDays).toBe(31);
    expect(r.marketSampleDetail?.acquisitionOverThreeMonths).toBe(false);
  });
  it("4호 1984-06-01 취득 · 사례일 1985-02-01 → 1985-01-01과 31일", () => {
    const r = calculateStockTransferTax(
      base({ ...SAMPLE, acquisitionMarketSampleDate: new Date("1985-02-01"), acquisitionDate: new Date("1984-06-01") }),
    );
    expect(r.marketSampleDetail?.acquisitionDeltaDays).toBe(31);
  });
  it("의제가 아니면 실제 취득일 기준 — 4호 1985-06-01 · 사례일 1985-07-01 → 30일", () => {
    const r = calculateStockTransferTax(
      base({ ...SAMPLE, acquisitionMarketSampleDate: new Date("1985-07-01"), acquisitionDate: new Date("1985-06-01") }),
    );
    expect(r.marketSampleDetail?.acquisitionDeltaDays).toBe(30);
  });
});

describe("Y1-7: 세액 불변 — 의제일 파생은 보유기간에만 닿는다", () => {
  const dates = ["1984-06-01", "1985-06-01", "1986-01-01"];
  it("기타자산: 세 날짜의 산출세액·양도차익 동일", () => {
    const rs = dates.map((d) => calculateStockTransferTax(base({ acquisitionDate: new Date(d) })));
    expect(new Set(rs.map((r) => r.calculatedTax)).size).toBe(1);
    expect(new Set(rs.map((r) => r.transferIncome)).size).toBe(1);
    expect(rs[0].calculatedTax).toBe(51_310_000);
  });
  it("주식(3호): 세 날짜의 산출세액 동일", () => {
    const rs = dates.map((d) => calculateStockTransferTax(base({ ...UNLISTED_3HO, acquisitionDate: new Date(d) })));
    expect(new Set(rs.map((r) => r.calculatedTax)).size).toBe(1);
    expect(rs[0].calculatedTax).toBe(37_500_000);
  });
});
