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
  /** 농어촌주택 경로 진입 여부. true여도 아래 3요건(§168의13①1~3호) 모두 충족해야 사업용 의제 */
  isRuralHousing: boolean;
  /** §168의13①1호 건물 연면적(㎡) — 150 이내 요건 */
  buildingFloorArea?: number;
  /** §168의13①1호 건물 부속토지면적(㎡) — 660 이내 요건. 자산 전체 landArea와 별개(부속토지 전용) */
  attachedLandArea?: number;
  /** §168의13①2호 건물+부속토지 합산 기준시가(원) — 2억 이하 요건 */
  combinedStdValue?: number;
  /** §168의13①3호 조특법 §99의4①1호가목1)~4) 제외지역(수도권·도시지역·조정대상지역·허가구역) 소재 여부. true=제외지역=요건 미충족 */
  isInRestrictedArea?: boolean;
  /** @deprecated 산식 미반영(엔진 미소비) — 하위호환 잔존. 제거는 별도 정리 작업 */
  isAfter20150101?: boolean;
}

export type PropertyTaxType =
  | "exempt"          // 비과세·면제 (v2 추가)
  | "separate"
  | "special_sum"
  | "comprehensive";

/**
 * §168의11① 호별 분기 — 면적기준 정밀판정.
 * 면적기준 자동산출: parking_garage(최저차고×1.5)·youth_training(수용정원×200㎡)·
 * hatchang(최대면적×1.2)·vacant_lot_1household(660㎡ 고정).
 * 별표 직접입력(standardAreaLimit): sports(별표3/4/5)·parking_attached(설치기준면적)·
 * reserve_forces(별표6제2호)·resort(휴양시설업 합산면적).
 * 면적기준 없음(boolean 유지): etc_14호(유사토지)·none.
 * 수입금액비율(2호다·10·11다·12호)은 §168의11② revenueTest 별도 경로.
 */
export type NblRelatedBusinessType =
  | "sports"                // 1호 체육시설 (별표3/4/5 — standardAreaLimit 직접입력)
  | "parking_attached"      // 2호 가목 부설주차장 (설치기준면적 직접입력)
  | "parking_garage"        // 2호 나목 업무용자동차 주차장 (최저차고기준면적 × 1.5)
  | "youth_training"        // 4호 청소년수련시설 (수용정원 × 200㎡ 초과 제외)
  | "reserve_forces"        // 5호 다목 예비군훈련 (별표6 제2호 — standardAreaLimit)
  | "resort"                // 6호 휴양시설업 (합산 기준면적 직접입력)
  | "hatchang"              // 7호 하치장·야적장 (최대면적 × 120%)
  | "vacant_lot_1household" // 13호 무주택1세대 1필지 나지 (660㎡ 고정)
  | "etc_14호"              // 14호 유사토지 (면적기준 없음 — boolean 유지)
  | "none";                 // 호 미해당 (재산세유형·기간기준만)

export interface OtherLandUsage {
  propertyTaxType: PropertyTaxType;
  hasBuilding: boolean;
  /** §101①2호나목 — 건축물 바닥면적(㎡, 시설은 수평투영면적). 2% 미달 시 이 면적만 별도합산(사업용) 유지·잔여 부속토지는 종합합산(비사업용). 배율 미적용(나목 carve-out은 바닥면적 자체·연면적 아님). VillaUsage.buildingFloorArea(별개)와 동명이타입 — 무관 */
  buildingFloorArea?: number;
  buildingStandardValue?: number;
  landStandardValue?: number;
  isRelatedToResidenceOrBusiness: boolean;
  /** §168의11① 호별 분기. 미설정 시 legacy isRelatedToResidenceOrBusiness fallback. */
  relatedBusinessType?: NblRelatedBusinessType;
  /** 별표/설치기준 직접입력 기준면적(㎡) — sports·parking_attached·reserve_forces·resort. */
  standardAreaLimit?: number;
  /** 7호 하치장: 매년 최대 사용면적(㎡). 엔진이 ×1.2 (§168의11①7호). */
  maxAnnualArea?: number;
  /** 4호 청소년수련시설: 수용정원(명). 엔진이 ×200㎡ (시행규칙 §83의4⑧). */
  youthCapacity?: number;
  /** 2호 나목: 최저차고기준면적(㎡). 엔진이 ×1.5 (§168의11①2호나목). */
  minGarageArea?: number;
  /** 1호 체육시설 종목 (별표3 자동 lookup — F2 Phase A). 미설정 시 standardAreaLimit fallback. */
  sportsFacilityType?: keyof typeof SPORTS_OUTDOOR_STD | keyof typeof SPORTS_INDOOR_STD;
  /** 5호 다목 예비군 부대편성인원 구간 (별표6 — F2 Phase A). */
  reserveForcesUnitSize?: keyof typeof RESERVE_FORCES_STD;
  /** 5호 다목 예비군 포함 시설 (별표6 합산 — 전술교육장 외 실시 불가 시 포함). */
  reserveForcesFacilities?: Array<"tactical" | "shooting_prep" | "range" | "basic">;
  /** 1호 체육시설 유형 (별표3 직장운동경기부 / 별표4 운동경기업 / 별표5 종업원) — F2 Phase B. 미설정 시 workplace(별표3). */
  sportsCategory?: "workplace" | "business" | "employee";
  /** 별표5 종업원 체육시설: 종업원수(명). 구간 선형보간 — F2 Phase B. */
  employeeCount?: number;
  /** 별표5 보유 시설(다중·합산): 운동장(field)·코트(court)·실내(indoor) — F2 Phase B. */
  employeeFacilityKinds?: Array<"field" | "court" | "indoor">;
  /** 6호 휴양 §83의4⑫1호 — 옥외 동물방목장·식물원 면적(㎡). F2 Phase B(B-3). */
  resortOutdoorArea?: number;
  /** 6호 휴양 §83의4⑫2호 — 부설주차장 설치기준면적(㎡). 엔진이 ×2(2배 이내). */
  resortParkingStdArea?: number;
  /** 6호 휴양 §83의4⑫3호 — 건축물 부속토지 면적(㎡, 용도지역별 배율 적용 후·직접입력). residential 등 배율 매핑 불가 시 fallback. */
  resortBuildingAttachedArea?: number;
  /** 6호 휴양 §83의4⑫3호 — 건축물 바닥면적(㎡). zoneType→§101②(지방세법 시행령) 용도지역별 배율 자동(바닥 × 배율). F2 Phase B(B-3 배율 자동). */
  resortBuildingFloorArea?: number;
  /** 별표3·4 비고 — 테니스·연식정구 선수 수(2인 초과 2인마다 가산: 별표3 483㎡·별표4 725㎡). F2 Phase B(B-2). */
  sportsPlayerCount?: number;
  /** 별표3 비고4 — 실내 운동경기부가 실내체육시설을 설치하지 않은 경우 800㎡(workplace 전용). F2 Phase B(B-2). */
  indoorNotInstalled?: boolean;
  /** 별표3·4 비고2 — 주종목 외 추가 보유 종목(다중). **합산이 원칙**이되 5종목군(축구·야구·럭비·필드하키·미식축구)은 그 중 max1만. F2 Phase B(B-2 합산). */
  sportsExtraEvents?: Array<keyof typeof SPORTS_OUTDOOR_STD>;
  /** 별표3·4·5 비고1·3 — 실내 종목 체육시설 건축물 바닥면적(㎡). 부속토지 = min(바닥, 표값) × zoneType 배율(§101②). 미입력 시 표값 fallback. F2 Phase B(B-2 실내 부속토지). */
  indoorFloorArea?: number;
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
  /** 당해 과세기간 연간수입금액 (원) — §168의11③ 산정값 입력 */
  currentRevenue: number;
  /** 당해 과세기간 토지가액 (원) — 양도일 기준시가 §168의11④ */
  currentLandValue: number;
  /** 직전 과세기간 연간수입금액 (원). 미제공 시 비율② 생략 */
  priorRevenue?: number;
  /** 직전 과세기간 토지가액 (원) */
  priorLandValue?: number;
}

export interface RevenueTestResult {
  businessType: NblRevenueBusinessType;
  /** 업종별 기준비율 (시행규칙 §83의4) */
  threshold: number;
  /** 비율① 당해 수입 ÷ 당해 토지가액 */
  ratioCurrent: number;
  /** 비율② (당해+직전 수입) ÷ (당해+직전 토지가액). 직전 미제공 시 undefined */
  ratioCombined?: number;
  /** max(①,②) — §168의11② "큰 것" */
  actualRatio: number;
  pass: boolean;
  detail: string;
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

  /** §168조의14② 양도일 의제 (경매·공매·신문공고) — 기간기준 판정 기준일 */
  deemedTransfer?: { reason: DeemedTransferReason; date: Date };

  /** §168의11② 수입금액비율 테스트 결과 (기타토지 + revenueTest 제공 시) */
  revenueTestDetail?: RevenueTestResult;

  surcharge: {
    surchargeType: "non_business_land";
    additionalRate: number;
    /** 비사업용 면적 비율 (단일 필지 기준면적 초과분 안분 중과 — 면적안분 없으면 1) 목장 §168의10③·기타토지 §168의11①. ⑤⑥(다필지·복합용도) 미구현 */
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
