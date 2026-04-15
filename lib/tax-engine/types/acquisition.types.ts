/**
 * 취득세 계산 엔진 공유 타입 정의
 *
 * 6개 모듈 간 데이터 계약:
 *   - acquisition-object.ts     (과세 대상 판정)
 *   - acquisition-deemed.ts     (간주취득 판정)
 *   - acquisition-timing.ts     (취득 시기 확정)
 *   - acquisition-standard-price.ts (시가표준액 산정)
 *   - acquisition-tax-base.ts   (과세표준 결정)
 *   - acquisition-tax-rate.ts   (세율 결정)
 *   - acquisition-tax-surcharge.ts  (중과세 판정)
 *   - acquisition-tax.ts        (메인 통합 엔진)
 */

// ============================================================
// 공통 유니온 타입
// ============================================================

/**
 * 과세 대상 물건 유형 (지방세법 §7 열거주의 — 8종 + 기타)
 */
export type PropertyObjectType =
  | "housing"        // 주택 (아파트·단독·연립·다세대)
  | "land"           // 토지 (주택 외)
  | "land_farmland"  // 농지 (전·답·과수원 — 상속세율 2.3% 특례)
  | "building"       // 건물 (비주거용)
  | "vehicle"        // 차량 (자동차관리법상 자동차·건설기계)
  | "machinery"      // 기계장비 (건설기계관리법 미등록)
  | "aircraft"       // 항공기
  | "vessel"         // 선박
  | "mining_right"   // 광업권
  | "fishing_right"  // 어업권
  | "membership"     // 회원권 (골프·승마·콘도·종합체육·요트)
  | "standing_tree"; // 입목 (立木)

/**
 * 취득 원인 유형 (지방세법 §6①)
 */
export type AcquisitionCause =
  // ① 유상취득
  | "purchase"             // 매매
  | "exchange"             // 교환
  | "auction"              // 공매·경매
  | "in_kind_investment"   // 현물출자
  // ② 무상취득
  | "inheritance"          // 상속 (일반)
  | "inheritance_farmland" // 농지 상속 (2.3% 특례)
  | "gift"                 // 증여
  | "burdened_gift"        // 부담부증여
  | "donation"             // 기부
  // ③ 원시취득
  | "new_construction"     // 신축
  | "extension"            // 증축
  | "reconstruction"       // 개축
  | "reclamation"          // 공유수면 매립·간척
  // ④ 간주취득
  | "deemed_major_shareholder" // 과점주주
  | "deemed_land_category"     // 지목변경
  | "deemed_renovation";       // 건물 개수(改修)

/**
 * 취득자 유형
 */
export type AcquirerType = "individual" | "corporation" | "government" | "nonprofit";

/**
 * 과세표준 결정 방식 (지방세법 §10~§10의5)
 */
export type TaxBaseMethod =
  | "actual_price"       // 사실상취득가격 (실거래가)
  | "recognized_market"  // 시가인정액 (특수관계인 비정상·감정가)
  | "standard_value"     // 시가표준액 (공시가격)
  | "construction_cost"  // 공사비 (원시취득)
  | "split_onerous"      // 부담부증여 — 유상 부분
  | "split_gratuitous"   // 부담부증여 — 무상 부분
  | "installment"        // 연부취득 — 회차별
  | "deemed_difference"; // 간주취득 — 전후 차액

/**
 * 세율 결정 유형
 */
export type TaxRateType =
  | "basic"               // 기본세율 (고정)
  | "linear_interpolation" // 주택 6억~9억 선형보간
  | "surcharge_regulated"  // 조정대상지역 중과
  | "surcharge_corporate"  // 법인 중과
  | "surcharge_luxury";    // 사치성재산 중과

/**
 * 비과세 사유 유형 (지방세법 §9)
 */
export type AcquisitionExemptionType =
  | "government_acquisition"  // 국가·지방자치단체 취득
  | "trust_return"            // 신탁법상 위탁자 반환
  | "cemetery"                // 묘지 취득
  | "religious_nonprofit"     // 종교·비영리법인 용도 취득
  | "temporary_building"      // 임시건축물 (1년 내 철거)
  | "self_cultivated_farmland"; // 자경농지

// ============================================================
// 입력 타입
// ============================================================

/**
 * 간주취득 전용 입력
 */
export interface DeemedAcquisitionInput {
  // 과점주주
  majorShareholder?: {
    corporateAssetValue: number;    // 법인 보유 과세대상 자산 시가표준액 합계
    prevShareRatio: number;         // 취득 전 지분율 (0~1)
    newShareRatio: number;          // 취득 후 지분율 (0~1)
    isListed: boolean;              // 상장법인 여부 (상장이면 비과세)
  };
  // 지목변경
  landCategory?: {
    prevCategory: string;           // 변경 전 지목
    newCategory: string;            // 변경 후 지목
    prevStandardValue: number;      // 변경 전 시가표준액
    newStandardValue: number;       // 변경 후 시가표준액
  };
  // 건물 개수
  renovation?: {
    renovationType: "structural_change" | "use_change" | "major_repair";
    prevStandardValue: number;      // 개수 전 시가표준액
    newStandardValue: number;       // 개수 후 시가표준액
  };
}

/**
 * 시가표준액 산정 입력
 */
export interface StandardPriceInput {
  propertyType: PropertyObjectType;
  // 주택: 주택공시가격
  housingPublicPrice?: number;
  // 토지: 개별공시지가(원/㎡) × 면적
  individualLandPrice?: number;   // 원/㎡
  landArea?: number;              // ㎡
  // 건물(비주거): 신축가격기준액 × 지수 × 잔가율 × 연면적
  newBuildingBasePrice?: number;  // 원/㎡ (행안부 고시)
  structureIndex?: number;        // 구조지수 (RC=1.0, 철골=0.9 등)
  usageIndex?: number;            // 용도지수
  locationIndex?: number;         // 위치지수
  elapsedYears?: number;          // 경과연수 (잔가율 산출)
  floorArea?: number;             // 연면적 ㎡
}

/**
 * 연부취득 회차 정보
 */
export interface InstallmentPayment {
  paymentDate: string;            // 지급일 (YYYY-MM-DD)
  amount: number;                 // 지급액 (원)
}

/**
 * 취득세 계산기 메인 입력 타입
 */
export interface AcquisitionTaxInput {
  // ─── 물건 정보 ───
  propertyType: PropertyObjectType;
  acquisitionCause: AcquisitionCause;

  // ─── 취득가액 ───
  /** 신고 취득가액 (유상: 실거래가, 무상: 0 또는 참고값) */
  reportedPrice: number;
  /** 시가인정액 (감정가·매매사례가액 — 무상취득·특수관계인 적용) */
  marketValue?: number;
  /** 시가표준액 입력 (주택공시가격 등 — 없으면 standardPriceInput으로 계산) */
  standardValue?: number;
  /** 시가표준액 산정 입력 (직접 입력하지 않는 경우) */
  standardPriceInput?: StandardPriceInput;

  // ─── 부담부증여 ───
  /** 승계 채무액 (부담부증여 시 입력) */
  encumbrance?: number;

  // ─── 원시취득 ───
  /** 공사비·설계비 합계 (신축·개축·증축 시) */
  constructionCost?: number;

  // ─── 연부취득 ───
  installments?: InstallmentPayment[];

  // ─── 취득자 정보 ───
  acquiredBy: AcquirerType;
  /** 특수관계인 여부 (지방세기본법 §2④ 기준) */
  isRelatedParty?: boolean;

  // ─── 주택 관련 ───
  /** 전용면적 ㎡ (농특세 85㎡ 이하 면제 판단) */
  areaSqm?: number;
  /** 취득 후 주택 수 (취득 대상 포함) */
  houseCountAfter?: number;
  /** 조정대상지역 여부 (취득일 기준) */
  isRegulatedArea?: boolean;

  // ─── 감면 ───
  /** 생애최초 주택 구매 여부 */
  isFirstHome?: boolean;
  /** 수도권 여부 (생애최초 감면 한도 구분) */
  isMetropolitan?: boolean;

  // ─── 간주취득 ───
  deemedInput?: DeemedAcquisitionInput;

  // ─── 취득 시기 ───
  /** 잔금 지급일 (YYYY-MM-DD) */
  balancePaymentDate?: string;
  /** 등기접수일 (YYYY-MM-DD) */
  registrationDate?: string;
  /** 계약일 (YYYY-MM-DD) — 증여·교환 */
  contractDate?: string;
  /** 사용승인서 발급일 (YYYY-MM-DD) — 신축 */
  usageApprovalDate?: string;
  /** 사실상 사용 개시일 (YYYY-MM-DD) — 사용승인 이전 사용 시 */
  actualUsageDate?: string;

  // ─── 계산 기준일 ───
  /** 세율 적용 기준일 (YYYY-MM-DD, 기본값: 취득일) */
  targetDate?: string;
}

// ============================================================
// 결과 타입
// ============================================================

/**
 * 과세표준 결정 결과
 */
export interface TaxBaseResult {
  method: TaxBaseMethod;
  taxBase: number;               // 최종 과세표준 (천원 미만 절사)
  rawTaxBase: number;            // 절사 전 과세표준
  breakdown?: {
    onerousTaxBase?: number;     // 부담부증여 유상 과세표준
    gratuitousTaxBase?: number;  // 부담부증여 무상 과세표준
  };
  warnings: string[];
  legalBasis: string;
}

/**
 * 세율 결정 결과
 */
export interface TaxRateDecision {
  appliedRate: number;           // 적용 세율 (소수, 예: 0.01667)
  rateType: TaxRateType;
  isSurcharged: boolean;
  surchargeReason?: string;
  legalBasis: string;
  warnings: string[];
}

/**
 * 중과세 판정 결과
 */
export interface SurchargeDecision {
  isSurcharged: boolean;
  surchargeRate?: number;        // 중과세율 (예: 0.08, 0.12)
  surchargeReason?: string;
  // 생애최초 감면
  firstHomeReduction?: {
    isEligible: boolean;
    reductionAmount: number;     // 감면액 (200만원 한도)
    maxReductionAmount: number;  // 한도 (200만원)
    warnings: string[];          // 추징 주의사항
  };
  exceptions: string[];          // 중과 배제 사유
  warnings: string[];
  legalBasis: string[];
}

/**
 * 부담부증여 세액 분리 내역
 */
export interface BurdenedGiftBreakdown {
  onerousTaxBase: number;        // 유상 과세표준 (채무액)
  onerousTax: number;            // 유상 취득세 (매매세율 적용)
  gratuitousTaxBase: number;     // 무상 과세표준 (초과분)
  gratuitousTax: number;         // 무상 취득세 (증여세율 적용)
}

/**
 * 취득세 계산 최종 결과
 */
export interface AcquisitionTaxResult {
  // ─── 입력 요약 ───
  propertyType: PropertyObjectType;
  acquisitionCause: AcquisitionCause;
  acquisitionValue: number;      // 실제 적용 취득가액

  // ─── 과세표준 ───
  taxBase: number;               // 최종 과세표준 (천원 미만 절사)
  taxBaseMethod: TaxBaseMethod;

  // ─── 세율 ───
  appliedRate: number;           // 적용 세율 (소수점 5자리)
  rateType: TaxRateType;
  isSurcharged: boolean;
  surchargeReason?: string;

  // ─── 세액 ───
  acquisitionTax: number;        // 취득세 본세
  ruralSpecialTax: number;       // 농어촌특별세
  localEducationTax: number;     // 지방교육세
  totalTax: number;              // 총 납부세액 (감면 전)

  // ─── 감면 ───
  reductionType?: "first_home";
  reductionAmount: number;       // 감면액 (0이면 미적용)
  totalTaxAfterReduction: number; // 감면 후 최종 납부세액

  // ─── 부담부증여 분리 ───
  burdenedGiftBreakdown?: BurdenedGiftBreakdown;

  // ─── 취득 시기·신고 기한 ───
  acquisitionDate: string;       // 확정된 취득일 (YYYY-MM-DD)
  filingDeadline: string;        // 신고 기한 (YYYY-MM-DD)

  // ─── 비과세 ───
  isExempt: boolean;
  exemptionType?: AcquisitionExemptionType;

  // ─── 메타 ───
  appliedLawDate: string;
  warnings: string[];
  legalBasis: string[];
}

// ============================================================
// 과점주주 간주취득 결과
// ============================================================

export interface DeemedMajorShareholderResult {
  isSubjectToTax: boolean;
  deemedTaxBase: number;         // 간주취득 과세표준
  prevShareRatio: number;
  newShareRatio: number;
  taxableRatio: number;          // 과세 대상 지분율 (증가분 or 신규)
  legalBasis: string;
  warnings: string[];
}
