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

// ============================================================
// 1. 합산배제 관련 타입
// ============================================================

/**
 * 합산배제 유형 (종합부동산세법 시행령 §3·§4)
 */
export type ExclusionType =
  | "private_construction_rental"   // 민간건설임대 (시행령 §3①1호)
  | "private_purchase_rental_long"  // 민간매입임대 장기일반 (시행령 §3①2호)
  | "private_purchase_rental_short" // 민간매입임대 단기 구법 (시행령 §3①2호)
  | "public_support_rental"         // 공공지원민간임대 (시행령 §3①3호)
  | "public_construction_rental"    // 공공건설임대 (시행령 §3①4호)
  | "public_purchase_rental"        // 공공매입임대 (시행령 §3①5호)
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
    | "public_support"
    | "public_construction"
    | "public_purchase";
  rentalRegistrationDate: Date;    // 임대사업자 등록일
  rentalStartDate: Date;           // 임대개시일
  assessedValue: number;           // 공시가격 (원)
  area: number;                    // 전용면적 (㎡)
  location: "metro" | "non_metro"; // 수도권 여부
  previousRent?: number;           // 직전 임대료 (환산 월세 기준)
  currentRent: number;             // 현재 임대료
  isInitialContract: boolean;      // 최초 계약 여부
  assessmentDate: Date;            // 과세기준일 (6월 1일)
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
// 2. 주택분 종합부동산세 입력 타입
// ============================================================

/**
 * 개별 주택 입력 (공시가격, 합산배제 정보 포함)
 */
export interface ComprehensiveProperty {
  propertyId: string;
  assessedValue: number;             // 공시가격 (원)
  area?: number;                     // 전용면적 (㎡, 합산배제 판정 시 필요)
  location?: "metro" | "non_metro";  // 수도권 여부 (합산배제 판정 시 필요)
  exclusionType?: ExclusionType;     // 합산배제 유형 (미입력 시 "none")
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

/**
 * 종합부동산세 전체 입력 타입
 */
export interface ComprehensiveTaxInput {
  // ── 주택 목록 ──
  properties: ComprehensiveProperty[];

  // ── 1세대1주택자 여부 ──
  isOneHouseOwner: boolean;

  // ── 1세대1주택자 세액공제 (isOneHouseOwner=true 일 때만 적용) ──
  birthDate?: Date;        // 생년월일 (고령자 공제 계산용)
  acquisitionDate?: Date;  // 취득일 (장기보유 공제 계산용)

  // ── 과세 기준 ──
  assessmentYear: number;         // 과세연도 (과세기준일 = 해당연도 6월 1일)
  isMultiHouseInAdjustedArea?: boolean; // 조정대상지역 2주택+ 여부 (세부담 상한 300% 적용)

  // ── 세부담 상한 (선택 — 미입력 시 상한 생략) ──
  previousYearTotalTax?: number;  // 전년도 총세액 (종부세 + 재산세, 농특세 제외)

  // ── 토지분 (선택) ──
  landAggregate?: AggregateLandTaxInput;                     // 종합합산 토지
  landSeparate?: SeparateAggregateLandForComprehensive[];    // 별도합산 토지 목록

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
  deductionAmount: number;    // 공제 금액 (원, Math.floor)
  isMaxCapApplied: boolean;   // 80% 상한 적용 여부
}

/**
 * 세부담 상한 결과 (종합부동산세법 §10)
 */
export interface TaxCapResult {
  previousYearTotalTax: number; // 전년도 총세액 (입력값)
  capRate: number;              // 1.5 또는 3.0
  capAmount: number;            // 상한액 (전년도 × 상한율)
  cappedTax: number;            // 상한 적용 후 종부세액
  isApplied: boolean;           // 실제 상한 적용 여부
}

/**
 * 재산세 비율 안분 공제 결과 (종합부동산세법 시행령 §4의2)
 */
export interface PropertyTaxCredit {
  totalPropertyTax: number;      // 재산세 부과세액 합계
  propertyTaxBase: number;       // 재산세 과세표준 합계
  comprehensiveTaxBase: number;  // 종부세 과세표준
  ratio: number;                 // 안분 비율 (≤ 1.0)
  creditAmount: number;          // 공제할 재산세액
}

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

  // 별도합산은 세부담 상한 없음

  // 결정세액 · 농특세
  determinedTax: number;         // 결정세액
  ruralSpecialTax: number;       // 농어촌특별세 (결정세액 × 20%)
  totalTax: number;              // 별도합산 토지 총납부세액
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
  }[];

  // ── 주택분 합산 과세 ──
  totalAssessedValue: number;     // 합산배제 전 공시가격 합계
  includedAssessedValue: number;  // 합산배제 후 과세 대상 공시가격 합계
  basicDeduction: number;         // 기본공제 (9억 or 12억)
  fairMarketRatio: number;        // 공정시장가액비율 (0.60)
  taxBase: number;                // 과세표준 (만원 미만 절사)
  isSubjectToHousingTax: boolean; // 종부세 납세의무 여부 (기본공제 초과 여부)

  // ── 주택분 세율 적용 ──
  appliedRate: number;            // 적용 세율
  progressiveDeduction: number;   // 누진공제
  calculatedTax: number;          // 산출세액

  // ── 1세대1주택 세액공제 (isOneHouseOwner=true 일 때만) ──
  oneHouseDeduction?: OneHouseDeductionResult;

  // ── 재산세 비율 안분 공제 (핵심) ──
  propertyTaxCredit: PropertyTaxCredit;

  // ── 세부담 상한 (전년도 미입력 시 undefined) ──
  taxCap?: TaxCapResult;

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
