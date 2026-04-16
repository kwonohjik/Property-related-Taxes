/**
 * 재산세 과세대상 판정 타입 정의 (P2-01~04)
 *
 * 지방세법 §104(과세대상 정의) ~ §109(비과세)
 *
 * 담당 모듈:
 *   property-object.ts             — 과세대상 판정 + 물건 분류
 *   property-taxpayer.ts           — 납세의무자 확정
 *   property-land-classification.ts — 토지 3분류
 *   property-house-scope.ts        — 주택 범위·겸용·오피스텔
 *   property-exemption.ts          — 비과세·감면
 */

// ============================================================
// P2-01: 물건·분류·용도지역 유니온 타입
// ============================================================

/**
 * 재산세 과세대상 물건 유형 5종 (지방세법 §105 열거주의)
 *
 * 취득세와 달리 재산세는 차량·기계장비·광업권·어업권·회원권·입목을 제외
 */
export type PropertyTaxObjectType =
  | "land"       // 토지 (3분류: 종합합산·별도합산·분리과세)
  | "building"   // 건축물 (주택 외)
  | "house"      // 주택 (건물 + 부속토지 통합 과세)
  | "vessel"     // 선박
  | "aircraft";  // 항공기

/**
 * 토지 재산세 분류 (지방세법 §106)
 * - general_aggregate  : 종합합산 (나대지·잡종지 등, 전국합산·누진 0.2~0.5%)
 * - separate_aggregate : 별도합산 (영업용 건물 부속토지 한도 내, 0.2~0.4%)
 * - separate_taxation  : 분리과세 (자경농지·골프장 등, 0.07%/0.2%/4%)
 * - split              : 별도합산 + 초과분 종합합산 (면적 초과 시)
 * - exempt             : 비과세 (§109)
 */
export type LandClassification =
  | "general_aggregate"
  | "separate_aggregate"
  | "separate_taxation"
  | "split"
  | "exempt";

/**
 * 용도지역 7종 (국토의 계획 및 이용에 관한 법률 §36)
 * 별도합산 기준면적 배율 산정에 사용
 */
export type ZoningDistrictType =
  | "residential"      // 주거지역 (배율 5배)
  | "commercial"       // 상업지역 (배율 3배)
  | "industrial"       // 공업지역 (배율 4배)
  | "green"            // 녹지지역 (배율 5배)
  | "management"       // 관리지역 (배율 5배)
  | "agricultural"     // 농림지역 (배율 7배)
  | "nature_preserve"; // 자연환경보전지역 (배율 7배)

/**
 * 분리과세 토지 세부 유형 (지방세법 §106②, 시행령 §102)
 */
export type SeparateTaxationLandType =
  // 저율 0.07%
  | "farmland_self_cultivated"   // 자경농지 (농업인 직접 경작)
  | "cattle_farmland"            // 목장용지 (기준면적 이내)
  | "forest_protected"           // 보전산지·임업후계림
  // 일반 0.2%
  | "factory_site_industrial"    // 공장용지 (산업단지·지정지역)
  | "tourism_site"               // 관광단지 토지
  | "industrial_complex"         // 산업단지 토지
  // 고율 4%
  | "golf_course"                // 회원제 골프장
  | "luxury_entertainment_site"  // 고급오락장 부속토지
  | "villa_site";                // 고급별장 부속토지

/**
 * 주택 구조 유형
 */
export type HouseStructureType =
  | "single_detached"          // 단독주택
  | "multi_household"          // 다가구주택 (1구 1주택)
  | "multiplex"                // 다세대주택
  | "apartment"                // 아파트
  | "townhouse"                // 연립주택
  | "officetel_residential"    // 오피스텔 (주거용)
  | "dormitory";               // 기숙사

// ============================================================
// P2-02: 물건별 상세 입력 타입
// ============================================================

/**
 * 토지 상세 입력 (지방세법 §106 분류에 사용)
 */
export interface LandInput {
  /** 토지 면적 (m²) */
  landArea: number;
  /** 지목·이용현황 (예: "전", "답", "대", "잡종지") */
  landUse: string;
  /** 용도지역 (별도합산 배율 결정) */
  zoningDistrict: ZoningDistrictType;
  /** 농지 여부 */
  isFarmland: boolean;
  /** 농업인 직접 자경 여부 (분리과세 0.07% 요건) */
  isSelfCultivated?: boolean;
  /** 농업인 해당 여부 */
  isFarmer?: boolean;
  /** 산업단지·공업지역 지정 여부 */
  isIndustrialDistrict?: boolean;
  /** 회원제 골프장 해당 여부 */
  isMemberGolf?: boolean;
  /** 관광단지 해당 여부 */
  isTourismSite?: boolean;
  /** 보전산지·임업후계림 해당 여부 */
  isProtectedForest?: boolean;
  /** 목장용지 해당 여부 */
  isCattleFarmland?: boolean;
  /** 고급오락장·별장 해당 여부 */
  isLuxuryEntertainment?: boolean;
  /**
   * 부속 건축물 바닥면적 (m²)
   * 별도합산 기준면적 계산에 사용 (건축물이 있는 토지)
   */
  buildingFloorArea?: number;
}

/**
 * 건축물 상세 입력
 */
export interface BuildingInput {
  /** 건축물 바닥면적 (m²) */
  floorArea: number;
  /** 건축물 유형 */
  buildingType: "general" | "golf_course" | "luxury" | "factory";
  /** 사용승인 여부 (건설 중 여부 판정) */
  hasUsageApproval: boolean;
  /** 실제 사용 여부 (사용승인 전 사실상 사용 시 과세) */
  isActuallyUsed?: boolean;
}

/**
 * 주택 상세 입력
 */
export interface HouseInput {
  /** 건물 바닥면적 (m²) — 부속토지 한도 계산 기준 */
  buildingFloorArea: number;
  /** 부속토지 면적 (m²) */
  attachedLandArea: number;
  /** 도시지역 내 여부 (한도배율: 도시 5배, 비도시 10배) */
  isUrbanArea: boolean;
  /** 주택 구조 유형 (오피스텔 분기에만 사용, 미입력 시 일반 주택으로 처리) */
  structureType?: HouseStructureType;
  /** 주거 사용 면적 (겸용주택) */
  residentialArea?: number;
  /** 비주거 사용 면적 (겸용주택) */
  nonResidentialArea?: number;
  /** 오피스텔 주거용 신고 여부 */
  isOfficetelResidential?: boolean;
}

// ============================================================
// P2-03: 최상위 입출력 타입
// ============================================================

/**
 * 과세대상 판정 입력
 */
export interface PropertyObjectInput {
  /** 물건 유형 */
  objectType: PropertyTaxObjectType;
  /** 과세기준일 (기본: 해당 연도 6월 1일) */
  assessmentDate?: Date;

  // ── 소유자 ──
  /** 공부상 소유자 식별자 */
  registeredOwner: string;
  /** 사실상 소유자 (공부와 불일치 시) */
  actualOwner?: string;
  /** 소유자 유형 */
  ownerType: "individual" | "corporation" | "government" | "nonprofit";
  /** 공유 지분 목록 */
  coOwnershipShares?: CoOwnershipShare[];

  // ── 신탁 ──
  /** 신탁재산 여부 */
  isTrust?: boolean;
  /** 신탁 유형 (자익/타익) */
  trustType?: "self" | "other";

  // ── 상속 ──
  /** 상속 미등기 여부 */
  isInheritanceUnregistered?: boolean;
  /** 상속인 목록 (상속 미등기 시) */
  heirs?: string[];

  // ── 물건별 상세 ──
  landInfo?: LandInput;
  buildingInfo?: BuildingInput;
  houseInfo?: HouseInput;

  /** 공시가격 (원) */
  publicPrice: number;
}

/**
 * 과세대상 판정 결과
 */
export interface PropertyObjectResult {
  /** 과세대상 해당 여부 */
  isSubjectToTax: boolean;
  /** 실제 과세 물건 유형 (겸용주택 처리 후 최종 분류) */
  objectType: PropertyTaxObjectType;

  /** 납세의무자 정보 */
  taxpayer: {
    type: PropertyTaxpayerType;
    name: string;
    legalBasis: string;
  };

  /** 비과세·감면 결과 */
  exemption?: {
    isExempt: boolean;
    exemptionType?: PropertyTaxExemption;
    reductionRate?: number;   // 0~1 (감면율)
    reason: string;
  };

  /** 토지 분류 결과 */
  landClassification?: {
    primary: LandClassification;
    separateTaxationType?: SeparateTaxationLandType;
    separateTaxationRate?: number;
    /** 별도합산 인정 면적 (split 시) */
    separateAggregateArea?: number;
    /** 종합합산 전환 면적 (split 시) */
    generalAggregateArea?: number;
  };

  /** 주택 범위 결과 */
  houseScope?: {
    /** 주택분 과세 가액 (건물 + 인정 부속토지) */
    totalHouseValue: number;
    /** 초과 토지 면적 (종합합산 전환) */
    excessLandArea: number;
    /** 초과 토지 공시가격 (원) */
    excessLandValue: number;
    /** 겸용주택 분류 */
    mixedUseClassification?: "full_house" | "partial_house" | "not_house";
  };

  /** 건축물 분류 */
  buildingClassification?: "general" | "golf_course" | "luxury" | "factory";

  /**
   * 최종 공시가격 (원)
   * 겸용주택·부속토지 초과분 분리 후의 실효 공시가격
   */
  adjustedPublicPrice: number;

  /** 과세기준일 */
  assessmentDate: Date;
  /** 경고 메시지 */
  warnings: string[];
  /** 법령 근거 */
  legalBasis: string[];
}

// ============================================================
// P2-04: 공유지분 + 납세의무자 유형
// ============================================================

/**
 * 공유재산 지분 (지방세법 §107③)
 */
export interface CoOwnershipShare {
  /** 공유자 식별자 */
  ownerId: string;
  /** 지분율 (0 초과 1 이하, 모든 지분의 합 = 1) */
  shareRatio: number;
}

/**
 * 납세의무자 유형 8종 (지방세법 §107)
 */
export type PropertyTaxpayerType =
  | "registered_owner"        // 공부상 소유자 (원칙)
  | "actual_owner"            // 사실상 소유자
  | "co_owner"                // 공유자 (지분별 안분)
  | "trustee"                 // 신탁 수탁자 (§107의2)
  | "beneficiary"             // 신탁 수익자
  | "heir_representative"     // 상속 미등기 주된 상속인 (§107②)
  | "construction_contractor" // 건설 중 건축물 건축주
  | "lessee";                 // 지상권자·임차인

// ============================================================
// 비과세·감면 유형 (에이전트 §6 참조)
// ============================================================

/**
 * 비과세 사유 8종 (지방세법 §109)
 */
export type PropertyTaxExemption =
  | "government_owned"          // 국가·지자체 소유 (§109①)
  | "government_free_use"       // 국가 등 1년+ 무상사용 (§109①)
  | "public_use_land"           // 도로·하천·묘지 등 공공용 (§109③)
  | "temporary_building"        // 임시건축물 1년 미만 (§109②)
  | "building_to_be_demolished" // 철거 예정 건축물 (§109②)
  | "religious_nonprofit_use"   // 종교·자선·학술 용도 (§109②)
  | "military_use"              // 군사 목적 (§109①)
  | "foreign_government";       // 외국정부 소유 상호주의 (§109①)

/**
 * 감면 유형 6종 (지방세특례제한법)
 */
export type PropertyTaxReduction =
  | "public_rental_housing"     // 공공임대주택
  | "long_term_rental_housing"  // 장기임대주택
  | "small_business_factory"    // 중소기업 공장
  | "cultural_heritage"         // 문화재
  | "disabled_person_residence" // 장애인 거주
  | "multi_child_family";       // 다자녀 가구
