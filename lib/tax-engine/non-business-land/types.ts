/**
 * 비사업용 토지 판정 v2 엔진 — 공통 타입
 *
 * PDF "비사토 판정 흐름도" (세법 실무교재 제5절, p.1695~1707)와
 * 현행 소득세법 §104-3 / 시행령 §168-6~14 기준.
 *
 * 기존 `lib/tax-engine/non-business-land.ts` v1 타입과 키를 호환 유지하면서
 * v2 필드를 확장 — Phase D-2에서 wrapper 전환 시 v1 파일이 이 파일을 재-export 한다.
 */

import type { NblRevenueBusinessType } from "../legal-codes";

// ============================================================
// 기본 원시 타입
// ============================================================

/** 폐쇄 날짜 구간 [start, end). start은 포함, end는 불포함. */
export interface DateInterval {
  start: Date;
  end: Date;
}

/** 토지 지목 (v1 호환) */
export type LandType =
  | "farmland"       // 농지 (전·답·과수원 통합 레거시)
  | "paddy"          // 답 (NBL-11)
  | "field"          // 전 (NBL-11)
  | "orchard"        // 과수원 (NBL-11)
  | "forest"         // 임야
  | "pasture"        // 목장용지
  | "vacant_lot"     // 나대지
  | "building_site"  // 건물 부수 토지
  | "housing_site"   // 주택 부수 토지
  | "villa_land"     // 별장부수토지
  | "other_land"     // 기타토지 (나대지·잡종지)
  | "miscellaneous"  // 잡종지
  | "other";

/** PDF 지목 분류 그룹 (Land Category Group) */
export type LandCategoryGroup =
  | "farmland"
  | "forest"
  | "pasture"
  | "housing"
  | "villa"
  | "other_land"
  | "unknown";

/** 용도지역 */
export type ZoneType =
  | "residential"
  | "exclusive_residential"
  | "general_residential"
  | "semi_residential"
  | "commercial"
  | "industrial"
  | "green"
  | "management"
  | "agriculture_forest"
  | "natural_env"
  | "unplanned"
  | "undesignated";

// ============================================================
// 유예기간 / 부득이한 사유
// ============================================================

export type GracePeriodType =
  | "inheritance"
  | "legal_restriction"
  | "sale_contract"
  | "construction"
  | "unavoidable"
  | "preparation"
  | "land_replotting";

export type UnavoidableReasonType =
  | "illness"
  | "elderly"
  | "military"
  | "emigration"
  | "expropriation"
  | "bankruptcy";

export interface UnavoidableReason {
  type: UnavoidableReasonType;
  startDate: Date;
  endDate: Date;
  description?: string;
}

export interface BusinessUsePeriod {
  startDate: Date;
  endDate: Date;
  usageType: string;
}

export interface GracePeriod {
  type: GracePeriodType;
  startDate: Date;
  endDate: Date;
}

// ============================================================
// 위치 / 주거 이력 (신규)
// ============================================================

export interface LocationInfo {
  sidoCode?: string;
  sigunguCode?: string;
  distanceKm?: number;
  hasResidentRegistration?: boolean;
}

/**
 * 소유자 주거 이력 1건 (신규 — 농지·임야 재촌 기간 산출용).
 * 여러 건을 배열로 입력하면 각 구간별로 토지 소재지와 매칭해
 * "재촌 기간"을 자동 산출한다.
 */
export interface OwnerResidenceHistory {
  sidoCode?: string;
  sidoName: string;
  sigunguCode?: string;
  sigunguName: string;
  eupmyeondongName?: string;
  startDate: Date;
  /** 현재 거주 중이면 양도일 또는 미래 날짜 */
  endDate: Date;
  /** 주민등록 여부 — 임야 재촌 필수 요건 */
  hasResidentRegistration: boolean;
}

/** 소유자 프로필 (신규) */
export interface OwnerProfile {
  residenceHistories: OwnerResidenceHistory[];
  /** 공동소유 지분 (1=100%). 미지정 시 1로 간주. 대법원 2015두39439 */
  ownershipRatio?: number;
}

// ============================================================
// 무조건 사업용 의제 (§168-14 ③)
// ============================================================

export type UnconditionalExemptionReason =
  | "inheritance_before_2007"
  | "long_owned_20years"
  | "ancestor_8year_farming"
  | "public_expropriation"
  | "factory_adjacent"
  | "inong"
  | "jongjoong_owned"
  | "jongjoong_or_inherit_urban_farmland"
  | "none";

export interface UnconditionalExemptionInput {
  isInheritedBefore2007?: boolean;
  inheritanceDate?: Date;
  ownedOver20YearsBefore2007?: boolean;
  isAncestor8YearFarming?: boolean;
  isPublicExpropriation?: boolean;
  publicNoticeDate?: Date;
  isFactoryAdjacent?: boolean;
  isInong?: boolean;
  inongDate?: Date;
  isJongjoongOwned?: boolean;
  jongjoongAcquisitionDate?: Date;
  /**
   * §168-14 ③4호: 도시지역 內 농지로서 종중(2005.12.31 이전 취득) 또는
   * 상속 5년 이내 양도에 해당하는지. v2 신규.
   */
  isUrbanFarmlandJongjoongOrInherited?: boolean;
}

// ============================================================
// 지목별 사용 현황
// ============================================================

export interface PastureUsage {
  isLivestockOperator: boolean;
  livestockType?: string;
  livestockCount?: number;
  standardArea?: number;
  /** 축산업 영위 기간 (여러 구간 가능) — v2 신규 */
  livestockPeriods?: BusinessUsePeriod[];
  /** §168-10 ②1호 상속 3년 이내 목장용지 (상속개시일) — v2 신규 */
  inheritanceDate?: Date;
  /**
   * §168-10 ②3호 사회복지법인·학교·종교·정당이 사업에 직접 사용 — v2 신규.
   * (OwnerType 미도입 버전에서 boolean 플래그로 처리)
   */
  isSpecialOrgUse?: boolean;
}

export interface VillaUsage {
  villaUsePeriods: BusinessUsePeriod[];
  isEupMyeon: boolean;
  isRuralHousing: boolean;
  isAfter20150101?: boolean;
}

export type PropertyTaxType =
  | "exempt"          // 비과세·면제 (v2 추가)
  | "separate"
  | "special_sum"
  | "comprehensive";

export interface OtherLandUsage {
  propertyTaxType: PropertyTaxType;
  hasBuilding: boolean;
  buildingFloorArea?: number;
  buildingStandardValue?: number;
  landStandardValue?: number;
  isRelatedToResidenceOrBusiness: boolean;
}

export interface ForestUsageDetail {
  isPublicInterest?: boolean;
  hasForestPlan?: boolean;
  isSpecialForestZone?: boolean;
  isForestSuccessor?: boolean;
  /** §168-9 ③7호: 상속개시일부터 3년 경과 전 임야 (보존 유지) */
  inheritedForestWithin3Years?: boolean;
  /** @deprecated 변수명 오류 수정 — `inheritedForestWithin3Years` 사용. 2026-04-21까지 호환 */
  inheritedForestWithin5Years?: boolean;
  forestInheritanceDate?: Date;
}

export interface FarmlandDeemingInput {
  isWeekendFarm?: boolean;
  isFarmConversionApproved?: boolean;
  isFarmDevZone?: boolean;
  isMarginalFarmProject?: boolean;
  isReclaimed?: boolean;
  isPublicProjectUse?: boolean;
  isSickElderlyRental?: boolean;
}

// ============================================================
// 수입금액 비율 테스트 (§168-11 ②)
// ============================================================

export interface RevenueTestInput {
  businessType: NblRevenueBusinessType;
  annualRevenue: number;
  landValue: number;
}

export interface RevenueTestResult {
  businessType: NblRevenueBusinessType;
  threshold: number;
  actualRatio: number;
  pass: boolean;
  detail: string;
}

// ============================================================
// 입력 (NonBusinessLandInput)
// ============================================================

export interface NonBusinessLandInput {
  landType: LandType;
  landArea: number;
  zoneType: ZoneType;
  acquisitionDate: Date;
  transferDate: Date;

  // 농지
  farmingSelf?: boolean;
  /** @deprecated v2에서는 `ownerProfile` 사용을 권장 */
  farmerResidenceDistance?: number;
  landLocation?: LocationInfo;
  ownerLocation?: LocationInfo;
  adjacentSigunguCodes?: string[];
  farmlandDeeming?: FarmlandDeemingInput;

  // 임야
  /** @deprecated v2에서는 `forestDetail.hasForestPlan` 사용 */
  forestManagementPlan?: boolean;
  forestDetail?: ForestUsageDetail;

  // 목장
  pasture?: PastureUsage;
  // 별장
  villa?: VillaUsage;
  // 기타토지
  otherLand?: OtherLandUsage;

  // 무조건 의제
  unconditionalExemption?: UnconditionalExemptionInput;

  // 도시지역 편입
  urbanIncorporationDate?: Date;

  // 사업용 사용기간
  businessUsePeriods: BusinessUsePeriod[];

  // 면적 안분
  buildingFootprint?: number;
  housingFootprint?: number;
  /** 주택부수토지: 도시지역 안/밖. @deprecated v2는 zoneType+수도권여부로 자동 산출 */
  isUrbanArea?: boolean;
  /** v2: 수도권 소재 여부 (주택부수토지 §168-12 배율 결정) */
  isMetropolitanArea?: boolean;

  // 유예기간·부득이 사유
  gracePeriods: GracePeriod[];
  unavoidableReasons?: UnavoidableReason[];

  // 수입금액
  revenueTest?: RevenueTestInput;

  // v2 신규 — 소유자 주거 이력
  /**
   * 소유자 주거 이력. 농지·임야 재촌 기간을 프로그램적으로 산출하는 데 사용.
   * 미제공 시 legacy `farmerResidenceDistance` fallback.
   */
  ownerProfile?: OwnerProfile;
}

// ============================================================
// 판정 결과 (NonBusinessLandJudgment)
// ============================================================

export type StepStatus = "PASS" | "FAIL" | "SKIP" | "NOT_APPLICABLE";

export interface JudgmentStep {
  id: string;
  label: string;
  status: StepStatus;
  detail: string;
  legalBasis?: string;
}

export interface AreaProportioning {
  totalArea: number;
  businessArea: number;
  nonBusinessArea: number;
  nonBusinessRatio: number;
  buildingMultiplier: number;
}

/** 판정 엔진 반환 액션 (v2 신규 — 별장 REDIRECT 경로 지원) */
export type JudgmentAction =
  | "DETERMINED"            // 사업용/비사업용 확정
  | "REDIRECT_TO_CATEGORY"; // 별장 비사용기간 충족 → 다른 지목 재판정 요청

export interface NonBusinessLandJudgment {
  /** 판정 결과 — REDIRECT인 경우 undefined */
  isNonBusinessLand: boolean;
  judgmentReason: string;

  /** v2: 엔진 액션 (REDIRECT 경로 지원) */
  action?: JudgmentAction;
  /** v2: 재판정 힌트 (REDIRECT 시) */
  redirectHint?: string;
  /** v2: UI 쪽에 재입력 배너 노출 플래그 */
  needsRedirect?: boolean;

  totalOwnershipDays: number;
  businessUseDays: number;
  gracePeriodDays: number;
  effectiveBusinessDays: number;
  businessUseRatio: number;

  criteria: {
    rule80Percent: boolean;
    rule5Years: boolean;
    rule2of3Years: boolean;
  };

  areaProportioning?: AreaProportioning;

  surcharge: {
    surchargeType: "non_business_land";
    additionalRate: number;
    longTermDeductionExcluded: boolean;
    basicDeductionApplied: boolean;
  };

  unconditionalExemption?: {
    isApplied: boolean;
    reason: UnconditionalExemptionReason;
    detail: string;
  };

  urbanIncorporationGrace?: {
    isApplied: boolean;
    graceYears: 2 | 3;
    graceEndDate: Date;
  };

  appliedLawArticles: string[];
  warnings: string[];
  judgmentSteps: JudgmentStep[];

  /** v2: 실제로 산출된 재촌 기간 (농지·임야 디버깅·감사용) */
  residencePeriodsUsed?: DateInterval[];
}

// ============================================================
// DB 주입형 판정 기준 규칙
// ============================================================

export interface NonBusinessLandJudgmentRules {
  type: "non_business_land_judgment";
  /**
   * @deprecated v1 레거시 — 주택부수토지 배율은 v2에서 `getHousingMultiplier()`
   * (`urban-area.ts`) 가 §168-12 기준으로 직접 반환. 이 필드는 기타토지·건물 부수토지
   * 면적 안분(`lib/tax-engine/non-business-land.ts` v1 엔진)에서만 사용된다.
   * 신 v2 엔진의 `judgeHousingLand`·`judgeOtherLand` 는 이 필드를 읽지 않는다.
   * (Bug-05 정리: 이중 시스템 명시)
   */
  buildingAreaMultipliers: {
    residential: number;
    exclusive_residential?: number;
    general_residential?: number;
    semi_residential?: number;
    commercial: number;
    industrial: number;
    green: number;
    management: number;
    agriculture_forest: number;
    natural_env: number;
    unplanned?: number;
    undesignated: number;
  };
  farmlandDistanceKm: number;
  exemptionPeriods: {
    inheritance: number;
    construction: number;
    unavoidable: number;
    preparation: number;
    sale_contract: number;
  };
  urbanIncorporationGrace?: {
    changeDate: string;
    graceYearsOld: number;
    graceYearsNew: number;
  };
  unconditionalExemptionDates?: {
    inheritanceCutoff: string;
    transferCutoffForLegacy: string;
    jongjoongCutoff: string;
    publicExpropriation5YearsDate: string;
    publicExpropriation2YearsDate: string;
  };
  /**
   * 기간 기준 비율. 2015.2.2 이전 양도분에 대해 농·임·목만 80% 적용.
   * 현행법은 0.6 (사업용 60% = 비사업용 40% 초과의 부정).
   */
  periodCriteriaThresholds?: {
    oldThresholdDate: string;
    oldThresholdRatio: number;
    currentThresholdRatio: number;
  };
}

export const DEFAULT_NON_BUSINESS_LAND_RULES: NonBusinessLandJudgmentRules = {
  type: "non_business_land_judgment",
  buildingAreaMultipliers: {
    residential: 4,
    exclusive_residential: 5,
    general_residential: 4,
    semi_residential: 3,
    commercial: 3,
    industrial: 4,
    green: 7,
    management: 7,
    agriculture_forest: 7,
    natural_env: 7,
    unplanned: 4,
    undesignated: 7,
  },
  farmlandDistanceKm: 30,
  exemptionPeriods: {
    inheritance: 5,
    construction: 2,
    unavoidable: 2,
    preparation: 2,
    sale_contract: 2,
  },
  urbanIncorporationGrace: {
    changeDate: "2015-02-02",
    graceYearsOld: 2,
    graceYearsNew: 3,
  },
  unconditionalExemptionDates: {
    inheritanceCutoff: "2006-12-31",
    transferCutoffForLegacy: "2009-12-31",
    jongjoongCutoff: "2005-12-31",
    publicExpropriation5YearsDate: "",
    publicExpropriation2YearsDate: "",
  },
  periodCriteriaThresholds: {
    oldThresholdDate: "2015-02-02",
    oldThresholdRatio: 0.8,
    // v2: 현행법 §168-6 "100분의 40 초과 비사업용" = "60% 이상 사업용"
    currentThresholdRatio: 0.6,
  },
};

// ============================================================
// 판정 내부 유틸 — 헬퍼 타입
// ============================================================

/** 농지계 지목 여부 (전·답·과수원 + legacy farmland) */
export function isFarmlandType(landType: LandType): boolean {
  return (
    landType === "farmland" ||
    landType === "paddy" ||
    landType === "field" ||
    landType === "orchard"
  );
}

// ============================================================
// 지목별 judge 공통 반환 타입 (내부 — engine.ts에서 조립)
// ============================================================

export interface CategoryJudgeResult {
  isBusiness: boolean;
  reason: string;
  steps: JudgmentStep[];
  appliedLaws: string[];
  areaProportioning?: AreaProportioning;

  // v2 별장 REDIRECT 경로
  action?: JudgmentAction;
  redirectHint?: string;

  // 기간 분석 정보
  totalOwnershipDays: number;
  effectiveBusinessDays: number;
  gracePeriodDays: number;
  businessUseRatio: number;
  criteria: {
    rule2of3Years: boolean;
    rule5Years: boolean;
    rule80Percent: boolean;
  };
  /** 실제 산출된 재촌 기간 (감사용) */
  residencePeriodsUsed?: DateInterval[];
  warnings?: string[];
}
