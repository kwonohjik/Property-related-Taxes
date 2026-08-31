/**
 * PR-A 집계 엔진 결함 3건 anchor — 리뷰 2026-08-28 #1·#5·#16·#28
 *
 * 세 결함 모두 **다종목 합산 경로만** 틀리고 단건 경로는 정상이다.
 * 그래서 anchor 는 전부 「단건과 다종목이 같은 값을 내는가」를 축으로 잡는다.
 *
 *   AG-EX-1 (#1)    비과세 종목의 echo 산출세액이 합산 총계에 섞이지 않는다
 *   AG-EX-2 (#1)    단축 분기(each_item·단건 배열)에서도 같다
 *   AG-EX-3 (#1)    과세표준 총계에도 비과세 종목이 섞이지 않는다
 *   AG-SPLIT-1 (#5) lot 단기·장기 혼재 종목의 세액이 단건과 일치한다
 *   AG-SPLIT-2 (#5) 역방향 — lot 전량 장기인데 폼 전역 취득일이 단기
 *   AG-BD-1 (#16)   §103①1호 부동산그룹 기소진액이 다종목에서도 반영된다
 *   AG-BD-2 (#16)   basicDeductionByGroup 표시값도 같은 한도를 따른다
 *   SPLIT-ECHO-1 (#28) split 단일세율 경로의 appliedRate·누진공제 echo 가 실제 계산과 일치
 *   SPLIT-ECHO-2 (#28) 기타자산 split 도 §55 누진공제를 echo 한다
 *
 * 근거 조문: 소득세법 §92② · §94①3호 가목 1) 단서 · §103①1호·2호·② · §104①11호 가목 1)·2)
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";
import { calcSplitModeTax } from "@/lib/tax-engine/stock-transfer/lot-allocation-tax";
import { applyStockTaxRate } from "@/lib/tax-engine/stock-transfer/stock-transfer-rate-calc";
import type {
  StockTransferInput,
  AcquisitionLot,
  TransferLot,
} from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// ============================================================
// 픽스처
// ============================================================

function baseInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: false,
    selfShareRatio: 0,
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
    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1000,
    totalIssuedShares: 100_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 50_000,
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
    ...overrides,
  } as StockTransferInput;
}

/** 코스피 소액주주 장내 — §94①3호 가목 1) 단서 비과세. 차익 4,000만. */
const EXEMPT_ITEM = baseInput({ isOnMarketTransaction: true });

/** 코스피 대주주 장외 — 과세. 차익 1,000만. */
const TAXABLE_ITEM = baseInput({
  selfShareRatio: 0.02,
  selfMarketCap: 10_000_000_000,
  isOnMarketTransaction: false,
  perShareTransferPrice: 20_000,
  perShareAcquisitionPrice: 10_000,
});

// ============================================================
// #1 — 비과세 종목의 echo 가 총계에 섞인다
// ============================================================

describe("AG-EX (#1): 비과세 종목의 echo 산출세액이 합산 총계에 섞이지 않는다", () => {
  it("AG-EX-1: 비과세 이익 종목 + 과세 종목 → 총계는 과세 종목만 반영", () => {
    const exemptSingle = calculateStockTransferTax(EXEMPT_ITEM);
    // 전제 — 비과세 단건은 finalTax 0 이지만 taxBase·calculatedTax 는 echo 로 남는다.
    expect(exemptSingle.isExempt).toBe(true);
    expect(exemptSingle.finalTax).toBe(0);
    expect(exemptSingle.calculatedTax).toBeGreaterThan(0); // echo 보존 규약

    const taxableSingle = calculateStockTransferTax(TAXABLE_ITEM);
    const agg = calculateStockTransferTaxAggregate([EXEMPT_ITEM, TAXABLE_ITEM]);

    // 비과세 종목은 과세표준·산출세액 어느 단계에도 산입되지 않는다(§92②).
    expect(agg.totalCalculatedTax).toBe(taxableSingle.calculatedTax);
    expect(agg.totalFinalTax).toBe(taxableSingle.finalTax);
    expect(agg.totalLocalIncomeTax).toBe(taxableSingle.localIncomeTax);
  });

  it("AG-EX-2: 단축 분기(each_item)에서도 비과세 echo 가 섞이지 않는다", () => {
    const taxableSingle = calculateStockTransferTax(TAXABLE_ITEM);
    const agg = calculateStockTransferTaxAggregate(
      [EXEMPT_ITEM, TAXABLE_ITEM],
      "each_item",
    );
    expect(agg.totalCalculatedTax).toBe(taxableSingle.calculatedTax);
    expect(agg.totalFinalTax).toBe(taxableSingle.finalTax);
    expect(agg.totalLocalIncomeTax).toBe(taxableSingle.localIncomeTax);
  });

  it("AG-EX-2b: 비과세 종목 1건만 있는 배열(단축 분기) → 총계 전부 0", () => {
    const agg = calculateStockTransferTaxAggregate([EXEMPT_ITEM]);
    expect(agg.totalCalculatedTax).toBe(0);
    expect(agg.totalFinalTax).toBe(0);
    expect(agg.totalLocalIncomeTax).toBe(0);
    expect(agg.totalTaxBase).toBe(0);
  });

  it("AG-EX-3: totalTaxBase·totalTransferIncome 에도 비과세 종목이 섞이지 않는다", () => {
    const taxableSingle = calculateStockTransferTax(TAXABLE_ITEM);
    const agg = calculateStockTransferTaxAggregate([EXEMPT_ITEM, TAXABLE_ITEM]);
    expect(agg.totalTaxBase).toBe(taxableSingle.taxBase);
    expect(agg.totalTransferIncome).toBe(taxableSingle.transferIncome);
  });

  it("AG-EX-4: 종목별 결과의 echo 는 그대로 보존된다(표시 산식 규약 불변)", () => {
    const agg = calculateStockTransferTaxAggregate([EXEMPT_ITEM, TAXABLE_ITEM]);
    const exemptItem = agg.items[0];
    expect(exemptItem.isExempt).toBe(true);
    expect(exemptItem.finalTax).toBe(0);
    // 총계에서 빼는 것과 종목 echo 를 지우는 것은 다르다 — echo 는 남아야 한다.
    expect(exemptItem.calculatedTax).toBeGreaterThan(0);
    expect(exemptItem.taxBase).toBeGreaterThan(0);
  });
});

// ============================================================
// #5 — 다종목이 split(lot) 세율 분기를 버린다
// ============================================================

function lot(
  id: string,
  date: string,
  shareCount: number,
  perShare: number,
): AcquisitionLot {
  return {
    id,
    acquisitionDate: new Date(date),
    shareCount,
    perShareAcquisitionPrice: perShare,
    acquisitionCause: "purchase",
  };
}

function transferLot(shareCount: number, perShare: number): TransferLot {
  return {
    id: "t1",
    transferDate: new Date("2025-07-01"),
    shareCount,
    perShareTransferPrice: perShare,
  };
}

/** 비상장 대주주·비중소 — lot A 장기(2020) + lot B 단기(2025-03). FIFO 전량 매도. */
const SPLIT_MIXED = baseInput({
  marketType: "unlisted",
  selfShareRatio: 0.6,
  selfMarketCap: 5_000_000_000,
  isSmallMediumEnterprise: false,
  acquisitionDate: new Date("2020-01-01"),
  transferDate: new Date("2025-07-01"),
  filingDate: new Date("2025-08-31"),
  priorYearEndDate: new Date("2024-12-31"),
  shareCount: 2000,
  acquisitionLots: [
    lot("a", "2020-01-01", 1000, 100_000),
    lot("b", "2025-03-01", 1000, 100_000),
  ],
  transferLots: [transferLot(2000, 500_000)],
  costAllocationMethod: "fifo",
  perShareTransferPrice: 500_000,
});

/** 짝 — split 이 아닌 평범한 과세 종목(합산 상대). */
const PLAIN_TAXABLE = baseInput({
  marketType: "unlisted",
  selfShareRatio: 0.6,
  selfMarketCap: 5_000_000_000,
  transferDate: new Date("2025-08-01"),
  filingDate: new Date("2025-09-30"),
  priorYearEndDate: new Date("2024-12-31"),
  perShareTransferPrice: 20_000,
  perShareAcquisitionPrice: 10_000,
});

describe("AG-SPLIT (#5): 다종목 합산이 lot 단기·장기 세율 분기를 유지한다", () => {
  it("AG-SPLIT-1: 혼합 lot 종목을 단독 배열로 합산하면 단건과 세액이 같다", () => {
    const single = calculateStockTransferTax(SPLIT_MIXED);
    // 전제 — 이 픽스처가 실제로 split 혼합 경로를 탄다.
    expect(single.lotMatchingDetail).toBeDefined();
    expect(single.appliedRate).toBe(0); // 혼합 규약

    const agg = calculateStockTransferTaxAggregate([SPLIT_MIXED], "each_item");
    expect(agg.items[0].calculatedTax).toBe(single.calculatedTax);
  });

  it("AG-SPLIT-2: 다종목(aggregate)에서도 혼합 lot 세율이 유지된다", () => {
    const agg = calculateStockTransferTaxAggregate([SPLIT_MIXED, PLAIN_TAXABLE]);
    const splitItem = agg.items[0];

    // 기본공제가 어느 종목에 붙든, 세율 구조는 lot 축을 따라야 한다.
    // 단기·장기 그룹을 각각 계산한 값과 일치하는지 정본 헬퍼로 대조한다.
    const expected = calcSplitModeTax(
      splitItem.taxBase,
      splitItem.lotMatchingDetail!,
      splitItem.taxCategory,
      false,
    );
    expect(splitItem.calculatedTax).toBe(Math.floor(expected.calculatedTax / 10) * 10);
    // 혼합이면 appliedRate 는 0(UI "혼합" 라벨) — 단일세율로 접히면 안 된다.
    expect(splitItem.appliedRate).toBe(0);
  });

  it("AG-SPLIT-3: split 종목이 있어도 없는 종목은 정상 경로 그대로", () => {
    const plainSingle = calculateStockTransferTax(PLAIN_TAXABLE);
    const agg = calculateStockTransferTaxAggregate([PLAIN_TAXABLE], "each_item");
    expect(agg.items[0].calculatedTax).toBe(plainSingle.calculatedTax);
    expect(agg.items[0].appliedRate).toBe(plainSingle.appliedRate);
  });
});

// ============================================================
// #16 — 다종목 기본공제가 §103①1호 기소진액을 버린다
// ============================================================

/** 기타자산(§94①4 라목 부동산과다보유) — §103①1호 그룹. */
const OTHER_ASSET_ITEM = baseInput({
  marketType: "unlisted",
  isHeavyRealEstateForRate: true,
  selfShareRatio: 0.5,
  selfMarketCap: 10_000_000_000,
  perShareTransferPrice: 60_000,
  perShareAcquisitionPrice: 10_000,
  realEstateGroupBasicDeductionUsed: 2_500_000,
});

/** 주식 그룹 짝 — §103①2호. */
const STOCK_GROUP_ITEM = baseInput({
  marketType: "unlisted",
  selfShareRatio: 0.5,
  selfMarketCap: 10_000_000_000,
  realEstateGroupBasicDeductionUsed: 2_500_000,
});

describe("AG-BD (#16): 다종목 기본공제가 §103①1호 기소진액을 반영한다", () => {
  it("AG-BD-1: 기소진 250만이면 기타자산 종목의 기본공제는 0", () => {
    const single = calculateStockTransferTax(OTHER_ASSET_ITEM);
    // 전제 — 단건 경로는 이미 정상이다.
    expect(single.basicDeductionGroup).toBe("real_estate_and_other_asset");
    expect(single.basicDeduction).toBe(0);

    const agg = calculateStockTransferTaxAggregate([OTHER_ASSET_ITEM, STOCK_GROUP_ITEM]);
    expect(agg.items[0].basicDeduction).toBe(0);
  });

  it("AG-BD-2: basicDeductionByGroup 표시값도 같은 한도를 따른다", () => {
    const agg = calculateStockTransferTaxAggregate([OTHER_ASSET_ITEM, STOCK_GROUP_ITEM]);
    expect(agg.basicDeductionByGroup.real_estate_and_other_asset).toBe(0);
    // 주식 그룹(§103①2호)은 별개 한도라 영향 없다.
    expect(agg.basicDeductionByGroup.stock).toBe(2_500_000);
  });

  it("AG-BD-3: 기소진 선언이 세액을 실제로 움직인다(대조군과 달라야 한다)", () => {
    const used = calculateStockTransferTaxAggregate([OTHER_ASSET_ITEM, STOCK_GROUP_ITEM]);
    const notUsed = calculateStockTransferTaxAggregate([
      { ...OTHER_ASSET_ITEM, realEstateGroupBasicDeductionUsed: 0 },
      { ...STOCK_GROUP_ITEM, realEstateGroupBasicDeductionUsed: 0 },
    ]);
    // 종전에는 두 값이 완전히 같았다(입력이 세액에 0 영향).
    expect(used.totalFinalTax).toBeGreaterThan(notUsed.totalFinalTax);
    expect(used.totalTaxBase).toBe(notUsed.totalTaxBase + 2_500_000);
  });

  it("AG-BD-4: 한도를 넘는 선언값은 250만으로 clamp 된다(음수·초과 방어)", () => {
    const over = calculateStockTransferTaxAggregate([
      { ...OTHER_ASSET_ITEM, realEstateGroupBasicDeductionUsed: 9_999_999 },
      { ...STOCK_GROUP_ITEM, realEstateGroupBasicDeductionUsed: 9_999_999 },
    ]);
    const exact = calculateStockTransferTaxAggregate([OTHER_ASSET_ITEM, STOCK_GROUP_ITEM]);
    expect(over.totalTaxBase).toBe(exact.totalTaxBase);
    expect(over.basicDeductionByGroup.real_estate_and_other_asset).toBe(0);
  });
});

// ============================================================
// #28 — split 모드 appliedRate·누진공제 echo 가 실제 계산과 다르다
// ============================================================

describe("SPLIT-ECHO (#28): split 단일세율 경로의 echo 가 실제 계산과 일치한다", () => {
  it("SPLIT-ECHO-1: 비대주주 split → appliedRate 가 실제 적용 세율", () => {
    const nonMajorSplit = baseInput({
      marketType: "unlisted",
      selfShareRatio: 0.001,
      selfMarketCap: 100_000_000,
      isSmallMediumEnterprise: false,
      transferDate: new Date("2025-07-01"),
      filingDate: new Date("2025-08-31"),
      priorYearEndDate: new Date("2024-12-31"),
      shareCount: 2000,
      acquisitionLots: [
        lot("a", "2020-01-01", 1000, 100_000),
        lot("b", "2025-03-01", 1000, 100_000),
      ],
      transferLots: [transferLot(2000, 300_000)],
      costAllocationMethod: "fifo",
      perShareTransferPrice: 300_000,
    });
    const r = calculateStockTransferTax(nonMajorSplit);
    expect(r.lotMatchingDetail).toBeDefined();
    expect(r.taxCategory).toBe("unlisted_non_major");

    // 비대주주는 lot 에 따라 세율이 갈리지 않는다 → 정본과 동일한 세율·누진공제를 echo 해야 한다.
    const canonical = applyStockTaxRate(r.taxBase, r.taxCategory, false, false);
    expect(r.appliedRate).toBe(canonical.appliedRate);
    expect(r.progressiveDeduction).toBe(canonical.progressiveDeduction);
  });

  it("SPLIT-ECHO-2: 기타자산 split → §55 누진공제가 echo 된다", () => {
    const otherAssetSplit = baseInput({
      marketType: "unlisted",
      isHeavyRealEstateForRate: true,
      selfShareRatio: 0.5,
      selfMarketCap: 10_000_000_000,
      transferDate: new Date("2025-07-01"),
      filingDate: new Date("2025-08-31"),
      priorYearEndDate: new Date("2024-12-31"),
      shareCount: 2000,
      acquisitionLots: [
        lot("a", "2020-01-01", 1000, 100_000),
        lot("b", "2025-03-01", 1000, 100_000),
      ],
      transferLots: [transferLot(2000, 300_000)],
      costAllocationMethod: "fifo",
      perShareTransferPrice: 300_000,
    });
    const r = calculateStockTransferTax(otherAssetSplit);
    expect(r.lotMatchingDetail).toBeDefined();
    expect(r.taxCategory).toBe("other_asset_heavy_re");

    const canonical = applyStockTaxRate(r.taxBase, r.taxCategory, false, false);
    expect(r.calculatedTax).toBe(Math.floor(canonical.calculatedTax / 10) * 10);
    expect(r.appliedRate).toBe(canonical.appliedRate);
    // §55 누진공제가 있는 구간인데 종전에는 undefined 였다 → 결과뷰 산식 항등식이 깨졌다.
    expect(r.progressiveDeduction).toBe(canonical.progressiveDeduction);
    expect(r.progressiveDeduction).toBeGreaterThan(0);
  });

  it("SPLIT-ECHO-3: 대주주 비중소 혼합 lot 은 종전대로 appliedRate 0(혼합 라벨)", () => {
    const r = calculateStockTransferTax(SPLIT_MIXED);
    expect(r.appliedRate).toBe(0);
    // 혼합이면 단일 누진공제를 말할 수 없다 — undefined 가 정본이다.
    expect(r.progressiveDeduction).toBeUndefined();
  });
});
