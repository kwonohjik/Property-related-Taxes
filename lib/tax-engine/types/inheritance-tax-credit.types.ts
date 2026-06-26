/**
 * 상속세·증여세 세액공제 타입 (상증법 §28·§29·§30·§69 + 조특법 §30의5·§30의6)
 *
 * 800줄 정책으로 inheritance-gift.types.ts에서 분리 (2026-05-21).
 * barrel: inheritance-gift.types.ts에서 re-export.
 */

import type { CalculationStep, PriorGift } from "./inheritance-gift.types";

/**
 * §30 재상속분 재산 1건 (재산별 구분 계산 입력 — 집행기준 30-22-1 ②).
 */
export interface ShortTermReinheritAsset {
  /** 표시·결과 echo용 명칭 (비상장주식·토지1 등). 미입력 시 "재상속재산 N". */
  name?: string;
  /**
   * 재상속분의 재산가액 = 1차(전의) 상속 당시 가액 (§30③, 2002.12.18 개정). §30②1호 분자.
   * 2차 평가액 아님.
   */
  priorValue: number;
}

/** 재산별 단기재상속 공제 1행 (결과 표 echo) */
export interface ShortTermReinheritPerAsset {
  name: string;
  /** 재상속분 재산가액(1차 당시) */
  priorValue: number;
  /** floor(전의 산출세액 × priorValue / 전의 상속재산가액) */
  base: number;
  /** floor(base × 공제율) */
  credit: number;
}

/** 상속세 세액공제 입력 */
export interface InheritanceTaxCreditInput {
  /** 증여세액공제 (§28) — 사전증여별 납부세액 (PriorGift에서 자동 계산) */
  priorGifts?: PriorGift[];
  /** 외국납부세액 (§29) — 외국 법령에 따라 부과된 상속세액 (한도 비교 대상 ②) */
  foreignTaxPaid?: number;
  /**
   * 국외 상속재산 과세표준 (§29 / 상증령 §21① 한도식 분자 ①).
   * 외국에서 상속세가 부과된 상속재산의 과세표준.
   * 미입력/0 → 한도 0 → 공제 0 (한도 조건 미충족, 자동 안분 아님).
   * 분모(전체 과세표준)는 엔진이 taxBase로 자동 주입.
   */
  foreignInheritanceTaxBase?: number;
  /**
   * 단기재상속 — 1차(전의) 상속개시일 ISO(YYYY-MM-DD). [신규]
   * 2차 = InheritanceTaxInput.deathDate. 두 날짜로 공제율 구간을 자동 도출
   * (deriveShortTermReinheritBand — 올림 banding). 미입력 시 legacy shortTermReinheritYears fallback.
   */
  shortTermReinheritPriorDeathDate?: string;
  /**
   * 단기재상속 — 재상속분 재산 배열 (재산별 구분 — 집행기준 30-22-1 ②). [신규]
   * 1건+ 입력 시 재산별 floor 계산·합산. 미입력 시 legacy lump(shortTermReinheritAssetValue) fallback.
   */
  shortTermReinheritAssets?: ShortTermReinheritAsset[];
  /**
   * 단기재상속 — 전의 상속세 **산출세액** (§30②1호 계수, 1차 상속 **전체**).
   * 필드명은 "TaxPaid"이나 의미는 산출세액(결정·납부세액·특정 상속인 몫 아님).
   */
  shortTermReinheritTaxPaid?: number;
  /**
   * 단기재상속 — 전의 상속재산가액 = 1차 **총상속재산(채무공제 전)** (§30②1호 분모).
   * 과세가액 아님. 미입력/0 시 전부재상속(분수=1) fallback.
   */
  shortTermReinheritPriorEstateValue?: number;
  /**
   * @deprecated shortTermReinheritPriorDeathDate + deathDate 자동 banding 권장.
   * priorDeathDate 부재 시 수동 band(공제율 구간 정수) fallback.
   */
  shortTermReinheritYears?: number;
  /**
   * @deprecated shortTermReinheritAssets 권장. 단일 분자(전부재상속 lump fallback).
   * 법령근거: 상증법 §30②1호 (대수적 약분 후 분자).
   */
  shortTermReinheritAssetValue?: number;
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
  /**
   * 창업자금 과세가액 한도 기준 — 10인 이상 신규 고용 여부 (§30의5①, D2)
   * true → 과세가액 한도 100억, false/undefined → 50억
   */
  startupNewHiresAtLeast10?: boolean;
  /**
   * 가업승계 특례 전용 — 가업 영위기간 (연수).
   * 한도 산정: 10년 이상 300억, 20년 이상 400억, 30년 이상 600억 (§30의6①)
   * 미입력 시 10년으로 간주 (300억 한도).
   */
  familyBusinessYears?: number;
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
   * §69 적용 신고세액공제율 (연도별, 상속개시일/증여일 기준).
   * 결과카드·신고서 양식 율 표시용 echo. 미전달 이력 호환: 표시 측 `?? 0.03` fallback.
   */
  filingCreditRate?: number;
  /**
   * §69 산식 노출용 — 산출세액 합계 (할증 포함).
   * = computedTax + generationSkipSurcharge
   * (= 엔진 `totalComputedTax`, inheritance-gift-tax-credit.ts:315).
   * §28의 ⑦(할증 전, `result.computedTax`)과 구분 필수.
   * 상속세 호출에는 현재 echo 미적용 → undefined 가능.
   */
  totalComputedTaxWithSurcharge?: number;
  /**
   * §29 외국납부세액공제 산식 표시용 echo (상증령 §21① 점유비 한도 적용 시 — inheritance).
   * `creditLimit` = 한도① = floor(computedTax × 국외과표 ÷ 전체과표),
   * `creditAmount` = 잔액 클램핑 후 최종 공제액. gift(§59)·미적용 시 undefined.
   */
  foreignCreditDetail?: {
    computedTax: number;
    foreignTaxPaid: number;
    foreignInheritanceTaxBase: number;
    overallTaxBase: number;
    creditLimit: number;
    creditAmount: number;
  };
  /**
   * §30 단기재상속 재산별 표 echo (상속세 + assets 입력 시). 결과뷰 TaxCreditBreakdownCard 렌더용.
   * 미적용·legacy lump 미입력 시 undefined.
   */
  shortTermReinheritDetail?: {
    /** 적용 공제율 구간 (deriveShortTermReinheritBand 결과) */
    band: number;
    /** 공제율 (0.0~1.0) */
    creditRate: number;
    /** 전의 상속세 산출세액(echo) */
    priorComputedTax: number;
    /** 전의 상속재산가액(채무공제 전, echo) */
    priorEstateValue: number;
    /** 재산별 표 (legacy lump = 1행) */
    perAsset: ShortTermReinheritPerAsset[];
    /** Σ per-asset.credit (§30③ 한도 적용 전) */
    creditAmount: number;
    /** §30③ 한도(= 산출세액 − §28 − §29, orchestrator remainingTax) */
    limit: number;
  };
}
