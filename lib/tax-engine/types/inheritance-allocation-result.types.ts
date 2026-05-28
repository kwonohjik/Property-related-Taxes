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

  // ============================================================
  // Phase B2 echo 필드 — PDF 표8 (이미지 8) 재현용 중간값 노출
  // 산식 변경 0 — 모두 optional. heir-allocation-summary-table.engine.design.md
  // ============================================================
  /**
   * 자산 4분류 합계 (협의분할 분배 후 본인 몫).
   * - perHeir[heir].categoryBreakdown — 협의분할 입력 또는 법정상속분 fallback 분배
   * - perHeir[corp].categoryBreakdown — 모든 0 (본래 상속재산 없음, 사전증여만)
   */
  categoryBreakdown?: {
    financial: number;
    realEstate: number;
    stock: number;
    other: number;
  };
  /** ① 총상속재산 (채무공제 전) = Σ categoryBreakdown */
  grossInheritance?: number;
  /** ㉠ 과세제외 재산 (비과세 + 과세가액불산입). 일반적으로 0. */
  excludedFromTaxation?: number;
  /**
   * ⑩b / ⑫b 공제 한도 — 한 필드 두 의미 (D-8):
   * - heir(spouse/child/...): §28 사전증여공제 한도 = floor(⑪ × directTaxBaseShare / taxBaseShare)
   * - corporate: §3의2② 면제 한도 = floor(⑦ × corporateGiftTaxBase / taxBase)
   * UI는 heir.relation으로 분기하여 ⑩b/⑫b 라벨 분리 표시.
   */
  priorGiftCreditLimit?: number;
  /**
   * ⑩a / ⑫a 증여세 산출세액.
   * - heir: PriorGift.giftTaxPaid 합 (donee 기준)
   * - corp: Heir.corporateGiftComputedTax (영리법인 사전증여 시 부담 증여세 산출세액)
   */
  priorGiftComputedTax?: number;
  /**
   * *5 부담비율 = taxBaseShare / (taxBase − corporate 사전증여 과세표준) (4자리 round).
   * corp는 비율 계산 대상이 아니므로 undefined (UI는 — 표시).
   */
  burdenRatio?: number;
}

export interface HeirAllocationResult {
  /** Heir.id 별 산출 결과. 영리법인은 finalTax=0. JSON-native Record (Map 금지 — 직렬화 소실 방지). */
  perHeir: Record<string, HeirTaxBreakdown>;
  /** 배부대상 산출세액 = 산출세액 − 영리법인 면제 (할증 미포함) */
  distributableTax: number;
  /** 간접배부 분모 = grossEstateWithGifts − Σ(상속인·수유자 외 자 사전증여 가액) */
  indirectDistributionBase: number;
  /** 간접배부 분자 = taxBase − Σ직접배부 − corporateGiftTaxBase */
  indirectNumerator: number;
  /** 산출세액상당액 분모 = taxBase − corporateGiftTaxBase */
  computedTaxShareDenominator: number;
  /** 협의분할 미입력 자산이 법정상속분으로 자동 배분되었는지 (결과 카드 안내용 echo) */
  usedLegalShareFallback: boolean;
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
  /**
   * PR 2 (2026-05-22) — 영리법인 별 분배 명세 (부표 5 양식).
   * 다수 영리법인 시 corporateGiftTaxBase 비례 안분. 단일 영리법인이면 배열 길이 1.
   */
  perCorporateBreakdown?: PerCorporateExemptionDetail[];
}

/** PR 2 — 영리법인 별 면제·주주 환원 명세 (부표 5 가. + 나.) */
export interface PerCorporateExemptionDetail {
  /** Heir.id — 영리법인 식별자 */
  corporateId: string;
  /** ④ 유증·사전증여 재산가액 (해당 영리법인분) */
  inheritedAmount: number;
  /** ⑤ 면제세액 (해당 영리법인분 — 다수 영리법인 시 안분) */
  exemptionAmount: number;
  /** ⑥ ④ × 10% */
  tenPercentBaseline: number;
  /** 주주별 ⑪ 면제분 납부세액 = (⑤ − ⑥) × ⑩ */
  shareholderPayments: ShareholderPaymentDetail[];
}

export interface ShareholderPaymentDetail {
  /** ShareholderInfo.id */
  shareholderId: string;
  /** 부표 5 ⑩ 지분율 */
  shareRatio: number;
  /** 부표 5 ⑪ 면제분 납부세액 */
  paymentAmount: number;
}
