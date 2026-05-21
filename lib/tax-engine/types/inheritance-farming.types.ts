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

// `CalculationStep` re-export 의도가 아니므로 import만 유지 (다른 모듈이 본 파일을 통해 우회 import 방지)
export type { CalculationStep };
