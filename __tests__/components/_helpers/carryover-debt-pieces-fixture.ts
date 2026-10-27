/**
 * 이월과세 × 당초 증여 채무 부분(매입분) — 결과 카드 anchor 공용 픽스처.
 * 값은 엔진 anchor(`__tests__/api/transfer.route.carryover-debt-purchased-part.anchor.test.ts` R-1 · 2026-10-27 probe 실측)와 같다:
 * 주택 · 양도 15억 · 증여 2023-06-01 평가액 10억 · 채무 4억 · 증여자 2000-06-01 1억 → A′ 293,970,000 / B 173,060,000.
 */
import type {
  CarryoverPieceEcho,
  CarryoverPurchasedPartSplit,
  CarryoverTaxationDetail,
} from "@/lib/tax-engine/types/transfer-carryover.types";

export const GIFT_PIECE: CarryoverPieceEcho = {
  propertyId: "primary", transferPrice: 900_000_000, acquisitionPrice: 60_000_000, acquisitionDate: "2000-06-01", holdingPeriodYears: 25, transferGain: 840_000_000, appliedRate: 0.42,
};
export const PURCHASED_PIECE: CarryoverPieceEcho = {
  propertyId: "primary__purchased", transferPrice: 600_000_000, acquisitionPrice: 400_000_000, acquisitionDate: "2023-06-01", holdingPeriodYears: 2, transferGain: 200_000_000, appliedRate: 0.38,
};
export const SPLIT: CarryoverPurchasedPartSplit = {
  debtAmount: 400_000_000, giftValuation: 1_000_000_000, transferPrice: 1_500_000_000, donorAcquisitionPrice: 100_000_000,
  gift: GIFT_PIECE, purchased: PURCHASED_PIECE, determinedTaxA: 293_970_000, determinedTaxB: 173_060_000,
};

/** 비교 카드 detail — 단독 카드 값(211,020,000 · 174,060,000)과 신고 전체 값(293,970,000 · 173,060,000)이 일부러 다르다. */
export function detailWith(split: CarryoverPurchasedPartSplit | undefined, over: Partial<CarryoverTaxationDetail> = {}): CarryoverTaxationDetail {
  return {
    isEligible: true,
    applicablePeriodYears: 10,
    scenarioA: {
      acquisitionPrice: 60_000_000, holdingPeriodYears: 25, giftTaxAddedToExpense: 0, giftTaxLimitApplied: false, giftTaxLimitCap: 840_000_000,
      donorCapexAddedToExpense: 0, donorCapexGuardApplied: false, effectiveCapex: 0, transferGain: 840_000_000, determinedTax: 211_020_000,
      ...(split ? { purchasedPartSplit: split } : {}),
    },
    scenarioB: { acquisitionPrice: 1_000_000_000, holdingPeriodYears: 2, transferGain: 500_000_000, determinedTax: 174_060_000 },
    adoptedScenario: "A",
    comparisonExclusion: false,
    filingUnitComparison: { determinedTaxWithCarryover: 293_970_000, determinedTaxWithout: 173_060_000 },
    ...over,
  };
}
