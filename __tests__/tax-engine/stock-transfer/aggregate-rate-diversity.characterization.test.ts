/**
 * 다종목 aggregate — **세율 다양성** characterization
 *
 * 계획서: docs/02-design/features/foreign-stock-118-6-limit-bc-apportionment.plan.md (Phase 1)
 *
 * ## 왜 이 파일이 필요한가 — 기존 안전망이 세율 축을 지키지 못한다
 *
 * Phase 4에서 `stock-transfer-aggregate.ts` STEP 3의 stock 분기에 **국외주식 갈래**를 추가한다
 * (국외주식은 §104①12호나목 20% 단일세율이라 국내 세율 계산을 타면 안 된다).
 * 그 작업의 실패 모드는 「**국외 갈래가 국내 종목까지 삼켜 전 종목이 20%가 되는 것**」이다.
 *
 * 2026-08-12 mutation 실측 — STEP 3의 `applyStockTaxRate(...)` 호출을 전 종목 20% 고정으로
 * 치환했더니 **974건 중 4건만 실패**했다:
 *
 *   · `loss-offset-102-2.anchor.test.ts` M-6-1·M-6-2·M-6-4 (§103② 순서 — 20%/30% 혼합 픽스처라 우연히 걸림)
 *   · `carryover-97-2-lot-necessary-expense.anchor.test.ts` N-7
 *
 * ⚠️ **aggregate 전용 테스트 36건**(`case-aggregate-multi-stock` 19 + `audit-fix-stock-transfer-aggregate` 17)은
 *    **한 건도 잡지 못했다** — 픽스처가 전부 20% 계열이라 20% 고정 변이가 보이지 않는다.
 *    개수는 안전망의 크기를 말해주지 않는다.
 *
 * ⇒ 이 파일은 **4개 세율군을 한 계산에 섞어** 그 사각지대를 메운다.
 *
 * ## 고정하는 것 (2026-08-12 실측 — 전부 법령과 대조 확인)
 *
 * | 종목 | 분류 | 근거 | 과세표준 | 세율 | 산출세액 |
 * |---|---|---|---:|---:|---:|
 * | 2월 | 중소 비대주주 | §104①11호나목1) | 37,500,000 | 10% | 3,750,000 |
 * | 4월 | 비중소 비대주주 | §104①11호나목2) | 40,000,000 | 20% | 8,000,000 |
 * | 6월 | 대주주 장기 | §104①11호가목2) 3억 이하 | 40,000,000 | 20% | 8,000,000 |
 * | 8월 | 비중소 대주주 단기 | §104①11호가목1) 1년 미만 | 40,000,000 | 30% | 12,000,000 |
 *
 * 🔑 기본공제 250만원이 **세율이 가장 낮은 2월 종목**에 간다 — §103②가 「**먼저 양도한 자산**의
 *    양도소득금액에서부터」로 정하기 때문이다. 세액이 커지는 방향이지만 **법령대로**다.
 *    (세율 높은 쪽에 주는 「유리한」 배분을 구현하면 이 anchor가 잡는다.)
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 비상장 기본 픽스처 — 종목당 양도소득 40,000,000 (500,000 − 100,000) × 100주 */
function base(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
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
    acquisitionDate: new Date("2021-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 500_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 100_000,
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
    ...o,
  };
}

/** 10% — 중소기업 비대주주 (§104①11호나목1) · 2월 양도 */
const SME_NON_MAJOR = base({
  isSmallMediumEnterprise: true,
  transferDate: new Date("2024-02-01"),
});
/** 20% — 중소기업 외 비대주주 (§104①11호나목2) · 4월 양도 */
const NON_SME_NON_MAJOR = base({ transferDate: new Date("2024-04-01") });
/** 20~25% — 대주주 장기보유 (§104①11호가목2) · 6월 양도 · 과세표준 3억 이하라 20% */
const MAJOR_LONG = base({
  isMajorShareholder: true,
  selfShareRatio: 0.05,
  transferDate: new Date("2024-06-01"),
});
/** 30% — 중소기업 외 대주주 1년 미만 (§104①11호가목1) · 8월 양도 */
const MAJOR_SHORT = base({
  isMajorShareholder: true,
  selfShareRatio: 0.05,
  acquisitionDate: new Date("2024-01-05"),
  transferDate: new Date("2024-08-01"),
  filingDate: new Date("2024-10-31"),
});

const INPUTS = [SME_NON_MAJOR, NON_SME_NON_MAJOR, MAJOR_LONG, MAJOR_SHORT];

describe("AGG-RATE — 다종목 aggregate가 종목별 세율을 각각 적용한다", () => {
  const r = calculateStockTransferTaxAggregate(INPUTS, "aggregate");

  it("AGG-RATE-0 [픽스처 가드] 네 종목의 양도소득금액이 모두 같다 — 차이는 세율뿐", () => {
    expect(r.items.map((x) => x.transferIncome)).toEqual([
      40_000_000, 40_000_000, 40_000_000, 40_000_000,
    ]);
  });

  it("AGG-RATE-1 적용 세율이 종목마다 다르다 — 10% / 20% / 20% / 30%", () => {
    expect(r.items.map((x) => x.appliedRate)).toEqual([0.1, 0.2, 0.2, 0.3]);
  });

  it("AGG-RATE-2 §103② — 기본공제 250만원은 **먼저 양도한** 2월 종목에 전액 간다", () => {
    // 세율이 가장 낮은 종목이라 세액은 커지지만, §103②가 정하는 순서가 그렇다.
    expect(r.items.map((x) => x.basicDeduction)).toEqual([2_500_000, 0, 0, 0]);
    expect(r.basicDeductionByGroup.stock).toBe(2_500_000);
  });

  it("AGG-RATE-3 종목별 산출세액", () => {
    expect(r.items.map((x) => x.calculatedTax)).toEqual([
      3_750_000,   // 37,500,000 × 10%
      8_000_000,   // 40,000,000 × 20%
      8_000_000,   // 40,000,000 × 20% (3억 이하 구간)
      12_000_000,  // 40,000,000 × 30%
    ]);
  });

  it("AGG-RATE-4 합계 — 산출세액 31,750,000 · 지방소득세 3,175,000", () => {
    expect(r.totalTransferIncome).toBe(160_000_000);
    expect(r.totalTaxBase).toBe(157_500_000);
    expect(r.totalCalculatedTax).toBe(31_750_000);
    expect(r.totalFinalTax).toBe(31_750_000);
    expect(r.totalLocalIncomeTax).toBe(3_175_000);
  });

  it("AGG-RATE-5 [트립와이어] 전 종목이 같은 세율이면 실패한다 — 20% 고정 변이 방어", () => {
    // Phase 4에서 국외주식 갈래가 국내 종목까지 삼키면 여기가 먼저 빨개진다.
    expect(new Set(r.items.map((x) => x.appliedRate)).size).toBeGreaterThan(1);
    // 전 종목 20%였다면 합계가 31,500,000이 된다(157,500,000 × 20%).
    expect(r.totalCalculatedTax).not.toBe(31_500_000);
  });
});
