/**
 * PLD — 취득 후 상장(§165⑤) 환산 **분모 미입력은 차단**한다.
 *
 * ## 왜 이 anchor가 필요한가
 *
 * 같은 필드(`transferDatePriceAvg1Month`)의 미입력을 두 경로가 **다르게** 처리하고 있었다:
 *
 *   일반 §176의2②1호 (`stock-valuation-listed.ts:77`) → 0-가드 → 취득가 0 + 사유 경고
 *   취득 후 상장 §165⑤ (`resolveTransferStd`)          → 1주당 양도가 fallback → 환산 미적용
 *
 * 계획서 `docs/00-pm/stock-listed-conversion-unification.plan.md` **Q-1**에서
 * CLAUDE.md 「자동 안분 fallback 금지」와 일관되는 **차단(0 + warning)** 쪽으로 정본을 통일했다.
 *
 * ## 🔑 픽스처가 «나누어떨어지면» 이 anchor의 구별력은 0이다
 *
 *   fallback 값 = floor(양도가 × 취득기준 / floor(양도가 ÷ 주식수))
 *   차단 시     = 0
 *
 * 주식수가 양도가를 나누어떨어뜨리면 fallback이 「환산 미적용」(취득기준 × 주식수)과
 * **우연히 같아진다**. 기존 픽스처 둘이 모두 그 경우였다 —
 * `post-listing-163-9-conversion.test.ts` PL-3 과 `route-split-mode.anchor.test.ts` LO-PRE-3이
 * 둘 다 8,950 × 5,000이라, fallback을 제거해도 수치가 안 변해 **통과했다**.
 *
 * ⇒ 여기서는 `transferActualInputMode: "total"`로 **44,753,000**(÷5,000 = 8,950.6)을 쓴다.
 *    `perShareTransferPrice`를 쓰면 총액 = 1주당 × 주식수라 **항상 나누어떨어져** 안 된다.
 *
 * ## 도달 경로
 *
 * ⑧ validate(`stock-transfer-tax-validate-step2.ts:297-331`)가 §165⑤ 경로에서도 분모를
 * 요구하므로 **UI로는 도달하지 않는다**. ⑫ Zod가 §165⑤만 면제하고 있어 **API 직접 호출**로는
 * 통과했다 — 그 면제도 함께 닫는다(PLD-3).
 * 프레이밍은 형제 anchor `BG-ENG`(`gift-burdened-stock-major-and-conversion.anchor.test.ts:357`)와 같다.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { addStockRefines, stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";

/** 양도가 44,753,000 · 주식수 5,000 → 1주당 취득기준시가 5,824 (PL-1과 같은 평가 픽스처) */
const TRANSFER_TOTAL = 44_753_000;
const SHARE_COUNT = 5_000;
const ACQ_STD_PER_SHARE = 5_824;
const TRANSFER_STD = 8_659;

function baseInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    isOnMarketTransaction: true,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: new Date("2005-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: SHARE_COUNT,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    // ★ 총액 모드 — 1주당 모드로는 나누어떨어짐을 피할 수 없다(위 주석)
    transferActualInputMode: "total",
    transferTotalPrice: TRANSFER_TOTAL,
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: TRANSFER_STD,
    acquiredBeforeListing: true,
    tradingHaltAtTransfer: false,
    listingDate: new Date("2009-08-21"),
    listingDatePriceAvg1Month: 8_001,
    listingYearNetIncomePerShare: 61_570,
    listingYearNetAssetPerShare: 5_352,
    acquisitionYearNetIncomePerShare: 44_520,
    acquisitionYearNetAssetPerShare: 4_348,
    bookLost: false,
    expenseMode: "estimated",
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

describe("PLD — §165⑤ 환산 분모 미입력은 차단한다 (Q-1 정본)", () => {
  it("PLD-0 (픽스처 가드): 양도가가 주식수로 나누어떨어지지 않는다", () => {
    // 이 성질이 깨지면 PLD-1의 구별력이 0이 된다 — 픽스처를 바꿀 때 여기서 먼저 걸린다.
    expect(TRANSFER_TOTAL % SHARE_COUNT).not.toBe(0);
  });

  it("PLD-1: 분모 미입력 → 취득가액 0 + 사유 경고 (일반 경로와 같은 문구)", () => {
    const r = calculateStockTransferTax(baseInput({ transferDatePriceAvg1Month: undefined }));
    expect(r.acquisitionPrice).toBe(0);
    expect(r.warnings.join(" ")).toContain("양도일 이전 1개월 종가평균이 0 이하");
  });

  it("PLD-2 (대조군): 분모를 넣으면 환산이 정상 산출되고 그 경고가 붙지 않는다", () => {
    const r = calculateStockTransferTax(baseInput());
    expect(r.valuationDetail?.finalPerShareValue).toBe(ACQ_STD_PER_SHARE);
    expect(r.acquisitionPrice).toBe(
      Math.floor((TRANSFER_TOTAL * ACQ_STD_PER_SHARE) / TRANSFER_STD),
    );
    expect(r.warnings.join(" ")).not.toContain("종가평균이 0 이하");
  });

  /**
   * ⑫ 게이트 — 종전에는 분모 refine이 `!data.acquiredBeforeListing`로 §165⑤를 **면제**해
   * 이 payload가 API를 그대로 통과했다. Q-1 정본에서는 통과시키면 안 된다.
   */
  it("PLD-3: ⑫ Zod가 §165⑤ 분모 미입력 payload를 거부한다", () => {
    const schema = addStockRefines(stockTransferInputSchema);
    const body = {
      marketType: "kosdaq",
      isMajorShareholder: true,
      selfShareRatio: 0.05,
      selfMarketCap: 0,
      isLargestShareholderGroup: false,
      combinedShareRatio: 0,
      combinedMarketCap: 0,
      isVentureCompany: false,
      isKOTCTrading: false,
      isOnMarketTransaction: true,
      priorYearEndDate: "2023-12-31",
      isQualifyingBlockShareholder: false,
      isHeavyRealEstateForRate: false,
      isHeavyRealEstateForValuation: false,
      isSmallMediumEnterprise: false,
      isMidsizeEnterprise: false,
      isListedSmallShareholder: false,
      acquisitionDate: "2005-01-01",
      transferDate: "2024-06-01",
      shareCount: SHARE_COUNT,
      totalIssuedShares: 10_000_000,
      acquisitionCause: "purchase",
      transferPriceMode: "actual",
      transferActualInputMode: "total",
      transferTotalPrice: TRANSFER_TOTAL,
      acquisitionMode: "estimated",
      // ★ transferDatePriceAvg1Month 없음 — 이것이 거부 사유여야 한다
      acquiredBeforeListing: true,
      tradingHaltAtTransfer: false,
      listingDate: "2009-08-21",
      listingDatePriceAvg1Month: 8_001,
      listingYearNetIncomePerShare: 61_570,
      listingYearNetAssetPerShare: 5_352,
      acquisitionYearNetIncomePerShare: 44_520,
      acquisitionYearNetAssetPerShare: 4_348,
      bookLost: false,
      expenseMode: "estimated",
      filingType: "preliminary",
      filingDate: "2024-08-31",
      isElectronicFiling: false,
      filingViolation: "none",
      isFraudulent: false,
      isInternationalTransaction: false,
      realEstateGroupBasicDeductionUsed: 0,
    };

    const parsed = schema.safeParse(body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path.join("."));
      // 🔑 «그 사유로» 거부되는지를 본다 — 다른 필드 누락으로 실패하면 이 anchor는 무의미하다
      expect(paths).toContain("transferDatePriceAvg1Month");
    }
  });

  it("PLD-4 (PLD-3 대조군): 분모를 채우면 ⑫를 통과한다", () => {
    const schema = addStockRefines(stockTransferInputSchema);
    const body = {
      marketType: "kosdaq",
      isMajorShareholder: true,
      selfShareRatio: 0.05,
      selfMarketCap: 0,
      isLargestShareholderGroup: false,
      combinedShareRatio: 0,
      combinedMarketCap: 0,
      isVentureCompany: false,
      isKOTCTrading: false,
      isOnMarketTransaction: true,
      priorYearEndDate: "2023-12-31",
      isQualifyingBlockShareholder: false,
      isHeavyRealEstateForRate: false,
      isHeavyRealEstateForValuation: false,
      isSmallMediumEnterprise: false,
      isMidsizeEnterprise: false,
      isListedSmallShareholder: false,
      acquisitionDate: "2005-01-01",
      transferDate: "2024-06-01",
      shareCount: SHARE_COUNT,
      totalIssuedShares: 10_000_000,
      acquisitionCause: "purchase",
      transferPriceMode: "actual",
      transferActualInputMode: "total",
      transferTotalPrice: TRANSFER_TOTAL,
      acquisitionMode: "estimated",
      transferDatePriceAvg1Month: TRANSFER_STD,
      acquiredBeforeListing: true,
      tradingHaltAtTransfer: false,
      listingDate: "2009-08-21",
      listingDatePriceAvg1Month: 8_001,
      listingYearNetIncomePerShare: 61_570,
      listingYearNetAssetPerShare: 5_352,
      acquisitionYearNetIncomePerShare: 44_520,
      acquisitionYearNetAssetPerShare: 4_348,
      bookLost: false,
      expenseMode: "estimated",
      filingType: "preliminary",
      filingDate: "2024-08-31",
      isElectronicFiling: false,
      filingViolation: "none",
      isFraudulent: false,
      isInternationalTransaction: false,
      realEstateGroupBasicDeductionUsed: 0,
    };

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new Error(
        "PLD-4 픽스처가 스키마를 통과하지 못한다 — PLD-3의 실패 사유가 분모가 아닐 수 있다: " +
          JSON.stringify(parsed.error.issues.map((i) => ({ p: i.path.join("."), m: i.message }))),
      );
    }
    expect(parsed.success).toBe(true);
  });
});
