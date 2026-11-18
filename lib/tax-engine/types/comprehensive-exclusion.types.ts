/**
 * 종합부동산세 합산배제 타입(시행령 §3·§4) — comprehensive.types.ts에서 분리(800줄 정책 · 계획서
 * comprehensive-rental-excl-tax-defects-3.plan.md Q-10). 원래 파일이 re-export한다.
 */

// §3①8호 나목·7호 단서 판정 입력 — 별도 파일(800줄 정책)
import type { RentalExclusion8NaFacts } from "./comprehensive-exclusion-8na.types";
// §3①6호 미분양매입임대 판정 입력 — 별도 파일(800줄 정책)
import type { RentalExclusion6hoFacts } from "./comprehensive-exclusion-6ho.types";
import type { RentalExclusion459hoFacts } from "./comprehensive-exclusion-459ho.types";
// 가격 판정 기준 공시가격(임대개시일 등) — 계획서 T-03
import type { RentalExclusionPriceBasisFacts } from "./comprehensive-exclusion-price-basis.types";
// 공실 2년(§3⑦4호) — 계획서 T-12
import type { RentalExclusionVacancyFacts } from "./comprehensive-exclusion-vacancy.types";
// §3⑧ 5% 위반 뒤 2개 과세연도 — 계획서 T-07b
import type { RentalExclusionRentViolationFacts } from "./comprehensive-exclusion-rent-violation.types";

// ============================================================
// 1. 합산배제 관련 타입
// ============================================================

/**
 * 합산배제 유형 (종합부동산세법 시행령 §3·§4)
 */
export type ExclusionType =
  | "private_construction_rental"   // 민간건설임대 (시행령 §3①1호)
  | "private_purchase_rental_long"  // 민간매입임대 장기일반 (시행령 §3①8호)
  | "private_purchase_rental_short" // 민간매입임대 2018.3.31. 이전 등록 — 단기·장기 공통 (시행령 §3①2호)
  | "public_support_construction_rental" // 공공지원·장기일반민간임대 건설 (시행령 §3①7호)
  | "public_support_purchase_rental"     // 공공지원민간임대 매입 (시행령 §3①8호)
  | "public_construction_rental"    // 공공건설임대 (시행령 §3①1호)
  | "public_purchase_rental"        // 공공매입임대 (시행령 §3①2호)
  | "existing_rental"               // 기존임대주택 2005년 이전 등록 (시행령 §3①3호)
  | "private_short_term_rental_6y_construction" // 단기민간임대 건설 6년 (시행령 §3①10호)
  | "private_short_term_rental_6y_purchase"     // 단기민간임대 매입 6년 (시행령 §3①11호)
  | "unsold_purchase_rental"        // 미분양매입임대 (시행령 §3①6호)
  | "vacant_construction_rental"    // 미임대 민간건설임대 (시행령 §3①4호)
  | "reit_purchase_rental"          // 부동산투자회사 2008 취득 매입임대 (시행령 §3①5호)
  | "public_conversion_pending_rental" // 분양전환공공임대 임대의무기간 만료 후 2년 (시행령 §3①9호)
  | "unsold_housing"                // 미분양주택 (시행령 §4①1호)
  | "daycare_housing"               // 가정어린이집용 (시행령 §4①2호)
  | "employee_housing"              // 사원용 (시행령 §4①3호)
  | "developer_unsold"              // 주택건설사업자 미분양 (시행령 §4①4호)
  | "cultural_heritage"             // 문화재 (시행령 §4①5호)
  | "religious"                     // 종교단체 (시행령 §4①6호)
  | "senior_welfare"                // 노인복지주택 (시행령 §4①7호)
  | "none";                         // 합산배제 미신청

/**
 * 2020.2.11. 전 세무서 사업자등록만 한 다가구주택(부칙<대통령령 제30404호> 제6조 · T-14) — 1구를 1호로 본 구별 사실.
 * 판정: `lib/tax-engine/comprehensive-exclusion-multifamily.ts`. 계획서: comprehensive-rental-excl-multifamily-deemed.plan.md
 */
export interface DeemedMultiFamilyInput {
  /** 구(호실)별 면적(㎡)·공시가격(원) — 1구=1호(시행령 §3⑥). 가격은 사용자가 구별로 입력한다(산정 방법 확인 필요) */
  units: { label: string; area: number; assessedValue: number }[];
  /** 2020.2.11. 전부터 본인이 계속 임대(그 뒤 상속·취득·임대 전환·폐업 없음) — false면 불성립 + 확인 필요 */
  noConversionAfterCutoff: boolean;
}

/**
 * 임대주택 합산배제 입력 (시행령 §3 요건 판정용)
 */
export interface RentalExclusionInput
  extends RentalExclusion8NaFacts,
    RentalExclusion6hoFacts,
    RentalExclusion459hoFacts,
    RentalExclusionPriceBasisFacts,
    RentalExclusionVacancyFacts,
    RentalExclusionRentViolationFacts {
  registrationType:
    | "private_construction"
    | "private_purchase_long"
    | "private_purchase_short"
    | "public_support_construction"  // 공공지원·장기일반민간임대 건설 (시행령 §3①7호 — 두 유형 요건이 같다)
    | "public_support_purchase"      // 공공지원민간임대 매입 (시행령 §3①8호)
    | "public_construction"
    | "public_purchase"
    | "existing_rental"              // 기존임대주택 2005년 이전 등록 (시행령 §3①3호)
    | "private_short_term_6y_construction"  // 단기민간임대 건설 (시행령 §3①10호)
    | "private_short_term_6y_purchase"      // 단기민간임대 매입 (시행령 §3①11호)
    | "unsold_purchase"                     // 미분양매입임대 (시행령 §3①6호)
    | "vacant_construction"                 // 미임대 민간건설임대 (시행령 §3①4호 — 「소유」)
    | "reit_purchase"                       // 부동산투자회사 2008 취득 매입임대 (시행령 §3①5호)
    | "public_conversion_pending";          // 분양전환공공임대 만료 후 2년 (시행령 §3①9호 — 「소유」)
  rentalRegistrationDate: Date;    // 지자체 임대사업자 등록일(등록증 — 신청일 아님, 서면-2021-법규재산-3280)
  /**
   * 세무서 사업자등록일(소득세법 §168·법인세법 §111) — §3①1호·2호 단서 「2018년 3월 31일 이전에 … 사업자등록등」
   * 판정용(민간건설·민간매입). 그 두 유형에서 없으면 요건 확인 불가로 불성립.
   */
  businessRegistrationDate?: Date;
  /** 사용승인일(사용검사 확인증일) — 1·7호 가목 6억/9억 적용례(대통령령 제31447호 부칙 제2조). 없으면 6억 + 확인 필요 */
  usageApprovalDate?: Date;
  rentalStartDate?: Date;          // 임대개시일 — 4·9호(「소유」)는 없을 수 있다(Zod가 그 밖 유형은 필수로 막는다)
  assessedValue: number;           // 공시가격 (원)
  area: number;                    // 전용면적 (㎡)
  location: "metro" | "non_metro"; // 수도권 여부
  previousRent?: number;           // 직전 임대료 (환산 월세 기준)
  currentRent: number;             // 현재 임대료
  isInitialContract: boolean;      // 처음 쓴 표준임대차계약 여부(5% 비교 제외)
  assessmentDate: Date;            // 과세기준일 (6월 1일)
  /** 읍·면 지역 여부 (existing_rental §3①3호 전용 — 읍면 100㎡ / 그외 85㎡ 면적 상한) */
  isEupMyeonArea?: boolean;
  /** 합산배제 임대주택 30호 이상 여부 (§3①1·2·7·8호 공시가격 상한 tier — 30호↑ 상향) */
  isThirtyPlusUnits?: boolean;
  /**
   * §3①1·3·7·10호 「요건을 모두 갖춘 주택이 2호 이상」 — 이 주택을 포함해 그 호의 요건을 모두 갖춘 주택 수.
   * 1·7·10호는 같은 특별시·광역시·도(§3⑤), 3호는 ⑤ 밖이라 전국. 없으면 불성립 + 확인 필요.
   */
  qualifyingUnitCount?: number;
  /**
   * 있으면 의제 다가구 판정 경로(1·2호만) — 세무서 사업자등록일을 지자체 등록일로 보고 가격·면적은 구별로 판정한다.
   * 없으면 현행 판정 100% 불변(`validateDeemedMultiFamily`).
   */
  deemedMultiFamily?: DeemedMultiFamilyInput;

  // ── 의무임대기간 (시행령 §3① "N년 이상 계속하여 임대") ──
  /** 임대등록 말소일 — 과세기준일(당일 포함)까지 말소면 합산배제 거부 — 과세기준일 현재 임대사업자 아님 (시행령 §3①) */
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
