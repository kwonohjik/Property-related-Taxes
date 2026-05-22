/**
 * Phase 2 모듈 — 사업연도별 순손익액 산출 (별지 부표3 6쪽 다. 산출)
 *
 * 법령: 상증령 §56 ④ 1·2호 (KoreanLaw 검증 2026-05-22)
 *   - 1호: 가산 항목 (가~마) — 익금불산입·이월·외화환산이익 등
 *   - 2호: 차감 항목 (가~마) — 법인세·부가세·벌금·한도초과·외화환산손실 등
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation.engine.design.md
 */

import type { FiscalYearAdjustment } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

export interface FiscalYearNetIncomeResult {
  /** 가산 합계 (별지 양식 ②~⑦) */
  addTotal: number;
  /** 차감 합계 (별지 양식 ⑧~㉒) */
  subTotal: number;
  /** 다. 순손익액 = ① + 가산 − 차감 (§56④) */
  adjustedNetIncome: number;
}

/**
 * 사업연도별 순손익액 산출
 *
 * 산식: 다 = ① 각 사업연도 소득금액 + Σ(가산 ②~⑦) − Σ(차감 ⑧~㉒)
 *
 * @example PDF 사례 1 2021년
 *   ① 140,000,000원
 *   가산: ② 1,000,000원
 *   차감: ⑨ 700,000 + ⑬ 500,000 + ⑮ 3,800,000 + ⑯ 6,000,000 + ⑲ 3,000,000 + ⑧ 7,000,000 = 21,000,000원
 *   다. = 140,000,000 + 1,000,000 − 21,000,000 = 120,000,000원
 */
export function calcFiscalYearNetIncome(
  fy: FiscalYearAdjustment,
): FiscalYearNetIncomeResult {
  const add =
    (fy.addRefundInterest ?? 0) +
    (fy.addLossFromDividend ?? 0) +
    (fy.addCarriedDonation ?? 0) +
    (fy.addCarriedCarPayment ?? 0) +
    (fy.addForexValuationGain ?? 0) +
    (fy.addOtherByOrdinance ?? 0);

  const sub =
    (fy.subCorporateTax ?? 0) +
    (fy.subAdditionalTaxes ?? 0) +
    (fy.subFines ?? 0) +
    (fy.subCompulsoryPublicCharges ?? 0) +
    (fy.subPunitiveDamages ?? 0) +
    (fy.subWithholdingPenalty ?? 0) +
    (fy.subExcessiveExpenses ?? 0) +
    (fy.subDonationExcess ?? 0) +
    (fy.subEntertainmentExcess ?? 0) +
    (fy.subNonBusinessExpenses ?? 0) +
    (fy.subNonBusinessCarExpenses ?? 0) +
    (fy.subInterestPayment ?? 0) +
    (fy.subDepreciationShortage ?? 0) +
    (fy.subForexValuationLoss ?? 0) +
    (fy.subOtherByOrdinance ?? 0);

  return {
    addTotal: add,
    subTotal: sub,
    adjustedNetIncome: fy.taxableIncome + add - sub,
  };
}
