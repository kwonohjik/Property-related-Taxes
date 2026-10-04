/**
 * 의제취득일 전 매수 주식 — 영 §176의2④ 「① 의제취득일 현재 가액 vs ② 실가 + 생산자물가상승분」 중 많은 것 (Z-1)
 *
 * 계획서 `docs/00-pm/stock-pre-deemed-acquisition-176-2-4.plan.md` §6
 *
 * 근거: 영 §176의2④ · 법 §97②1호 나목 · 시행규칙 §85의2① · 재산46014-10094 ·
 *   대법원 2004두1520(비상장주식 — 실지거래가액으로 신고하는 경우에도 많은 것) · 서일46014-10386(기타자산 주식)
 *
 * 배율(재산46014-10094): (의제취득일 직전일이 속하는 달 PPI) ÷ (취득월 PPI). ECOS 404Y014 총지수(2020=100):
 *   1975-06 = 17.61 · 1980-06 = 39.17 · 1984-06 = 49.59 · 1984-12 = 50.29 · 1985-12 = 50.57 · 1965-01 = 4.88
 *   ② = floor(실가 총액 × PPI_직전달 ÷ PPI_취득월)  — 아래 기대값은 **독립 정수 계산**(Python)으로 손계산했다.
 *     1,000주 × 10,000원 = 10,000,000원 기준:
 *       1975-06 → 1985-12 : 10,000,000 × 5057 ÷ 1761 = 28,716,638
 *       1980-06 → 1985-12 : 10,000,000 × 5057 ÷ 3917 = 12,910,390
 *       1984-06 → 1984-12 : 10,000,000 × 5029 ÷ 4959 = 10,141,157   (기타자산 — 의제취득일 1985.1.1.)
 *       1965-01 → 1985-12 : 10,000,000 × 5057 ÷ 488  = 103,627,049
 *
 *   Z1-1   3호 비상장 1975-06 매수 · 실가 → ② 28,716,638 · 필요경비 실비 · 세액
 *   Z1-2   환산 ① > ② → ① 채택 · 개산공제
 *   Z1-3   환산 ① < ② → ② 채택 · 실비 (Z1-2의 짝)
 *   Z1-4   ① 환산 채택 + 실비가 더 큼 → §97②2호 단서 swap
 *   Z1-5   기타자산(4호) 1984-06 → 의제취득일 1985.1.1. → 직전 달 1984-12
 *   Z1-6   기타자산 1985-06 · 3호 1986-01-01 이후 → 의제 대상 아님 (회귀)
 *   Z1-7   동액 → ② (실가 방식)
 *   Z1-8   상장 + 매매사례 → ① 불가 → ②만
 *   Z1-9   1965.01 이전 취득 → 직접 입력 배율 (없으면 산정 안 함 + 경고)
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

const RULE = "의제취득일물가상승가산";

/** 비상장 3호 · 1,000주 · 양도 200,000/주 · 취득 10,000/주 실가 · 양도 2025-12-01 · 대주주 */
function base(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.2,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0.2,
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
    acquisitionDate: new Date("1975-06-01"),
    transferDate: new Date("2025-12-01"),
    shareCount: 1000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 200_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 10_000,
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

/** 상장(코스피) 환산 — ① = 양도가액 × 취득 종가평균 ÷ 양도 종가평균 = 200,000,000 × acqAvg ÷ 100,000 */
function listedEstimated(acqAvg: number, o: Partial<StockTransferInput> = {}): StockTransferInput {
  return base({
    marketType: "kospi",
    acquisitionDate: new Date("1980-06-01"),
    acquisitionMode: "estimated",
    expenseMode: "estimated",
    acquisitionStdMode: "monthly_avg",
    transferDatePriceAvg1Month: 100_000,
    acquisitionDatePriceAvg1Month: acqAvg,
    preDeemedActualPricePerShare: 10_000,
    ...o,
  } as Partial<StockTransferInput>);
}

describe("Z1-1: 3호 1975-06 매수 · 실가 — ② = 실가 × 생산자물가상승 (영 §176의2④2호)", () => {
  const r = calculateStockTransferTax(base());
  it("취득가액 = 28,716,638 (입력 실가 10,000,000이 아니다)", () => {
    expect(r.acquisitionPrice).toBe(28_716_638);
  });
  it("필요경비는 실비 — 개산공제 없음 (법 §97②1호 나목)", () => {
    expect(r.estimatedDeduction).toBeUndefined();
    expect(r.expenses).toBe(0);
  });
  it("양도차익 = 200,000,000 − 28,716,638 = 171,283,362 · 산출세액 33,756,670 (20%, 기본공제 250만원, 10원 미만 절사)", () => {
    // (171,283,362 − 2,500,000) × 20% = 33,756,672.4 → 엔진의 산출세액 10원 미만 절사(`floorTen`) → 33,756,670
    // 종전(실가 10,000,000 그대로)은 37,500,000 — 과대과세 3,743,330 (계획서 §4)
    expect(r.transferIncome).toBe(171_283_362);
    expect(r.calculatedTax).toBe(33_756_670);
  });
  it("결과 echo — 지수·배율·채택", () => {
    const d = r.preDeemedAcquisitionDetail!;
    expect(d).toMatchObject({
      deemedDate: "1986-01-01",
      acquisitionMonth: "1975-06",
      deemedPrevMonth: "1985-12",
      ppiAtAcquisition: 17.61,
      ppiAtDeemedPrev: 50.57,
      ratioSource: "table",
      actualBase: 10_000_000,
      clause2Amount: 28_716_638,
      selected: "clause2",
      expenseBasis: "actual",
    });
    expect(d.clause1Amount).toBeUndefined();
    expect(r.appliedRules).toContain(RULE);
  });
  it("실비(자본적지출·양도비)는 그대로 공제된다", () => {
    const r2 = calculateStockTransferTax(base({ actualExpenses: 500_000 }));
    expect(r2.expenses).toBe(500_000);
    expect(r2.transferIncome).toBe(200_000_000 - 28_716_638 - 500_000);
  });
});

describe("Z1-2·3: ① 환산 vs ② — 큰 쪽 (1980-06 매수 → ② = 12,910,390)", () => {
  it("Z1-2: ① 40,000,000 > ② → ① 채택 · 개산공제 = 취득 기준시가 20,000,000 × 1% = 200,000", () => {
    const r = calculateStockTransferTax(listedEstimated(20_000));
    expect(r.acquisitionPrice).toBe(40_000_000);
    expect(r.preDeemedAcquisitionDetail).toMatchObject({
      clause1Amount: 40_000_000,
      clause1Method: "estimated",
      clause2Amount: 12_910_390,
      selected: "clause1",
      expenseBasis: "estimated",
    });
    expect(r.estimatedDeduction).toBe(200_000);
    expect(r.expenses).toBe(200_000);
  });
  it("Z1-3: ① 10,000,000 < ② 12,910,390 → ② 채택 · 개산공제 없음 · 실비(0)", () => {
    const r = calculateStockTransferTax(listedEstimated(5_000));
    expect(r.acquisitionPrice).toBe(12_910_390);
    expect(r.preDeemedAcquisitionDetail).toMatchObject({
      clause1Amount: 10_000_000,
      clause2Amount: 12_910_390,
      selected: "clause2",
      expenseBasis: "actual",
    });
    expect(r.estimatedDeduction).toBeUndefined();
    expect(r.usedEstimatedAcquisition).toBe(false);
    expect(r.expenses).toBe(0);
  });
  it("Z1-3b: ② 채택 시 입력 실비가 공제된다 — 모드가 환산이어도 필요경비는 실비", () => {
    const r = calculateStockTransferTax(listedEstimated(5_000, { actualExpenses: 300_000 }));
    expect(r.preDeemedAcquisitionDetail?.selected).toBe("clause2");
    expect(r.expenses).toBe(300_000);
  });
  it("Z1-7: 동액이면 ② (실가 방식 필요경비) — ① = ② = 12,910,390", () => {
    // ① = 200,000,000 × acqAvg ÷ 100,000 = 12,910,390 → acqAvg = 6,455.195 (정수 불가) → 실가를 ① 값에 맞춰 ② = 40,000,000
    const r = calculateStockTransferTax(
      listedEstimated(20_000, { acquisitionDate: new Date("1985-12-01"), preDeemedActualPricePerShare: 40_000 }),
    );
    // 1985-12 매수 → 배율 1 → ② = 40,000 × 1,000 = 40,000,000 = ① (40,000,000)
    expect(r.preDeemedAcquisitionDetail).toMatchObject({ clause1Amount: 40_000_000, clause2Amount: 40_000_000, selected: "clause2" });
    expect(r.estimatedDeduction).toBeUndefined();
  });
});

describe("Z1-4: ① 환산이 채택돼도 §97②2호 단서 swap은 그대로 (실비가 환산+개산공제보다 크면)", () => {
  it("실비 60,000,000 > (40,000,000 + 200,000) → 단서 발동", () => {
    const r = calculateStockTransferTax(listedEstimated(20_000, { actualExpenses: 60_000_000 }));
    expect(r.preDeemedAcquisitionDetail?.selected).toBe("clause1");
    expect(r.swapApplied).toBe(true);
    expect(r.expenses).toBe(60_000_000);
  });
});

describe("Z1-5: 기타자산(4호) — 의제취득일 1985.1.1. → 직전 달 1984-12 (영 §162⑦1호)", () => {
  const OTHER: Partial<StockTransferInput> = { marketType: "other_asset", isHeavyRealEstateForRate: true };
  it("1984-06 매수 → ② = 10,000,000 × 5029 ÷ 4959 = 10,141,157", () => {
    const r = calculateStockTransferTax(base({ ...OTHER, acquisitionDate: new Date("1984-06-01") }));
    expect(r.acquisitionPrice).toBe(10_141_157);
    expect(r.preDeemedAcquisitionDetail).toMatchObject({
      deemedDate: "1985-01-01",
      acquisitionMonth: "1984-06",
      deemedPrevMonth: "1984-12",
      ppiAtAcquisition: 49.59,
      ppiAtDeemedPrev: 50.29,
    });
  });
});

describe("Z1-6: 의제 대상이 아니면 종전 그대로 (회귀)", () => {
  it("기타자산 1985-06 매수 — 4호 의제일(1985.1.1.) 이후", () => {
    const r = calculateStockTransferTax(
      base({ marketType: "other_asset", isHeavyRealEstateForRate: true, acquisitionDate: new Date("1985-06-01") }),
    );
    expect(r.acquisitionPrice).toBe(10_000_000);
    expect(r.preDeemedAcquisitionDetail).toBeUndefined();
    expect(r.appliedRules).not.toContain(RULE);
  });
  it("3호 1986-01-01 매수 — 의제일 당일은 «전»이 아니다", () => {
    const r = calculateStockTransferTax(base({ acquisitionDate: new Date("1986-01-01") }));
    expect(r.acquisitionPrice).toBe(10_000_000);
    expect(r.preDeemedAcquisitionDetail).toBeUndefined();
  });
  it("3호 1985-12-31 매수 — 의제일 전이지만 취득월 = 직전 달이라 배율 1 (② = 실가)", () => {
    const r = calculateStockTransferTax(base({ acquisitionDate: new Date("1985-12-31") }));
    expect(r.acquisitionPrice).toBe(10_000_000);
    expect(r.preDeemedAcquisitionDetail).toMatchObject({ clause2Amount: 10_000_000, selected: "clause2" });
  });
  it("상속·증여는 범위 밖 — 취득가액 그대로", () => {
    for (const cause of ["inheritance", "gift"] as const) {
      const r = calculateStockTransferTax(base({ acquisitionCause: cause, decedentAcquisitionDate: undefined }));
      expect(r.preDeemedAcquisitionDetail).toBeUndefined();
      expect(r.acquisitionPrice).toBe(10_000_000);
    }
  });
  it("실가를 입력하지 않은 환산·매매사례(실가 모름) → ①만 (종전 동작)", () => {
    const r = calculateStockTransferTax(listedEstimated(20_000, { preDeemedActualPricePerShare: undefined }));
    expect(r.preDeemedAcquisitionDetail).toBeUndefined();
    expect(r.acquisitionPrice).toBe(40_000_000);
  });
});

describe("Z1-8: 상장 + 매매사례 → ① 불가(영 §176의2③1호 괄호) — ②만", () => {
  it("매매사례 모드의 사례가는 ①로 보지 않는다 → ② = 12,910,390", () => {
    const r = calculateStockTransferTax(
      base({
        marketType: "kospi",
        acquisitionDate: new Date("1980-06-01"),
        acquisitionMode: "sale_case",
        expenseMode: "estimated",
        acquisitionMarketSamplePrice: 50_000,
        preDeemedActualPricePerShare: 10_000,
      }),
    );
    expect(r.preDeemedAcquisitionDetail?.clause1Amount).toBeUndefined();
    expect(r.preDeemedAcquisitionDetail?.selected).toBe("clause2");
    expect(r.acquisitionPrice).toBe(12_910_390);
  });
  it("비상장 매매사례 ① 60,000/주 × 1,000 = 60,000,000 > ② → ① 채택 · 개산공제(sale_case)", () => {
    const r = calculateStockTransferTax(
      base({
        acquisitionDate: new Date("1980-06-01"),
        acquisitionMode: "sale_case",
        expenseMode: "estimated",
        acquisitionMarketSamplePrice: 60_000,
        acquisitionMarketSampleDate: new Date("1980-07-01"),
        acquisitionYearNetIncomePerShare: 100_000,
        acquisitionYearNetAssetPerShare: 100_000,
        preDeemedActualPricePerShare: 10_000,
      }),
    );
    expect(r.preDeemedAcquisitionDetail).toMatchObject({ clause1Amount: 60_000_000, clause1Method: "sale_case", selected: "clause1" });
    expect(r.acquisitionPrice).toBe(60_000_000);
  });
});

describe("Z1-8c: 매매사례 모드의 legacy fallback(사례가 미입력 → 1주당 취득가액)은 ①이 아니다", () => {
  it("사례가를 입력하지 않으면 ①은 «없음» — ②만 (legacy 값은 ②와 같은 실가라 견줄 대상이 아니다)", () => {
    const r = calculateStockTransferTax(
      base({
        acquisitionMode: "sale_case",
        expenseMode: "estimated",
        perShareAcquisitionPrice: 10_000, // legacy fallback이 사례가로 읽히는 값
        preDeemedActualPricePerShare: 10_000,
      }),
    );
    expect(r.preDeemedAcquisitionDetail?.clause1Amount).toBeUndefined();
    expect(r.preDeemedAcquisitionDetail?.selected).toBe("clause2");
    expect(r.acquisitionPrice).toBe(28_716_638);
  });
});

describe("Z1-9: 1965.01 이전 취득 — PPI 계열 밖 (계획서 Q-4)", () => {
  const OLD = { acquisitionDate: new Date("1964-12-01") };
  it("직접 입력 배율 3.5 → ② = 10,000,000 × 3.5 = 35,000,000 · 출처 override", () => {
    const r = calculateStockTransferTax(base({ ...OLD, preDeemedPpiRatio: 3.5 }));
    expect(r.acquisitionPrice).toBe(35_000_000);
    expect(r.preDeemedAcquisitionDetail).toMatchObject({ ratioSource: "override", ratio: 3.5, clause2Amount: 35_000_000 });
  });
  it("표로 산정되는 구간(1975)에서는 직접 입력 배율을 읽지 않는다", () => {
    const r = calculateStockTransferTax(base({ preDeemedPpiRatio: 9 }));
    expect(r.preDeemedAcquisitionDetail?.ratioSource).toBe("table");
    expect(r.acquisitionPrice).toBe(28_716_638);
  });
  it("배율 미입력 → 자동 fallback 없이 산정하지 않고 경고 (⑧⑫가 먼저 막는 입력)", () => {
    const r = calculateStockTransferTax(base(OLD));
    expect(r.preDeemedAcquisitionDetail).toBeUndefined();
    expect(r.acquisitionPrice).toBe(10_000_000);
    expect(r.warnings.join("\n")).toContain("생산자물가지수 계열(1965.01~) 이전");
  });
  it("1965-01 취득(표의 첫 달) → ② = 10,000,000 × 5057 ÷ 488 = 103,627,049", () => {
    const r = calculateStockTransferTax(base({ acquisitionDate: new Date("1965-01-15") }));
    expect(r.acquisitionPrice).toBe(103_627_049);
  });
});
