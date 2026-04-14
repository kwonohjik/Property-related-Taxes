/**
 * 비사업용 토지 판정 전담 순수 엔진 (Layer 2)
 *
 * DB 직접 호출 없음. 모든 판정 기준 데이터는 매개변수로 주입.
 *
 * 법적 근거:
 *   소득세법 §104조의3 (비사업용 토지의 범위)
 *   시행령 §168조의6 (판정 3기준 — 80%/5년내3년/3년내2년)
 *   시행령 §168조의7 (부득이한 사유)
 *   시행령 §168조의8 (건물 부수 토지 배율)
 */

import { differenceInDays, addYears } from "date-fns";
import { NBL } from "./legal-codes";

// ============================================================
// 타입 정의
// ============================================================

// ── P1: 판정 단계 상태 ──────────────────────────────────────────

/**
 * 개별 판정 단계의 결과 상태.
 * - PASS: 해당 기준 충족 → 사업용 인정
 * - FAIL: 해당 기준 미충족
 * - SKIP: 지목/유형이 달라 건너뜀
 * - NOT_APPLICABLE: 조건 자체가 해당되지 않음 (무조건 의제 미해당 등)
 */
export type StepStatus = "PASS" | "FAIL" | "SKIP" | "NOT_APPLICABLE";

/** 단일 판정 단계 정보 — 결과 시각화·법령 참조에 사용 */
export interface JudgmentStep {
  /** 단계 식별자 (예: "unconditional_exemption", "criteria_80pct") */
  id: string;
  /** 표시 레이블 (예: "① 무조건 사업용 의제") */
  label: string;
  /** 판정 결과 상태 */
  status: StepStatus;
  /** 판정 세부 설명 */
  detail: string;
  /** 법적 근거 조문 (예: "시행령 §168조의14 ③") */
  legalBasis?: string;
}

/** 토지 유형 */
export type LandType =
  | "farmland"      // 농지 (전·답·과수원 통합 레거시)
  | "paddy"         // 답 (NBL-11)
  | "field"         // 전 (NBL-11)
  | "orchard"       // 과수원 (NBL-11)
  | "forest"        // 임야
  | "pasture"       // 목장용지 (NBL-02)
  | "vacant_lot"    // 나대지
  | "building_site" // 건물 부수 토지
  | "housing_site"  // 주택 부수 토지
  | "villa_land"    // 별장부수토지 (NBL-03)
  | "other_land"    // 기타토지 (나대지·잡종지) (NBL-04)
  | "miscellaneous" // 잡종지
  | "other";        // 기타

/**
 * 농지계 지목 판정 (레거시 "farmland" 포함 — NBL-11).
 */
export function isFarmlandType(landType: LandType): boolean {
  return landType === "farmland" || landType === "paddy" || landType === "field" || landType === "orchard";
}

/** 용도지역 (NBL-08: 주거지역 3세분화 + 미계획) */
export type ZoneType =
  | "residential"              // 주거지역 (레거시 — 통합형, 4배)
  | "exclusive_residential"    // 전용주거 (NBL-08, 5배)
  | "general_residential"      // 일반주거 (NBL-08, 4배)
  | "semi_residential"         // 준주거 (NBL-08, 3배)
  | "commercial"               // 상업지역
  | "industrial"               // 공업지역
  | "green"                    // 녹지지역
  | "management"               // 관리지역
  | "agriculture_forest"       // 농림지역
  | "natural_env"              // 자연환경보전지역
  | "unplanned"                // 미계획지역 (NBL-08)
  | "undesignated";            // 미지정 (레거시)

/** 유예기간 유형 */
export type GracePeriodType =
  | "inheritance"       // 상속 (최대 5년)
  | "legal_restriction" // 법령 사용 금지·제한 (기간 전체)
  | "sale_contract"     // 매매계약 체결 후 양도일 (최대 2년)
  | "construction"      // 건축허가 후 신축·증축 (최대 2년)
  | "unavoidable"       // 부득이한 사유 (최대 2년)
  | "preparation"       // 사업 준비기간 (최대 2년)
  | "land_replotting";  // 환지처분 전 (제한 없음)

/**
 * 부득이한 사유 유형 (시행령 §168조의7)
 * 농지 자경 불가 사유 — 해당 기간은 유예기간으로 산입
 */
export type UnavoidableReasonType =
  | "illness"        // 질병 (6개월 이상 치료)
  | "elderly"        // 고령 (만 65세 이상 자경 불가)
  | "military"       // 징집·소집
  | "emigration"     // 해외이주
  | "expropriation"  // 공익사업 수용·협의매수
  | "bankruptcy";    // 파산선고

/** 부득이한 사유 항목 */
export interface UnavoidableReason {
  type: UnavoidableReasonType;
  startDate: Date;
  endDate: Date;
  description?: string;
}

/** 사업용 사용기간 */
export interface BusinessUsePeriod {
  startDate: Date;
  endDate: Date;
  usageType: string; // 자경, 영림계획, 건물임대 등 — 표시용
}

/** 유예기간 항목 */
export interface GracePeriod {
  type: GracePeriodType;
  startDate: Date; // 사유 시작일 (상속 = 상속개시일)
  endDate: Date;   // 입력된 종료일 (최대 제한은 내부에서 적용)
}

// ============================================================
// NBL-01: 무조건 사업용 의제 (소령 §168-14 ③, 7가지)
// ============================================================

/**
 * 무조건 사업용 토지 의제 입력.
 * 7가지 사유 중 하나라도 해당 시 즉시 사업용 판정 (Step 0 조기 종료).
 */
export interface UnconditionalExemptionInput {
  /** ① 2006.12.31 이전 상속 + 2009.12.31 이전 양도 */
  isInheritedBefore2007?: boolean;
  /** 상속개시일 (isInheritedBefore2007=true 시 필수) */
  inheritanceDate?: Date;
  /** ② 20년 이상 소유 + 2006.12.31 이전 + 2009.12.31 이전 양도 */
  ownedOver20YearsBefore2007?: boolean;
  /** ③ 직계존속·배우자 8년 재촌자경 상속·증여 (농지/임야/목장만) */
  isAncestor8YearFarming?: boolean;
  /** ④ 공익사업 협의매수·수용 */
  isPublicExpropriation?: boolean;
  /** 공익사업 고시일 (publicNotice + acquisitionDate 비교용) */
  publicNoticeDate?: Date;
  /** ⑤ 공장 인접 토지 (소유자 요구 매수) */
  isFactoryAdjacent?: boolean;
  /** ⑥ 이농 (농지 전용, 2006.12.31 이전 이농 + 2009.12.31 이전 양도) */
  isInong?: boolean;
  /** 이농일 */
  inongDate?: Date;
  /** ⑦ 종중 소유 (2005.12.31 이전 취득, 농지/임야/목장) */
  isJongjoongOwned?: boolean;
  /** 종중 취득일 */
  jongjoongAcquisitionDate?: Date;
}

export type UnconditionalExemptionReason =
  | "inheritance_before_2007"
  | "long_owned_20years"
  | "ancestor_8year_farming"
  | "public_expropriation"
  | "factory_adjacent"
  | "inong"
  | "jongjoong_owned"
  | "none";

// ============================================================
// NBL-02: 목장용지 사용현황
// ============================================================

/** 목장용지 입력 (소령 §168-9) */
export interface PastureUsage {
  /** 축산업 영위 여부 */
  isLivestockOperator: boolean;
  /** 가축 종류 (한우, 젖소, 돼지 등) */
  livestockType?: string;
  /** 실제 가축 사육두수 */
  livestockCount?: number;
  /** 가축별 기준면적 (축산법·사료관리법 기준, ㎡) */
  standardArea?: number;
}

// ============================================================
// NBL-03: 별장부수토지 사용현황
// ============================================================

/** 별장부수토지 입력 (소령 §168-11) */
export interface VillaUsage {
  /** 별장 사용기간 */
  villaUsePeriods: BusinessUsePeriod[];
  /** 읍·면 소재 여부 */
  isEupMyeon: boolean;
  /** 농어촌주택 해당 여부 (건축물 150㎡·토지 660㎡·2억원 이하) */
  isRuralHousing: boolean;
  /** 2015.1.1 이후 양도 여부 (특례 적용) */
  isAfter20150101?: boolean;
}

// ============================================================
// NBL-04: 기타토지 사용현황
// ============================================================

/** 재산세 과세 분류 */
export type PropertyTaxType =
  | "separate"        // 분리과세 (사업용 의제)
  | "special_sum"     // 별도합산과세 (사업용 의제)
  | "comprehensive";  // 종합합산과세 (비사업용 원칙)

/** 기타토지 입력 (나대지·잡종지) */
export interface OtherLandUsage {
  /** 재산세 과세 분류 */
  propertyTaxType: PropertyTaxType;
  /** 건물 유무 */
  hasBuilding: boolean;
  /** 건물 연면적(㎡) */
  buildingFloorArea?: number;
  /** 건물 표준가 (원) */
  buildingStandardValue?: number;
  /** 토지 표준가 (원) */
  landStandardValue?: number;
  /** 거주·사업 관련성 */
  isRelatedToResidenceOrBusiness: boolean;
}

// ============================================================
// NBL-05: 재촌 판정 - 위치 정보
// ============================================================

/** 행정구역 위치 정보 */
export interface LocationInfo {
  /** 시도코드 (2자리, 예: "11" 서울) */
  sidoCode?: string;
  /** 시군구코드 (5자리, 예: "11680" 강남구) */
  sigunguCode?: string;
  /** 직선거리(km) — 위치코드 미제공 시 fallback */
  distanceKm?: number;
  /** 주민등록 해당 여부 (임야 재촌 요건) */
  hasResidentRegistration?: boolean;
}

// ============================================================
// NBL-06: 임야 세부 요건 확장
// ============================================================

/** 임야 사용현황 상세 (소령 §168-9, §168-10) */
export interface ForestUsageDetail {
  /** 공익상·산림보호 임야 (산림유전자보호림·보안림·채종림·시험림·개발제한구역) */
  isPublicInterest?: boolean;
  /** 산림경영계획 인가·시업 중 */
  hasForestPlan?: boolean;
  /** 특수산림사업지구 */
  isSpecialForestZone?: boolean;
  /** 임업후계자 임산물 생산 */
  isForestSuccessor?: boolean;
  /** 상속 5년 이내 임야 */
  inheritedForestWithin5Years?: boolean;
  /** 상속개시일 (inheritedForestWithin5Years 검증용) */
  forestInheritanceDate?: Date;
}

// ============================================================
// NBL-07: 농지 사용의제 확대 (소령 §168-8 ③)
// ============================================================

/**
 * 재촌·자경 미충족 시에도 사업용 인정되는 농지 사용의제.
 */
export interface FarmlandDeemingInput {
  /** 주말·체험영농 (세대당 1,000㎡ 이하, 2003.1.1~2021.12.31 취득) */
  isWeekendFarm?: boolean;
  /** 농지전용허가·협의 완료 */
  isFarmConversionApproved?: boolean;
  /** 농지개발사업지구 내 1,500㎡ 미만 */
  isFarmDevZone?: boolean;
  /** 한계농지정비사업지구 내 1,500㎡ 미만 */
  isMarginalFarmProject?: boolean;
  /** 매립농지 */
  isReclaimed?: boolean;
  /** 공익·개발사업 관련 */
  isPublicProjectUse?: boolean;
  /** 5년 이상 자경 후 질병·고령 사유 임대 */
  isSickElderlyRental?: boolean;
}

/** 비사업용 토지 판정 입력 */
export interface NonBusinessLandInput {
  /** 토지 유형 */
  landType: LandType;
  /** 전체 면적 (㎡, 소수점 2자리까지) */
  landArea: number;
  /** 용도지역 */
  zoneType: ZoneType;
  /** 취득일 */
  acquisitionDate: Date;
  /** 양도일 */
  transferDate: Date;

  // ---- 농지 관련 ----
  /** 자경 여부 (농지계 지목 시 사용) */
  farmingSelf?: boolean;
  /** 농지 소재지에서 거주지까지 직선거리 (km) — legacy fallback */
  farmerResidenceDistance?: number;
  /** 토지 소재지 (NBL-05) */
  landLocation?: LocationInfo;
  /** 소유자 거주지 (NBL-05) */
  ownerLocation?: LocationInfo;
  /** 연접 시군구코드 목록 (NBL-05) — 입력 시 우선 사용 */
  adjacentSigunguCodes?: string[];
  /** 농지 사용의제 (NBL-07) */
  farmlandDeeming?: FarmlandDeemingInput;

  // ---- 임야 관련 ----
  /** 영림계획 인가 여부 (landType === "forest" 시 사용) — legacy */
  forestManagementPlan?: boolean;
  /** 임야 세부 요건 (NBL-06) */
  forestDetail?: ForestUsageDetail;

  // ---- 목장용지 (NBL-02) ----
  pasture?: PastureUsage;

  // ---- 별장부수토지 (NBL-03) ----
  villa?: VillaUsage;

  // ---- 기타토지 (NBL-04) ----
  otherLand?: OtherLandUsage;

  // ---- 무조건 사업용 의제 (NBL-01) ----
  unconditionalExemption?: UnconditionalExemptionInput;

  // ---- 도시지역 편입유예 (NBL-09) ----
  /** 도시지역 편입일 — 농지·목장용지 2년/3년 유예 판정용 */
  urbanIncorporationDate?: Date;

  // ---- 사업용 사용기간 (직접 입력) ----
  businessUsePeriods: BusinessUsePeriod[];

  // ---- 건물 부수 토지 ----
  /** 건물 바닥면적 (㎡, landType === "building_site" 시 필수) */
  buildingFootprint?: number;

  // ---- 주택 부수 토지 ----
  /** 주택 정착면적 (㎡, landType === "housing_site" 시 필수) */
  housingFootprint?: number;
  /** 도시지역 여부 (주택 부수 토지 배율 결정) */
  isUrbanArea?: boolean;

  // ---- 유예기간 ----
  gracePeriods: GracePeriod[];
  /**
   * 부득이한 사유 목록 (시행령 §168조의7)
   * 내부에서 GracePeriod type="unavoidable"로 변환하여 처리.
   * gracePeriods와 중복 없이 병합됨.
   */
  unavoidableReasons?: UnavoidableReason[];
}

/** 면적 안분 결과 */
export interface AreaProportioning {
  totalArea: number;
  businessArea: number;
  nonBusinessArea: number;
  /** 비사업용 면적 비율 (소수, 소수점 4자리) */
  nonBusinessRatio: number;
  /** 적용 배율 (건물/주택 부수 토지) */
  buildingMultiplier: number;
}

/** 비사업용 토지 판정 결과 */
export interface NonBusinessLandJudgment {
  /** 비사업용 토지 여부 */
  isNonBusinessLand: boolean;
  /** 판정 사유 설명 */
  judgmentReason: string;

  // ---- 기간 분석 ----
  /** 전체 소유일수 (취득일 다음날 ~ 양도일) */
  totalOwnershipDays: number;
  /** 사업용 사용일수 (중복 제거) */
  businessUseDays: number;
  /** 유예기간 일수 (중복 제거) */
  gracePeriodDays: number;
  /** 유효 사업용 일수 = 사업용 + 유예기간 (합산 후 중복 제거) */
  effectiveBusinessDays: number;
  /** 사업용 사용 비율 (소수점 4자리) */
  businessUseRatio: number;

  // ---- 3가지 판정 기준 ----
  criteria: {
    /** ① 소유기간의 80% 이상 사업용 */
    rule80Percent: boolean;
    /** ② 소유기간 5년 이상 + 직전 5년 중 3년(1095일) 이상 사업용 */
    rule5Years: boolean;
    /** ③ 소유기간 3년 이상 + 직전 3년 중 2년(730일) 이상 사업용 */
    rule2of3Years: boolean;
  };

  // ---- 면적 안분 (건물/주택 부수 토지) ----
  areaProportioning?: AreaProportioning;

  // ---- 중과세 정보 ----
  surcharge: {
    surchargeType: "non_business_land";
    /** 가산세율 (+10%p) */
    additionalRate: number;
    /** 장기보유특별공제 배제 여부 (항상 true) */
    longTermDeductionExcluded: boolean;
    /** 기본공제 적용 여부 (항상 true — 미등기와 구별) */
    basicDeductionApplied: boolean;
  };

  /** 무조건 사업용 의제 적용 여부 (NBL-01) */
  unconditionalExemption?: {
    isApplied: boolean;
    reason: UnconditionalExemptionReason;
    detail: string;
  };

  /** 도시지역 편입유예 적용 여부 (NBL-09) */
  urbanIncorporationGrace?: {
    isApplied: boolean;
    graceYears: 2 | 3;
    graceEndDate: Date;
  };

  appliedLawArticles: string[];
  warnings: string[];
  /**
   * 판정 단계별 상세 결과 (P1: 결과 시각화·법령 참조용).
   * 각 단계에 PASS/FAIL/SKIP/NOT_APPLICABLE 상태와 법령 조문이 첨부됨.
   */
  judgmentSteps: JudgmentStep[];
}

// ============================================================
// DB 판정 기준 타입 (transfer:special:non_business_land_judgment)
// ============================================================

/** DB에서 파싱된 비사업용 토지 판정 기준 규칙 */
export interface NonBusinessLandJudgmentRules {
  type: "non_business_land_judgment";
  /** 건물 부수 토지 용도지역별 배율 (NBL-08 확장 — 11가지) */
  buildingAreaMultipliers: {
    residential: number;              // legacy 통합 (주거 일반)
    exclusive_residential?: number;   // 전용주거 5 (NBL-08)
    general_residential?: number;     // 일반주거 4 (NBL-08)
    semi_residential?: number;        // 준주거 3 (NBL-08)
    commercial: number;               // 상업 3 (NBL-08 수정)
    industrial: number;               // 공업 4 (NBL-08 수정)
    green: number;                    // 녹지 7
    management: number;               // 관리 7
    agriculture_forest: number;       // 농림 7
    natural_env: number;              // 자연환경 7
    unplanned?: number;               // 미계획 4 (NBL-08)
    undesignated: number;             // 미지정 (레거시 fallback)
  };
  /** 농지 자경 거리 요건 (km) */
  farmlandDistanceKm: number;
  /** 유예기간 최대 기간 (년) */
  exemptionPeriods: {
    inheritance: number;   // 5
    construction: number;  // 2
    unavoidable: number;   // 2
    preparation: number;   // 2
    sale_contract: number; // 2
  };
  /** 도시지역 편입유예 차등 기준 (NBL-09) */
  urbanIncorporationGrace?: {
    /** 변경 기준일 (2015-02-02) — 이전 양도: graceYearsOld, 이후: graceYearsNew */
    changeDate: string;
    graceYearsOld: number; // 2
    graceYearsNew: number; // 3
  };
  /** 무조건 사업용 의제 기준일 (NBL-01) */
  unconditionalExemptionDates?: {
    inheritanceCutoff: string;          // "2006-12-31"
    transferCutoffForLegacy: string;    // "2009-12-31"
    jongjoongCutoff: string;            // "2005-12-31"
    publicExpropriation5YearsDate: string; // 고시일 5년 전 기준
    publicExpropriation2YearsDate: string; // 고시일 2년 전 기준
  };
  /** 기간기준 80%/60% 분기 기준 (NBL-10) */
  periodCriteriaThresholds?: {
    /** 2015.2.2 이전 양도 농지·임야·목장: 80% 적용 */
    oldThresholdDate: string;            // "2015-02-02"
    oldThresholdRatio: number;           // 0.8
    /** 현행 §104-3 ①: 80% (공통) */
    currentThresholdRatio: number;       // 0.8
  };
}

/** 기본 판정 기준 (DB 미로드 시 fallback, 테스트용) */
export const DEFAULT_NON_BUSINESS_LAND_RULES: NonBusinessLandJudgmentRules = {
  type: "non_business_land_judgment",
  buildingAreaMultipliers: {
    // NBL-08: 용도지역별 정확한 배율 (소령 §168-12)
    residential: 4,             // legacy 통합 — 일반주거 기본값
    exclusive_residential: 5,   // 전용주거 5배
    general_residential: 4,     // 일반주거 4배
    semi_residential: 3,        // 준주거 3배
    commercial: 3,              // 상업 3배
    industrial: 4,              // 공업 4배
    green: 7,                   // 녹지 7배
    management: 7,              // 관리 7배
    agriculture_forest: 7,      // 농림 7배
    natural_env: 7,             // 자연환경 7배
    unplanned: 4,               // 미계획 4배
    undesignated: 7,            // 미지정 fallback
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
    publicExpropriation5YearsDate: "", // 런타임에 고시일 기준으로 계산
    publicExpropriation2YearsDate: "",
  },
  periodCriteriaThresholds: {
    oldThresholdDate: "2015-02-02",
    oldThresholdRatio: 0.8,
    currentThresholdRatio: 0.8,
  },
};

// ============================================================
// 내부 유틸 타입
// ============================================================

interface DateInterval {
  start: Date;
  end: Date;
}

// ============================================================
// Step 1: 기간 계산 유틸
// ============================================================

/**
 * 소유기간 시작일 = 취득일 다음날 (초일불산입 원칙)
 */
function getOwnershipStart(acquisitionDate: Date): Date {
  const d = new Date(acquisitionDate);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * 겹치는 기간을 합산·중복 제거하여 반환 (interval merge 알고리즘).
 * start === end 인 길이 0 기간은 무시.
 */
export function mergeOverlappingPeriods(periods: DateInterval[]): DateInterval[] {
  const valid = periods.filter((p) => p.end > p.start);
  if (valid.length === 0) return [];

  const sorted = [...valid].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: DateInterval[] = [{ start: new Date(sorted[0].start), end: new Date(sorted[0].end) }];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];

    if (cur.start <= last.end) {
      // 겹침(overlapping) 또는 연접(touching) → end 확장
      // ※ cur.start === last.end 인 "인접 구간"도 병합 처리:
      //   세법상 사업용 기간은 시작일 포함·종료일 불포함(반열린 구간)으로 해석하므로
      //   [1~5일], [5~10일] → [1~10일]로 합산해도 5일 이중 카운트 없음.
      if (cur.end > last.end) {
        last.end = new Date(cur.end);
      }
    } else {
      merged.push({ start: new Date(cur.start), end: new Date(cur.end) });
    }
  }
  return merged;
}

/**
 * 기간 목록의 총 일수를 [windowStart, windowEnd] 범위로 클립하여 합산.
 * periods는 이미 merge된 상태를 가정.
 */
function sumDaysInWindow(
  periods: DateInterval[],
  windowStart: Date,
  windowEnd: Date,
): number {
  let total = 0;
  for (const p of periods) {
    const s = p.start < windowStart ? windowStart : p.start;
    const e = p.end > windowEnd ? windowEnd : p.end;
    const days = differenceInDays(e, s);
    if (days > 0) total += days;
  }
  return total;
}

// ============================================================
// Step 2: 유예기간 계산
// ============================================================

/**
 * 유예기간 목록을 `DateInterval[]`로 변환하되, 유형별 최대 기간을 적용.
 * legal_restriction / land_replotting은 최대 제한 없음.
 */
function buildGraceIntervals(
  gracePeriods: GracePeriod[],
  rules: NonBusinessLandJudgmentRules,
): DateInterval[] {
  const intervals: DateInterval[] = [];

  for (const gp of gracePeriods) {
    let effectiveEnd = gp.endDate;

    const maxYears: number | undefined = (() => {
      switch (gp.type) {
        case "inheritance":       return rules.exemptionPeriods.inheritance;
        case "construction":      return rules.exemptionPeriods.construction;
        case "unavoidable":       return rules.exemptionPeriods.unavoidable;
        case "preparation":       return rules.exemptionPeriods.preparation;
        case "sale_contract":     return rules.exemptionPeriods.sale_contract;
        case "legal_restriction": return undefined; // 제한 없음
        case "land_replotting":   return undefined; // 환지공고일까지
        default:                  return undefined;
      }
    })();

    if (maxYears !== undefined) {
      const maxEnd = addYears(gp.startDate, maxYears);
      if (effectiveEnd > maxEnd) effectiveEnd = maxEnd;
    }

    if (effectiveEnd > gp.startDate) {
      intervals.push({ start: gp.startDate, end: effectiveEnd });
    }
  }

  return intervals;
}

// ============================================================
// Step 3: 사업용 사용일수 집계
// ============================================================

interface EffectiveDaysResult {
  /** 사업용 사용일수 (중복 제거, 소유기간 클립) */
  businessUseDays: number;
  /** 유예기간 일수 (중복 제거, 소유기간 클립) */
  gracePeriodDays: number;
  /** 유효 사업용 일수 = 사업용 + 유예기간 합산 후 중복 제거 */
  effectiveDays: number;
}

function calculateEffectiveDays(
  businessUsePeriods: BusinessUsePeriod[],
  gracePeriods: GracePeriod[],
  ownershipStart: Date,
  transferDate: Date,
  rules: NonBusinessLandJudgmentRules,
): EffectiveDaysResult {
  const bizIntervals: DateInterval[] = businessUsePeriods.map((p) => ({
    start: p.startDate,
    end: p.endDate,
  }));
  const graceIntervals = buildGraceIntervals(gracePeriods, rules);

  const mergedBiz   = mergeOverlappingPeriods(bizIntervals);
  const mergedGrace = mergeOverlappingPeriods(graceIntervals);
  const mergedAll   = mergeOverlappingPeriods([...bizIntervals, ...graceIntervals]);

  const businessUseDays = sumDaysInWindow(mergedBiz,   ownershipStart, transferDate);
  const gracePeriodDays = sumDaysInWindow(mergedGrace, ownershipStart, transferDate);
  const effectiveDays   = sumDaysInWindow(mergedAll,   ownershipStart, transferDate);

  return { businessUseDays, gracePeriodDays, effectiveDays };
}

// ============================================================
// Step 4: 최근 N년 중 M년 이상 사업용 판정
// ============================================================

/**
 * 양도일 직전 windowYears년 기간 중 사업용(유예 포함) 일수가 requiredYears×365일 이상인지 판정.
 * 판정 창의 하한은 소유 시작일로 클립.
 */
function checkRecentYearsRule(
  transferDate: Date,
  businessUsePeriods: BusinessUsePeriod[],
  gracePeriods: GracePeriod[],
  acquisitionDate: Date,
  windowYears: number,
  requiredYears: number,
  rules: NonBusinessLandJudgmentRules,
): boolean {
  const ownershipStart = getOwnershipStart(acquisitionDate);
  const windowStart = addYears(transferDate, -windowYears);
  // 판정 창 시작 = max(소유시작일, 직전 N년 시작)
  const effectiveWindowStart = windowStart > ownershipStart ? windowStart : ownershipStart;

  const bizIntervals: DateInterval[] = businessUsePeriods.map((p) => ({
    start: p.startDate,
    end: p.endDate,
  }));
  const graceIntervals = buildGraceIntervals(gracePeriods, rules);
  const mergedAll = mergeOverlappingPeriods([...bizIntervals, ...graceIntervals]);

  const daysInWindow = sumDaysInWindow(mergedAll, effectiveWindowStart, transferDate);
  return daysInWindow >= requiredYears * 365;
}

// ============================================================
// Step 5: 면적 안분 계산 (건물/주택 부수 토지)
// ============================================================

/**
 * 건물 부수 토지 용도지역별 배율 (시행령 §168조의8, NBL-08 세분화).
 * 세분 용도지역(전용/일반/준주거 등) 우선, 미제공 시 상위 카테고리로 폴백.
 */
function getBuildingMultiplier(
  zoneType: ZoneType,
  rules: NonBusinessLandJudgmentRules,
): number {
  const m = rules.buildingAreaMultipliers;
  const direct = (m as Record<string, number | undefined>)[zoneType];
  if (direct !== undefined) return direct;
  // 세분 용도지역 미제공 시 상위로 폴백
  switch (zoneType) {
    case "exclusive_residential":
    case "general_residential":
    case "semi_residential":
      return m.residential;
    case "unplanned":
      return m.undesignated;
    default:
      return m.undesignated;
  }
}

function calcBuildingLandArea(
  totalArea: number,
  buildingFootprint: number,
  zoneType: ZoneType,
  rules: NonBusinessLandJudgmentRules,
): AreaProportioning {
  const multiplier = getBuildingMultiplier(zoneType, rules);
  const allowedArea = buildingFootprint * multiplier;
  const businessArea = Math.min(totalArea, allowedArea);
  const nonBusinessArea = Math.max(0, totalArea - allowedArea);
  const nonBusinessRatio =
    totalArea > 0 ? Math.round((nonBusinessArea / totalArea) * 10000) / 10000 : 0;
  return { totalArea, businessArea, nonBusinessArea, nonBusinessRatio, buildingMultiplier: multiplier };
}

function calcHousingLandArea(
  totalArea: number,
  housingFootprint: number,
  isUrbanArea: boolean,
): AreaProportioning {
  const multiplier = isUrbanArea ? 5 : 10;
  const allowedArea = housingFootprint * multiplier;
  const businessArea = Math.min(totalArea, allowedArea);
  const nonBusinessArea = Math.max(0, totalArea - allowedArea);
  const nonBusinessRatio =
    totalArea > 0 ? Math.round((nonBusinessArea / totalArea) * 10000) / 10000 : 0;
  return { totalArea, businessArea, nonBusinessArea, nonBusinessRatio, buildingMultiplier: multiplier };
}

// ============================================================
// NBL-01: 무조건 사업용 의제 7가지 판정
// ============================================================

/**
 * 무조건 사업용 의제 판정 (소령 §168-14 ③).
 * 해당 시 Step 0에서 조기 종료 → 사업용 확정.
 */
export function checkUnconditionalExemption(
  input: NonBusinessLandInput,
): { isExempt: boolean; reason: UnconditionalExemptionReason; detail: string } {
  const u = input.unconditionalExemption;
  if (!u) return { isExempt: false, reason: "none", detail: "" };

  const transferDate = input.transferDate;
  const INHERITANCE_CUTOFF = new Date("2006-12-31");
  const TRANSFER_CUTOFF = new Date("2009-12-31");
  const JONGJOONG_CUTOFF = new Date("2005-12-31");

  // ① 2006.12.31 이전 상속 + 2009.12.31 이전 양도
  if (u.isInheritedBefore2007 && u.inheritanceDate) {
    if (u.inheritanceDate <= INHERITANCE_CUTOFF && transferDate <= TRANSFER_CUTOFF) {
      return {
        isExempt: true,
        reason: "inheritance_before_2007",
        detail: `2006.12.31 이전 상속(${u.inheritanceDate.toISOString().slice(0, 10)}) + 2009.12.31 이전 양도`,
      };
    }
  }

  // ② 20년 이상 소유 + 2006.12.31 이전 + 2009.12.31 이전 양도
  if (u.ownedOver20YearsBefore2007 && transferDate <= TRANSFER_CUTOFF) {
    return {
      isExempt: true,
      reason: "long_owned_20years",
      detail: "20년 이상 보유 + 2006.12.31 이전 소유 + 2009.12.31 이전 양도",
    };
  }

  // ③ 직계존속·배우자 8년 재촌자경 상속·증여 (농지/임야/목장)
  if (u.isAncestor8YearFarming) {
    const isAgriculturalLike =
      isFarmlandType(input.landType) ||
      input.landType === "forest" ||
      input.landType === "pasture";
    if (isAgriculturalLike) {
      return {
        isExempt: true,
        reason: "ancestor_8year_farming",
        detail: "직계존속·배우자의 8년 이상 재촌자경 후 상속·증여받은 농지/임야/목장",
      };
    }
  }

  // ④ 공익사업 협의매수·수용
  // 고시일 이전 취득 또는 고시일 5년(사업자지정)·2년(일반) 전 취득
  if (u.isPublicExpropriation && u.publicNoticeDate) {
    const yearsBefore5 = addYears(u.publicNoticeDate, -5);
    const yearsBefore2 = addYears(u.publicNoticeDate, -2);
    if (
      input.acquisitionDate <= u.publicNoticeDate ||
      input.acquisitionDate <= yearsBefore5 ||
      input.acquisitionDate <= yearsBefore2
    ) {
      return {
        isExempt: true,
        reason: "public_expropriation",
        detail: `공익사업 협의매수·수용 (고시일 ${u.publicNoticeDate.toISOString().slice(0, 10)} 기준)`,
      };
    }
  }

  // ⑤ 공장 인접 토지 (소유자 요구 매수)
  if (u.isFactoryAdjacent) {
    return {
      isExempt: true,
      reason: "factory_adjacent",
      detail: "공장 인접 토지 — 소유자 요구에 의한 매수",
    };
  }

  // ⑥ 이농 (농지, 2006.12.31 이전 이농 + 2009.12.31 이전 양도)
  if (u.isInong && u.inongDate && isFarmlandType(input.landType)) {
    if (u.inongDate <= INHERITANCE_CUTOFF && transferDate <= TRANSFER_CUTOFF) {
      return {
        isExempt: true,
        reason: "inong",
        detail: `2006.12.31 이전 이농(${u.inongDate.toISOString().slice(0, 10)}) + 2009.12.31 이전 양도`,
      };
    }
  }

  // ⑦ 종중 소유 (2005.12.31 이전 취득, 농지/임야/목장)
  if (u.isJongjoongOwned && u.jongjoongAcquisitionDate) {
    const isAgriculturalLike =
      isFarmlandType(input.landType) ||
      input.landType === "forest" ||
      input.landType === "pasture";
    if (isAgriculturalLike && u.jongjoongAcquisitionDate <= JONGJOONG_CUTOFF) {
      return {
        isExempt: true,
        reason: "jongjoong_owned",
        detail: `종중 소유 — 2005.12.31 이전 취득(${u.jongjoongAcquisitionDate.toISOString().slice(0, 10)})`,
      };
    }
  }

  return { isExempt: false, reason: "none", detail: "" };
}

// ============================================================
// NBL-05: 재촌 판정 (동일/연접 시·군·구 OR 30km 이내)
// ============================================================

/**
 * 재촌 요건 충족 여부.
 * 우선순위: 시군구코드 일치 > 연접 시군구코드 > 직선거리 30km 이내
 */
export function isResidenceValid(
  landLocation: LocationInfo | undefined,
  ownerLocation: LocationInfo | undefined,
  adjacentSigunguCodes: string[] = [],
  distanceLimitKm = 30,
): boolean {
  if (!landLocation || !ownerLocation) {
    // 위치 정보 미제공 → 거리 fallback
    if (ownerLocation?.distanceKm !== undefined) {
      return ownerLocation.distanceKm <= distanceLimitKm;
    }
    return false;
  }

  // 1. 동일 시·군·구
  if (
    landLocation.sigunguCode &&
    ownerLocation.sigunguCode &&
    landLocation.sigunguCode === ownerLocation.sigunguCode
  ) {
    return true;
  }

  // 2. 연접 시·군·구
  if (
    ownerLocation.sigunguCode &&
    adjacentSigunguCodes.includes(ownerLocation.sigunguCode)
  ) {
    return true;
  }

  // 3. 직선거리 30km 이내
  if (ownerLocation.distanceKm !== undefined) {
    return ownerLocation.distanceKm <= distanceLimitKm;
  }

  return false;
}

// ============================================================
// NBL-09: 도시지역 편입유예 (2년/3년 차등)
// ============================================================

/**
 * 도시지역 편입유예 판정 (소령 §168-14 ①).
 * 농지·목장용지만 대상. 2015.2.2 이전 양도: 2년, 이후: 3년.
 */
export function checkIncorporationGrace(
  urbanIncorporationDate: Date | undefined,
  transferDate: Date,
  rules: NonBusinessLandJudgmentRules,
): { isApplied: boolean; graceYears: 2 | 3; graceEndDate: Date } {
  if (!urbanIncorporationDate) {
    return { isApplied: false, graceYears: 3, graceEndDate: transferDate };
  }
  const grace = rules.urbanIncorporationGrace;
  const changeDate = grace ? new Date(grace.changeDate) : new Date("2015-02-02");
  const graceYears: 2 | 3 = transferDate < changeDate
    ? ((grace?.graceYearsOld ?? 2) as 2)
    : ((grace?.graceYearsNew ?? 3) as 3);
  const graceEndDate = addYears(urbanIncorporationDate, graceYears);
  const isApplied = transferDate <= graceEndDate;
  return { isApplied, graceYears, graceEndDate };
}

// ============================================================
// NBL-02: 목장용지 판정
// ============================================================

/**
 * 목장용지 사업용 판정.
 * 축산업 영위 + 기준면적 이내 + (도시지역 밖 또는 편입유예 내) → 사업용.
 */
export function judgePasture(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): { isBusiness: boolean; detail: string; areaProportioning?: AreaProportioning } {
  const p = input.pasture;
  if (!p) {
    return { isBusiness: false, detail: "목장용지 사용현황 미제공" };
  }

  // 축산업 미영위 → 비사업용
  if (!p.isLivestockOperator) {
    return { isBusiness: false, detail: "축산업 미영위 — 비사업용" };
  }

  // 기준면적 비교 (standardArea 미제공 시 전체 사업용으로 간주)
  if (p.standardArea !== undefined && input.landArea > p.standardArea) {
    const businessArea = p.standardArea;
    const nonBusinessArea = input.landArea - p.standardArea;
    const nonBusinessRatio =
      input.landArea > 0
        ? Math.round((nonBusinessArea / input.landArea) * 10000) / 10000
        : 0;
    return {
      isBusiness: false,
      detail: `축산업 영위 + 기준면적(${p.standardArea}㎡) 초과 — 초과분 비사업용`,
      areaProportioning: {
        totalArea: input.landArea,
        businessArea,
        nonBusinessArea,
        nonBusinessRatio,
        buildingMultiplier: 1,
      },
    };
  }

  // 도시지역 편입유예 검증 (편입일 있으면)
  if (input.urbanIncorporationDate) {
    const g = checkIncorporationGrace(input.urbanIncorporationDate, input.transferDate, rules);
    if (!g.isApplied) {
      return {
        isBusiness: false,
        detail: `도시지역 편입 후 ${g.graceYears}년 경과 — 유예기간 초과`,
      };
    }
    return {
      isBusiness: true,
      detail: `축산업 영위 + 도시지역 편입 ${g.graceYears}년 유예기간 내`,
    };
  }

  return { isBusiness: true, detail: "축산업 영위 + 기준면적 이내 — 사업용" };
}

// ============================================================
// NBL-03: 별장부수토지 판정
// ============================================================

/**
 * 별장부수토지 판정 (소령 §168-11).
 * 2015.1.1 이후 양도: 별장 자체는 주택으로 과세, 부속토지는 기타토지 기준.
 * 농어촌주택: 건축물 150㎡ / 토지 660㎡ / 2억원 이하 → 사업용.
 */
export function judgeVillaLand(
  input: NonBusinessLandInput,
): { isBusiness: boolean; detail: string } {
  const v = input.villa;
  if (!v) return { isBusiness: false, detail: "별장 사용현황 미제공" };

  // 농어촌주택 특례
  if (v.isRuralHousing) {
    return {
      isBusiness: true,
      detail: "농어촌주택 특례 — 건축물 150㎡·토지 660㎡·2억원 이하 별장",
    };
  }

  // 2015.1.1 이후 양도: 별장부수토지는 원칙 비사업용
  const afterDate = v.isAfter20150101 ?? (input.transferDate >= new Date("2015-01-01"));
  if (afterDate) {
    return {
      isBusiness: false,
      detail: "2015.1.1 이후 양도 별장부수토지 — 비사업용 (농어촌주택 제외)",
    };
  }

  // 2015.1.1 이전: 사용기간 기준 (기간 판정으로 위임)
  return { isBusiness: false, detail: "2015.1.1 이전 별장부수토지 — 일반 기간 기준 판정" };
}

// ============================================================
// NBL-04: 기타토지 판정
// ============================================================

/**
 * 기타토지(나대지·잡종지) 판정 (소령 §168-11 ①).
 * 재산세 분리과세·별도합산: 사업용 의제
 * 재산세 종합합산: 원칙 비사업용
 * 건물 유무·건물표준가 vs 토지표준가 비교 추가 검증.
 */
export function judgeOtherLand(
  input: NonBusinessLandInput,
): { isBusiness: boolean; detail: string } {
  const o = input.otherLand;
  if (!o) return { isBusiness: false, detail: "기타토지 사용현황 미제공" };

  // 분리과세·별도합산 → 사업용 의제
  if (o.propertyTaxType === "separate") {
    return { isBusiness: true, detail: "재산세 분리과세 대상 — 사업용 의제" };
  }
  if (o.propertyTaxType === "special_sum") {
    return { isBusiness: true, detail: "재산세 별도합산과세 대상 — 사업용 의제" };
  }

  // 종합합산 + 건물 있음 + 건물표준가 ≥ 토지표준가 3% → 사업용
  if (o.hasBuilding && o.buildingStandardValue && o.landStandardValue) {
    const ratio = o.buildingStandardValue / o.landStandardValue;
    if (ratio >= 0.03) {
      return {
        isBusiness: true,
        detail: `건물 표준가/토지 표준가 비율 ${Math.round(ratio * 10000) / 100}% ≥ 3% — 건물 있는 토지로 사업용 인정`,
      };
    }
  }

  // 거주·사업 관련성
  if (o.isRelatedToResidenceOrBusiness) {
    return { isBusiness: true, detail: "거주·사업과 직접 관련 토지 — 사업용 인정" };
  }

  return { isBusiness: false, detail: "재산세 종합합산 + 건물·관련성 없음 — 비사업용" };
}

// ============================================================
// NBL-06: 임야 세부 요건 판정
// ============================================================

/**
 * 임야 사업용 특수 요건 검증 (소령 §168-9, §168-10).
 * 재촌·영림계획 외 공익상·임업후계자·상속 5년 등 추가 검증.
 */
export function checkForestSpecialRequirement(
  input: NonBusinessLandInput,
): { isBusiness: boolean; detail: string } {
  const f = input.forestDetail;
  if (!f) return { isBusiness: false, detail: "임야 세부 요건 미제공" };

  if (f.isPublicInterest) {
    return { isBusiness: true, detail: "공익상·산림보호 임야 (보안림·채종림·시험림·개발제한구역 등)" };
  }
  if (f.hasForestPlan) {
    return { isBusiness: true, detail: "산림경영계획 인가·시업 중 임야" };
  }
  if (f.isSpecialForestZone) {
    return { isBusiness: true, detail: "특수산림사업지구 임야" };
  }
  if (f.isForestSuccessor) {
    return { isBusiness: true, detail: "임업후계자 임산물 생산 임야" };
  }
  if (f.inheritedForestWithin5Years && f.forestInheritanceDate) {
    const years = differenceInDays(input.transferDate, f.forestInheritanceDate) / 365;
    if (years < 5) {
      return { isBusiness: true, detail: `상속 5년 이내 임야 (${Math.floor(years)}년 경과)` };
    }
  }
  return { isBusiness: false, detail: "임야 특수 요건 미충족" };
}

// ============================================================
// NBL-07: 농지 사용의제 확대 판정
// ============================================================

/**
 * 농지 사용의제 (소령 §168-8 ③) — 재촌·자경 미충족 시에도 사업용 인정.
 */
export function checkFarmlandDeeming(
  input: NonBusinessLandInput,
): { isBusiness: boolean; detail: string } {
  const d = input.farmlandDeeming;
  if (!d) return { isBusiness: false, detail: "농지 사용의제 미제공" };

  const WEEKEND_FARM_MAX_AREA = 1000;
  const FARM_DEV_MAX_AREA = 1500;
  const WEEKEND_FARM_ACQ_START = new Date("2003-01-01");
  const WEEKEND_FARM_TRANSFER_END = new Date("2021-12-31");

  if (d.isWeekendFarm) {
    // 세대당 1,000㎡ 이하 + 2003.1.1~2021.12.31 취득
    const meetsArea = input.landArea <= WEEKEND_FARM_MAX_AREA;
    const meetsAcq =
      input.acquisitionDate >= WEEKEND_FARM_ACQ_START &&
      input.transferDate <= WEEKEND_FARM_TRANSFER_END;
    if (meetsArea && meetsAcq) {
      return { isBusiness: true, detail: "주말·체험영농 (1,000㎡ 이하, 2003~2021 취득)" };
    }
  }
  if (d.isFarmConversionApproved) {
    return { isBusiness: true, detail: "농지전용허가·협의 완료" };
  }
  if (d.isFarmDevZone && input.landArea < FARM_DEV_MAX_AREA) {
    return { isBusiness: true, detail: "농지개발사업지구 1,500㎡ 미만" };
  }
  if (d.isMarginalFarmProject && input.landArea < FARM_DEV_MAX_AREA) {
    return { isBusiness: true, detail: "한계농지정비사업지구 1,500㎡ 미만" };
  }
  if (d.isReclaimed) {
    return { isBusiness: true, detail: "매립농지" };
  }
  if (d.isPublicProjectUse) {
    return { isBusiness: true, detail: "공익·개발사업 관련 농지" };
  }
  if (d.isSickElderlyRental) {
    return { isBusiness: true, detail: "5년 이상 자경 후 질병·고령 임대 농지" };
  }
  return { isBusiness: false, detail: "농지 사용의제 요건 미충족" };
}

// ============================================================
// NBL-10: 기간기준 분기 (2015.2.2 농지·임야 80% 특례)
// ============================================================

/**
 * 양도일 기준 80%/60% 기간 임계값 결정 (NBL-10).
 * 현행 §104-3 ①: 80% 일괄 (2015.2.2 이후)
 * 2015.2.2 이전 양도 + 농지·임야·목장: 80% 적용 (레거시)
 * 2015.2.2 이후 일반 토지: 80%
 */
export function getPeriodCriteriaThreshold(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): number {
  const t = rules.periodCriteriaThresholds;
  if (!t) return 0.8;
  // 현행법은 80%로 일괄, 분기는 과거 양도 케이스용
  const changeDate = new Date(t.oldThresholdDate);
  if (input.transferDate < changeDate) {
    const isAgricultural =
      isFarmlandType(input.landType) ||
      input.landType === "forest" ||
      input.landType === "pasture";
    return isAgricultural ? t.oldThresholdRatio : t.currentThresholdRatio;
  }
  return t.currentThresholdRatio;
}

// ============================================================
// 메인 함수: judgeNonBusinessLand
// ============================================================

/**
 * 비사업용 토지 판정 메인 함수 (순수 함수).
 *
 * @param input  토지 정보 + 사업용 사용기간 + 유예기간
 * @param rules  판정 기준 규칙 (DB: transfer:special:non_business_land_judgment)
 */
export function judgeNonBusinessLand(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules = DEFAULT_NON_BUSINESS_LAND_RULES,
): NonBusinessLandJudgment {
  const warnings: string[] = [];
  const appliedLawArticles: string[] = [
    NBL.MAIN,
    NBL.CRITERIA,
  ];
  // P1: 판정 단계 기록
  const judgmentSteps: JudgmentStep[] = [];

  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  const totalOwnershipDays = Math.max(
    0,
    differenceInDays(input.transferDate, ownershipStart),
  );

  // ── Step 0: 무조건 사업용 의제 (NBL-01) ──────────────────────────
  const unconditional = checkUnconditionalExemption(input);
  if (unconditional.isExempt) {
    appliedLawArticles.push(NBL.UNCONDITIONAL);
    judgmentSteps.push({
      id: "unconditional_exemption",
      label: "무조건 사업용 의제",
      status: "PASS",
      detail: unconditional.detail,
      legalBasis: NBL.UNCONDITIONAL,
    });
    return makeSurchargeResult(false, `사업용 (무조건 의제: ${unconditional.detail})`, {
      totalOwnershipDays,
      businessUseDays: totalOwnershipDays,
      gracePeriodDays: 0,
      effectiveBusinessDays: totalOwnershipDays,
      businessUseRatio: 1,
      criteria: { rule80Percent: true, rule5Years: false, rule2of3Years: false },
      areaProportioning: undefined,
      unconditionalExemption: {
        isApplied: true,
        reason: unconditional.reason,
        detail: unconditional.detail,
      },
      appliedLawArticles,
      warnings,
      judgmentSteps,
    });
  }
  judgmentSteps.push({
    id: "unconditional_exemption",
    label: "무조건 사업용 의제",
    status: "NOT_APPLICABLE",
    detail: "7가지 무조건 의제 사유 해당 없음 — 개별 판정 진행",
    legalBasis: NBL.UNCONDITIONAL,
  });

  // ── 지목별 독립 판정 분기 (NBL-02/03/04) ─────────────────────────
  // 목장용지
  if (input.landType === "pasture") {
    appliedLawArticles.push(NBL.FOREST_PASTURE);
    const res = judgePasture(input, rules);
    judgmentSteps.push({
      id: "land_type_judgment",
      label: "목장용지 사업용 요건",
      status: res.isBusiness ? "PASS" : "FAIL",
      detail: res.detail,
      legalBasis: NBL.FOREST_PASTURE,
    });
    return makeSurchargeResult(!res.isBusiness, res.detail, {
      totalOwnershipDays,
      businessUseDays: res.isBusiness ? totalOwnershipDays : 0,
      gracePeriodDays: 0,
      effectiveBusinessDays: res.isBusiness ? totalOwnershipDays : 0,
      businessUseRatio: res.isBusiness ? 1 : 0,
      criteria: {
        rule80Percent: res.isBusiness,
        rule5Years: false,
        rule2of3Years: false,
      },
      areaProportioning: res.areaProportioning,
      appliedLawArticles,
      warnings,
      judgmentSteps,
    });
  }

  // 별장부수토지
  if (input.landType === "villa_land") {
    appliedLawArticles.push(NBL.VILLA_OTHER);
    const res = judgeVillaLand(input);
    judgmentSteps.push({
      id: "land_type_judgment",
      label: "별장부수토지 사업용 요건",
      status: res.isBusiness ? "PASS" : "FAIL",
      detail: res.detail,
      legalBasis: NBL.VILLA_OTHER,
    });
    return makeSurchargeResult(!res.isBusiness, res.detail, {
      totalOwnershipDays,
      businessUseDays: res.isBusiness ? totalOwnershipDays : 0,
      gracePeriodDays: 0,
      effectiveBusinessDays: res.isBusiness ? totalOwnershipDays : 0,
      businessUseRatio: res.isBusiness ? 1 : 0,
      criteria: { rule80Percent: res.isBusiness, rule5Years: false, rule2of3Years: false },
      areaProportioning: undefined,
      appliedLawArticles,
      warnings,
      judgmentSteps,
    });
  }

  // 기타토지
  if (input.landType === "other_land") {
    appliedLawArticles.push(NBL.OTHER_LAND);
    const res = judgeOtherLand(input);
    judgmentSteps.push({
      id: "land_type_judgment",
      label: "기타토지 재산세 유형 확인",
      status: res.isBusiness ? "PASS" : "FAIL",
      detail: res.detail,
      legalBasis: NBL.OTHER_LAND,
    });
    return makeSurchargeResult(!res.isBusiness, res.detail, {
      totalOwnershipDays,
      businessUseDays: res.isBusiness ? totalOwnershipDays : 0,
      gracePeriodDays: 0,
      effectiveBusinessDays: res.isBusiness ? totalOwnershipDays : 0,
      businessUseRatio: res.isBusiness ? 1 : 0,
      criteria: { rule80Percent: res.isBusiness, rule5Years: false, rule2of3Years: false },
      areaProportioning: undefined,
      appliedLawArticles,
      warnings,
      judgmentSteps,
    });
  }

  // ── 면적 안분 케이스: 건물/주택 부수 토지 ──────────────────────────
  if (input.landType === "building_site" && input.buildingFootprint !== undefined) {
    appliedLawArticles.push(NBL.BUILDING_SITE);
    const area = calcBuildingLandArea(
      input.landArea,
      input.buildingFootprint,
      input.zoneType,
      rules,
    );

    if (area.nonBusinessArea <= 0) {
      // 배율 이내 → 전체 사업용
      judgmentSteps.push({
        id: "land_type_judgment",
        label: "건물 부수 토지 면적 안분",
        status: "PASS",
        detail: `용도지역 배율(${area.buildingMultiplier}배) 이내 — 전체 사업용`,
        legalBasis: NBL.BUILDING_SITE,
      });
      return makeSurchargeResult(false, "건물 부수 토지 배율 이내 — 전체 사업용", {
        totalOwnershipDays,
        businessUseDays: totalOwnershipDays,
        gracePeriodDays: 0,
        effectiveBusinessDays: totalOwnershipDays,
        businessUseRatio: 1,
        criteria: { rule80Percent: true, rule5Years: false, rule2of3Years: false },
        areaProportioning: area,
        appliedLawArticles,
        warnings,
        judgmentSteps,
      });
    }

    // 배율 초과 → 면적 안분 과세 (초과분은 비사업용)
    judgmentSteps.push({
      id: "land_type_judgment",
      label: "건물 부수 토지 면적 안분",
      status: "FAIL",
      detail: `용도지역 배율(${area.buildingMultiplier}배) 초과 — 비사업용 면적 ${area.nonBusinessArea}㎡ (${Math.round(area.nonBusinessRatio * 100)}%)`,
      legalBasis: NBL.BUILDING_SITE,
    });
    return makeSurchargeResult(true, `건물 부수 토지 배율(${area.buildingMultiplier}배) 초과 — 면적 안분 과세`, {
      totalOwnershipDays,
      businessUseDays: totalOwnershipDays,
      gracePeriodDays: 0,
      effectiveBusinessDays: totalOwnershipDays,
      businessUseRatio: area.nonBusinessRatio,
      criteria: { rule80Percent: false, rule5Years: false, rule2of3Years: false },
      areaProportioning: area,
      appliedLawArticles,
      warnings,
      judgmentSteps,
    });
  }

  if (input.landType === "housing_site" && input.housingFootprint !== undefined) {
    appliedLawArticles.push(NBL.HOUSING_SITE);
    const isUrban = input.isUrbanArea ?? true;
    const area = calcHousingLandArea(input.landArea, input.housingFootprint, isUrban);

    if (area.nonBusinessArea <= 0) {
      judgmentSteps.push({
        id: "land_type_judgment",
        label: "주택 부수 토지 면적 안분",
        status: "PASS",
        detail: `주택 배율(${area.buildingMultiplier}배) 이내 — 전체 사업용`,
        legalBasis: NBL.HOUSING_SITE,
      });
      return makeSurchargeResult(false, "주택 부수 토지 배율 이내 — 전체 사업용", {
        totalOwnershipDays,
        businessUseDays: totalOwnershipDays,
        gracePeriodDays: 0,
        effectiveBusinessDays: totalOwnershipDays,
        businessUseRatio: 1,
        criteria: { rule80Percent: true, rule5Years: false, rule2of3Years: false },
        areaProportioning: area,
        appliedLawArticles,
        warnings,
        judgmentSteps,
      });
    }

    judgmentSteps.push({
      id: "land_type_judgment",
      label: "주택 부수 토지 면적 안분",
      status: "FAIL",
      detail: `주택 배율(${area.buildingMultiplier}배) 초과 — 비사업용 면적 ${area.nonBusinessArea}㎡ (${Math.round(area.nonBusinessRatio * 100)}%)`,
      legalBasis: NBL.HOUSING_SITE,
    });
    return makeSurchargeResult(true, `주택 부수 토지 배율(${area.buildingMultiplier}배) 초과 — 면적 안분 과세`, {
      totalOwnershipDays,
      businessUseDays: totalOwnershipDays,
      gracePeriodDays: 0,
      effectiveBusinessDays: totalOwnershipDays,
      businessUseRatio: area.nonBusinessRatio,
      criteria: { rule80Percent: false, rule5Years: false, rule2of3Years: false },
      areaProportioning: area,
      appliedLawArticles,
      warnings,
      judgmentSteps,
    });
  }

  // ── 기간 기반 판정: 농지/임야/나대지/기타 ─────────────────────────

  // 농지 자경 요건 확인 (NBL-05 재촌 정밀화 + NBL-07 사용의제 + NBL-11 세분화)
  let effectiveBusinessPeriods = [...input.businessUsePeriods];
  let farmlandDeemedBusiness = false;

  if (isFarmlandType(input.landType)) {
    // NBL-07: 농지 사용의제 먼저 확인 (주말농장·한계농지·매립농지·전용허가 등)
    const deeming = checkFarmlandDeeming(input);
    if (deeming.isBusiness) {
      appliedLawArticles.push(NBL.FARMLAND_DEEM);
      farmlandDeemedBusiness = true;
      // 사용의제 → 전체 보유기간 사업용 간주
      effectiveBusinessPeriods = [
        {
          startDate: ownershipStart,
          endDate: input.transferDate,
          usageType: `사용의제(${deeming.detail})`,
        },
      ];
      judgmentSteps.push({
        id: "farmland_deeming",
        label: "농지 사용의제",
        status: "PASS",
        detail: `사용의제 해당 — ${deeming.detail} (전체 보유기간 사업용 간주)`,
        legalBasis: NBL.FARMLAND_DEEM,
      });
    } else {
      // NBL-05: 재촌 정밀 판정 (시군구 코드 / 연접 / 30km)
      const residenceOk = isResidenceValid(
        input.landLocation,
        input.ownerLocation,
        input.adjacentSigunguCodes ?? [],
        rules.farmlandDistanceKm,
      );

      // regionCode 모두 미제공 시 legacy farmerResidenceDistance 사용
      const hasLocationInfo =
        input.landLocation?.sigunguCode || input.ownerLocation?.sigunguCode;
      const legacyDistanceOk =
        input.farmerResidenceDistance === undefined ||
        input.farmerResidenceDistance <= rules.farmlandDistanceKm;

      const finalResidenceOk = hasLocationInfo ? residenceOk : legacyDistanceOk;

      if (!input.farmingSelf) {
        warnings.push("농지 자경 여부=false — 임대 농지는 원칙 비사업용");
        effectiveBusinessPeriods = [];
      } else if (!finalResidenceOk) {
        warnings.push(
          hasLocationInfo
            ? "농지 소재지 재촌 요건 미충족 (시·군·구·연접·30km)"
            : `거주지 거리 ${input.farmerResidenceDistance}km 초과 (한도 ${rules.farmlandDistanceKm}km)`,
        );
        effectiveBusinessPeriods = [];
      }

      // NBL-09: 도시지역 편입유예 보정 (농지)
      if (!farmlandDeemedBusiness && input.urbanIncorporationDate) {
        const grace = checkIncorporationGrace(
          input.urbanIncorporationDate,
          input.transferDate,
          rules,
        );
        if (grace.isApplied) {
          appliedLawArticles.push(NBL.URBAN_GRACE);
          effectiveBusinessPeriods = [
            {
              startDate: ownershipStart,
              endDate: input.transferDate,
              usageType: `편입유예(${grace.graceYears}년)`,
            },
          ];
          farmlandDeemedBusiness = true;
          judgmentSteps.push({
            id: "urban_grace",
            label: "도시지역 편입유예",
            status: "PASS",
            detail: `도시지역 편입 후 ${grace.graceYears}년 유예 적용 — 전체 사업용 간주`,
            legalBasis: NBL.URBAN_GRACE,
          });
        }
      }
    }
  }

  // 임야 세부 요건 (NBL-06) + legacy 영림계획
  let forestDeemedBusiness = false;
  if (input.landType === "forest") {
    // NBL-06: 공익상·산림계획·특수산림·임업후계자·상속 5년 이내
    const forestSpecial = checkForestSpecialRequirement(input);
    if (forestSpecial.isBusiness) {
      appliedLawArticles.push(NBL.FOREST_PASTURE, NBL.FOREST_SPECIAL);
      forestDeemedBusiness = true;
      effectiveBusinessPeriods = [
        {
          startDate: ownershipStart,
          endDate: input.transferDate,
          usageType: `임야특례(${forestSpecial.detail})`,
        },
      ];
      judgmentSteps.push({
        id: "forest_special",
        label: "임야 특수 요건",
        status: "PASS",
        detail: forestSpecial.detail,
        legalBasis: NBL.FOREST_SPECIAL,
      });
    } else {
      // legacy 영림계획 판정 (하위호환)
      if (!input.forestManagementPlan && !input.forestDetail) {
        warnings.push("임야 영림계획 인가 없음 — 사업용 사용기간 미인정");
        effectiveBusinessPeriods = [];
      }

      // NBL-05: 임야 재촌 요건 (주민등록 필수)
      if (input.landLocation && input.ownerLocation) {
        const residenceOk = isResidenceValid(
          input.landLocation,
          input.ownerLocation,
          input.adjacentSigunguCodes ?? [],
          rules.farmlandDistanceKm,
        );
        if (!residenceOk) {
          warnings.push("임야 재촌 요건 미충족 (시·군·구·연접·30km)");
          effectiveBusinessPeriods = [];
        }
        if (input.ownerLocation.hasResidentRegistration === false) {
          warnings.push("임야 재촌 요건: 주민등록 필수 — 미등록");
          effectiveBusinessPeriods = [];
        }
      }
      judgmentSteps.push({
        id: "forest_special",
        label: "임야 특수 요건",
        status: "NOT_APPLICABLE",
        detail: "공익상·산림계획·특수산림·임업후계자 등 특수 요건 미해당",
        legalBasis: NBL.FOREST_SPECIAL,
      });
    }
  }

  // unavoidableReasons → GracePeriod[] 변환 후 gracePeriods에 병합
  const mergedGracePeriods: GracePeriod[] = [
    ...input.gracePeriods,
    ...(input.unavoidableReasons ?? []).map((u) => ({
      type: "unavoidable" as GracePeriodType,
      startDate: u.startDate,
      endDate: u.endDate,
    })),
  ];

  // 유효 사업용 일수 계산
  const { businessUseDays, gracePeriodDays, effectiveDays } = calculateEffectiveDays(
    effectiveBusinessPeriods,
    mergedGracePeriods,
    ownershipStart,
    input.transferDate,
    rules,
  );

  const effectiveBusinessDays = Math.min(effectiveDays, totalOwnershipDays);
  const businessUseRatio =
    totalOwnershipDays > 0
      ? Math.round((effectiveBusinessDays / totalOwnershipDays) * 10000) / 10000
      : 0;

  // 3가지 기준 판정 (소득세법 시행령 §168조의6 ①②③)
  const FIVE_YEARS_DAYS = 5 * 365;   // 1825일
  const THREE_YEARS_MANDATORY = 3 * 365; // 1095일 (rule② 사업용 최소일수)
  const TWO_YEARS_IN_LAST_THREE = 2 * 365; // 730일

  // ① 소유기간의 80% 이상 사업용 (NBL-10: 2015.2.2 이전 농지·임야 특례 분기)
  const thresholdRatio = getPeriodCriteriaThreshold(input, rules);
  const rule80Percent = businessUseRatio >= thresholdRatio;

  // ② 소유기간 5년(1825일) 이상 AND 소유기간 중 사업용 사용일수 1095일(3년) 이상
  //    (창(window) 방식이 아닌 소유 전체 기간의 사업용 합계로 판정 — §168조의6 ① 2호)
  const rule5Years =
    totalOwnershipDays >= FIVE_YEARS_DAYS &&
    effectiveBusinessDays >= THREE_YEARS_MANDATORY;

  // ③ 양도일 직전 1095일(3년) 중 사업용 사용일수 730일(2년) 이상
  //    소유기간 최소 요건 없음 — 소유기간이 3년 미만이면 창이 소유시작일로 클립됨
  const rule2of3Years = checkRecentYearsRule(
    input.transferDate,
    effectiveBusinessPeriods,
    mergedGracePeriods,
    input.acquisitionDate,
    3,
    2,
    rules,
  );

  const isBusiness = rule80Percent || rule5Years || rule2of3Years;
  const isNonBusinessLand = !isBusiness;

  const judgmentReason = buildJudgmentReason(
    isNonBusinessLand,
    businessUseRatio,
    rule80Percent,
    rule5Years,
    rule2of3Years,
  );

  // P1: 3가지 기간 기준 단계 기록
  const pctLabel = Math.round(thresholdRatio * 100);
  judgmentSteps.push({
    id: "criteria_80pct",
    label: `① 보유기간 ${pctLabel}% 이상 사업용`,
    status: rule80Percent ? "PASS" : "FAIL",
    detail: rule80Percent
      ? `사업용 비율 ${Math.round(businessUseRatio * 10000) / 100}% ≥ ${pctLabel}% 충족`
      : `사업용 비율 ${Math.round(businessUseRatio * 10000) / 100}% < ${pctLabel}% 미충족 (사업용 ${effectiveBusinessDays}일 / 전체 ${totalOwnershipDays}일)`,
    legalBasis: NBL.CRITERIA,
  });
  judgmentSteps.push({
    id: "criteria_5years",
    label: "② 직전 5년 중 3년(1095일) 이상 사업용",
    status: rule5Years ? "PASS" : (totalOwnershipDays < FIVE_YEARS_DAYS ? "SKIP" : "FAIL"),
    detail: rule5Years
      ? `보유기간 ${totalOwnershipDays}일(≥5년) 중 사업용 ${effectiveBusinessDays}일(≥1095일) 충족`
      : totalOwnershipDays < FIVE_YEARS_DAYS
        ? `보유기간 ${totalOwnershipDays}일로 5년(1825일) 미만 — 건너뜀`
        : `사업용 ${effectiveBusinessDays}일 < 1095일 미충족`,
    legalBasis: NBL.CRITERIA,
  });
  judgmentSteps.push({
    id: "criteria_2of3years",
    label: "③ 직전 3년 중 2년(730일) 이상 사업용",
    status: rule2of3Years ? "PASS" : "FAIL",
    detail: rule2of3Years
      ? "직전 3년 중 2년(730일) 이상 사업용 사용 충족"
      : `직전 3년 중 사업용 일수 730일 미만 미충족`,
    legalBasis: NBL.CRITERIA,
  });

  return makeSurchargeResult(isNonBusinessLand, judgmentReason, {
    totalOwnershipDays,
    businessUseDays,
    gracePeriodDays,
    effectiveBusinessDays,
    businessUseRatio,
    criteria: { rule80Percent, rule5Years, rule2of3Years },
    areaProportioning: undefined,
    appliedLawArticles,
    warnings,
    judgmentSteps,
  });
}

// ============================================================
// 내부 헬퍼
// ============================================================

function buildJudgmentReason(
  isNonBusiness: boolean,
  ratio: number,
  r80: boolean,
  r5y: boolean,
  r2of3: boolean,
): string {
  if (!isNonBusiness) {
    if (r80) return `사업용 (보유기간 대비 ${Math.round(ratio * 100)}% — ① 80% 기준 충족)`;
    if (r5y) return "사업용 (직전 5년 중 3년(1095일) 이상 — ② 5년 기준 충족)";
    return "사업용 (직전 3년 중 2년(730일) 이상 — ③ 3년 기준 충족)";
  }
  return `비사업용 토지 (3가지 기준 모두 미충족 — 사업용 비율 ${Math.round(ratio * 10000) / 100}%)`;
}

type PartialJudgment = Omit<NonBusinessLandJudgment, "isNonBusinessLand" | "judgmentReason" | "surcharge">;

/** P2: 내부 결과 빌더 — surcharge 구조체를 항상 일관되게 첨부 */
function makeSurchargeResult(
  isNonBusinessLand: boolean,
  judgmentReason: string,
  partial: PartialJudgment,
): NonBusinessLandJudgment {
  return {
    isNonBusinessLand,
    judgmentReason,
    ...partial,
    surcharge: {
      surchargeType: "non_business_land",
      additionalRate: 0.10,
      longTermDeductionExcluded: true, // 비사업용 → 장기보유공제 배제
      basicDeductionApplied: true,     // 기본공제 250만원은 적용 (미등기와 구별)
    },
  };
}

// ── P2: Factory 패턴 공개 API ─────────────────────────────────────

/**
 * 사업용 토지 결과 생성 팩토리.
 * 외부 모듈에서 테스트 픽스처 또는 특례 처리 결과를 만들 때 사용.
 */
export function createBusinessResult(
  reason: string,
  partial: Partial<PartialJudgment> & Pick<PartialJudgment, "judgmentSteps" | "appliedLawArticles" | "warnings">,
): NonBusinessLandJudgment {
  const defaults: PartialJudgment = {
    totalOwnershipDays: 0,
    businessUseDays: 0,
    gracePeriodDays: 0,
    effectiveBusinessDays: 0,
    businessUseRatio: 1,
    criteria: { rule80Percent: true, rule5Years: false, rule2of3Years: false },
    areaProportioning: undefined,
    unconditionalExemption: undefined,
    urbanIncorporationGrace: undefined,
    ...partial,
  };
  return makeSurchargeResult(false, reason, defaults);
}

/**
 * 비사업용 토지 결과 생성 팩토리.
 * 외부 모듈에서 테스트 픽스처 또는 강제 비사업용 처리 결과를 만들 때 사용.
 */
export function createNonBusinessResult(
  reason: string,
  partial: Partial<PartialJudgment> & Pick<PartialJudgment, "judgmentSteps" | "appliedLawArticles" | "warnings">,
): NonBusinessLandJudgment {
  const defaults: PartialJudgment = {
    totalOwnershipDays: 0,
    businessUseDays: 0,
    gracePeriodDays: 0,
    effectiveBusinessDays: 0,
    businessUseRatio: 0,
    criteria: { rule80Percent: false, rule5Years: false, rule2of3Years: false },
    areaProportioning: undefined,
    unconditionalExemption: undefined,
    urbanIncorporationGrace: undefined,
    ...partial,
  };
  return makeSurchargeResult(true, reason, defaults);
}
