import { describe, it, expect } from "vitest";
import { calcGenerationSkipSurcharge } from "@/lib/tax-engine/inheritance-gift-common";

/**
 * §27 세대생략 할증 안분 BigInt 정밀도 (리뷰 확정 #14 회귀).
 *
 * 버그: floor(computedTax × generationSkipAssetAmount × rate / denom) — 두 큰 값의 Number 곱이
 *   2^53 초과 시 정밀도 손실로 1원 오차. §57 경로(surchargeCreditLimit)는 이미 BigInt safeMultiplyThenDivide.
 * 정정: 할증율을 정수(×10)로 올려 safeMultiplyThenDivide BigInt 단일 floor.
 */
describe("§27 세대생략 할증 안분 정수연산 (리뷰 #14)", () => {
  it("[GSS-BIGINT] 산출세액 543.21억 · 세대생략재산 880.0034억 · 분모 970억 → 14,784,329,286 (float …285)", () => {
    // rate 0.3 (미성년 아님). float 곱(ct×asset≈4.8e21 > 2^53)에서 1원 하향 오차 발생 케이스.
    const r = calcGenerationSkipSurcharge(
      54_321_000_000, // computedTax
      true,           // isGenerationSkip
      false,          // isMinorDonee → rate 0.3
      0,              // taxBase (fallback, 미사용)
      "inheritance",
      88_000_340_000, // generationSkipAssetAmount
      97_000_000_000, // totalEstateValue (분모)
    );
    expect(r.surchargeAmount).toBe(14_784_329_286);
  });
});
