/**
 * 영농상속공제 타입 (상증법 §18의3 + 시행령 §16)
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - §16②(피상속인 8년 종사·거주), §16③(상속인 2년·18세·후계자), §16④(직접 종사 4종),
 *     §16⑤(영농 자산), §16⑭(영농 부정), §18의3⑥(조세포탈)
 *
 * 800줄 정책으로 inheritance-gift.types.ts에서 분리 (2026-05-21).
 * barrel: inheritance-gift.types.ts에서 re-export.
 */

import type { CalculationStep } from "./inheritance-gift.types";

/**
 * 영농상속 자격 입력 (§18의3 + 시행령 §16).
 */
export interface FarmingInheritanceInput {
  /** 영농 유형 — personal(소득세법) / corporate(법인세법) */
  type: "personal" | "corporate";

  // ─ 피상속인 요건 (§16②) ─
  /** 8년 이상 직접 영농 종사 (질병·수용 1년 인정) — §16②1호가 (personal 전용) */
  decedentEightYearFarming: boolean;
  /** 거주지 충족 (자산 유형별 분기) — §16②1호나 (personal 전용) */
  decedentResidenceMet: boolean;
  /** [법인] 8년 경영 + 최대주주 50%+ 유지 — §16②2호 */
  decedentCorporateMet?: boolean;

  // ─ 상속인 요건 (§16③) ─
  /** 18세 이상 */
  heirIsAdult: boolean;
  /** 2년 이상 직접 영농 종사 (개인) 또는 법인 종사 (법인) */
  heirTwoYearFarming: boolean;
  /** 거주지 충족 (personal 전용) */
  heirResidenceMet: boolean;
  /** 피상속인 65세 미만 사망 or 천재지변·인재 사망 (상속인 2년 요건 면제) */
  decedentEarlyDeath?: boolean;
  /** [법인] 신고기한 내 임원 + 2년 내 대표이사 취임 예정 — §16③2호나 */
  heirCorporateOfficer?: boolean;
  /**
   * 후계자 트랙 — 재정경제부령 영농·영어·임업후계자 자격 (§16③ 본문 후단).
   * true 시 18세·2년·거주 요건 면제. 단 피상속인 요건·§16⑭·§18의3⑥은 적용.
   */
  isDesignatedSuccessor?: boolean;

  // ─ 영농 부정 §16⑭ (피상속인·상속인 모두 적용, 후계자 트랙 포함) ─
  /** 사업소득+총급여 3,700만 이상 과세기간 존재 */
  hasDisqualifyingIncome?: boolean;

  // ─ 조세포탈·회계부정 §18의3⑥ + 시행령 §15⑲ ─
  /** 형 확정 — true 시 공제 배제 (1호 결정 전 케이스 단순화. 2호 사후 추징은 F-7) */
  hasTaxFraudConviction?: boolean;

  // ─ §16② 단서 — 영농상속 후 최대주주 사망 적용 배제 (F-9, 2026-05-21) ─
  /**
   * 본 상속이 직전 영농상속 당시 최대주주등(상속받은 상속인 제외) 사망으로 개시된 두 번째 상속인 경우.
   * 시행령 §16② 단서: "제2호에 해당하는 경우로서 영농상속이 이루어진 후에 영농상속 당시 최대주주등에
   * 해당하는 사람(영농상속을 받은 상속인은 제외한다)의 사망으로 상속이 개시되는 경우는 적용하지 아니한다."
   * → corporate 트랙(§16②2호) 전용. true 시 다른 요건 무관 단독 종결.
   */
  isSecondaryAfterFarmingInheritance?: boolean;

  // ─ 거주지 좌표 자동 검증 (F-10, §16②1호나, 2026-05-21) ─
  /** 피상속인 주소 좌표 — 자동 30km 판정용. 미입력 시 사용자 boolean(decedentResidenceMet) 그대로 사용 */
  decedentResidenceLatLng?: { lat: number; lng: number };
  /** 상속인 주소 좌표 — 자동 30km 판정용. 미입력 시 사용자 boolean(heirResidenceMet) 그대로 사용 */
  heirResidenceLatLng?: { lat: number; lng: number };

  // ─ §16⑤ 본문 — 자격자 분배분만 영농상속재산가액 (F-11, 2026-05-21) ─
  /**
   * 자격 충족 상속인 ID 목록 (heirAllocations 연계).
   * - undefined: 모든 상속인 자격 충족 가정 (기존 동작 호환 — 전체 영농자산 합산)
   * - []: 명시 0건 — 자격자 없음 (영농상속재산가액 0)
   * - [...]: 명시 자격자 — heirAllocations 중 본 ID 분배분만 합산
   *
   * 시행령 §16⑤ 본문: "법 제18의3제1항에서 '영농상속 재산가액'이란 다음 각 호의 구분에 따라
   * 제3항의 요건을 갖춘 상속인이 받거나 받을 상속재산의 가액을 말한다."
   */
  qualifiedHeirIds?: string[];
}

/**
 * 영농상속공제 상세 (calcFarmingDeduction 반환).
 */
export interface FarmingDeductionDetail {
  /** 자격 충족 여부. farming 미입력(legacy) 시 true로 처리되나 evaluated=false로 구분 */
  eligible: boolean;
  /** 요건 평가 수행 여부 — farming=undefined 시 false (legacy 호환) */
  evaluated: boolean;
  /** 미충족 사유 (eligible=false 시) */
  ineligibleReasons: string[];
  /** 엔진이 받은 farmingAssetValue (사용자 명시 또는 UI suggest 결과 후 store에 저장된 값) */
  appliedAssetValue: number;
  /** 30억 한도 적용 후 최종 공제액 = Math.min(appliedAssetValue, FARMING_MAX). eligible=false 시 0 */
  cappedDeduction: number;
}

/** 영농상속공제 자격 평가 결과 (evaluateFarmingEligibility 반환) */
export interface FarmingEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/** 영농상속공제 한도 — §18의3① 30억 */
export const FARMING_MAX = 3_000_000_000;

// ============================================================
// F-7 사후관리 추징 (§18의3④ + §18의3⑥2호 + 시행령 §16⑥⑦⑧)
// ============================================================

/**
 * 사후관리 위반 사유.
 * - asset_disposed / farming_ceased: §18의3④ (5년 내 위반, §16⑥ 정당사유 적용 가능)
 * - tax_fraud_conviction / accounting_fraud: §18의3⑥2호 (5년 무관, 정당사유 미적용)
 */
export type FarmingPostMgmtViolation =
  | "asset_disposed"
  | "farming_ceased"
  | "tax_fraud_conviction"
  | "accounting_fraud";

/** §16⑥ 정당한 사유 7종 — violation ∈ {asset_disposed, farming_ceased}에만 적용 */
export type FarmingPostMgmtJustifiedReason =
  | "heir_death"               // 1. 상속인 사망
  | "overseas_relocation"      // 2. 해외이주법 해외이주
  | "expropriation"            // 3. 공익사업법 수용·협의매수
  | "government_transfer"      // 4. 국가·지자체 양도·증여
  | "land_exchange"            // 5. 영농상 농지 교환·분합·대토
  | "corporate_stock_disposal" // 6. 법인주식 처분 (물납 §73 / §15⑧3호) + 최대주주 유지
  | "other_similar";           // 7. 1~6호 유사 (재정경제부령)

export interface FarmingPostMgmtInput {
  /** 위반 사유 */
  violation: FarmingPostMgmtViolation;
  /** 사유 발생일 (ISO date YYYY-MM-DD) */
  violationDate: string;
  /** 상속세 신고기한 (= 상속개시일 + 6개월, §67) — 이자상당액 기산일 */
  filingDeadline: string;
  /** 사유 발생 시점의 결정세액 (이자상당액 기준액) */
  determinedTax: number;
  /**
   * 국세기본법 시행령 §43의3② 이자율 (소수, 예: 0.029 = 연 2.9%).
   * 시점별 개정 — 사용자 직접 입력 권장.
   */
  interestRate: number;
  /**
   * 정당한 사유 §16⑥ — violation ∈ {asset_disposed, farming_ceased}일 때만 적용.
   * §18의3⑥2호 트랙(tax_fraud·accounting_fraud)에는 무시.
   */
  justifiedReason?: FarmingPostMgmtJustifiedReason;
  /** [justifiedReason="corporate_stock_disposal"] 최대주주 유지 여부 */
  maintainsMajorShareholder?: boolean;
}

export interface FarmingPostMgmtResult {
  /** 추징 대상 여부 */
  recaptureRequired: boolean;
  /** 추징 면제 사유 (정당사유 인정 시) */
  exemptedBy?: FarmingPostMgmtJustifiedReason;
  /** 추징세액 = originalDeduction × 100% (§16⑦) */
  recaptureAmount: number;
  /** 이자상당액 (§16⑧) */
  interestAmount: number;
  /** 합계 */
  totalRecapture: number;
  /** 신고 기한 (사유 발생일 속하는 달 말일 + 6개월, §18의3⑦) */
  reportDeadline: string;
  /** 적용 일수 (filingDeadline+1 ~ violationDate) */
  interestDays: number;
  breakdown: CalculationStep[];
}

// `CalculationStep` re-export 의도가 아니므로 import만 유지 (다른 모듈이 본 파일을 통해 우회 import 방지)
export type { CalculationStep };
