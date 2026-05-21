/**
 * 가업상속공제 타입 (상증법 §18의2 + 상증령 §15)
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - 상증법 §18의2 mst=276123 (시행 2026-01-02)
 *   - 상증령 §15 mst=283637 (시행 2026-02-27)
 *
 * 800줄 정책으로 inheritance-gift.types.ts에서 분리.
 * barrel: inheritance-gift.types.ts에서 re-export.
 *
 * 계획서: docs/00-pm/inheritance-family-business-deduction-expansion.plan.md (v3)
 * 디자인: docs/02-design/features/inheritance-family-business-deduction/inheritance-family-business-deduction.engine.design.md (v2)
 */

import type { CalculationStep } from "./inheritance-gift.types";

/**
 * EstateItem.familyBusinessCategory — 가업상속 자산 분류 (상증법 §18의2 + 상증령 §15⑤).
 * UI에서 사용자가 EstateItem 카드에서 선택. farmingCategory와 동시 선택 불가 (validate 차단).
 */
export type FamilyBusinessCategory =
  | "business_real_estate"  // 가업용 부동산 (사업장·공장·창고·부속토지)
  | "business_equipment"    // 가업용 기계장치·설비
  | "corporate_stock"       // 가업 법인 주식 (사업무관자산 차감 후 — businessType="corporate" 한정)
  | "intangible_asset"      // 영업권·특허 등 가업 무형자산
  | "inventory"             // 가업 재고자산
  | "other";                // 기타 가업용 자산

/**
 * 가업상속 자격·요건 입력 (상증법 §18의2 + 상증령 §15).
 *
 * 신규 사용자는 본 객체 제공 권장. 미제공 시 legacy familyBusinessYears + familyBusinessValue fallback.
 * familyBusinessDirectAmount 제공 시 본 객체 무시 (Phase E escape hatch).
 */
export interface FamilyBusinessInheritanceInput {
  /** 가업 유형 — individual(소득세법 개인사업) / corporate(법인세법 법인). 지분 요건 분기 결정. */
  businessType: "individual" | "corporate";

  /** 영위 연수 (10/20/30년 한도 결정 — §18의2① 각 호). 10년 미만 시 자격 미충족. */
  operatingYears: number;

  /** 피상속인 사망일 (ISO date) — 신고기한 산정용. 미입력 시 InheritanceDeductionInput.deathDate fallback. */
  deathDate?: string;

  /** 기업 규모 — sme(중소) / medium(중견). medium은 §18의2② 200% 가드 활성화. */
  enterpriseSize: "sme" | "medium";
  /** 직전 3개 과세기간 평균 매출액 (원) — 중견기업 5천억 가드 (상증령 §15②3). */
  averageRevenue3Y?: number;
  /** 자산총액 (원) — 중소기업 5천억 가드 (상증령 §15①3). */
  totalAssets?: number;
  /** 별표 업종 영위 자기확인 (상증령 §15①1·②1). */
  isEligibleIndustry: boolean;

  // ─ 피상속인 요건 (상증령 §15③1호) ─
  /**
   * [corporate 전용] 최대주주등 + 특수관계인 합산 지분 — 40% (상장 20%) × 10년 보유 충족.
   * UI에서 사용자가 isListedOnExchange 토글의 hint를 보고 boolean 입력.
   */
  decedentMajorShareholdingMet?: boolean;
  /** 거래소 상장 여부 (corporate 전용) — UI hint 분기 (40% vs 20%). */
  isListedOnExchange?: boolean;
  /** 대표이사 종사 요건 (50%+ / 승계 후 10년 계속 / 10년 중 5년+ 중 1) — 상증령 §15③1호 나. */
  decedentCEORequirementMet: boolean;

  // ─ 상속인 요건 (상증령 §15③2호) ─
  /** 18세 이상 — 가. */
  heirIsAdult: boolean;
  /** 상속개시 전 영위기간 중 2년 이상 직접 가업 종사 — 나. */
  heirTwoYearEngagement: boolean;
  /** 피상속인 65세 미만 사망 or 천재지변·인재 사망 (2년 요건 면제) — 나 단서. */
  decedentEarlyDeath?: boolean;
  /** 신고기한까지 임원 취임 — 다. */
  heirOfficerByFilingDeadline: boolean;
  /** 신고기한 후 2년 이내 대표이사 취임 예정 — 라. */
  heirCEOWithinTwoYears: boolean;
  /**
   * 상속인의 배우자가 가~라 요건 모두 충족 → 상속인 충족 간주 (상증령 §15③2호 후단).
   * true 시 heirIsAdult·heirTwoYearEngagement·heirOfficerByFilingDeadline·heirCEOWithinTwoYears 평가 skip.
   */
  spouseFulfillsRequirements?: boolean;

  // ─ §18의2② 중견기업 외 상속재산 비율 가드 (200%) ─
  /** 가업상속인의 가업상속재산 외 상속재산 가액 (원) — 200% 가드 산정용. */
  heirOtherEstateValue?: number;
  /** 가업상속인 부담 채무 (원) — 200% 가드 산정용 차감 (상증령 §15⑥1호). */
  heirDebt?: number;

  // ─ 안내 동의 (사업무관자산 §15⑤2호 + 사후관리 §18의2⑤) ─
  /** 사업무관자산 차감 후 가액 직접 입력 동의 (UI sky tone 안내 카드). */
  unrelatedAssetsAcknowledged: boolean;
  /** 5년 사후관리 의무 인지·동의 (UI amber tone 안내 카드). */
  postManagementAcknowledged: boolean;

  // ─ 조세포탈·회계부정 §18의2⑧1호 ─
  /** 형 확정 (공제 배제) — short-circuit. */
  hasTaxFraudConviction?: boolean;
}

/**
 * 가업상속공제 미충족 사유 (상증법 §18의2 + 상증령 §15 기반 11종).
 */
export type FamilyBusinessIneligibleReason =
  | "operating_years_below_10"           // §18의2① 가업 정의 (10년 미만)
  | "enterprise_size_exceeded"           // 상증령 §15①3·②3 (자산 5천억 / 매출 5천억)
  | "industry_not_eligible"              // 상증령 §15①1·②1 별표 업종
  | "decedent_ceo_requirement_failed"    // 상증령 §15③1호 나
  | "decedent_majority_share_failed"     // 상증령 §15③1호 가 (40%/20%)
  | "heir_not_adult"                     // 상증령 §15③2호 가
  | "heir_engagement_short"              // 상증령 §15③2호 나
  | "heir_officer_not_appointed"         // 상증령 §15③2호 다
  | "heir_ceo_not_scheduled"             // 상증령 §15③2호 라
  | "medium_other_estate_exceeds_200pct" // §18의2② + 상증령 §15⑥⑦
  | "tax_fraud_conviction";              // §18의2⑧1호 (short-circuit)

/**
 * 가업상속공제 한도 (상증법 §18의2① 각 호).
 *   0: 자격 미충족 또는 10년 미만
 *   300억: 10~20년 (1호)
 *   400억: 20~30년 (2호)
 *   600억: 30년+ (3호)
 */
export type FamilyBusinessCap = 0 | 30_000_000_000 | 40_000_000_000 | 60_000_000_000;

/**
 * §18의2② 200% 가드 메타 (중견기업 한정 — enterpriseSize === "medium"일 때만 산정).
 */
export interface FamilyBusinessMediumGuard {
  /** 가업상속공제 미적용 시 산출세액 (가업상속인 부담분) */
  taxIfNoFBD: number;
  /** taxIfNoFBD × 2 (200% 상한) */
  cap200pct: number;
  /** 가업외 상속재산 − 채무 (heirOtherEstateValue − heirDebt) */
  otherEstateNet: number;
  /** otherEstateNet > cap200pct → 공제 배제 */
  exceeded: boolean;
}

/**
 * 가업상속공제 상세 결과 (정밀화 Phase B).
 */
export interface FamilyBusinessDeductionDetail {
  /** 자격 충족 여부 */
  eligible: boolean;
  /** 미충족 사유 (eligible=false 시) */
  ineligibleReasons?: FamilyBusinessIneligibleReason[];
  /** 적용 한도 (영위연수 기반, 자격 미충족 시 0) */
  appliedCap: FamilyBusinessCap;
  /** 영위 연수 (캡 결정 근거) */
  operatingYears: number;
  /** 자동 합산 가업 자산가액 (EstateItem familyBusinessCategory 합) */
  autoDerivedValue?: number;
  /** 사용자 수동 override 가액 (familyBusinessValue) */
  manualValue?: number;
  /** 최종 사용 가액 (manual ?? auto, 직접입력 모드 시 directAmount) */
  finalValue: number;
  /** 공제액 (eligible=false 시 0, 그 외 min(finalValue, appliedCap)) */
  deduction: number;
  /** 직접 입력 모드 사용 여부 (familyBusinessDirectAmount 사용 시 true) */
  usedDirectInput: boolean;
  /** 200% 가드 산정 메타 (중견기업 한정) */
  mediumGuard?: FamilyBusinessMediumGuard;
  /** breakdown — orchestrator가 전체 결과에 병합 */
  breakdown: CalculationStep[];
}

/**
 * 한도 (상증법 §18의2①).
 */
export const FAMILY_BUSINESS_CAP_10Y: FamilyBusinessCap = 30_000_000_000;  // 1호
export const FAMILY_BUSINESS_CAP_20Y: FamilyBusinessCap = 40_000_000_000;  // 2호
export const FAMILY_BUSINESS_CAP_30Y: FamilyBusinessCap = 60_000_000_000;  // 3호

/**
 * 중소·중견 5천억 임계 (상증령 §15①3·②3).
 */
export const FAMILY_BUSINESS_SCALE_THRESHOLD = 500_000_000_000;

/**
 * §18의2② 200% 비율 (상증령 §15⑦).
 */
export const FAMILY_BUSINESS_OTHER_ESTATE_RATIO = 2;
