/**
 * 케이스 12·18·20·22~24 anchor 테스트
 *
 * 케이스 12: §94② 우선순위 — §94①3 + §94①4 동시 충족 → 기타자산 §55 누진 + 기본공제 1호
 * 케이스 18: 거래정지·관리종목 → 비상장 보충 평가 우회 (appliedRules 확인)
 * 케이스 20: 대주주 임계 시기별 8건 (2017·2018.4.1.·2020.4.1.·2024.1.1. × 코스피·코스닥)
 * 케이스 22: 상속 단기 30% 기산점 — 피상속인 취득일 §104②1
 * 케이스 23: 증여 단기 30% 기산점 — 수증일 (§97의2 미적용)
 * 케이스 24: 합병·분할 단기 30% 기산점 — 종전 주식 취득일 §104②3
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// ============================================================
// 공용 기본 입력 팩토리
// ============================================================

function baseInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: 0.03,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    priorYearEndDate: new Date("2023-12-31"),

    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,

    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,

    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 10_000_000,

    acquisitionCause: "purchase",

    transferPriceMode: "actual",
    perShareTransferPrice: 50_000,

    acquisitionMode: "actual",
    perShareAcquisitionPrice: 30_000,
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

    ...overrides,
  };
}

// ============================================================
// 케이스 12: §94② 우선순위
// ============================================================

describe("케이스 12 — §94② 우선순위 (§94①3 + §94①4 동시)", () => {
  it("C12-1: 비상장 + 과점주주(다목) 동시 충족 → §55 누진 + 기타자산", () => {
    // 비상장이면서 동시에 과점주주 요건 충족 → §94② → 기타자산(4호) 우선
    const input = baseInput({
      marketType: "unlisted",
      isQualifyingBlockShareholder: true,  // 다목
      isHeavyRealEstateForRate: false,
      perShareTransferPrice: 100_000,
      perShareAcquisitionPrice: 20_000,
      shareCount: 1_000,
      // 양도가 = 100M, 취득가 = 20M, transferIncome = 80M
      // 기본공제 1호 그룹(§94② 발동) — 부동산 이미 사용분 없으면 250만
      // taxBase = 77,500,000
      // §55 누진 3구간: 88M 이하 24% - 5,760,000 = floor(77,500,000 × 0.24) - 5,760,000
      //   = 18,600,000 - 5,760,000 = 12,840,000
    });
    const result = calculateStockTransferTax(input);

    expect(result.section94_2Applied).toBe(true);
    expect(result.taxCategory).toBe("other_asset_block_shareholder");
    expect(result.appliedSection94).toBe("①4다");
    expect(result.basicDeductionGroup).toBe("real_estate_and_other_asset");
    expect(result.appliedRules).toContain("§94②우선");
    expect(result.appliedRules).toContain("기타자산우선§55누진");
    expect(result.appliedRules).toContain("기본공제부동산그룹합산");

    // 세율 확인: §55 누진세율 (8단계)
    expect(result.transferIncome).toBe(80_000_000);
    expect(result.taxBase).toBe(77_500_000);
    // 77,500,000 × 24% = 18,600,000 - 5,760,000 = 12,840,000
    expect(result.calculatedTax).toBe(12_840_000);
  });

  it("C12-2: 상장 + 부동산과다보유(라목) → §55 누진 강제", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: true,
      selfShareRatio: 0.03,
      isHeavyRealEstateForRate: true,  // 라목
      isQualifyingBlockShareholder: false,
      perShareTransferPrice: 100_000,
      perShareAcquisitionPrice: 20_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);

    expect(result.section94_2Applied).toBe(true);
    expect(result.taxCategory).toBe("other_asset_heavy_re");
    expect(result.appliedSection94).toBe("①4라");
  });

  it("C12-3: §94② 발동 시 부동산 그룹 기본공제 잔여 반영", () => {
    // 같은 해 부동산 양도로 기본공제 이미 사용 → 잔여 0원
    const input = baseInput({
      marketType: "unlisted",
      isQualifyingBlockShareholder: true,
      realEstateGroupBasicDeductionUsed: 2_500_000,  // 이미 250만 사용
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    // 기본공제 잔여 0원 → taxBase = transferIncome
    expect(result.basicDeduction).toBe(0);
    expect(result.taxBase).toBe(result.transferIncome);
  });
});

// ============================================================
// 케이스 18: 거래정지·관리종목 → 비상장 보충 평가 우회
// ============================================================

describe("케이스 18 — 거래정지·관리종목 비상장 보충 평가 우회", () => {
  it("C18-1: tradingHaltAtTransfer=true → appliedRules에 '거래정지우회'", () => {
    const input = baseInput({
      marketType: "kosdaq",
      isMajorShareholder: true,
      selfShareRatio: 0.03,
      acquisitionMode: "estimated",
      tradingHaltAtTransfer: true,
      acquiredBeforeListing: false,
    });
    const result = calculateStockTransferTax(input);
    expect(result.appliedRules).toContain("거래정지우회");
  });
});

// ============================================================
// 케이스 20: 대주주 임계 시기별 8건
// ============================================================

describe("케이스 20 — 대주주 임계 시기별 (코스피·코스닥 × 4 시기)", () => {
  /**
   * 코스피 임계 이력:
   * 2024.1.1.~ : 1%·50억
   * 2020.4.1.~ : 1%·10억
   * 2018.4.1.~ : 1%·15억
   * 2017.~     : 1%·25억
   */

  it("C20-1: 코스피 2024년 기준 — 시총 50억 미만(49억) → 비대주주", () => {
    const input = baseInput({
      marketType: "kospi",
      selfShareRatio: 0.005,            // 0.5% (1% 미만)
      selfMarketCap: 4_900_000_000,    // 49억 (50억 미만)
      priorYearEndDate: new Date("2024-12-31"),
      isKOTCTrading: false,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(true);
    expect(result.finalTax).toBe(0);
  });

  it("C20-2: 코스피 2020년 기준 — 시총 12억 → 대주주 (임계 10억)", () => {
    const input = baseInput({
      marketType: "kospi",
      selfShareRatio: 0.005,
      selfMarketCap: 1_200_000_000,    // 12억 (2020 임계 10억 초과)
      priorYearEndDate: new Date("2020-12-31"),  // 2020.4.1.~ 임계 적용
      isSmallMediumEnterprise: true,
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(false);
    expect(result.taxCategory).toBe("listed_major");
  });

  it("C20-3: 코스피 2018년 기준 — 시총 10억 → 비대주주 (임계 15억 미만)", () => {
    const input = baseInput({
      marketType: "kospi",
      selfShareRatio: 0.005,
      selfMarketCap: 1_000_000_000,    // 10억 (2018 임계 15억 미만)
      priorYearEndDate: new Date("2018-12-31"),  // 2018.4.1.~ 임계
      isKOTCTrading: false,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(true);
  });

  it("C20-4: 코스피 2017년 기준 — 시총 20억 → 비대주주 (임계 25억 미만)", () => {
    const input = baseInput({
      marketType: "kospi",
      selfShareRatio: 0.005,
      selfMarketCap: 2_000_000_000,   // 20억 (2017 임계 25억 미만)
      priorYearEndDate: new Date("2017-06-30"),  // 2017년 기준
      isKOTCTrading: false,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(true);
  });

  it("C20-5: 코스닥 2024년 기준 — 지분 2% 정확히 충족 → 대주주", () => {
    const input = baseInput({
      marketType: "kosdaq",
      selfShareRatio: 0.02,            // 정확히 2% (코스닥 임계)
      selfMarketCap: 0,
      priorYearEndDate: new Date("2024-12-31"),
      isSmallMediumEnterprise: true,
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(false);
    expect(result.taxCategory).toBe("listed_major");
  });

  it("C20-6: 코스닥 2020년 기준 — 시총 10억 → 대주주 (임계 10억 정확)", () => {
    const input = baseInput({
      marketType: "kosdaq",
      selfShareRatio: 0.01,
      selfMarketCap: 1_000_000_000,   // 정확히 10억 (2020 임계)
      priorYearEndDate: new Date("2020-12-31"),
      isSmallMediumEnterprise: true,
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(false);
    expect(result.taxCategory).toBe("listed_major");
  });

  it("C20-7: 코스닥 2018년 기준 — 시총 15억 → 대주주", () => {
    const input = baseInput({
      marketType: "kosdaq",
      selfShareRatio: 0.01,
      selfMarketCap: 1_500_000_000,   // 15억 (2018 임계)
      priorYearEndDate: new Date("2018-12-31"),
      isSmallMediumEnterprise: true,
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.taxCategory).toBe("listed_major");
  });

  it("C20-8: 코스닥 2017년 기준 — 시총 15억 → 비대주주 (임계 20억 미만)", () => {
    const input = baseInput({
      marketType: "kosdaq",
      selfShareRatio: 0.01,
      selfMarketCap: 1_500_000_000,   // 15억 (2017 임계 20억 미만)
      priorYearEndDate: new Date("2017-06-30"),
      isKOTCTrading: false,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(true);
  });
});

// ============================================================
// 케이스 22: 상속 단기 30% 기산점 (피상속인 취득일 §104②1)
// ============================================================

describe("케이스 22 — 상속 단기 30% 기산점", () => {
  it("C22-1: 피상속인 2023-07-01 취득, 수증자 2024-01-01 상속 취득, 2024-06-01 양도 → 단기 11개월", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: true,
      selfShareRatio: 0.03,
      isSmallMediumEnterprise: false,
      // 본인 취득일(상속일): 2024-01-01
      acquisitionDate: new Date("2024-01-01"),
      // 피상속인 취득일: 2023-07-01 (기산점)
      decedentAcquisitionDate: new Date("2023-07-01"),
      acquisitionCause: "inheritance",
      transferDate: new Date("2024-06-01"),
      // 피상속인 기산점 2023-07-01 → 양도일 2024-06-01 = 11개월 → 단기
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isShortTermHolding).toBe(true);
    expect(result.holdingPeriodMonths).toBeLessThan(12);
    expect(result.appliedRules).toContain("단기30%");
    expect(result.appliedRate).toBe(0.30);
  });

  it("C22-2: 피상속인 2022-01-01 취득 → 2년 이상 → 단기 미적용 누진", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: true,
      selfShareRatio: 0.03,
      isSmallMediumEnterprise: false,
      acquisitionDate: new Date("2024-01-01"),
      decedentAcquisitionDate: new Date("2022-01-01"),  // 2년 이상
      acquisitionCause: "inheritance",
      transferDate: new Date("2024-06-01"),
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isShortTermHolding).toBe(false);
    expect(result.appliedRate).toBe(0.20);  // 누진 3억 이하
  });
});

// ============================================================
// 케이스 23: 증여 단기 30% 기산점 (수증일 기산 — §97의2 미적용)
// ============================================================

describe("케이스 23 — 증여 단기 30% 기산점 (수증일 기산)", () => {
  it("C23-1: 수증일 2024-01-01, 양도일 2024-10-01 → 9개월 단기", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: true,
      selfShareRatio: 0.03,
      isSmallMediumEnterprise: false,
      // 주식은 §97의2 미적용 → 수증일(acquisitionDate) 기산
      acquisitionDate: new Date("2024-01-01"),
      acquisitionCause: "gift",
      transferDate: new Date("2024-10-01"),
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isShortTermHolding).toBe(true);
    expect(result.holdingPeriodDays).toBeLessThan(365);
    expect(result.appliedRate).toBe(0.30);
  });

  it("C23-2: donorAcquisitionDate 있어도 수증일 기산 (주식 §97의2 미적용)", () => {
    // §97의2는 토지·건물·시설물이용권 한정 → 주식은 수증일 기산이 원칙
    // donorAcquisitionDate는 입력 받지만 주식에서는 일반 증여 수증일로 기산
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: true,
      selfShareRatio: 0.03,
      isSmallMediumEnterprise: false,
      acquisitionDate: new Date("2024-01-01"),   // 수증일 = 기산점
      donorAcquisitionDate: new Date("2010-01-01"),  // 증여자 취득일 (주식은 무시됨)
      acquisitionCause: "gift",
      transferDate: new Date("2024-10-01"),
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    // donorAcquisitionDate를 기산점으로 쓰면 14년 이상 → 단기 미적용
    // 하지만 주식은 수증일(acquisitionDate) 기산 → 9개월 → 단기
    // ※ 현재 엔진: gift 케이스는 donorAcquisitionDate를 startDate로 사용하는데,
    //   설계 의도는 "일반 증여 = 수증일". donorAcquisitionDate는 §97의2 이월과세용.
    //   주식의 경우 §97의2 미적용이므로 acquisitionDate(수증일)를 써야 함.
    expect(result.holdingPeriodDays).toBeLessThan(365);
    // 주식 증여는 acquisitionDate를 수증일로 사용
    expect(result.isShortTermHolding).toBe(true);
  });
});

// ============================================================
// 케이스 24: 합병·분할 단기 30% 기산점 (종전 주식 취득일 §104②3)
// ============================================================

describe("케이스 24 — 합병·분할 단기 30% 기산점", () => {
  it("C24-1: 종전 주식 취득일 2023-07-01 → 합병 후 2024-06-01 양도 = 11개월 단기", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: true,
      selfShareRatio: 0.03,
      isSmallMediumEnterprise: false,
      // 합병으로 신주 취득: 합병기일
      acquisitionDate: new Date("2024-01-01"),
      // 종전 주식 취득일 (기산점)
      preMergerAcquisitionDate: new Date("2023-07-01"),
      acquisitionCause: "merger_split",
      transferDate: new Date("2024-06-01"),
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isShortTermHolding).toBe(true);
    expect(result.holdingPeriodDays).toBeLessThan(365);
    expect(result.appliedRate).toBe(0.30);
  });

  it("C24-2: 종전 주식 취득일 2022-01-01 → 2년 이상 → 단기 미적용", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: true,
      selfShareRatio: 0.03,
      isSmallMediumEnterprise: false,
      acquisitionDate: new Date("2024-01-01"),
      preMergerAcquisitionDate: new Date("2022-01-01"),  // 2년 이상
      acquisitionCause: "merger_split",
      transferDate: new Date("2024-06-01"),
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isShortTermHolding).toBe(false);
    expect(result.appliedRate).toBe(0.20);
  });
});
