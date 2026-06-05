/**
 * 상속세·증여세 비과세 타입 (상증법 §11·§12·§46·§46의2)
 *
 * 800줄 정책으로 inheritance-gift.types.ts에서 분리 (2026-05-21).
 * barrel: inheritance-gift.types.ts에서 re-export.
 */

import type { CalculationStep } from "./inheritance-gift.types";

/**
 * 체크리스트 기반 비과세 항목 (ExemptionChecklist 컴포넌트 출력)
 * exemption-evaluator.ts에도 동일 인터페이스 export됨 (하위 호환)
 */
export interface ExemptionCheckedItem {
  ruleId: string;
  /** 해당 항목의 자산 가액 또는 금액 */
  claimedAmount: number;
  /** 장애인 신탁: 10년 합산 기사용 공제액 */
  priorDisabledTrustUsed?: number;
  /**
   * 공익법인 동족주식 초과분 금액 (§16 ②)
   * 5%(성실공익법인 10%) 초과 보유 주식의 시가 — 이 금액은 과세됨
   */
  excessStockAmount?: number;
  /** 공익법인 동족주식 5% 초과 보유 여부 (§16 ②) */
  relatedStockExceeded?: boolean;
  /** 혼인공제 기사용 여부 (§53의2 — 평생 1회) */
  marriageExemptionAlreadyUsed?: boolean;
  /** 면적 한도 항목의 실제 면적 (㎡) — 금양임야·묘토 */
  claimedAreaM2?: number;
  /** @deprecated claimedAreaM2 사용 권장 */
  areaM2?: number;
}

/**
 * 비과세 입력 (상증법 §11·§12·§46·§46의2)
 * @deprecated ExemptionCheckedItem[] 방식으로 대체됨.
 */
export interface ExemptionInput {
  /** 전사자 해당 여부 (§11) */
  isWarHero?: boolean;
  /** 국가·지자체·공공단체 유증 재산 금액 (§12 1호) */
  donatedToState?: number;
  /** 제사용 재산 — 족보·제구 (§12 3호, 민법 §1008의3) */
  ceremonialProperty?: number;
  /** 비과세 증여 — 사회통념상 금품·학자금·치료비 등 (§46) */
  socialNormGifts?: number;
  /** 공익법인 출연재산 (§46의2) */
  publicInterestContribution?: number;
}

/** 비과세 계산 결과 */
export interface ExemptionResult {
  totalExemptAmount: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}
