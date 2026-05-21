/**
 * 상속인별 배부 결과 + 영리법인 면제 결과 타입
 *
 * 800줄 정책으로 inheritance-gift.types.ts에서 분리 (2026-05-21).
 * barrel: inheritance-gift.types.ts에서 re-export.
 *
 * Design 참조: §2-5 (상속인별 배부) · §2-5 (영리법인 §3의2② 면제)
 */

import type { CalculationStep } from "./inheritance-gift.types";

// ============================================================
// 상속인별 배부 결과
// ============================================================

export interface HeirTaxBreakdown {
  heirId: string;
  /** 본래상속재산 직접 분배 */
  directEstateAmount: number;
  /** 사전증여 가산가액 */
  priorGiftAmount: number;
  /** 추정상속재산 분배 */
  presumedAmount: number;
  /** 채무·공과금·장례비 분담 */
  debtShare: number;
  /** 과세가액상당액 */
  taxableValueShare: number;
  /** 직접배부 과세표준 (사전증여 과세표준 − 증여공제) */
  directTaxBaseShare: number;
  /** 간접배부 과세표준 */
  indirectTaxBaseShare: number;
  /** 과세표준상당액 = 직접 + 간접 */
  taxBaseShare: number;
  /** 산출세액상당액 (배부대상 산출세액 × 비율, 할증 전) */
  computedTaxShare: number;
  /** 세대생략 할증액 (수유자만) */
  generationSkipSurcharge: number;
  /** 사전증여세액공제 */
  priorGiftCredit: number;
  /** 차가감세액 = computedTaxShare + 할증 − priorGiftCredit */
  preFilingCreditTax: number;
  /** 신고세액공제 (3%) */
  filingCredit: number;
  /** 자진납부세액 */
  finalTax: number;
}

export interface HeirAllocationResult {
  /** Heir.id 별 산출 결과. 영리법인은 finalTax=0. */
  perHeir: Map<string, HeirTaxBreakdown>;
  /** 배부대상 산출세액 = 산출세액 − 영리법인 면제 (할증 미포함) */
  distributableTax: number;
  /** 간접배부 분모 = grossEstateWithGifts − Σ(상속인·수유자 외 자 사전증여 가액) */
  indirectDistributionBase: number;
  /** 간접배부 분자 = taxBase − Σ직접배부 − corporateGiftTaxBase */
  indirectNumerator: number;
  /** 산출세액상당액 분모 = taxBase − corporateGiftTaxBase */
  computedTaxShareDenominator: number;
  breakdown: CalculationStep[];
}

// ============================================================
// 영리법인 §3의2② 면제 결과
// ============================================================

export interface CorporateExemptionResult {
  /** 면제세액 = Min(증여세 산출세액, 한도) */
  amount: number;
  /** 한도 = floor(산출세액 × 영리법인 과세표준 / 상속세 과세표준) */
  limit: number;
  breakdown: CalculationStep[];
}
