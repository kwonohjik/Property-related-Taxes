/**
 * 종합부동산세 계산 엔진 공유 타입 정의
 *
 * 종합부동산세법 §8~§15 기반:
 * - 주택분: 합산배제·기본공제·공정시장가액비율·누진세율·1세대1주택공제·재산세비율안분·세부담상한
 * - 토지분: 종합합산(5억 기본공제)·별도합산(80억 기본공제)
 *
 * 2-레이어 아키텍처:
 *   Layer 1 (Orchestrator): app/api/calc/comprehensive/route.ts
 *   Layer 2 (Pure Engine):  lib/tax-engine/comprehensive-tax.ts
 */

// 법인 §9② 세부 유형·class·조건요건 — 별도 파일(800줄 정책). 로컬 사용 + 하위호환 re-export
import type {
  CorporateHousingClass,
  CorporateHousingType,
  CorporateHousingReqs,
} from "./comprehensive-corporate.types";
export type { CorporateHousingClass, CorporateHousingType, CorporateHousingReqs };

// 직전연도 세부담상한 상당액 타입 — 별도 파일(800줄 정책). 로컬 사용 + 하위호환 re-export
import type {
  PreviousYearAutoInput,
  PriorPropertyTaxLine,
  PreviousYearEquivalentResult,
} from "./comprehensive-prior-year.types";
export type {
  PreviousYearAutoInput,
  PriorPropertyTaxLine,
  PreviousYearEquivalentResult,
};

// ============================================================
// -1. 납세의무자 유형 (종합부동산세법 §9②)
// ============================================================

/**
 * 납세의무자 유형 (§9② 세율 분기 진입)
 *
 * - individual: 개인 (기본, §9① 각호 누진세율)
 * - corporate:  법인 또는 법인으로 보는 단체. 세부 §9② class 는 corporateHousingType +
 *               조건 플래그로 resolveCorporateHousingClass() 가 도출 (단일 진실).
 */
export type ComprehensiveTaxpayerType = "individual" | "corporate";

// ============================================================
// 0. 연도별 세율 구간 (과세연도별 세법 파라미터 — comprehensive-historical.ts)
// ============================================================

/** 주택분 누진세율 구간 (종합부동산세법 §9①) */
export interface ComprehensiveBracket {
  limit: number;       // 구간 상한 (과세표준, 원). 마지막 구간은 Infinity
  rate: number;        // 세율 (0~1)
  deduction: number;   // 누진공제액 (원)
}

// ============================================================
// 1. 합산배제 관련 타입
// ============================================================

/**
 * 합산배제 유형 (종합부동산세법 시행령 §3·§4)
 */
export type ExclusionType =
  | "private_construction_rental"   // 민간건설임대 (시행령 §3①1호)
  | "private_purchase_rental_long"  // 민간매입임대 장기일반 (시행령 §3①8호)
  | "private_purchase_rental_short" // 민간매입임대 단기 구법 (시행령 §3①2호 구법)
  | "public_support_construction_rental" // 공공지원민간임대 건설 (시행령 §3①7호)
  | "public_support_purchase_rental"     // 공공지원민간임대 매입 (시행령 §3①8호)
  | "public_construction_rental"    // 공공건설임대 (시행령 §3①1호)
  | "public_purchase_rental"        // 공공매입임대 (시행령 §3①2호)
  | "existing_rental"               // 기존임대주택 2005년 이전 등록 (시행령 §3①3호)
  | "private_short_term_rental_6y_construction" // 단기민간임대 건설 6년 (시행령 §3①10호)
  | "private_short_term_rental_6y_purchase"     // 단기민간임대 매입 6년 (시행령 §3①11호)
  | "unsold_housing"                // 미분양주택 (시행령 §4①1호)
  | "daycare_housing"               // 가정어린이집용 (시행령 §4①2호)
  | "employee_housing"              // 사원용 (시행령 §4①3호)
  | "developer_unsold"              // 주택건설사업자 미분양 (시행령 §4①4호)
  | "cultural_heritage"             // 문화재 (시행령 §4①5호)
  | "religious"                     // 종교단체 (시행령 §4①6호)
  | "senior_welfare"                // 노인복지주택 (시행령 §4①7호)
  | "none";                         // 합산배제 미신청

/**
 * 임대주택 합산배제 입력 (시행령 §3 요건 판정용)
 */
export interface RentalExclusionInput {
  registrationType:
    | "private_construction"
    | "private_purchase_long"
    | "private_purchase_short"
    | "public_support_construction"  // 공공지원민간임대 건설 (시행령 §3①7호)
    | "public_support_purchase"      // 공공지원민간임대 매입 (시행령 §3①8호)
    | "public_construction"
    | "public_purchase"
    | "existing_rental"              // 기존임대주택 2005년 이전 등록 (시행령 §3①3호)
    | "private_short_term_6y_construction"  // 단기민간임대 건설 (시행령 §3①10호)
    | "private_short_term_6y_purchase";     // 단기민간임대 매입 (시행령 §3①11호)
  rentalRegistrationDate: Date;    // 임대사업자 등록일
  rentalStartDate: Date;           // 임대개시일
  assessedValue: number;           // 공시가격 (원)
  area: number;                    // 전용면적 (㎡)
  location: "metro" | "non_metro"; // 수도권 여부
  previousRent?: number;           // 직전 임대료 (환산 월세 기준)
  currentRent: number;             // 현재 임대료
  isInitialContract: boolean;      // 최초 계약 여부
  assessmentDate: Date;            // 과세기준일 (6월 1일)
  /** 읍·면 지역 여부 (existing_rental §3①3호 전용 — 읍면 100㎡ / 그외 85㎡ 면적 상한) */
  isEupMyeonArea?: boolean;
  /** 합산배제 임대주택 30호 이상 여부 (§3①1·2·7·8호 공시가격 상한 tier — 30호↑ 상향) */
  isThirtyPlusUnits?: boolean;

  // ── 의무임대기간 (시행령 §3① "N년 이상 계속하여 임대") ──
  /** 임대등록 말소일 — 입력 + 과세기준일 이전이면 합산배제 거부 (시행령 §3① 계속임대 위반 확정) */
  registrationRevokedDate?: Date;
  /** 실제 임대 경과 연수 (기산일~과세기준일, 시행령 §3⑦ 합산기간) — 의무기간 미달 시 추징 위험 경고용 (배제 거부 아님) */
  actualRentalYears?: number;
}

/**
 * 기타 합산배제 주택 입력 (시행령 §4 요건 판정용)
 */
export interface OtherExclusionInput {
  // 미분양주택 (시행령 §4①1호)
  recruitmentNoticeDate?: Date | string;    // 입주자 모집공고일 (Date 또는 "YYYY-MM-DD")
  acquisitionDate?: Date | string;          // 취득일 (Date 또는 "YYYY-MM-DD")
  isFirstSale?: boolean;                    // 최초 매각 여부

  // 가정어린이집 (시행령 §4①2호)
  hasDaycarePermit?: boolean;      // 인가증 보유 여부
  isActuallyUsedAsDaycare?: boolean; // 실제 사용 여부

  // 사원용 주택 (시행령 §4①3호)
  isProvidedToEmployee?: boolean;  // 종업원 제공 여부
  rentalFeeRate?: number;          // 임대료율 (시세 대비 비율)
}

/**
 * 합산배제 판정 대상 주택 입력
 */
export interface PropertyForExclusion {
  propertyId: string;
  assessedValue: number;              // 공시가격 (원)
  area: number;                       // 전용면적 (㎡)
  location: "metro" | "non_metro";    // 수도권 여부
  exclusionType: ExclusionType;
  rentalInfo?: RentalExclusionInput;  // 임대주택인 경우
  otherInfo?: OtherExclusionInput;    // 기타 합산배제인 경우
}

/**
 * 합산배제 판정 검증 결과 (개별)
 */
export interface ExclusionValidationResult {
  isExcluded: boolean;
  reason: string;        // 법령 근거 상수 (COMPREHENSIVE_EXCL.*)
  failReasons?: string[];
  warnings?: string[];   // 사후 추징 위험 경고 (의무임대기간 미충족 등) — 코어 메시지(순번 접두 없음)
}

/**
 * 합산배제 판정 결과 (개별 주택)
 */
export interface ExclusionResult {
  propertyId: string;
  isExcluded: boolean;
  excludedValue: number;       // 합산배제 공시가격 (isExcluded ? assessedValue : 0)
  exclusionType: ExclusionType;
  reason: string;              // 법령 근거 상수
  failReasons?: string[];      // 요건 미충족 사유 목록
  warnings?: string[];         // 사후 추징 위험 경고 (코어 메시지 — 순번 접두 없음)
}

/**
 * 합산배제 일괄 판정 결과
 */
export interface AggregationExclusionResult {
  propertyResults: ExclusionResult[];
  totalExcludedValue: number;  // 합산배제 공시가격 합계
  excludedCount: number;       // 합산배제 인정 주택 수
  includedCount: number;       // 과세 포함 주택 수
}

// ============================================================
// 1-2. §8④ 1세대1주택자 의제 특례 유형 (종합부동산세법 §8④ 각 호)
// ============================================================

/**
 * §8④ 1세대1주택자 의제 특례 유형 (per-property 지정)
 *
 * - none:                  특례 없음 (기본)
 * - appurtenant_land_only: §8④1호 — 다른 주택의 부속토지(건물·토지 소유자 상이). 신청 불요.
 *                          ★ 세율 주택 수에는 포함 (시행령 §4의3③3호 다목은 "무허가·무권원 부속토지" 전용 — R-8)
 * - temporary_two_house:   §8④2호 — 일시적 2주택 (신규주택 취득 3년 이내, 령 §4의2①). §4의3③3호 라목 주택 수 제외(의제 성립 시).
 * - inherited_house:       §8④3호 — 상속주택 (5년 미경과·지분 40%·지분공시 6억/3억 중 하나, 령 §4의2②).
 *                          §4의3③3호 나목 주택 수 제외(의제 성립 무관 — 전제 없음).
 * - regional_low_price:    §8④4호 — 지방 저가주택 (공시 4억 이하 + 수도권·광역시·세종 외 소재, 령 §4의2③).
 *                          §4의3③3호 마목 주택 수 제외(의제 성립 시).
 */
export type Section8Para4Type =
  | "none"
  | "appurtenant_land_only"
  | "temporary_two_house"
  | "inherited_house"
  | "regional_low_price";

// ============================================================
// 2. 주택분 종합부동산세 입력 타입
// ============================================================

/**
 * 건물·부속토지 소유자 분리 시 시가표준액 비율 안분 (사례6 / 종부세법 §8④1호 "다른 주택의 부속토지").
 * 납세자가 토지(또는 건물)만 소유 → 주택 공시가격을 건물·토지 시가표준액 비율로 안분.
 * 안분비율 = ownedPart==="land" ? land/(land+building) : building/(land+building).
 * ★ 분수(num/den)로 엔진에 전달(applyEffectiveFactor) — 사전 비율 라운딩 0.
 */
export interface AppurtenantSplitInput {
  ownedPart: "land" | "building";  // 납세자 소유 부분 (사례6 = "land")
  landStandardValue: number;       // 토지 시가표준액 (원)
  buildingStandardValue: number;   // 건물 시가표준액 (원)
}

/**
 * 개별 주택 입력 (공시가격, 합산배제 정보 포함)
 */
export interface ComprehensiveProperty {
  propertyId: string;
  assessedValue: number;             // 공시가격 (원)
  area?: number;                     // 전용면적 (㎡, 합산배제 판정 시 필요)
  location?: "metro" | "non_metro";  // 수도권 여부 (합산배제 판정 시 필요)
  exclusionType?: ExclusionType;     // 합산배제 유형 (미입력 시 "none")
  /**
   * 지자체 조례 재산세 감면율 (0~1. 25% → 0.25. 미입력 = 감면 없음).
   * 종부세 과세표준·재산세공제·세부담상한에 공시가격 × (1−rate) 반영.
   * 법령 원칙: 해당연도 종부세 계산 시 감면비율을 공시가격에 적용
   * (교재 사례2 "일반적인 1주택자로 재산세 감면된 경우").
   */
  reductionRate?: number;
  /**
   * 공유지분율 (0~1. 70% → 0.7. 미입력 = 단독 소유(1.0) — 기존 동작 보존).
   * 지분율에 비례하여 종부세 과세표준·재산세·세부담상한에 반영.
   * effectiveFactor(reductionRate, ownershipRatio) 헬퍼로 감면율과 결합.
   * 교재 사례3 "공유지분이 있는 경우" 기반.
   */
  ownershipRatio?: number;
  /**
   * 건물·부속토지 소유자 분리 시 시가표준액 비율 안분 (사례6). 미입력 = 분리 없음(비율 1).
   * effectiveFactor(감면 × 지분)에 시가표준액 안분비율을 추가 결합(applyEffectiveFactor 4번째 인자).
   * 공유지분(ownershipRatio)과 직교 — 공존 가능(부속토지를 공유).
   */
  appurtenantSplit?: AppurtenantSplitInput;
  /**
   * 재산세 부과세액 직접입력 (비율 안분 공제 ⓐ). 미입력 = calculatePropertyTax 자동계산(하위호환).
   * 다가구주택 구별 면적안분 합산·주택 세부담상한(105/110/130%) 적용분·감면 실부과액 등
   * 엔진 자동계산이 재현하지 못하는 고지서 실부과액을 ⓐ로 주입할 때 사용 (교재 사례7·8·9).
   * ★ 이미 감면·지분·세부담상한이 반영된 실부과액이므로 applyEffectiveFactor 후곱 금지(이중적용 방지).
   * 토지분 AggregateLandTaxInput.propertyTaxAmount와 동일 의미 — 명명 통일.
   */
  propertyTaxAmount?: number;
  /**
   * 다가구주택 구별(층) 면적(㎡) — 트랙 A 자동화 (사례7). 입력 시 통합공시(assessedValue)를
   * 면적비율로 구별 안분 후 각 구분에 calculatePropertyTax(누진세율)를 개별 적용·합산하여 ⓐ 산정.
   * 우선순위: propertyTaxAmount(직접입력) > floorUnits(다가구) > 단일 assessedValue(기존 자동).
   * 면적 소수 허용. area>0·합>0 검증(UI ⑧). 부동산공시법 §17 + 국토부 「개별주택가격 조사·산정지침」 고시.
   */
  floorUnits?: { label: string; area: number }[];
  /**
   * 직전연도 주택공시가격(원) — 트랙 B 자동화 (사례8·9, §122 단서 세부담상한).
   * 입력 시 ⓐ = applyEffectiveFactor(min(당해 표준세율, 직전 표준세율 × 105/110/130%), 감면·지분).
   * 직전 표준세율은 직전 공시 + 직전 연도 법령(시행령 §118 제2호 가목 본문)으로 산출.
   * 우선순위: propertyTaxAmount > {floorUnits | priorAssessedValue} > 단일 assessedValue.
   * 2024+ 세부담상한 폐지(과세표준상한제 §110③) → getHousingTaxCapPct null → 상한 미적용.
   */
  priorAssessedValue?: number;
  /**
   * §8④ 1세대1주택자 의제 특례 유형 (미입력 = "none").
   * 의제 성립(일반주택 정확히 1채 + 특례주택 ≥ 1)·세액공제 안분(§9⑦⑨)·세율 주택 수 제외(령 §4의3③) 판정에 사용.
   * 요건(취득일·상속개시일·지분율)은 UI·Zod 검증 전용 — 엔진은 유형 지정을 신뢰 (자동 요건 판정은 후속).
   */
  section8para4Type?: Section8Para4Type;
  rentalInfo?: RentalExclusionInput;
  otherInfo?: OtherExclusionInput;
}

/**
 * 종합합산 토지 입력 (AggregateLandTaxInput으로도 사용)
 */
export interface AggregateLandTaxInput {
  totalOfficialValue: number;     // 인별 종합합산 토지 공시지가 합산 (원)
  propertyTaxBase: number;        // 재산세 과세표준 (비율 안분 공제 분모)
  propertyTaxAmount: number;      // 재산세 부과세액 (비율 안분 공제 원본)
  previousYearTotalTax?: number;  // 전년도 총세액 (세부담 상한 계산용, 미입력 시 undefined)
}

/**
 * 별도합산 토지 개별 물건 (Comprehensive 엔진에 전달하는 형태)
 */
export interface SeparateAggregateLandForComprehensive {
  landId: string;
  publicPrice: number;       // 개별공시지가 × 면적 (원)
  propertyTaxBase: number;   // 재산세 과세표준 (property-tax.ts에서 전달)
  propertyTaxAmount: number; // 재산세 부과세액 (property-tax.ts에서 전달)
}

// ============================================================
// 토지분 "납부할세액의 계산" 카드 — 필지별 입력 + 자동계산 (교재 사례10·11)
// Design: docs/02-design/features/comprehensive-land-payable-calc.engine.design.md
// ============================================================

/**
 * 토지 필지 1건 (종합합산·별도합산 공용).
 * shareRatio는 0~1 (API에서 % → /100 변환 완료). 직전 공시지가는 자동계산(세부담상한) 옵트인.
 */
export interface LandParcelInput {
  parcelId: string;
  jurisdiction: string;              // 재산세 관내 합산 그룹 (지방세법 §113) — trim 동일 = 동일 그룹
  name?: string;                     // 표시용 ("송파구-1")
  area: number;                      // ㎡
  shareRatio: number;                // 지분율 (0~1)
  officialPricePerSqm: number;       // 당해 개별공시지가 (원/㎡)
  priorOfficialPricePerSqm?: number; // 직전연도 (전 필지 존재 시 자동계산 활성)
}

/** ②ⓐ ≪지역≫ 블록 echo — 당해연도 (§122 Min 포함) */
export interface LandJurisdictionPropertyTax {
  jurisdiction: string;
  parcels: {
    parcelId: string;
    name?: string;
    area: number;
    shareRatio: number;
    pricePerSqm: number;
    officialValue: number;           // floor(area × shareRatio × pricePerSqm)
  }[];
  officialValueSum: number;          // 공시가격 합산
  propertyTaxBase: number;           // × 70% (floor)
  appliedRate: number;               // 재산세 표준세율 (0.005/0.004 등)
  progressiveDeduction: number;      // 재산세 누진공제
  standardTax: number;               // 세부담 상한 적용 전
  priorStandardTax?: number;         // 직전연도 재산세상당 (자동계산 시)
  capAmount?: number;                // 직전 × 150% (§122)
  imposedTax: number;                // Min(상한전, 상한액) — 직전 부재 시 = standardTax
}

/** ④나① 직전연도 지자체 분해 — slim(§122 Min 미적용: 시행령 §6/§7 §122 제외) */
export interface LandPriorJurisdictionTax {
  jurisdiction: string;
  parcels: {
    parcelId: string;
    name?: string;
    area: number;
    shareRatio: number;
    pricePerSqm: number;
    officialValue: number;
  }[];
  officialValueSum: number;
  propertyTaxBase: number;
  appliedRate: number;
  progressiveDeduction: number;
  standardTax: number;               // 표준세율 재산세상당 (Min 없음)
}

/** ④나 토지 직전연도 총세액상당액 (자동계산 시만 — 종부세법 §15·시행령 §6/§7) */
export interface LandPreviousYearEquivalent {
  propertyTaxEquiv: number;          // 나① = Σ perJurisdiction.standardTax
  comprehensiveTaxEquiv: number;     // 나② = ⓐ − ⓑ (≥0)
  total: number;                     // 나 = ① + ②
  detail: {
    officialValueSum: number;        // 직전 공시 합산
    basicDeduction: number;          // 5억 / 80억
    fairMarketRatio: number;         // getComprehensiveParams(y−1).fairMarketRatioLand
    taxBase: number;                 // 종부세 과표 (trunc10k)
    appliedRate: number;
    progressiveDeduction: number;
    calculatedTax: number;           // 나②ⓐ
    stdTaxNumerator: number;         // 나②ⓑ 분자 (누진공제 없음)
    stdTaxDenominator: number;       // 나②ⓑ 분모 (누진 1회)
    creditAmount: number;            // 나②ⓑ
    perJurisdiction: LandPriorJurisdictionTax[];
  };
}

/**
 * 종합부동산세 전체 입력 타입
 */
/**
 * 직전연도 종합부동산세상당액 자동계산 입력 (세부담상한 — 시행령 §5②).
 * previousYearTotalTax(직접입력)와 상호배타. 별지 제5호서식 부표를 재현하기 위한 입력.
 * 범위: 직전연도 일반/1세대1주택 + 다주택 중과 자동 판정(taxableHouseCount·isMultiHouseInAdjustedArea 입력 시).
 */
// PreviousYearAutoInput → comprehensive-prior-year.types.ts (상단 re-export)

export interface ComprehensiveTaxInput {
  // ── 주택 목록 ──
  properties: ComprehensiveProperty[];

  // ── 납세의무자 유형 (미입력 시 "individual" — 기존 anchor 무변경) ──
  /**
   * 납세의무자 유형 (§9②). undefined / "individual" = 개인. "corporate" = 법인.
   * 법인 세부 §9② class 는 corporateHousingType + 조건 플래그로 도출 (resolveCorporateHousingClass).
   */
  taxpayerType?: ComprehensiveTaxpayerType;

  /** 법인 세부 유형 (시행령 §4의4 자동판정 입력). corporate일 때 필수(미입력 시 엔진 general_corp 방어) */
  corporateHousingType?: CorporateHousingType;
  /** 공익법인: 직접 공익목적사업용 주택만 보유 (§9②1호ⓐ vs 2호). public_interest_corp일 때 필수 */
  corpHoldsOnlyPublicPurposeHousing?: boolean;
  /** 민간건설임대/도시개발: 민간건설임대 2호↑ + §4의4①5·5의2호 가·나·다목 주택만. private_rental/urban_dev일 때 필수 */
  corpHoldsQualifyingRentalHousingOnly?: boolean;
  /** 사회적기업: §4의4①6호 가·나목(설립목적 + 적격 주택만). social_enterprise일 때 필수 */
  corpMeetsSocialEnterpriseRequirements?: boolean;

  // ── 1세대1주택자 여부 ──
  isOneHouseOwner: boolean;

  /**
   * 부부 공동명의 1주택자 특례 신청 (§10의2). 미입력 = false.
   * true 시 공동명의 1주택자를 1세대1주택자로 보아 과세표준·세율·세액공제 계산 (§10의2③).
   * - properties: 지분 안분 없이 주택 전체 공시가격 입력 (령 §5의2⑥ — 배우자 지분 합산)
   * - birthDate/acquisitionDate: 납세의무자(공동 소유자간 합의로 정한 자, 령 §5의2③) 기준 (령 §5의2⑧)
   * - isOneHouseOwner와 상호배타 (Zod refine 차단), 법인(taxpayerType ≠ individual)이면 무시
   */
  isJointOwnershipSpecialCase?: boolean;

  // ── 1세대1주택자 세액공제 (isOneHouseOwner 또는 §10의2 특례 적용 시) ──
  birthDate?: Date;        // 생년월일 (고령자 공제 계산용)
  acquisitionDate?: Date;  // 취득일 (장기보유 공제 계산용)

  // ── 과세 기준 ──
  assessmentYear: number;         // 과세연도 (과세기준일 = 해당연도 6월 1일)

  /**
   * 조정대상지역 2주택 이상 여부 (구 §9①3호·§10② — 2022 귀속 이하만 유효).
   * 2023+ 연도에서는 엔진이 무시(주택 수 3 이상만 중과). 미입력 시 false.
   */
  isMultiHouseInAdjustedArea?: boolean;

  // ── 세부담 상한 (선택 — 미입력 시 상한 생략) ──
  //   두 방식 상호배타 (Zod refine 차단):
  //   (1) previousYearTotalTax: 전년도 총세액 직접 입력
  //   (2) previousYearAuto: 직전연도 공시가격으로 상당액 자동 계산 (별지 5호서식 부표)
  previousYearTotalTax?: number;  // 전년도 총세액 (종부세 + 재산세, 농특세 제외)
  previousYearAuto?: PreviousYearAutoInput;  // 직전연도 상당액 자동계산 (주택분, 시행령 §5②)

  // ── 토지분 (선택) ──
  landAggregate?: AggregateLandTaxInput;                     // 종합합산 토지 (집계 직접입력)
  landSeparate?: SeparateAggregateLandForComprehensive[];    // 별도합산 토지 목록 (집계 직접입력)

  // ── 토지분 필지 모드 (납부할세액 카드 — 집계 입력과 상호배타, Zod refine) ──
  //   필지별 입력 → orchestrator가 지자체 관내 합산 재산세(§122 Min) + 직전연도 상당액 자동계산.
  //   직전연도 자동계산: priorOfficialPricePerSqm 전 필지 존재 시 활성 (Zod 전부-or-전무).
  //   assessmentYear ≤ 2021 시 자동계산 미산출(historical 2020 부재 — Zod 1차·orchestrator 2차 차단).
  landAggregateParcels?: LandParcelInput[];
  landSeparateParcels?: LandParcelInput[];
  landAggregatePreviousYearTotalTax?: number; // 종합합산 직전연도 총세액 직접입력 (direct 서브모드)
  landSeparatePreviousYearTotalTax?: number;  // 별도합산 직전연도 총세액 직접입력 (G-3 — 직접 서브모드)

  // ── 계산 기준일 오버라이드 (테스트용) ──
  targetDate?: string;  // YYYY-MM-DD (기본값: assessmentYear-06-01)
}

// ============================================================
// 3. 주택분 중간 계산 결과 타입
// ============================================================

/**
 * 1세대1주택자 세액공제 결과 (종합부동산세법 §9②)
 */
export interface OneHouseDeductionResult {
  seniorRate: number;         // 고령자 공제율 (0 | 0.2 | 0.3 | 0.4)
  longTermRate: number;       // 장기보유 공제율 (0 | 0.2 | 0.4 | 0.5)
  combinedRate: number;       // 합산 공제율 (최대 0.80)
  deductionAmount: number;    // 공제 금액 (원, Math.floor) — GAP-1: 재산세 안분 공제 후 세액 기준 (§9⑥)
  // 신고서 ⑦(고령자)·⑧(장기보유) 분리 echo — 80% 상한 발동 시에도 합 = deductionAmount (잔액 흡수).
  seniorAmount: number;       // 고령자 공제액 = floor(base × seniorRate 안분 후)
  longTermAmount: number;     // 장기보유 공제액 = deductionAmount − seniorAmount
  isMaxCapApplied: boolean;   // 80% 상한 적용 여부
  /**
   * §8④ 의제 시 §9⑦⑨ 공시가격 안분 비율 echo (결과뷰 산식 표시용 — 미적용 시 undefined).
   * deduction = floor(base × main/total × combinedRate)
   */
  apportionmentRatio?: {
    mainHouseAssessedValue: number;  // 안분 분자 (특례주택 제외 공시 합산)
    totalAssessedValue: number;      // 안분 분모 (전체 과세 공시 합산)
  };
}

/**
 * 세부담 상한 결과 (종합부동산세법 §10)
 */
export interface TaxCapResult {
  previousYearTotalTax: number; // 전년도 총세액 (입력값)
  capRate: number;              // 1.5 (현행 §10 단일 상한 — 구 다주택 300% 조항 삭제됨)
  capAmount: number;            // 상한액 (전년도 × 상한율)
  cappedTax: number;            // 상한 적용 후 종부세액
  isApplied: boolean;           // 실제 상한 적용 여부
}

/**
 * 재산세 비율 안분 공제 결과 (종합부동산세법 시행령 §4의3)
 *   — §4의3 = 주택분 공제 재산세 계산식, §4의2 = 1세대1주택자 범위 (KoreanLaw 축자 정정).
 */
export interface PropertyTaxCredit {
  totalPropertyTax: number;      // ⓐ 재산세 부과세액 합계 (별지 3호부표 ⑧·5호 ⑧)
  propertyTaxBase: number;       // ⑥/⑩ 총 표준세율 재산세액 (역사적 명명 — 라벨은 서식 기준)
  comprehensiveTaxBase: number;  // ⑤/⑨ 과세표준 표준세율 재산세액
  ratio: number;                 // 안분 비율 (≤ 1.0)
  creditAmount: number;          // ⑪ 공제할 재산세액
  // ── 교재 p.186~187 "납부할세액의 계산" 카드 echo (계산 무변경 — 중간값 노출) ──
  propertyFairMarketRatio?: number;   // 재산세 공정시장가액비율 (②ⓐ "× 45%" — getPropertyFmrForProration)
  propertyTaxBaseAmount?: number;     // 재산세 과세표준 (②ⓐ 공시가격 × FMR — aggregatedPropertyTaxBase)
  priorPropertyTaxCapPct?: number | null; // 재산세 세부담상한율 (②ⓐ §122 단서 — 자동모드만, 2024+/비자동=null)
}

/**
 * 직전연도 종합부동산세상당액 계산 결과 (시행령 §5② — 별지 제5호서식 부표 ①~⑫ echo).
 * previousYearAuto 입력 시에만 산출. 세부담상한 ⑭⑮⑯에 사용.
 */
// PriorPropertyTaxLine, PreviousYearEquivalentResult → comprehensive-prior-year.types.ts (상단 re-export)

// ============================================================
// 4. 토지분 계산 결과 타입
// ============================================================

/**
 * 종합합산 토지분 종합부동산세 계산 결과 (종합부동산세법 §11~§15)
 */
export interface AggregateLandTaxResult {
  // 납세의무 판정
  isSubjectToTax: boolean;       // 5억 초과 여부

  // 과세표준
  totalOfficialValue: number;    // 공시지가 합산
  basicDeduction: number;        // 기본공제 (5억)
  afterDeduction: number;        // 공제 후 금액
  fairMarketRatio: number;       // 공정시장가액비율 (1.00)
  taxBase: number;               // 과세표준 (만원 미만 절사)

  // 세율 적용
  appliedRate: number;           // 적용 세율
  progressiveDeduction: number;  // 누진공제
  calculatedTax: number;         // 산출세액

  // 재산세 비율 안분 공제
  propertyTaxCredit: {
    propertyTaxAmount: number;
    propertyTaxBase: number;
    comprehensiveTaxBase: number;
    ratio: number;
    creditAmount: number;
  };

  // 세부담 상한 (전년도 미입력 시 undefined)
  taxCap?: TaxCapResult;

  // 결정세액 · 농특세
  determinedTax: number;         // 결정세액 (상한 적용 후)
  ruralSpecialTax: number;       // 농어촌특별세 (결정세액 × 20%)
  totalTax: number;              // 종합합산 토지 총납부세액 (결정세액 + 농특세)

  // ── 납부할세액 카드 echo (필지 모드 — 미설정 시 카드 축약, 집계 모드 회귀 0) ──
  perJurisdiction?: LandJurisdictionPropertyTax[];      // ②ⓐ 지자체 분해
  previousYearEquivalent?: LandPreviousYearEquivalent;  // ④나 직전연도 분해
  propertyFairMarketRatio?: number;                     // 재산세 FMR (0.70) — ②ⓐⓑⓒ bullet
  taxBeforeCap?: number;                                // ③ = calculatedTax − creditAmount (clamp 0)
  currentYearTotalEquivalent?: number;                  // ④가 = ②ⓐ + ③ (taxCap 존재 시)
}

/**
 * 별도합산 토지분 종합부동산세 계산 결과 (종합부동산세법 §12·§14)
 */
export interface SeparateAggregateLandTaxResult {
  // 납세의무 판정
  isSubjectToTax: boolean;       // 80억 초과 여부

  // 과세표준
  totalPublicPrice: number;      // 공시지가 합산
  basicDeduction: number;        // 기본공제 (80억)
  afterDeduction: number;        // 공제 후 금액
  fairMarketRatio: number;       // 공정시장가액비율 (1.00)
  taxBase: number;               // 과세표준 (만원 미만 절사)

  // 세율 적용
  appliedRate: number;           // 적용 세율
  progressiveDeduction: number;  // 누진공제
  calculatedTax: number;         // 산출세액

  // 재산세 비율 안분 공제
  propertyTaxCredit: {
    propertyTaxAmount: number;
    propertyTaxBase: number;
    comprehensiveTaxBase: number;
    ratio: number;
    creditAmount: number;
  };

  // 세부담 상한 (종부세법 §15② — 150%, 전년도 미입력 시 undefined)
  //   G-3: 종전 "별도합산은 세부담 상한 없음"은 드리프트 — KoreanLaw §15② 검증(2026-06-12)으로 추가
  taxCap?: TaxCapResult;

  // 결정세액 · 농특세
  determinedTax: number;         // 결정세액
  ruralSpecialTax: number;       // 농어촌특별세 (결정세액 × 20%)
  totalTax: number;              // 별도합산 토지 총납부세액

  // ── 납부할세액 카드 echo (필지 모드 — 미설정 시 카드 축약, 집계 모드 회귀 0) ──
  perJurisdiction?: LandJurisdictionPropertyTax[];
  previousYearEquivalent?: LandPreviousYearEquivalent;
  propertyFairMarketRatio?: number;
  taxBeforeCap?: number;
  currentYearTotalEquivalent?: number;
}

// ============================================================
// 5. 종합부동산세 전체 결과 타입
// ============================================================

/**
 * 종합부동산세 전체 계산 결과 (ComprehensiveTaxResult)
 */
export interface ComprehensiveTaxResult {
  // ── 합산배제 ──
  aggregationExclusion: AggregationExclusionResult;

  // ── 주택 목록 (개별 재산세 포함) ──
  properties: {
    propertyId: string;
    assessedValue: number;
    isExcluded: boolean;
    propertyTax: number;      // 개별 주택 재산세 (자동 계산)
    /** ② ⓐ 재산세 주택별 산출근거 표시용 echo (감면·지분·감면후 공시 — 결과 카드 ⑦) */
    reductionRate?: number;           // 적용 감면율 (0~1)
    ownershipRatio?: number;          // 적용 지분율 (0~1)
    effectiveAssessedValue?: number;  // 감면·지분 반영 후 공시가격 (① 과세공시가격·과표 라벨용)
    /** 트랙 A 다가구 구별 안분 echo (floorUnits 입력 시만) — 결과 카드 ⑦ */
    multiFamilyBreakdown?: { label: string; apportionedAssessedValue: number; tax: number }[];
    /** 트랙 B 주택 세부담상한 echo (priorAssessedValue 입력 시만) — 결과 카드 ⑦ */
    housingTaxCapDetail?: {
      standardTax: number;        // 당해 표준세율(감면전·cap전)
      priorStandardTax: number;   // 직전 표준세율(감면전)
      capPct: number | null;      // 105 | 110 | 130 | null(2024+)
      capAmount: number | null;   // floor(직전표준 × capPct/100)
      cappedTax: number;          // min(standardTax, capAmount) — 감면전
      imposedTax: number;         // applyEffectiveFactor(cappedTax, 감면·지분) = ⓐ
    };
  }[];

  // ── 주택분 합산 과세 ──
  totalAssessedValue: number;     // 합산배제 전 공시가격 합계 (감면전 원공시)
  includedAssessedValue: number;  // 합산배제 후 과세 대상 공시가격 합계 (감면전)
  /**
   * 감면후 과세 공시가격 합산 (부표3 ③칸).
   * reductionRate 입력 시 = Σ floor(assessedValue × (1−rate)).
   * 감면율 미적용 시 = includedAssessedValue와 동일.
   * 과세표준·재산세 비율안분공제 ②ⓒ 분모 산정에 사용.
   */
  effectiveIncludedAssessedValue: number;
  basicDeduction: number;         // 기본공제 (9억 or 12억)
  fairMarketRatio: number;        // 공정시장가액비율 (0.60)
  taxBase: number;                // 과세표준 (만원 미만 절사)
  isSubjectToHousingTax: boolean; // 종부세 납세의무 여부 (기본공제 초과 여부)

  // ── 주택분 세율 적용 ──
  appliedRate: number;            // 적용 세율
  progressiveDeduction: number;   // 누진공제
  calculatedTax: number;          // 산출세액 (신고서 ④ / 별지5호 ⑦ — 재산세 공제 전)
  isMultiHouseRateApplied: boolean; // 다주택 중과세율 적용 여부 (echo — 결과뷰 안내)

  // ── 서식 칸 echo (신고서·별지 5호) ──
  oneHouseExtraDeduction?: number; // 3호부표 ⑤·5호 ③ 1세대1주택 추가공제 (basicDeduction − 일반공제, 1주택 시만)
  taxAfterPropertyCredit: number;  // 신고서 ⑥ = calculatedTax − 공제 재산세액 (음수 시 0)
  taxBeforeCap: number;            // 별지5호 ⑬ = taxAfterPropertyCredit − 세액공제 (세부담상한 전 종부세액)
  currentYearTotalEquivalent?: number; // 별지5호 ⑲ = ⓐ + taxBeforeCap (taxCap 존재 시만)

  // ── 1세대1주택 세액공제 (isOneHouseOwner=true 일 때만) ──
  oneHouseDeduction?: OneHouseDeductionResult;

  /**
   * §8④ 1세대1주택자 의제 적용 echo — 결과뷰 배지·안분 산식 표시용 (의제 성립 시만).
   * appliedTypes: 적용 특례 유형 목록 (중복 제거) · mainHouseAssessedValue: 안분 분자 · excludedAssessedValue: 특례주택 공시 합산
   */
  section8para4Detail?: {
    appliedTypes: Section8Para4Type[];
    mainHouseAssessedValue: number;
    excludedAssessedValue: number;
  };

  // ── 재산세 비율 안분 공제 (핵심) ──
  propertyTaxCredit: PropertyTaxCredit;

  // ── 세부담 상한 (전년도 미입력 시 undefined) ──
  taxCap?: TaxCapResult;
  previousYearEquivalent?: PreviousYearEquivalentResult; // 직전연도 자동계산 모드일 때만 (별지 5호서식 부표)

  // ── 주택분 최종 세액 ──
  determinedHousingTax: number;   // 결정세액 (상한 적용 후)
  housingRuralSpecialTax: number; // 농어촌특별세 (결정세액 × 20%)
  totalHousingTax: number;        // 주택분 총납부세액 (결정세액 + 농특세)
  totalPropertyTax: number;       // 재산세 총납부세액 (참고 표시)

  // ── 토지분 (해당 시) ──
  aggregateLandTax?: AggregateLandTaxResult;
  separateLandTax?: SeparateAggregateLandTaxResult;

  // ── 최종 합계 ──
  grandTotal: number;             // 주택분 종부세 + 토지분 종부세 + 재산세 + 농특세 합계

  // ── 메타 ──
  assessmentDate: string;         // 과세기준일 (YYYY-06-01)
  isOneHouseOwner: boolean;
  /** 납세의무자 유형 echo (individual | corporate) */
  taxpayerType: ComprehensiveTaxpayerType;
  /** 법인 세부 유형 echo (§4의4) — 결과뷰 라벨 */
  corporateHousingType?: CorporateHousingType;
  /** 도출된 §9② class — 결과뷰 배지·산식 분기 단일원천 (개인이면 undefined) */
  corporateHousingClass?: CorporateHousingClass;
  /** §10의2 부부 공동명의 1주택자 특례 적용 여부 echo — 결과뷰 배지·기본공제 라벨용 */
  isJointOwnershipApplied: boolean;
  warnings: string[];             // 경고 메시지 (v1.3 scope 한계 등)
  appliedLawDate: string;         // 적용 법령 기준일
}

/**
 * 사후관리 위반 추징 입력 (합산배제 후 의무 위반 시)
 */
export interface PostManagementViolationInput {
  violationDate: Date;               // 위반일
  exclusionStartDate: Date;          // 최초 합산배제 시작일
  annualExcludedTax: number[];       // 연도별 합산배제 받은 세액
  assessmentDate: Date;              // 현재 과세기준일
}

/**
 * 사후관리 위반 추징 결과
 */
export interface PostManagementPenaltyResult {
  totalRecoveryTax: number;          // 추징 세액 합계
  interestAmount: number;            // 납부불성실 가산세
  totalPayable: number;              // 총 납부액 (추징세 + 이자)
  recoveryPeriodYears: number;       // 추징 대상 연수
}
