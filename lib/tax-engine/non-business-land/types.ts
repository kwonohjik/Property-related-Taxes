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
import type { SPORTS_OUTDOOR_STD, SPORTS_INDOOR_STD, RESERVE_FORCES_STD } from "./data/area-standards";

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
  /** 건물(비주택) 부수토지 — 「지방세법 시행령」 §101①2호. 주택(housing)과 **다른 조문**이다 */
  | "building_site"
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

/**
 * 부득이한 사유 유예기간 사유코드 (소득세법 시행령 §168조의14① + 시행규칙 §83조의5①).
 * §168조의14① 1~3호(법령 사용금지·보호구역·상속) + §83조의5① 1~12호(영 §168조의14①4호 위임).
 */
export type GraceReasonCode =
  // 시행령 §168조의14① 직접 (event_window — 사유 존속 기간 입력)
  | "use_prohibited"                // ①1호 법령 사용금지·제한
  | "protected_zone"                // ①2호 문화·자연유산 보호구역
  | "inherited_restricted"          // ①3호 1·2호 상속토지
  // 시행규칙 §83조의5① 1~12호
  | "building_permit_restricted"    // 1호 건축허가 제한 (단서: 매매업 매매용부동산 배제)
  | "construction_start_restricted" // 2호 착공 제한 (단서: 매매업 매매용부동산 배제)
  | "access_road"                   // 3호 사도·진입도로
  | "public_open_space"             // 4호 공공공지 제공 (착공일~제공종료일)
  | "construction_in_progress"      // 5호 건설 착공 (취득일+2년 ∪ 착공일~건설진행종료)
  | "mortgage_or_liquidation"       // 6호 저당권 실행·청산 분배 (취득일+2년)
  | "ownership_litigation"          // 7호 소유권 소송 계속
  | "urban_dev_buildable"           // 8호 도시개발 환지 건축가능 (건축가능일+2년)
  | "demolition"                    // 9호 건축물 멸실·철거·붕괴 (멸실일+5년)
  | "business_closure_relocation"   // 10호 휴·폐업·이전 (휴폐업·이전일+2년)
  | "natural_disaster_wasteland"    // 11호 천재지변 황지화 (사유발생일+2년)
  | "other_justifiable";            // 12호 그 밖의 정당한 사유

export interface BusinessUsePeriod {
  startDate: Date;
  endDate: Date;
  usageType: string;
}

export interface GracePeriod {
  reasonCode: GraceReasonCode;
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
  /** 좌표 (직선거리 30km 재촌 판정용, §153③3호). 농지=asset 좌표 파생. */
  lat?: number;
  lng?: number;
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
  /** 거주지 좌표 (직선거리 30km 재촌 판정용, §153③3호). 주소검색 파생. */
  lat?: number;
  lng?: number;
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
  /**
   * §168의14③3호나목 '취득일 소급' — 취득일(상속받은 토지는 피상속인 취득일,
   * §97의2① 이월과세는 증여자 취득일)이 고시일 5년 이전인지 판정하는 기준일.
   * 미제공 시 input.acquisitionDate(양수인 취득일=상속개시일/증여일) fallback.
   */
  expropriationAcquisitionDate?: Date;
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
// 지목별 사용 현황 — land-usage.types.ts 로 분리 (800줄 정책, 2026-08-05)
// ============================================================

import type {
  PastureUsage,
  VillaUsage,
  PropertyTaxType,
  NblRelatedBusinessType,
  NblParcel,
  FactoryIndustrySegment,
  FactoryLandUsage,
  OtherLandUsage,
  ForestUsageDetail,
  FarmlandDeemingInput,
} from "./land-usage.types";

export type {
  PastureUsage,
  VillaUsage,
  PropertyTaxType,
  NblRelatedBusinessType,
  NblParcel,
  FactoryIndustrySegment,
  FactoryLandUsage,
  OtherLandUsage,
  ForestUsageDetail,
  FarmlandDeemingInput,
};

// ============================================================
// 수입금액 비율 테스트 (§168-11 ②)
// ============================================================

export interface RevenueTestInput {
  businessType: NblRevenueBusinessType;
  /**
   * 당해 과세기간 수입금액 (원) — §168의11③3호 연환산 전 raw 기간수입금액.
   * currentBusinessDays·currentTaxYear가 제공되고 영위일수 < 해당연도총일수면 엔진이 연환산.
   */
  currentRevenue: number;
  /** 당해 과세기간 토지가액 (원) — 양도일 기준시가 §168의11④ */
  currentLandValue: number;
  /** 당해 과세기간 중 사업영위 일수(초일산입). 미제공 시 환산 안 함(계수 1) */
  currentBusinessDays?: number;
  /** 당해 과세연도(윤년 판정용 총일수 365/366). 미제공 시 환산 안 함 */
  currentTaxYear?: number;
  /** 직전 과세기간 수입금액 (원). 미제공 시 비율② 생략 */
  priorRevenue?: number;
  /** 직전 과세기간 토지가액 (원) */
  priorLandValue?: number;
  /** 직전 과세기간 중 사업영위 일수(초일산입). 미제공 시 직전 환산 안 함 */
  priorBusinessDays?: number;
  /** 직전 과세연도(윤년 판정용). 미제공 시 직전 환산 안 함 */
  priorTaxYear?: number;

  // §168의11③1호 간주임대료 — 전세금·보증금 (부가세법 시행령 §65① 준용)
  /** 당해 전세금·임대보증금 (원) */
  currentDeposit?: number;
  /** 당해 임대 과세대상기간 일수 */
  currentRentDays?: number;
  /** 당해 적용 정기예금이자율 분수(부가세칙 §47). 매퍼가 연도별 테이블에서 해소; 미검증 연도면 미제공 */
  currentDeemedRate?: { num: number; den: number };
  /** 직전 전세금·임대보증금 (원) */
  priorDeposit?: number;
  /** 직전 임대 과세대상기간 일수 */
  priorRentDays?: number;
  /** 직전 적용 정기예금이자율 분수 */
  priorDeemedRate?: { num: number; den: number };
  /** 간주임대료 입력은 있으나 해당 연도 율 미검증 → 적용 불가(경고) */
  deemedRateUnavailable?: boolean;

  // §168의11③2호 공통수입 안분 — 실지귀속 불가 공통수입금액
  /** 당해 공통수입금액 (원) */
  commonRevenue?: number;
  /** 당해 그 밖의 토지가액 (원) — 안분 분모 */
  otherLandValue?: number;
  /** 직전 공통수입금액 (원) */
  priorCommonRevenue?: number;
  /** 직전 그 밖의 토지가액 (원) */
  priorOtherLandValue?: number;
}

export interface RevenueTestResult {
  businessType: NblRevenueBusinessType;
  /** 업종별 기준비율 (시행규칙 §83의4) */
  threshold: number;
  /** 비율① 당해 (연환산) 수입 ÷ 당해 토지가액 */
  ratioCurrent: number;
  /** 비율② (당해+직전 연환산 수입) ÷ (당해+직전 토지가액). 직전 미제공 시 undefined */
  ratioCombined?: number;
  /** max(①,②) — §168의11② "큰 것" */
  actualRatio: number;
  pass: boolean;
  detail: string;
  /** §168의11③3호 연환산 후 당해 연간수입금액 (환산 미적용 시 raw와 동일) */
  annualizedCurrentRevenue: number;
  /** 연환산 후 직전 연간수입금액 (직전 제공 시). 환산 미적용 시 raw와 동일 */
  annualizedPriorRevenue?: number;
  /** 당해 영위일수 (echo) */
  currentBusinessDays?: number;
  /** 직전 영위일수 (echo) */
  priorBusinessDays?: number;
  /** 당해 또는 직전에 연환산이 적용되었는지 */
  annualizationApplied: boolean;
  /** §168의11③1호 당해 간주임대료 (원). 0이면 미적용 */
  deemedRentCurrent: number;
  /** 직전 간주임대료 (원) */
  deemedRentPrior: number;
  /** §168의11③2호 당해 공통수입 안분액 (원) */
  commonApportionedCurrent: number;
  /** 직전 공통수입 안분액 (원) */
  commonApportionedPrior: number;
  /** 간주임대료 입력 있으나 해당 연도 율 미검증으로 미적용된 경우 true (경고) */
  deemedRateUnavailable: boolean;
}

// ============================================================
// 입력 (NonBusinessLandInput)
// ============================================================

/**
 * 양도일 의제 사유 (소득세법 시행령 §168조의14② + 시행규칙 §83조의5②).
 * 의제일을 양도일로 보아 **§168조의6 기간기준만** 재판정한다.
 * 지목·도시지역·편입유예·무조건의제(§168조의14③)는 실제 양도일 유지.
 */
export type DeemedTransferReason =
  | "none" // 의제 없음 (실제 양도일)
  | "auction" // §168의14②1호 민사집행법 경매 → 최초 경매기일
  | "public_sale" // §168의14②2호 국세징수법 공매 → 최초 공매일
  | "kamco_consignment" // §83의5②1호 캠코 매각위임 → 매각 위임일
  | "newspaper_public_offering" // §83의5②2호 신문공고 → 최초 공고일
  | "republication"; // §83의5②3호 재공고 → 최초 공고일

export interface NonBusinessLandInput {
  landType: LandType;
  landArea: number;
  zoneType: ZoneType;
  acquisitionDate: Date;
  transferDate: Date;

  // §168조의14② 양도일 의제 (경매·공매·신문공고) — §168조의6 기간기준에만 적용
  deemedTransferReason?: DeemedTransferReason;
  deemedTransferDate?: Date;

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

  // 유예기간·부득이 사유 (§168조의14① + 시행규칙 §83조의5①). 사유별 종료일은 form-mapper가 자동산정.
  gracePeriods: GracePeriod[];

  /** §83조의5① 단서 — 부동산매매업 매매용부동산(1·2호 배제) 게이트 */
  isRealEstateDealerMatter?: boolean;

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

/** §168의11⑤ 필지별 비사업용 귀속 상세 1건 (결과 표시·감사용). Map 금지 — array. */
export interface ContiguousParcelNbl {
  id: string;
  landArea: number;
  acquisitionDate: Date;
  /** 귀속 후보 면적 — ⑤1호=landArea, ⑤2호=max(0, landArea − 바닥면적) */
  candidateArea: number;
  /** 이 필지에서 비사업용(기준면적 초과부분)으로 귀속된 면적(㎡) */
  nonBusinessArea: number;
}

export interface AreaProportioning {
  totalArea: number;
  businessArea: number;
  nonBusinessArea: number;
  nonBusinessRatio: number;
  buildingMultiplier: number;
  /** §168의11⑥ 복합용도 안분 시 특정용도분 비율(분자/분모, 사업용 비율). 미설정=① 호별·footprint·기간 안분 */
  mixedUseBuildingRatio?: number;
  /** §168의11⑤ 연접 다필지 취득시기순 안분 시 필지별 귀속 상세. 미설정=단일 필지 안분 */
  contiguousNblDetail?: ContiguousParcelNbl[];
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

  /** §168조의14② 양도일 의제 (경매·공매·신문공고) — 기간기준 판정 기준일 */
  deemedTransfer?: { reason: DeemedTransferReason; date: Date };

  /** §168의11② 수입금액비율 테스트 결과 (기타토지 + revenueTest 제공 시) */
  revenueTestDetail?: RevenueTestResult;

  surcharge: {
    surchargeType: "non_business_land";
    additionalRate: number;
    /** 비사업용 면적 비율 (기준면적 초과분 안분 중과 — 면적안분 없으면 1) 목장 §168의10③·기타토지 §168의11①·복합용도 §168의11⑥·연접 다필지 §168의11⑤·바닥면적 외 §101①2호나목 */
    nonBusinessAreaRatio: number;
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
  /** 재촌 인정 근거 (동일/연접/직선거리 30km + 거리) — 결과 카드 표시용 echo. */
  residenceMatch?: { matchType: "same" | "adjacent" | "within_30km"; distanceKm?: number };
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

  /** §168의11② 수입금액비율 테스트 결과 (judgeOtherLand에서 산출) */
  revenueTestDetail?: RevenueTestResult;

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
