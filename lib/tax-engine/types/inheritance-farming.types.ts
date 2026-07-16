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
import type { SigunguMatchKind } from "./inheritance-asset-location.types";

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
  /**
   * §16⑭1호 — 사업소득금액+총급여 3,700만 이상 과세기간 존재.
   * (2026.2.27 신설 §16⑭2호 분리 전 통합 필드였으나 이제 1호 전용으로 의미 축소)
   */
  hasDisqualifyingIncome?: boolean;
  /**
   * §16⑭2호 — 소득세법 §24①에 따른 사업소득 총수입금액이 소령 §208⑤2호 각 목 기준 이상인 과세기간
   * (2026.2.27 신설 — 농업·임업·어업·부동산임대업·농어가부업소득 제외).
   * true 시 해당 과세기간 영농 미종사로 판정. 1호(hasDisqualifyingIncome)와 OR 결합.
   */
  hasDisqualifyingGrossReceipt?: boolean;

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
  /** 피상속인 주소 (Vworld AddressSearch 영속화, A 작업 2026-05-22) — sessionStorage 복원 */
  decedentResidenceAddress?: { road?: string; jibun?: string; building?: string; detail?: string };
  /** 상속인 주소 (동일) */
  heirResidenceAddress?: { road?: string; jibun?: string; building?: string; detail?: string };
  /** 피상속인 거주지 시·군·구 코드 (v3 Phase 0 2026-05-22) — §16②1호나 동일/연접 OR 자동 판정 */
  decedentResidenceSigunguCode?: string;
  /** 상속인 거주지 시·군·구 코드 */
  heirResidenceSigunguCode?: string;
  /** 피상속인 — 산림지 §16②1호나 단서 "통상적으로 직접 경영할 수 있는 지역" (v4 C1-F, KoreanLaw 검증 2026-05-22). farmingCategory=forest_land일 때만 의미 */
  decedentForestManageableArea?: boolean;
  /** 상속인 — 산림지 단서 (동일) */
  heirForestManageableArea?: boolean;

  // ─ 부록 A: 상속인별 분리 자격 평가 (FH-1~6, 2026-05-22, KoreanLaw §16⑭ 검증 완료 `20f75e2`) ─
  /**
   * 상속인별 자격 평가 (선택). undefined 시 폼-수준 boolean을 모든 상속인에 동일 적용 (legacy).
   * 입력 시 deriveQualifiedHeirIds로 heirAssessments 중 자격 충족 상속인 자동 도출.
   * 명시 qualifiedHeirIds와 함께 입력 시 heirAssessments 자동 도출이 우선 (단, 사용자 명시 보장 옵션은 미지원 — 별도 PR).
   */
  heirAssessments?: FarmingHeirAssessment[];

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
  /** 한도 적용 후 최종 공제액 = Math.min(appliedAssetValue, appliedLimit). eligible=false 시 0 */
  cappedDeduction: number;
  /**
   * 적용 한도 (상속개시 연도별, §18의3① + 부칙) — resolveFarmingDeductionLimit(deathDate). 결과 카드 echo.
   * optional — 엔진(calcFarmingDeduction)은 반환 3곳 모두 항상 채우나, legacy detail mock 호환을 위해 optional.
   * 결과 카드는 `detail.appliedLimit || 3_000_000_000` fallback 처리.
   */
  appliedLimit?: number;
  /** 부록 A — heirAssessments 입력 시 자동 도출된 자격자 ID 수 (undefined 시 부록 A 미사용) */
  qualifiedHeirCount?: number;
  /** 부록 A — heirAssessments 입력 시 전체 평가 대상 heir 수 */
  totalHeirCount?: number;
  /**
   * v4.1.1 D8/14지점 ⑦ — §16②1호나 거주지 OR 자동 판정 결과 echo (옵션 C 산식 근거).
   * - type="personal"일 때만 생성. corporate 트랙(§16②2호)은 거주지 요건 없음 → undefined.
   * - legacy(farming=undefined) 또는 좌표·코드 미입력 시 matchKind null.
   * 결과 카드(InheritanceTaxResultView)에서 "§16②1호나 same_district 자동 확인" 산식 인용용.
   */
  residence?: {
    decedentMatchKind: SigunguMatchKind | null;
    heirMatchKind: SigunguMatchKind | null;
    decedentAutoMet: boolean | null;
    heirAutoMet: boolean | null;
    decedentMinDistanceKm: number | null;
    heirMinDistanceKm: number | null;
  };
}

/** 영농상속공제 자격 평가 결과 (evaluateFarmingEligibility 반환) */
export interface FarmingEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * 상속인별 자격 평가 (부록 A, 2026-05-22).
 * 영농상속공제 §16③ 본문 "상속인이 ... 요건을 충족하는 경우" + §16⑭ "피상속인 또는 상속인" 분리.
 */
export interface FarmingHeirAssessment {
  /** 상속인 ID — Heir.id 참조 */
  heirId: string;
  /** 18세 이상 — 상속인 단위 */
  heirIsAdult: boolean;
  /** 2년 직접 영농 종사 — 상속인 단위 (피상속인 65세 미만 사망 시 면제는 farming 폼-수준 decedentEarlyDeath로 일괄) */
  heirTwoYearFarming: boolean;
  /** 거주지 충족 (personal 전용) — 상속인 단위 */
  heirResidenceMet: boolean;
  /** [corporate] 신고기한 임원 + 2년 내 대표이사 — 상속인 단위 */
  heirCorporateOfficer?: boolean;
  /** 후계자 트랙 (재정경제부령) — 상속인 단위. true 시 18세·2년·거주 면제 */
  isDesignatedSuccessor?: boolean;
  /**
   * §16⑭1호 결격소득 — 상속인 단위 (사업소득금액+총급여 3,700만 이상)
   * "피상속인 또는 상속인" OR 분리 평가.
   */
  hasDisqualifyingIncome?: boolean;
  /**
   * §16⑭2호 결격 총수입금액 — 상속인 단위 (소령 §208⑤2호 기준 이상, 2026.2.27 신설).
   * hasDisqualifyingIncome과 OR 결합.
   */
  hasDisqualifyingGrossReceipt?: boolean;
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
  /**
   * 원래 상속세 과세표준 (영농공제 반영 후). §18의3④ 전단 추징세액 marginal 재계산 기준.
   * 추징세액 = 상속세(과세표준 + 산입액) − 상속세(과세표준). 이자상당액도 이 marginal 기준(§16⑧1호).
   */
  baseTaxableAmount: number;
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
  /** 상속세 과세가액 산입액 = originalDeduction × 100% (§16⑦) */
  taxableAmountAddback: number;
  /** 추징세액 = 상속세(과세표준 + 산입액) − 상속세(과세표준) (§18의3④ 전단 marginal) */
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
