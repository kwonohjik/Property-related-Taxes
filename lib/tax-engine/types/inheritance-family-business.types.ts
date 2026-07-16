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
  /** 피상속인 거주자/비거주자 — §18의2① "거주자의 사망으로" 요건. 비거주자면 부적격 (C-13). 미입력=거주자. */
  decedentType?: "resident" | "non_resident";

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
  /**
   * 18세 이상 — 가. (legacy boolean — 자동도출/override 미입력 시 fallback)
   * resolve 우선순위: heirIsAdultOverride > (heirId.birthDate ?? heirBirthDate 기반 자동) > 본 boolean.
   */
  heirIsAdult: boolean;
  /** 상속개시 전 영위기간 중 2년 이상 직접 가업 종사 — 나. (legacy boolean) */
  heirTwoYearEngagement: boolean;
  /** 피상속인 65세 미만 사망 or 천재지변·인재 사망 (2년 요건 면제) — 나 단서. (수동 토글 유지) */
  decedentEarlyDeath?: boolean;
  /** 신고기한까지 임원 취임 — 다. (legacy boolean) */
  heirOfficerByFilingDeadline: boolean;
  /** 신고기한 후 2년 이내 대표이사 취임 예정 — 라. (legacy boolean) */
  heirCEOWithinTwoYears: boolean;

  // ─ 요건 자동판정 기초데이터 (Phase 1, 2026-06-02) ─
  // store=기초데이터, 엔진=resolveFamilyBusinessRequirements가 계산 시점에 도출. (eligibility-autoderive.engine.design.md)
  /**
   * 가업상속인 Heir.id — 지정 상속인의 Heir.birthDate를 18세 판정에 재사용 (§20·§27과 단일소스).
   * corporate(영리법인)는 지정 불가(자연인 요건). orchestrator가 input.heirs에서 birthDate 도출.
   */
  heirId?: string;
  /** 가업상속인 생년월일 — heirId의 Heir.birthDate 미입력 시 fallback (ISO date). */
  heirBirthDate?: string;
  /** 상속인 가업종사 시작일 — 2년 종사(나목) 자동판정 (ISO date, 기존 heirEngagementPeriod string 승격). */
  heirEngagementStartDate?: string;
  /** 상속인 대표이사 취임(예정)일 — 라목 2년내 자동판정 (ISO date). */
  heirCEOAppointDate?: string;

  // ─ 요건 수동 override 3-state (undefined=자동도출 / true·false=수동, 상증령 §15③2호) ─
  /** 18세(가목) override — undefined=birthDate 자동, true/false=수동. */
  heirIsAdultOverride?: boolean;
  /** 2년 종사(나목) override. */
  heirTwoYearEngagementOverride?: boolean;
  /** 신고기한 임원취임(다목) override. */
  heirOfficerByFilingDeadlineOverride?: boolean;
  /** 2년내 대표이사(라목) override. */
  heirCEOWithinTwoYearsOverride?: boolean;

  // ─ 피상속인 요건 자동판정 기초데이터 (Phase 2, 2026-06-02, corporate) ─
  /** 가목 — 최대주주등+특수관계인 합산 지분율 (소수 0~1, 예 0.45). isListedOnExchange와 결합해 40%/20% 비교. */
  decedentShareRatioNum?: number;
  /** 가목 — 지분 취득(보유 시작)일 (ISO date). deathDate 기준 10년 이상 보유 자동판정. "계속 보유"는 override. */
  decedentShareAcquiredDate?: string;
  /** 나목 — 피상속인 대표이사 재직 구간 목록(비중첩). 1호(50%)·3호(소급10년중5년) 자동. 2호(승계)는 override. */
  decedentCEOPeriods?: Array<{ startDate: string; endDate: string }>;
  /** 가목 지분 요건 override — undefined=자동 / true·false=수동(계속보유 등). */
  decedentMajorShareholdingMetOverride?: boolean;
  /** 나목 대표이사 종사 override — undefined=자동(1·3호) / true·false=수동(2호 승계 등). */
  decedentCEORequirementMetOverride?: boolean;
  /**
   * 상속인의 배우자가 가~라 요건 모두 충족 → 상속인 충족 간주 (상증령 §15③2호 후단).
   * true 시 heirIsAdult·heirTwoYearEngagement·heirOfficerByFilingDeadline·heirCEOWithinTwoYears 평가 skip.
   */
  spouseFulfillsRequirements?: boolean;

  // ─ 복수가업 순차공제 (상증령 §15④ + 상증칙 §5, 2016.2.5.~) ─
  /**
   * 추가 가업 목록 — 피상속인이 둘 이상의 독립된 가업을 영위한 경우 (PR-4).
   * 주 가업(본 객체의 operatingYears + 가업가액)에 더해 영위연수·가업상속재산가액만 입력.
   * 각 추가 가업은 §15③ 요건을 충족함을 전제(요건 개별 판정은 후속). 미입력·빈 배열 = 단일 가업(기존 동작).
   * 총한도 = 가장 긴 기업 한도, 영위연수 내림차순 순차 공제 (상증칙 §5).
   */
  additionalFamilyBusinesses?: Array<{
    /** 추가 가업 영위 연수 (개별한도 결정). */
    operatingYears: number;
    /** 추가 가업의 가업상속재산가액 (원, 사업무관자산 차감 후). */
    businessValue: number;
    /** 표시용 라벨 (예: "B 제조법인"). 계산 미사용. */
    label?: string;
  }>;

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

  // ─ 기회발전특구 특례 (상증령 §15㉕, 2026-05-21 추가) ─
  /**
   * 본사 기회발전특구 소재·이전 (상증령 §15㉕1호 가·나).
   * - 가목: 본사를 기회발전특구로 이전
   * - 나목: 본사가 기회발전특구에 소재
   */
  isInOpportunityDevelopmentZone?: boolean;
  /**
   * 기회발전특구 상시근무인원 연평균이 전체 상시근무인원 연평균의 100분의 50 이상 (상증령 §15㉕2호).
   * isInOpportunityDevelopmentZone=true + 본 필드=true 모두 충족 시 다음 면제:
   *   - 상증령 §15③2호 라목 (신고기한 후 2년 내 대표이사 취임) 적용 배제
   *   - Phase F (사후관리) §15⑪1호 (대표이사 미종사) + §15⑪2호 (업종 변경) 적용 배제
   */
  ofzWorkforceRatio50PlusMet?: boolean;

  // ─ 조세포탈·회계부정 §18의2⑧1호 ─
  /** 형 확정 (공제 배제) — short-circuit. */
  hasTaxFraudConviction?: boolean;

  // ─ 별지 제1호서식 표시 전용 식별정보 (계산 미사용, 신고서 자동채움) ─
  /** 가. 사업자등록번호 */
  businessRegistrationNumber?: string;
  /** 가. 성명(대표자) */
  representativeName?: string;
  /** 가. 대표자 주민등록번호 */
  representativeResidentNumber?: string;
  /** 가. 개업연월일 (ISO date) */
  openingDate?: string;
  /** 가. 업종 */
  industryName?: string;
  /** 다. 피상속인 대표이사 재직기간 (표시 텍스트, 예 "20년") */
  decedentCeoTenure?: string;
  /** 다. 특수관계인포함 지분율 (표시 텍스트, 예 "60%") */
  decedentShareRatio?: string;
  /** 라. 가업상속인 가업종사기간 (표시 텍스트) */
  heirEngagementPeriod?: string;
  /** 라. 임원/대표이사 취임일 (ISO date) */
  heirOfficerAppointDate?: string;
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
  | "tax_fraud_conviction"               // §18의2⑧1호 (short-circuit)
  | "decedent_non_resident";             // §18의2① "거주자의 사망으로" — 비거주자 배제 (C-13)

/**
 * 가업상속공제 한도 (상증법 §18의2① 각 호 + 개정연혁).
 *   0: 자격 미충족 또는 10년 미만
 *   현행(2023.1.1.~): 300억(10~20) / 400억(20~30) / 600억(30+)
 *   개정연혁(deathDate 시기별): 200억·500억 추가 (2014~2017·2018~2022본)
 *     - 2018~2022: 200억(10~20) / 300억(20~30) / 500억(30+)
 *     - 2014~2017: 200억(10~15) / 300억(15~20) / 500억(20+)
 */
export type FamilyBusinessCap =
  | 0
  | 20_000_000_000
  | 30_000_000_000
  | 40_000_000_000
  | 50_000_000_000
  | 60_000_000_000;

/**
 * 복수가업 순차공제 단위 (상증칙 §5 — PR-4).
 * 주 가업 + 추가 가업을 동일 형태로 모아 순차 공제.
 */
export interface FamilyBusinessUnit {
  /** 영위 연수 (개별한도·순서 결정) */
  operatingYears: number;
  /** 가업상속재산가액 (원, 사업무관자산 차감 후) */
  value: number;
  /** 표시용 라벨 */
  label?: string;
}

/** 복수가업 순차공제 명세 행 (영위연수 내림차순 1행 = 1기업) */
export interface MultipleFamilyBusinessLineItem {
  /** 공제 순서 (1부터, 영위연수 긴 순) */
  order: number;
  operatingYears: number;
  /** 가업상속재산가액 */
  value: number;
  /** 영위연수별 개별한도 (familyBusinessCap) */
  individualCap: FamilyBusinessCap;
  /** 차감 전 잔여 총한도 (해당 행 진입 시점) */
  remainingTotalCapBefore: number;
  /** 공제액 = Min(잔여 총한도, 가업가액, 개별한도) */
  deduction: number;
  label?: string;
}

/**
 * 복수가업 순차공제 결과 (상증령 §15④ + 상증칙 §5).
 *   - totalCap = 가장 긴 기업의 한도 (총한도)
 *   - 영위연수 내림차순으로 잔여 총한도를 차감하며 순차 공제
 *   - totalDeduction ≤ totalCap
 */
export interface MultipleFamilyBusinessResult {
  /** 총한도 (가장 긴 기업의 한도) */
  totalCap: FamilyBusinessCap;
  /** 기업별 명세 (영위연수 내림차순) */
  lineItems: MultipleFamilyBusinessLineItem[];
  /** 공제 합계 (≤ totalCap) */
  totalDeduction: number;
}

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
  /**
   * 가드 평가 활성 여부 (안전장치, 계획서 §5-1).
   * taxIfNoFBD ≤ 0(orchestrator 미연동·미산정)이면 false → exceeded 강제 false(오배제 차단).
   * true일 때만 200% 비교가 유효. UI는 false 시 "미평가" 안내.
   */
  active: boolean;
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
  /**
   * 가업상속공제 적용률 (소득세법 시행령 §163의2③ — Track 2/4 prefill 소스).
   * 산식: deduction / finalValue (분모 0 시 0).
   * 개인가업(§163의2③1호) + 법인가업(§163의2③2호) 자산별 단순화 — 본 PR 통일 산식.
   * 자산별 분리(법인 사업관련자산 / 총자산)는 후속 PR transfer-fb-cgt-credit-integration.
   * 범위: 0 ≤ appliedRate ≤ 1.
   */
  appliedRate: number;
  /** 직접 입력 모드 사용 여부 (familyBusinessDirectAmount 사용 시 true) */
  usedDirectInput: boolean;
  /** 200% 가드 산정 메타 (중견기업 한정) */
  mediumGuard?: FamilyBusinessMediumGuard;
  /**
   * 복수가업 순차공제 명세 (상증령 §15④ + 상증칙 §5 — PR-4).
   * additionalFamilyBusinesses 입력 시에만 존재. 단일 가업이면 undefined.
   * 이 경우 deduction = totalDeduction, appliedCap = totalCap, finalValue = 전체 가업가액 합.
   */
  multipleBusinessDetail?: MultipleFamilyBusinessResult;
  /**
   * 기회발전특구 특례 활성 여부 (상증령 §15㉕).
   * true 시 heirCEOWithinTwoYears 요건 면제 적용. UI 결과 카드에 emerald tone 안내.
   */
  ofzExemptionActive?: boolean;
  /**
   * 요건 자동판정 메타 (Phase 1, 2026-06-02) — resolveFamilyBusinessRequirements 결과.
   * UI 결과카드가 신고기한·요건별 판정근거(auto/override/legacy) 노출. 미제공 시(legacy 경로) undefined.
   */
  resolvedRequirements?: {
    /** §67 신고기한 (다목·라목 판정 근거 — 결과 표시용) */
    filingDeadline: string;
    /** 요건별 판정 출처 (Phase 1 heir 4종 + Phase 2 decedent 2종) */
    source: Partial<
      Record<
        | "heirIsAdult"
        | "heirTwoYearEngagement"
        | "heirOfficerByFilingDeadline"
        | "heirCEOWithinTwoYears"
        | "decedentMajorShareholdingMet"
        | "decedentCEORequirementMet",
        "auto" | "override" | "legacy"
      >
    >;
  };
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
