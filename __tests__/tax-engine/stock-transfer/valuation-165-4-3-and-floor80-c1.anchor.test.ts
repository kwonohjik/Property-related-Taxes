/**
 * 비상장 보충평가 anchor — 리뷰 2026-08-28 #13·#18
 *
 * 둘 다 **「이 경로만 그 규정을 안 탄다」**는 비대칭이다. 조문은 경로를 가르지 않는다.
 *
 * ── #13 순자산 단독 평가(§165④3) 분기가 §165⑨ 월할 보정을 통째로 건너뛴다 ────────
 *   `calcUnlistedValuation`의 `netAssetOnlyReason` 분기는 §165⑨ 블록에 닿기 **전에**
 *   return 한다(반환 객체에 `section1659Detail` 키 자체가 없다).
 *   그런데 순자산 단독 법인이 동일 사업연도에 취득·양도하면 직전 사업연도가 같아
 *   양측 순자산가치가 **필연적으로 일치**하므로, 예외가 아니라 **전형적 §165⑨ 발동 케이스**다.
 *   UI 미리보기는 순자산 단독일 때도 §81④ 토글을 노출하고 validate는 전전연도 값을
 *   필수로 강제한다 — 화면은 열리고 검증은 요구하는데 엔진만 안 본다.
 *
 *   근거: 소득세법 시행령 §165⑨ — 「법 제99조제1항제3호 및 **제4호에 따라 산정한** 양도
 *        당시의 기준시가와 취득 당시의 기준시가가 같은 경우…」로 **호를 가르지 않는다**.
 *        §165④3호도 「제1호나목의 계산식에 따라 평가한 가액」이라 여전히 §99①4호 기준시가다.
 *        시행규칙 §81④1호.
 *
 *   ⚠️ 전전연도 평가도 **순자산 단독**이어야 한다 — 직전을 순자산 단독으로 평가해 놓고
 *      전전만 가중평균으로 잡으면 같은 산식의 양변을 서로 다른 기준으로 재는 것이 된다.
 *
 * ── #18 취득일 거래정지(C-1) 경로만 취득측 80% 하한(§165④1 단서)을 적용하지 않는다 ──
 *   `calcAcquisitionStdPerShareSupplementary`에 `hasFloor80` 참조가 0건이었다.
 *   주석은 근거를 「양측 경로 분자 관행」이라 적었으나 그 양측 경로(`calcUnlistedValuation`)는
 *   이미 취득측에도 하한을 걸도록 정정됐다(#1150) — **stale 자기참조**였다.
 *   하한은 값을 **올리는** 장치라, 취득측에서만 빼면 분자가 낮아져
 *   환산취득가 과소 → 세액 과대로 한쪽으로만 찌그러진다.
 *
 *   근거: 소득세법 시행령 §165④1호 단서 · §165③ 후문(분자만 §165④로 대체하도록 명령하므로
 *        그 1호 **단서까지 함께** 딸려온다).
 *        저장소 자신의 `unlisted-acq-std-floor80-symmetry.anchor.test.ts`가 이미
 *        「단서는 그 평가방법의 일부다」로 반대 입장을 배척하고 있어 dual truth 였다.
 *
 *   VL-1659-1~4  (#13)
 *   VL-C1-1~5    (#18)
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calcAcquisitionStdPerShareSupplementary } from "@/lib/tax-engine/stock-transfer/stock-valuation-unlisted";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function base(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.6,
    selfMarketCap: 2_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    isListedSmallShareholder: false,
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    acquisitionDate: new Date("2024-01-15"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 200_000,
    acquisitionMode: "estimated",
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "estimated",
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
// #13 — §165④3 순자산 단독 × §165⑨ 월할 보정
// ============================================================

describe("VL-1659 (#13): 순자산 단독 평가도 §165⑨ 월할 보정을 탄다", () => {
  /**
   * 동일 사업연도 취득·양도 → 양도·취득 기준시가가 같다(§165⑨ 트리거).
   * 직전 순자산 100,000 · 전전 80,000 · §81④ 1호 토글 ON.
   */
  const sameBizYear = (o: Partial<StockTransferInput> = {}) =>
    base({
      transferYearNetIncomePerShare: 100_000,
      transferYearNetAssetPerShare: 100_000,
      acquisitionYearNetIncomePerShare: 100_000,
      acquisitionYearNetAssetPerShare: 100_000,
      prePriorYearNetIncomePerShare: 80_000,
      prePriorYearNetAssetPerShare: 80_000,
      priorBizYearMonths: 12,
      unlistedSameBizYearToggle: true,
      ...o,
    });

  it("VL-1659-1: 가중평균 대조군 — §165⑨ 보정이 발동한다 (전제 확인)", () => {
    const r = calculateStockTransferTax(sameBizYear());
    expect(r.valuationDetail?.section1659Detail).toBeDefined();
    expect(r.valuationDetail!.section1659Detail!.adjusted).toBeGreaterThan(
      r.valuationDetail!.section1659Detail!.prior,
    );
  });

  it("VL-1659-2: 순자산 단독 사유가 있어도 §165⑨ 보정이 발동한다", () => {
    const r = calculateStockTransferTax(
      sameBizYear({ netAssetOnlyReason: "liquidation_or_owner_death" }),
    );
    expect(r.valuationDetail?.section1659Detail).toBeDefined();
    expect(r.valuationDetail!.section1659Detail!.prior).toBe(100_000);
  });

  it("VL-1659-3: 전전연도 평가도 순자산 단독이어야 한다 (양변 기준 일치)", () => {
    // 전전 NI 를 크게 흔들어도 순자산 단독 경로의 보정값은 바뀌지 않아야 한다.
    const low = calculateStockTransferTax(
      sameBizYear({
        netAssetOnlyReason: "liquidation_or_owner_death",
        prePriorYearNetIncomePerShare: 10_000,
      }),
    );
    const high = calculateStockTransferTax(
      sameBizYear({
        netAssetOnlyReason: "liquidation_or_owner_death",
        prePriorYearNetIncomePerShare: 900_000,
      }),
    );
    expect(low.valuationDetail?.section1659Detail?.prePrior).toBe(80_000);
    expect(high.valuationDetail?.section1659Detail?.prePrior).toBe(80_000);
    expect(high.acquisitionPrice).toBe(low.acquisitionPrice);
  });

  it("VL-1659-4: 보정이 걸리면 취득가액이 양도가액에 미달한다 (세액이 살아난다)", () => {
    const r = calculateStockTransferTax(
      sameBizYear({ netAssetOnlyReason: "liquidation_or_owner_death" }),
    );
    // 보정 전에는 분모=분자라 취득가액 = 양도가액 전액 → 차익 0 이하 → 세액 0이었다.
    expect(r.acquisitionPrice).toBeLessThan(r.transferPrice);
    expect(r.calculatedTax).toBeGreaterThan(0);
  });

  it("VL-1659-5: 토글 OFF면 종전대로 M-3 경고만 (회귀 가드)", () => {
    const r = calculateStockTransferTax(
      sameBizYear({
        netAssetOnlyReason: "liquidation_or_owner_death",
        unlistedSameBizYearToggle: false,
      }),
    );
    expect(r.valuationDetail?.section1659Detail).toBeUndefined();
    expect(r.warnings.some((w) => w.includes("§165⑨"))).toBe(true);
  });
});

// ============================================================
// #18 — C-1 취득측 80% 하한
// ============================================================

describe("VL-C1 (#18): 취득일 거래정지 경로도 §165④1 단서를 탄다", () => {
  /**
   * 코스피 소액주주 장외양도 · 취득일 거래정지.
   * 취득연도 NI 2,000 · NA 10,000 → 가중평균 5,200 vs 하한 8,000 ⇒ 하한 발동.
   */
  const haltAcq = (o: Partial<StockTransferInput> = {}) =>
    base({
      marketType: "kospi",
      isMajorShareholder: false,
      selfShareRatio: 0,
      selfMarketCap: 0,
      isListedSmallShareholder: true,
      isOnMarketTransaction: false,
      perShareTransferPrice: 10_000,
      tradingHaltAtAcquisition: true,
      transferDatePriceAvg1Month: 10_000,
      acquisitionYearNetIncomePerShare: 2_000,
      acquisitionYearNetAssetPerShare: 10_000,
      ...o,
    });

  it("VL-C1-1: leaf — 가중평균 5,200 < 하한 8,000 이면 8,000", () => {
    const r = calcAcquisitionStdPerShareSupplementary(haltAcq());
    expect(r.weightedRaw).toBe(5_200);
    expect(r.perShare).toBe(8_000);
  });

  it("VL-C1-2: 엔진 세액 — 취득가액이 하한 기준으로 선다", () => {
    const r = calculateStockTransferTax(haltAcq());
    // 양도가 10,000,000 × (8,000 / 10,000) = 8,000,000
    expect(r.acquisitionPrice).toBe(8_000_000);
    expect(r.valuationDetail?.finalPerShareValue).toBe(8_000);
  });

  it("VL-C1-3: 하한 발동 사실이 결과에 남는다 (하드코딩 false 금지)", () => {
    const r = calculateStockTransferTax(haltAcq());
    expect(r.valuationDetail?.netAssetFloorApplied).toBe(true);
  });

  it("VL-C1-4: 하한이 발동하지 않으면 종전과 같다 (회귀 가드)", () => {
    // NI 6,000 · NA 5,000 → 가중평균 5,600 > 하한 4,000
    const r = calculateStockTransferTax(
      haltAcq({
        acquisitionYearNetIncomePerShare: 6_000,
        acquisitionYearNetAssetPerShare: 5_000,
      }),
    );
    expect(r.valuationDetail?.finalPerShareValue).toBe(5_600);
    expect(r.valuationDetail?.netAssetFloorApplied).toBe(false);
  });

  it("VL-C1-5: 순자산 단독 사유는 하한 대상이 아니다 (§165④3 「제1호 각 목 외의 부분에도 불구하고」)", () => {
    const r = calcAcquisitionStdPerShareSupplementary(
      haltAcq({ netAssetOnlyReason: "liquidation_or_owner_death" }),
    );
    expect(r.perShare).toBe(10_000); // 순자산 그대로 — 하한(8,000) 개입 없음
  });
});
