/**
 * 상속세·증여세 세액공제 타입 (상증법 §28·§29·§30·§69 + 조특법 §30의5·§30의6)
 *
 * 800줄 정책으로 inheritance-gift.types.ts에서 분리 (2026-05-21).
 * barrel: inheritance-gift.types.ts에서 re-export.
 */

import type { CalculationStep, PriorGift } from "./inheritance-gift.types";

/** 상속세 세액공제 입력 */
export interface InheritanceTaxCreditInput {
  /** 증여세액공제 (§28) — 사전증여별 납부세액 (PriorGift에서 자동 계산) */
  priorGifts?: PriorGift[];
  /** 외국납부세액 (§29) */
  foreignTaxPaid?: number;
  /** 단기재상속 — 피상속인이 상속받은 날로부터 경과 연수 */
  shortTermReinheritYears?: number;
  /** 단기재상속 — 당시 상속세 납부액 (전의 상속세산출세액 기준) */
  shortTermReinheritTaxPaid?: number;
  /**
   * 단기재상속 — 재상속분의 재산가액 (§30②1호 안분 분수 분자).
   * 전(前) 상속재산 중 이번 상속에서 다시 상속되는 재산의 가액.
   *
   * 법령근거: 상증법 §30②1호 (대수적 약분 후 분자).
   * optional: 미입력 시 전부 재상속(분수=1) 가정으로 fallback.
   */
  shortTermReinheritAssetValue?: number;
  /**
   * 단기재상속 — 전의 상속재산가액 (§30②1호 안분 분수 분모).
   * 이전 상속 시 전체 상속재산의 가액.
   *
   * 법령근거: 상증법 §30②1호 (대수적 약분 후 분모).
   * optional: 미입력 또는 0 시 전부 재상속(분수=1) 가정으로 fallback.
   */
  shortTermReinheritPriorEstateValue?: number;
  /** 법정신고기한 내 신고 여부 (§69 3% 공제) */
  isFiledOnTime: boolean;
}

/** 증여세 세액공제 입력 */
export interface GiftTaxCreditInput {
  /** 외국납부세액 (§59) */
  foreignTaxPaid?: number;
  /** 법정신고기한 내 신고 여부 (§69 3% 공제) */
  isFiledOnTime: boolean;
  /** 조특법 과세특례 선택 (창업자금 §30의5 / 가업승계 §30의6) */
  specialTreatment?: "startup" | "family_business";
  /** 창업자금: 창업법인 설립 후 2년 이내 투자 완료 여부 */
  startupInvestmentCompleted?: boolean;
}

/** 세액공제 계산 결과 (상속·증여 공통 구조) */
export interface TaxCreditResult {
  giftTaxCredit: number;        // §28
  foreignTaxCredit: number;     // §29 or §59
  shortTermReinheritCredit: number; // §30 (상속만)
  filingCredit: number;         // §69
  specialTreatmentCredit: number;   // 조특법 §30의5·§30의6
  totalCredit: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
  /**
   * §69 산식 노출용 — 신고세액공제 기준세액.
   * = totalComputedTaxWithSurcharge − giftTaxCredit − foreignTaxCredit − specialTreatmentCredit
   * (= 엔진 `remainingTax`, inheritance-gift-tax-credit.ts:378·399).
   * 법정기한 외 신고 시에도 echo는 유지 (filingCredit만 0).
   * 상속세 호출(calcInheritanceTaxCredits)에는 현재 echo 미적용 → undefined 가능.
   */
  filingCreditBase?: number;
  /**
   * §69 산식 노출용 — 산출세액 합계 (할증 포함).
   * = computedTax + generationSkipSurcharge
   * (= 엔진 `totalComputedTax`, inheritance-gift-tax-credit.ts:315).
   * §28의 ⑦(할증 전, `result.computedTax`)과 구분 필수.
   * 상속세 호출에는 현재 echo 미적용 → undefined 가능.
   */
  totalComputedTaxWithSurcharge?: number;
}
