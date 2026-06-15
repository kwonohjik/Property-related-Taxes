/**
 * 재산세 계산 엔진 공유 타입 정의
 *
 * P1-01: PropertyTaxInput / PropertyTaxResult
 * P1-02: 서브엔진 4종 함수 시그니처 (구현은 각 파일)
 *
 * 하위 모듈 간 데이터 계약:
 *   - property-object.ts              (과세대상 판정)
 *   - property-land-classification.ts (토지 3분류)
 *   - property-house-scope.ts         (주택 범위·겸용·오피스텔)
 *   - property-tax-comprehensive-aggregate.ts (종합합산)
 *   - separate-aggregate-land.ts      (별도합산)
 *   - separate-taxation.ts            (분리과세)
 *   - property-tax.ts                 (메인 통합 엔진)
 */

import type {
  PropertyTaxpayerType,
  CoOwnershipShare,
} from "./property-object.types";

// ============================================================
// 1. 입력 타입 — PropertyTaxInput
// ============================================================

/**
 * 재산세 물건 유형 (지방세법 §104)
 * - housing   : 주택 (아파트·단독·연립·다세대)
 * - land      : 토지 (주택 외)
 * - building  : 건축물 (주거 외)
 * - vessel    : 선박
 * - aircraft  : 항공기
 */
export type PropertyObjectType =
  | "housing"
  | "land"
  | "building"
  | "vessel"
  | "aircraft";

/**
 * 건축물 세율 유형 (지방세법 §111①3)
 * - general     : 일반 건축물 0.25%
 * - golf_course : 골프장 4%
 * - luxury      : 고급오락장 4%
 * - factory     : 공장 0.5% (도시지역 내 신·증설)
 */
export type BuildingTaxType = "general" | "golf_course" | "luxury" | "factory";

/**
 * 화재위험 건축물 등급 — 소방분 지역자원시설세 중과 (지방세법 §146③2호·2의2호, 시행령 §138)
 * - none             : 중과 없음 (×1)
 * - fire_hazard       : 화재위험 건축물 — §146③2호 ×2 (시행령 §138①: 4~10층·학원·극장·유흥장·숙박·공장·창고·주유소·위험물 등)
 * - large_fire_hazard : 대형 화재위험 건축물 — §146③2의2호 ×3 (시행령 §138②: 11층↑·대형마트·백화점·호텔·복합상영관·3만㎡↑ 복합건축물 등)
 */
export type FireHazardClass = "none" | "fire_hazard" | "large_fire_hazard";

/**
 * 토지 재산세 과세 유형 (지방세법 §106)
 * - comprehensive_aggregate : 종합합산과세대상 (§106①1호)
 * - separate_aggregate      : 별도합산과세대상 (§106①2호) — P4 구현
 * - separated               : 분리과세대상 (§106②) — P5 구현
 */
export type LandTaxType =
  | "comprehensive_aggregate"
  | "separate_aggregate"
  | "separated";

/**
 * 재산세 메인 계산 입력 (지방세법 §110)
 */
export interface PropertyTaxInput {
  /** 물건 유형 */
  objectType: PropertyObjectType;

  /** 공시가격 (원) — 주택공시가격·개별공시지가·기준시가 등 */
  publishedPrice: number;

  /**
   * 직전연도 시가표준액(공시가격, 원) — 주택 과세표준상한제(지방세법 §110③) 계산용.
   * 미입력 시 상한 미작동(시행령 §109의2① 단서). objectType==="housing" 외에는 무시.
   */
  priorYearPublishedPrice?: number;

  /** 1세대 1주택 특례 적용 여부 (지방세법 §111③) — 주택 전용 */
  isOneHousehold?: boolean;

  /** 도시지역 내 토지·건축물 여부 → 도시지역분(0.14%) 과세 (지방세법 §112) */
  isUrbanArea?: boolean;

  /** 건축물 세율 구분 — objectType==="building" 일 때 필수 */
  buildingType?: BuildingTaxType;

  /**
   * 화재위험 건축물 등급 — 소방분 지역자원시설세 중과 (지방세법 §146③2호·2의2호).
   * objectType==="building" 전용. 미지정/"none"=중과 없음(×1).
   */
  fireHazardClass?: FireHazardClass;

  /**
   * 주택 건축물 부분 시가표준액 (원) — 주택 소방분 지역자원시설세 과세표준(지방세법 §146④ 단서, §4② 지자체장 산정).
   * objectType==="housing" 전용·선택. 미입력 시 주택 소방분 미산출. 주택공시가격(publishedPrice=토지+건물)과 별개.
   */
  housingBuildingValue?: number;

  /**
   * 전년도 재산세 납부세액 (원) — 세부담상한 계산에 사용
   * 미입력 시 세부담상한 생략 + warnings에 안내 추가
   */
  previousYearTax?: number;

  /** 계산 기준일 (YYYY-MM-DD, 기본: 과세기준일 6월 1일) */
  targetDate?: string;

  /**
   * 토지 과세 유형 — objectType==="land" 일 때 사용 (지방세법 §106)
   * - separate_aggregate : 별도합산 엔진 (P4) 호출
   * - 미입력/기타: 스텁 에러 (P5 이후 구현 예정)
   */
  landTaxType?: LandTaxType;

  /**
   * 분리과세 판정 입력 — landTaxType==="separated" 시 사용
   * assessedValue는 publishedPrice에서 자동 설정됨
   */
  separateTaxationItem?: {
    landCategory?: string;
    actualUsage?: string;
    isFarmland?: boolean;
    isLivestockFarm?: boolean;
    isProtectedForest?: boolean;
    isFactoryLand?: boolean;
    factoryLocation?: "industrial_zone" | "urban" | "other";
    isSaltField?: boolean;
    isTerminalOrParking?: boolean;
    isGolfCourse?: boolean;
    golfCourseType?: "member" | "public" | "simple";
    isHighClassEntertainment?: boolean;
    area?: number;
    ownerType?: "individual" | "corporation";
  };

  /**
   * 별도합산 단일 필지 데이터 — landTaxType==="separate_aggregate" 시 필수
   * 복수 필지 인별 합산은 API Orchestrator에서 직접 calculateSeparateAggregateTax() 호출
   */
  separateAggregateItem?: {
    id: string;
    jurisdictionCode: string;
    landArea: number;
    officialLandPrice: number;
    zoningDistrict:
      | "commercial"
      | "industrial"
      | "residential"
      | "green"
      | "management"
      | "agricultural"
      | "nature_preserve";
    buildingFloorArea?: number;
    isFactory?: boolean;
    factoryStandardArea?: number;
    demolished?: boolean;
    demolishedDate?: string;
  };

  /**
   * 납세의무자(지방세법 §107) 판정 입력 — 선택. 미입력 시 납세의무자 판정 생략(계산 100% 불변).
   * 특수 케이스(신탁·상속 미등기·공유·사실상소유자 불일치)에만 추가 필드 입력.
   */
  taxpayerInfo?: {
    /** 공부상 소유자 식별자 (§107②1호 fallback) */
    registeredOwner: string;
    /** 사실상 소유자 — 공부와 불일치 시 납세의무자(§107①본문) */
    actualOwner?: string;
    /** 신탁재산 여부 (§107②5호) */
    isTrust?: boolean;
    /** 신탁 유형 (자익/타익) */
    trustType?: "self" | "other";
    /** 위탁자(신탁 설정자) — isTrust 시 납세의무자(§107②5호, 현행법) */
    settlor?: string;
    /** 상속 미등기 여부 (§107②2호) */
    isInheritanceUnregistered?: boolean;
    /** 상속인 목록 (상속 미등기 시) */
    heirs?: string[];
    /** 공유 지분 목록 (§107①1호) — 2인 이상 시 지분별 안분 */
    coOwnershipShares?: CoOwnershipShare[];
  };
}

// ============================================================
// 2. 결과 타입 — PropertyTaxResult
// ============================================================

/**
 * 부가세 상세 (지방교육세·도시지역분·지역자원시설세)
 */
export interface PropertySurtaxDetail {
  /** 지방교육세 = 재산세 × 20% (지방세법 §151) */
  localEducationTax: number;
  /** 도시지역분 = 과세표준 × 0.14% (지방세법 §112, 도시지역만) */
  urbanAreaTax: number;
  /** 지역자원시설세 — 화재위험 중과 적용 후 최종 (지방세법 §146) */
  regionalResourceTax: number;
  /** 중과 전 §146③1호 base 소방분 (building + 화재위험 중과 시에만 노출) */
  regionalResourceTaxBeforeSurcharge?: number;
  /** 화재위험 중과 배율 — 2(§146③2호) 또는 3(§146③2의2호) (building + 중과 시에만) */
  fireHazardMultiplier?: number;
  /** 주택 건물분 소방분 과세표준 = 건물분가액 × 공정시장가액비율 (지방세법 §146④ 단서, housing 산출 시에만) */
  housingFireServiceTaxBase?: number;
}

/**
 * 분납 안내 (지방세법 §115)
 */
export interface InstallmentInfo {
  /** 분납 가능 여부 (산출세액 > 200,000) */
  eligible: boolean;
  /** 1차 납부액 (7월) */
  firstPayment: number;
  /** 2차 납부액 (9월) */
  secondPayment: number;
}

/**
 * 납세의무자 판정 결과 (지방세법 §107) — taxpayerInfo 입력 시에만 PropertyTaxResult에 포함.
 */
export interface PropertyTaxpayerInfo {
  /** 납세의무자 유형 (§107 각 호) */
  type: PropertyTaxpayerType;
  /** 납세의무자 식별자 (공유는 대표=지분 최대자) */
  name: string;
  /** 법령 근거 */
  legalBasis: string;
  /** 납세의무자 판정 관련 경고 (공유 대표·신탁 위탁자 미입력 등) */
  warnings: string[];
}

/**
 * 공유재산 지분별 세액 안분 (지방세법 §107①1호) — co_owner + 지분 2인 이상 시.
 * 본세(determinedTax)와 부가세 포함 고지액(totalPayable) 두 기준을 모두 제공.
 */
export interface PropertyCoOwnershipDistribution {
  distributions: Array<{
    /** 공유자 식별자 */
    ownerId: string;
    /** 지분율 */
    shareRatio: number;
    /** 본세(determinedTax) 지분 안분액 (원) — floor 잔액은 마지막 공유자 흡수 */
    taxAmount: number;
    /** 부가세 포함 고지액(totalPayable) 지분 안분액 (원) */
    totalAmount: number;
  }>;
  /** 안분 합산 오차 (본세 기준, 0이어야 정상) */
  roundingDiff: number;
}

/**
 * 재산세 메인 계산 결과
 *
 * ※ 종부세 연동 핵심 필드:
 *   - taxBase       : 재산세 과세표준 → 종부세 비율 안분에 사용
 *   - determinedTax : 재산세 부과세액 → 종부세 재산세공제에 사용
 */
export interface PropertyTaxResult {
  // ── 과세표준 ──
  /** 공정시장가액비율 적용 전 공시가격 */
  publishedPrice: number;
  /** 공정시장가액비율 (주택 0.60 / 토지·건축물 0.70) */
  fairMarketRatio: number;
  /** 과세표준 = 공시가격 × 공정시장가액비율 → 천원 절사 (지방세법 §110). 주택은 §110③ 과세표준상한 적용 후 값 */
  taxBase: number;

  // ── 과세표준상한 (주택, 지방세법 §110③ — housing 적용 시에만) ──
  /** 과세표준상한 적용 전 당해연도 과세표준 (= calcTaxBase 원값) */
  taxBaseBeforeCap?: number;
  /** §110③ 과세표준상한 실제 적용 여부 (상한액 < 당해 과세표준일 때만 true) */
  taxBaseCapApplied?: boolean;
  /** 과세표준상한액 = 직전연도 과세표준 상당액 + (당해 과세표준 × 5%) */
  taxBaseCapLimit?: number;
  /** 직전연도 과세표준 상당액 = 직전 시가표준액 × 당해 공정시장가액비율 (시행령 §109의2①) */
  priorYearTaxBaseEquivalent?: number;
  /** 과세표준상한율 (시행령 §109의2② — 0.05) */
  taxBaseCapRate?: number;

  // ── 산출세액 ──
  /** 적용 세율 (소수, 예: 0.001 = 0.1%) */
  appliedRate: number;
  /** 산출세액 (세율 적용 후 원 미만 절사) */
  calculatedTax: number;

  // ── 세부담상한 ──
  /** 세부담상한 적용 전 산출세액 */
  calculatedTaxBeforeCap: number;
  /** 세부담상한율 (예: 1.05 = 105%) — 미적용 시 1 */
  taxCapRate: number;
  /** 세부담상한 적용 후 확정세액 */
  determinedTax: number;

  // ── 부가세 ──
  /** 부가세 상세 */
  surtax: PropertySurtaxDetail;
  /** 합산 부가세 */
  totalSurtax: number;

  // ── 최종 납부세액 ──
  /** 총 납부세액 = determinedTax + totalSurtax */
  totalPayable: number;

  // ── 분납 안내 ──
  installment: InstallmentInfo;

  // ── 메타 ──
  /** 1세대1주택 특례 적용 여부 */
  oneHouseSpecialApplied: boolean;
  /** 계산 근거 법령 목록 */
  legalBasis: string[];
  /** 경고 메시지 (전년도 세액 미입력 등) */
  warnings: string[];
  /** 계산 기준일 */
  targetDate: string;

  // ── 납세의무자 (지방세법 §107) — taxpayerInfo 입력 시에만 ──
  /** 납세의무자 판정 결과 */
  taxpayer?: PropertyTaxpayerInfo;
  /** 공유재산 지분별 안분 (co_owner + 지분 2인 이상) */
  coOwnershipDistribution?: PropertyCoOwnershipDistribution;
}

// ============================================================
// 3. 서브엔진 함수 시그니처 (P1-02) — 구현은 각 파일에 있음
// ============================================================

/**
 * 과세대상 판정 서브엔진 인터페이스 (P2 구현)
 * property-object.ts의 determinePropertyTaxObject()
 */
export interface PropertyObjectDetermination {
  /** 과세 대상 여부 */
  isSubjectToTax: boolean;
  /** 비과세 여부 (§109) */
  isExempt: boolean;
  /** 비과세 사유 */
  exemptReason?: string;
  /** 감면율 (0~1) */
  reductionRate?: number;
  /** 최종 공시가격 (겸용·부속토지 분리 후) */
  adjustedPrice: number;
  /** 법령 근거 */
  legalBasis: string[];
  /** 경고 */
  warnings: string[];
}

/**
 * 종합합산 토지 세액 계산 서브엔진 인터페이스 (P3 구현)
 * property-tax-comprehensive-aggregate.ts의 calculateComprehensiveAggregate()
 */
export interface ComprehensiveAggregateTaxResult {
  /** 인별 전국 합산 과세표준 */
  totalTaxBase: number;
  /** 산출세액 */
  calculatedTax: number;
  /** 세부담상한 적용 후 확정세액 */
  determinedTax: number;
  /** 지자체별 안분세액 목록 */
  jurisdictionAllocation: Array<{
    jurisdiction: string;
    allocationRatio: number;
    allocatedTax: number;
  }>;
  legalBasis: string[];
  warnings: string[];
}

/**
 * 별도합산 토지 세액 계산 서브엔진 인터페이스 (P4 구현)
 * separate-aggregate-land.ts의 calculateSeparateAggregateTax()
 */
export interface SeparateAggregateTaxResult {
  /** 기준면적 이내 과세표준 */
  recognizedTaxBase: number;
  /** 기준면적 초과분 (종합합산 이관) */
  excessTaxBase: number;
  /** 산출세액 */
  calculatedTax: number;
  /** 확정세액 */
  determinedTax: number;
  legalBasis: string[];
  warnings: string[];
}

/**
 * 분리과세 토지 세액 계산 서브엔진 인터페이스 (P5 구현)
 * separate-taxation.ts의 calculateSeparateTaxationTax()
 */
export interface SeparateTaxationTaxResult {
  /** 분리과세 유형 (low_rate | general | heavy) */
  category: "low_rate" | "general" | "heavy";
  /** 적용 세율 */
  appliedRate: number;
  /** 산출세액 */
  calculatedTax: number;
  /** 종부세 배제 여부 */
  excludedFromComprehensive: boolean;
  legalBasis: string[];
  warnings: string[];
}
