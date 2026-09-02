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
  PropertyHeir,
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
 * 건축물 세율 유형 (지방세법 §111①2호)
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

  /** 1세대 1주택 특례 적용 여부 (지방세법 §111의2) — 주택 전용 */
  isOneHousehold?: boolean;

  /** 도시지역 내 토지·건축물 여부 → 도시지역분(0.14%) 과세 (지방세법 §112) */
  isUrbanArea?: boolean;

  /** 건축물 세율 구분 — objectType==="building" 일 때 필수 */
  buildingType?: BuildingTaxType;

  /** 선박 유형 — objectType==="vessel" 전용. luxury=고급선박(§13⑤5호, 5%). 기본 general(0.3%) */
  vesselType?: "general" | "luxury";

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
   * 전년도 재산세 납부세액 (원) — 세부담상한 계산에 사용 (direct 모드, §118 단서)
   * 미입력 시 세부담상한 생략 + warnings에 안내 추가
   */
  previousYearTax?: number;
  /** 직전연도 과세표준 (원) — recompute 모드(§118 본문) 직전 세율 재산정용 (건축물·선박·종합합산) */
  previousYearTaxBase?: number;
  /** 세부담상한 모드 — "direct"(직전 세액 직접입력, 기본) | "recompute"(직전 과세표준 재산정) */
  taxCapMode?: "direct" | "recompute";

  /**
   * [부칙 제15조 경과조치] 직전연도 주택 재산세 본세 (§112①1호, 고지서 '재산세' 항목).
   * objectType==="housing" 전용. 입력 시 2024~2028 종전 §122(공시 구간별 105/110/130%) 세부담상한 적용.
   * 미입력 시 상한 미적용 + warnings. 종부세 내부 호출은 미전달 → 회귀 0. (§118 단서: 직전 실제 과세 세액)
   */
  previousYearHousingBaseTax?: number;

  /**
   * [부칙 제15조 경과조치 v2] 직전연도 주택 도시지역분 세액(§112①2호, 고지서 '도시지역분' 항목).
   * objectType==="housing" + isUrbanArea 전용. 입력 시 2024~2028 종전 §122 세부담상한을 도시지역분에
   * **본세와 별개로 각각** 적용(시행령 §118 본문). capRate는 본세와 동일(공시 구간별 105/110/130%).
   * 미입력 시 도시지역분 상한 미적용. 종부세 내부 호출은 미전달 → 회귀 0. (§118 2호 가목 단서: 직전 실제 과세 세액)
   */
  previousYearHousingUrbanTax?: number;

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
    /** 목장용지 전체 면적 (㎡) — §102①3호 "…계산한 토지면적의 범위에서 소유하는 토지" */
    pastureTotalLandArea?: number;
    /** 축종 키 — §102①3호 [표] 9종 */
    pastureLivestockType?: string;
    /** 가축 마릿수 — **직전 연도 연중 최고** (양도세 별표1의3의 「과세기간 평균」과 다름) */
    pastureLivestockCount?: number;
    /** 부대시설·초지·사료포 보유 — 없는 시설의 몫은 기준면적에 얹지 않는다 */
    pastureHasFacility?: boolean;
    pastureHasGrassland?: boolean;
    pastureHasFodder?: boolean;
    /** §102⑨1호 — 도시지역 목장용지 여부 */
    pastureIsUrbanArea?: boolean;
    /** §102⑨1호 — 1989.12.31 이전부터 소유(1990.1.1 이후 상속·법인합병 포함) */
    pastureOwnedBefore1990?: boolean;
    isProtectedForest?: boolean;
    isFactoryLand?: boolean;
    factoryLocation?: "industrial_zone" | "urban" | "other";
    /** 공장 전체 부속토지 면적 (㎡) — §102①1호 "기준면적 범위의 토지" 판정 대상 */
    factoryTotalLandArea?: number;
    /** 공장건축물 **연면적** (㎡) — 바닥면적이 아니다 (별표6 2호가) */
    factoryFloorArea?: number;
    /** 업종별 기준공장면적률 (%) — 「공장입지 기준고시」 별표1 */
    factoryAreaRatePercent?: number;
    /** 별표6 3호가1) 「산집법」 §20① 제한지역 — 추가 인정한도 10%(3,000㎡) / 그 밖 20% */
    factoryIsRestrictedZone?: boolean;
    /** 별표6 3호나·다·라·바 추가 인정면적 (㎡). 마목 제외 — 부속토지 면적 쪽에 넣는다. */
    factoryAdditionalRecognizedArea?: number;
    /** 별표6 3호바 종업원용 체육시설용지 (㎡) — 기준면적의 10% 이내로 clamp (E4-06) */
    factoryEmployeeSportsArea?: number;
    /** §102①1호 단서 — 허가·사용승인 미이행 → 분리과세 전량 제외 */
    factoryIsUnpermitted?: boolean;
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
    /** 용도지역 — 「지방세법 시행령」 §101② 적용배율 결정. `ZoningDistrict`와 동일 집합. */
    zoningDistrict:
      | "exclusive_residential"
      | "semi_residential"
      | "commercial"
      | "general_residential"
      | "industrial"
      | "green"
      | "unplanned"
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
    /** 상속인 목록 (상속 미등기 시) — §107②2호 주된 상속자 판정(지분 최대 → 동률 시 연장자) */
    heirs?: PropertyHeir[];
    /** 공유 지분 목록 (§107①1호) — 2인 이상 시 지분별 안분 */
    coOwnershipShares?: CoOwnershipShare[];
    /** 종중재산 미신고 (§107②3호) → 공부상 소유자 */
    isClanProperty?: boolean;
    /** 연부 매매계약자 (§107②4호) — 국가 등과 연부매매 + 무상 사용권 */
    installmentBuyer?: string;
    /** 환지 체비지·보류지 사업시행자 (§107②6호) */
    projectOperator?: string;
    /** 외국인 항공기·선박 수입자 (§107②7호) */
    importer?: string;
    /** 파산재단 재산 (§107②8호) → 공부상 소유자 */
    isBankruptcyEstate?: boolean;
    /** 소유권 귀속 불명 시 사용자 (§107③) */
    ownershipUnclearUser?: string;

    // ── §107①2호: 주택 건물·부속토지 소유자 분리 ──
    /**
     * 주택 건물·부속토지 소유자 분리 여부 (지방세법 §107①2호).
     * true 시 buildingOwner·landOwner·landStdValue 모두 입력 필수.
     * 건물 시가표준액은 PropertyTaxInput.housingBuildingValue(§146④ 재사용) — 여기 넣지 않음.
     */
    isHouseSplit?: boolean;
    /** 건축물 소유자 식별자 (§107①2호) */
    buildingOwner?: string;
    /** 부속토지 소유자 식별자 (§107①2호) */
    landOwner?: string;
    /**
     * 부속토지 시가표준액 (원, §4① 개별공시지가 × 면적).
     * §107①2호 안분 기준. objectType==="housing" 전용.
     */
    landStdValue?: number;
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
 * §107①2호 주택 건물·부속토지 소유자 분리 세액 안분 결과.
 * objectType==="housing" + taxpayerInfo.isHouseSplit===true 시에만 PropertyTaxResult에 포함.
 *
 * 안분 알고리즘 (BigInt 전체 연산 — overflow 방지):
 *   buildingTaxAmount = floor(determinedTax × buildingStdValue / sum)
 *   landTaxAmount     = determinedTax − buildingTaxAmount  (잔액 흡수)
 *   동일 패턴으로 totalPayable 안분
 */
export interface PropertyHouseSplitDistribution {
  /** 건축물 소유자 식별자 */
  buildingOwner: string;
  /** 건축물 시가표준액 (원, §4② — housingBuildingValue 재사용) */
  buildingStdValue: number;
  /** 건축물 소유자 귀속 본세 (determinedTax 안분액, 원) */
  buildingTaxAmount: number;
  /** 건축물 소유자 귀속 고지액 (totalPayable 안분액, 원) */
  buildingTotalAmount: number;
  /** 부속토지 소유자 식별자 */
  landOwner: string;
  /** 부속토지 시가표준액 (원, §4① 개별공시지가 × 면적) */
  landStdValue: number;
  /** 부속토지 소유자 귀속 본세 (determinedTax 잔액 흡수, 원) */
  landTaxAmount: number;
  /** 부속토지 소유자 귀속 고지액 (totalPayable 잔액 흡수, 원) */
  landTotalAmount: number;
  /** 건물 안분 비율 = buildingStdValue / (buildingStdValue + landStdValue) — 표시용 */
  buildingRatio: number;
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
  /** 세부담상한 산정 모드 — direct(직전 세액 직접입력) | recompute(직전 과표 재산정, §118 본문). 미적용 시 undefined */
  taxCapMode?: "direct" | "recompute";
  /** 세부담상한(§122) 기준 직전연도 세액상당액 (cap 비교 기준값) */
  taxCapBasisTax?: number;
  /** recompute 모드 재산정 상세 (direct·미적용 시 undefined) */
  recomputeDetail?: {
    /** 직전 연도 (taxYear - 1) */
    priorYear: number;
    /** 직전 과세표준 (= previousYearTaxBase) */
    priorTaxBase: number;
    /** 직전 단일세율 (건축물·선박·항공기). 누진 토지는 undefined */
    appliedRate?: number;
    /** 재산정 직전 세액상당액 (= taxCapBasisTax) */
    recomputedTax: number;
  };

  /**
   * 주택 세부담상한 경과조치(부칙 제15조) 적용 결과 — objectType==="housing" + 경과조치 적용 시에만.
   * v1 본세. 도시지역분(§112①2호) 상한은 v2.
   */
  housingTransitionalCap?: {
    /** 경과조치 상한 실제 적용 여부 */
    applied: boolean;
    /** 공시가격 구간별 상한율 (1.05/1.10/1.30) */
    capRate: number;
    /** 직전연도 본세 (입력값, §118 단서) */
    previousYearBaseTax: number;
    /** 본세 상한 한도 = floor(직전본세 × capRate) */
    baseCapLimit: number;
    /** 상한 적용 전 산출세액 */
    baseCalculatedTax: number;
    /** 결정 본세 (= determinedTax) */
    baseDeterminedTax: number;
    /** 법령 근거 (부칙 제15조) */
    legalBasis: string;

    // ── [v2 §118 본문 "각각 산출"] 도시지역분(§112①2호) 세부담상한 — isUrbanArea + 직전 도시지역분 입력 + 적용 시에만 ──
    /** 도시지역분 상한 실제 적용 여부 */
    urbanApplied?: boolean;
    /** 직전연도 도시지역분 (입력값, §118 2호 가목 단서) */
    previousYearUrbanTax?: number;
    /** 상한 전 도시지역분 산출 = floor(과세표준 × 0.14%) */
    urbanCalculatedTax?: number;
    /** 도시지역분 상한 한도 = floor(직전 도시지역분 × capRate) — 본세와 동일 capRate */
    urbanCapLimit?: number;
    /** 결정 도시지역분 (= surtax.urbanAreaTax, 상한 적용 후) */
    urbanDeterminedTax?: number;
  };

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
  /**
   * §107①2호 주택 건물·부속토지 소유자 분리 세액 안분.
   * objectType==="housing" + taxpayerInfo.isHouseSplit===true + 시가표준액 양쪽 입력 시에만 존재.
   * 대표 납세의무자(taxpayer.type)는 시가표준액 큰 쪽(building_owner 또는 land_owner).
   */
  houseSplitDistribution?: PropertyHouseSplitDistribution;
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
