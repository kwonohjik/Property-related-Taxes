/**
 * 상속세·증여세 계산 엔진 타입 정의 (barrel)
 *
 * 5개 모듈 간 데이터 계약:
 *   - inheritance-tax.ts (메인 엔진)
 *   - gift-tax.ts (메인 엔진)
 *   - property-valuation.ts (재산평가)
 *   - inheritance-deductions.ts + gift-deductions.ts (공제)
 *   - inheritance-gift-tax-credit.ts (세액공제)
 *   - exemption-rules.ts (비과세)
 *
 * 800줄 정책(2026-06-19): 도메인별 타입을 sibling 파일로 분리하고 본 파일이 100% re-export.
 * 기존 import 경로(`from "./inheritance-gift.types"`)는 무변경 — 본 barrel이 전부 재수출.
 *   - inheritance-gift-common.types.ts   : CalculationStep·TaxResultMeta
 *   - inheritance-gift-heir.types.ts      : Heir·CohabitantDependent·ShareholderInfo·HeirAllocation·CohabitReason
 *   - inheritance-gift-estate.types.ts    : EstateItem·PropertyValuationResult·UnlistedStockData·추정상속·채무
 *   - inheritance-gift-deduction.types.ts : 상속·증여공제 input/result·재해손실·부수토지지역
 */

// ============================================================
// 분리 도메인 타입 barrel re-export (2026-06-19)
// ============================================================
export type { CalculationStep, TaxResultMeta } from "./inheritance-gift-common.types";
export type {
  ValuationMethod,
  AssetCategory,
  SuperficiesStructureType,
  ReceivableKind,
  ReceivableInstallment,
  EstateItem,
  UnlistedAssetValueOnlyReason,
  UnlistedStockData,
  PropertyValuationResult,
  PresumedCategory,
  PresumedInheritanceItem,
  PresumedInheritanceItemResult,
  DebtCategory,
  DebtItem,
} from "./inheritance-gift-estate.types";
export type {
  CohabitReasonType,
  CohabitReason,
  HeirRelation,
  Heir,
  CohabitantDependent,
  ShareholderInfo,
  HeirAllocation,
} from "./inheritance-gift-heir.types";
export type {
  CasualtyLossInput,
  AncillaryLandRegion,
  InheritanceDeductionInput,
  InheritanceDeductionResult,
  DonorRelation,
  GiftDeductionInput,
  GiftDeductionResult,
  GiftApportionment,
} from "./inheritance-gift-deduction.types";

// 본 파일 내부 인터페이스에서 사용하는 분리 타입 로컬 import (re-export만으로는 로컬 미생성)
import type { TaxResultMeta } from "./inheritance-gift-common.types";
import type {
  EstateItem,
  PropertyValuationResult,
  PresumedInheritanceItem,
  PresumedInheritanceItemResult,
  DebtItem,
} from "./inheritance-gift-estate.types";
import type { Heir, HeirAllocation } from "./inheritance-gift-heir.types";
import type {
  InheritanceDeductionInput,
  InheritanceDeductionResult,
  DonorRelation,
  GiftDeductionInput,
  GiftDeductionResult,
} from "./inheritance-gift-deduction.types";

// ============================================================
// 상장주식 평가 타입 — listed-stock-valuation.types.ts (barrel re-export)
// ============================================================
export type {
  ListedStockClass,
  ListedCompanySize,
  ListedPremiumExclusionReason,
  ListedStockDailyRow,
  ListedStockMonthGroups,
  ListedStockBesshiPage1Meta,
  ListedStockBesshiPage1Values,
  ListedStockBesshiData,
} from "./listed-stock-valuation.types";
export { EMPTY_LISTED_STOCK_MONTH_GROUPS } from "./listed-stock-valuation.types";

// ============================================================
// 비상장주식 V2 평가 — unlisted-stock-valuation.types.ts (barrel re-export)
// ============================================================
export type {
  UnlistedNetAssetOnlyReason,
  UnlistedPremiumExclusionReason,
  UnlistedCapitalChange,
  FiscalYearAdjustment,
  UnlistedNetAssetCalculation,
  UnlistedStockValuationInput,
  FiscalYearBreakdown,
  UnlistedGoodwillResult,
  UnlistedStockValuationResult,
} from "./unlisted-stock-valuation.types";

// ============================================================
// 비과세·과세가액 불산입 — inheritance-exemption.types.ts (barrel re-export)
// ============================================================
import type {
  ExemptionCheckedItem,
  ExemptionResult,
  ExemptionItemResult,
} from "./inheritance-exemption.types";
export type { ExemptionCheckedItem, ExemptionInput, ExemptionResult, ExemptionItemResult } from "./inheritance-exemption.types";

// ============================================================
// 사전증여 내역 (상증법 §13·§47) — inheritance-prior-gift.types.ts (barrel re-export)
// ============================================================
import type { PriorGift } from "./inheritance-prior-gift.types";
export type { PriorGift, GiftPriorPropertyCategory, EstatePropertyKindCode } from "./inheritance-prior-gift.types";

// 물납 §73 타입 — inheritance-payment-in-kind.types.ts (barrel re-export)
export type {
  PaymentInKindAssets,
  PaymentInKindInput,
  PaymentInKindRequirement,
  FillOrderStep,
  PaymentInKindResult,
} from "./inheritance-payment-in-kind.types";

// ============================================================
// 상속인별 배부 + 영리법인 면제 — inheritance-allocation-result.types.ts (barrel re-export)
// ============================================================
import type {
  CorporateExemptionResult,
  HeirAllocationResult,
} from "./inheritance-allocation-result.types";
export type {
  HeirTaxBreakdown,
  HeirAllocationResult,
  AllocationMismatch,
  CorporateExemptionResult,
  PerCorporateExemptionDetail,
  ShareholderPaymentDetail,
} from "./inheritance-allocation-result.types";

// ============================================================
// 공제 상세·영농·가업·사후관리·법인·위치 타입 (barrel re-export)
// ============================================================
import type { FamilyBusinessPostMgmtMeta } from "./inheritance-family-business-postmgmt.types";
export type { FarmingInheritanceInput, FarmingDeductionDetail, FarmingEligibilityResult } from "./inheritance-farming.types";
export type { FamilyBusinessCategory, FamilyBusinessInheritanceInput, FamilyBusinessIneligibleReason, FamilyBusinessDeductionDetail, FamilyBusinessCap, FamilyBusinessMediumGuard, FamilyBusinessUnit, MultipleFamilyBusinessLineItem, MultipleFamilyBusinessResult } from "./inheritance-family-business.types";
export type {
  FamilyBusinessPostMgmtMeta,
  FamilyBusinessPostMgmtInput,
  FamilyBusinessPostMgmtResult,
  PostMgmtViolationDetail,
  PostMgmtEmploymentResult,
  ViolationEvent,
  JustifiableReasonEvent,
  JustifiableReasonCode,
  CessationSubType,
  EmploymentTracking,
  MonthlyEmploymentData,
  PostMgmtAssetType,
  AmendmentReturnData,
} from "./inheritance-family-business-postmgmt.types";
export type { CorporateNonBusinessAssets, CorporateStockAdjustedResult } from "./inheritance-corporate-non-business.types";
export type { LatLng, EstateAddress } from "./inheritance-asset-location.types";
export type {
  LumpSumComparisonDetail,
  SpouseLegalShareTable,
  SpouseActualAmountTable,
  SpouseDeductionDetail,
  FinancialBreakdownRow,
  FinancialDeductionDetail,
  CohabitDeductionDetail,
  DeductionLimitCeilingDetail,
  PersonalDeductionDetail,
  CasualtyLossDeductionDetail,
} from "./inheritance-deduction-detail.types";
export { FARMING_MAX } from "./inheritance-farming.types";
export { FAMILY_BUSINESS_CAP_10Y, FAMILY_BUSINESS_CAP_20Y, FAMILY_BUSINESS_CAP_30Y, FAMILY_BUSINESS_SCALE_THRESHOLD, FAMILY_BUSINESS_OTHER_ESTATE_RATIO } from "./inheritance-family-business.types";

// ============================================================
// 세액공제 입력 (credits/) — inheritance-tax-credit.types.ts (barrel re-export)
// ============================================================
import type {
  InheritanceTaxCreditInput,
  GiftTaxCreditInput,
  TaxCreditResult,
} from "./inheritance-tax-credit.types";
export type {
  InheritanceTaxCreditInput,
  GiftTaxCreditInput,
  TaxCreditResult,
  ShortTermReinheritAsset,
  ShortTermReinheritPerAsset,
} from "./inheritance-tax-credit.types";

// ============================================================
// 증여자 관계·§57 할증·§58 안분·§27 세대생략·신고서 행 (barrel re-export)
// inheritance-gift-form-detail.types.ts — 800줄 정책 분리 (2026-06-26)
// ============================================================
import type {
  GiftDonorRelation,
  DonorGroup,
  GenerationSkipSurchargeDetail,
  PriorGiftCreditDetail,
  InheritanceGenerationSkipDetail,
  FilingFormRow,
} from "./inheritance-gift-form-detail.types";
export type {
  GiftDonorRelation,
  DonorGroup,
  GenerationSkipSurchargeDetail,
  PriorGiftCreditDetail,
  InheritanceGenerationSkipHeirRow,
  InheritanceGenerationSkipDetail,
  FilingFormRow,
} from "./inheritance-gift-form-detail.types";

// ============================================================
// 메인 엔진 Input / Output
// ============================================================

/** 상속세 계산 입력 전체 */
export interface InheritanceTaxInput {
  /** 거주자 / 비거주자 */
  decedentType: "resident" | "non_resident";
  deathDate: string; // ISO date YYYY-MM-DD
  estateItems: EstateItem[];
  /**
   * 일반 장례비(식대·제수 등, 봉안 제외) — 상증령 §9②1호.
   * 한도: min(max(expense,5,000,000), 10,000,000) — 500만 미만이면 500만 보장, 1천만 초과면 1천만.
   * @deprecated debtItems(category="funeral") 사용 권장
   */
  funeralExpense: number;
  /**
   * 봉안시설·자연장지 비용 — 상증령 §9②2호.
   * 한도: min(bonganExpense, 5,000,000). 별도 최소 보장 없음.
   * funeralIncludesBongan=true인 legacy 입력에서 이 필드가 없으면 엔진이 구 로직으로 fallback.
   */
  funeralBonganExpense?: number;
  /**
   * @deprecated funeralBonganExpense 사용. legacy 하위호환 — funeralBonganExpense 없고 true이면
   * 구 로직(식대+봉안 통합한도 1,500만, 식대 최소 500만)으로 fallback.
   */
  funeralIncludesBongan: boolean;
  /**
   * 공과금·사적채무 합계
   * @deprecated debtItems 사용 권장 (협의분할 입력 가능)
   */
  debts: number;
  /** 채무·공과금·장례비 통합 배열 (Design §2-3-1). debts·funeralExpense 대체 — 입력 시 우선. */
  debtItems?: DebtItem[];
  /** 추정상속재산 §15 (Design §2-3) */
  presumedItems?: PresumedInheritanceItem[];
  /** 비과세 체크리스트 항목 (§11·§12) — ExemptionChecklist 컴포넌트 출력 */
  exemptions?: ExemptionCheckedItem[];
  preGiftsWithin10Years: PriorGift[];
  heirs: Heir[];
  deductionInput: InheritanceDeductionInput;
  creditInput: InheritanceTaxCreditInput;
  /** 세대생략 상속 여부 (§27 — 피상속인의 자녀를 건너뛴 손자·외손자 등) */
  isGenerationSkip?: boolean;
  /** 세대생략 수상속인 미성년 여부 (§27 ② — 과세표준 20억 초과 시 40% 적용) */
  isMinorHeir?: boolean;
  /**
   * 세대생략 해당 상속재산가액 (§27 ① 안분 계산용).
   * 전체 상속인 중 일부만 세대생략인 경우, 해당 재산에만 할증 적용.
   * 미제공 시 전체 산출세액에 할증 적용 (전체가 세대생략인 경우에 사용).
   */
  generationSkipAssetAmount?: number;
  /** 평가기준일 (기본: 상속개시일) */
  valuationBaseDate?: string;
  /** 감정평가수수료 입력 (§25①2호·시행령 §20의3) */
  appraisalFee?: AppraisalFeeInput;
}

/** 상속세 계산 결과 전체 */
export interface InheritanceTaxResult extends TaxResultMeta {
  /** 상속재산가액 (평가 후) */
  grossEstateValue: number;
  /** 비과세 차감액 */
  exemptAmount: number;
  /** 비과세 항목별 상세 (결과 카드 ExemptionSummaryCard용) — evaluateExemptions 반환 전체 echo */
  exemptionDetail?: ExemptionResult & { itemResults: ExemptionItemResult[] };
  /** 장례·채무 차감 */
  deductedBeforeAggregation: number;
  /** 사전증여재산 합산 */
  priorGiftAggregated: number;
  /** 상속인·수유자 사전증여 §13 (= heirOnlyGifts) — 물납 §73①1호 분모 echo, 계산 불변 */
  priorGiftToHeirTotal?: number;
  /** 상속세 과세가액 */
  taxableEstateValue: number;
  /** 공제 합계 (§24 한도 적용 후) */
  totalDeduction: number;
  /** 과세표준 */
  taxBase: number;
  /** 산출세액 (누진세율) */
  computedTax: number;
  /**
   * ⑦ 산출세액 적용 한계세율 (§26) — 산식 표시용 echo. 예: 0.5.
   * `findApplicableBracket(taxBase)` 결과. 계산 영향 0 (표시 전용).
   */
  computedTaxAppliedRate?: number;
  /**
   * ⑦ 산출세액 누진공제액 (§26) — 산식 표시용 echo. 예: 460_000_000.
   * `findApplicableBracket(taxBase)` 결과. 계산 영향 0 (표시 전용).
   */
  computedTaxProgressiveDeduction?: number;
  /** 세대생략 할증액 (합계) — 기존 필드 유지 */
  generationSkipSurcharge: number;
  /**
   * §27 세대생략 할증 per-heir 상세 (A-3 신규).
   * - per-heir 경로: rows에 수유자별 행 포함
   * - 레거시 단일 경로: rows 1행 (heirId="legacy")
   * - 할증 없음: null
   */
  generationSkipDetail: InheritanceGenerationSkipDetail | null;
  /** 세액공제 합계 */
  totalTaxCredit: number;
  /** 결정세액 */
  finalTax: number;
  deductionDetail: InheritanceDeductionResult;
  creditDetail: TaxCreditResult;
  valuationResults: PropertyValuationResult[];
  /**
   * 가업상속공제 사후관리 트래킹 메타 (PR-2 — 계획 §2-1).
   * 가업상속공제 > 0 시에만 채워짐(직접입력 포함). 사후관리 시뮬레이터 prefill 소스.
   * 계산 영향 0 (echo·prefill 전용).
   */
  familyBusinessPostMgmtMeta?: FamilyBusinessPostMgmtMeta;

  // ===== 종합사례 PDF 확장 (Design §2-5) =====
  /** 추정상속재산 §15 결과 */
  presumedInheritanceDetail?: {
    items: PresumedInheritanceItemResult[];
    total: number;
  };
  /** 영리법인 §3의2② 면제세액 */
  corporateExemption?: CorporateExemptionResult;
  /** 상속인별 배부 결과 */
  heirAllocationResult?: HeirAllocationResult;
  /** 담보채무 §14 자동공제 내역 (echo — 산식 불변, 결과·자동노출 카드 표시용) */
  collateralDebtDetail?: DerivedCollateralDebt[];

  /**
   * Phase B3 — 상속인별 상속세부담액 집계 표 (이미지 8) 합계행 echo.
   * heir-allocation-summary-table.engine.design.md §B5
   */
  summaryTable?: {
    /** *1 과세표준 배부대상 과세가액 = 과세가액 − Σ가산 증여재산 (이미지 15) */
    distributableTaxBase: number;
    /** *2 할증과세 대상 과세가액 = 과세가액 − 영리법인 등 사전증여가액 (이미지 16 §27①) */
    surchargeTargetTaxableValue: number;
    /** *3·*5 분모 = taxBase − 영리법인 사전증여 과세표준 (이미지 16) */
    distributableTaxBaseAfterGifts: number;
    /**
     * ⑩b 합계행 표시값 = floor((⑦+⑧) × corporateGiftTaxBase / taxBase). 할증 포함.
     * perHeir[corp].priorGiftCreditLimit(할증 미포함)과 의도적 분리 (D-8).
     */
    corporateExemptionLimitDisplay: number;
    /** 자산 4분류 합계 (모든 상속인 합) */
    categoryTotals: {
      financial: number;
      realEstate: number;
      stock: number;
      other: number;
    };
    /** ㉠ 과세제외 재산 전체 합 (비과세 + 과세가액불산입) */
    totalExcludedFromTaxation: number;
  };
  /** 감정평가수수료 공제액 (별지9호 ⑲) — §25①2호·시행령 §20의3 */
  appraisalFeeDeduction?: number;
  /** 감정평가수수료 호별 내역·경고 (결과 ▼펼침) */
  appraisalFeeDetail?: AppraisalFeeResult;
  /** §74 징수유예세액 (별지9호 ㉖) — echo, finalTax(결정세액) 불변. 별지9호 ㊳에서 차감 */
  culturalHeritageDeferredTax?: number;
  /** §74 징수유예 상세 (결과 카드 ▼펼침) */
  culturalHeritageDeferralDetail?: CulturalHeritageDeferralDetail;
}

/**
 * 담보채무 §14 자동공제 파생 항목 (collateral-debt-auto-deduction).
 * `EstateItem.deductSecuredClaimAsDebt===true`인 자산의 담보채권액을 §14 부채로 derive.
 */
export interface DerivedCollateralDebt {
  /** 연결 EstateItem.id */
  estateItemId: string;
  /** 채권자 표시명 */
  creditorName: string;
  /** §14 공제액 = mortgageAmount + leaseDeposit (피상속인 채무 전부) */
  amount: number;
  /** §22 금융채무 차감액 = securedClaimIsFinancialDebt ? mortgageAmount : 0 (저당만, 임대보증금 제외) */
  financialDebtAmount: number;
  /** 연결 자산 분배를 담보채무액 비율로 환산한 상속인별 분배 (합 = amount). 미분배 시 undefined */
  heirAllocations?: HeirAllocation[];
}

/**
 * 감정평가수수료 입력 (상증령 §20의3 / 증여 §46의2 준용 — 상속·증여 공용).
 * §20의3③ 한도: 1호 부동산·3호 유형재산 각 500만, 2호 비상장 = 1천만 × 법인수 × 기관수.
 */
export interface AppraisalFeeInput {
  /** §20의3①1호 — 부동산 등 감정평가법인 수수료 (500만 한도, 감정가액 신고 시만 §20의3②) */
  realEstateAppraisalFee?: number;
  /** §20의3①2호 — 비상장주식 등 신용평가전문기관 수수료 (1천만 × 법인수 × 기관수 한도) */
  unlistedStockAppraisalFee?: number;
  /** §20의3③ 2호 한도 산정 — 평가대상 법인 수 (미입력 1) */
  unlistedTargetCount?: number;
  /** §20의3③ 2호 한도 산정 — 신용평가전문기관 수 (미입력 1) */
  unlistedAgencyCount?: number;
  /** §20의3①3호 — 서화·골동품 등 유형재산 감정수수료 (500만 한도) */
  tangibleAppraisalFee?: number;
}

/** 감정평가수수료 호별 한도 적용 내역 (결과 ▼펼침용) */
export interface AppraisalFeeBreakdownItem {
  label: string;
  amount: number;
  lawRef: string;
}

/** §74 징수유예 상세 (상증령 §76① — 결과 카드 ▼펼침용. echo 전용) */
export interface CulturalHeritageDeferralDetail {
  /** §76① 분자: §74①각호 재산 평가액 합 */
  qualifyingAssetValue: number;
  /** §76① 분모: grossEstateValue + priorGiftAggregated (§15 추정상속재산 제외) */
  totalEstateWithPriorGifts: number;
  /** 분자 ÷ 분모 (표시용) */
  deferralRatio: number;
  /** = computedTax (§26 산출세액, §27 할증 전) */
  computedTaxBase: number;
  items: {
    estateItemId: string;
    itemName: string;
    heritageType: "heritage_data" | "museum" | "designated" | "natural_monument";
    valuatedAmount: number;
    /** §74⑤ 담보 면제 가능 (designated·natural_monument만 true) */
    collateralExemptible: boolean;
  }[];
  /** 3·4호만 있으면 true */
  hasCollateralExemption: boolean;
  warnings: string[];
}

/** 감정평가수수료 계산 결과 (공유 모듈 calcAppraisalFeeDeduction 반환) */
export interface AppraisalFeeResult {
  /** 호별 한도 적용 후 합계 */
  total: number;
  breakdown: AppraisalFeeBreakdownItem[];
  /** 1호 감정가 미신고(§20의3②)·입증서류(§20의3④) 안내 */
  warnings: string[];
}

/** 증여세 계산 입력 전체 */
export interface GiftTaxInput {
  giftDate: string; // ISO date
  donorRelation: DonorRelation;
  /**
   * 금번 증여자 (필수 — 동일인 §47 합산 그룹화 + §57 적용 판정).
   * Phase A 도입. 외부 호출자 일괄 갱신 필요.
   */
  donor: GiftDonorRelation;
  giftItems: EstateItem[];
  /** 비과세 체크리스트 항목 (§46·§46의2) — ExemptionChecklist 컴포넌트 출력 */
  exemptions?: ExemptionCheckedItem[];
  priorGiftsWithin10Years: PriorGift[];
  /**
   * 세대생략 증여 여부 — donor === "grandparent" 에서 자동 도출 가능.
   * 명시 입력 시 그 값 우선 (예외 케이스 대비).
   */
  isGenerationSkip: boolean;
  /** 수증자 미성년 여부 (세대생략 20억 초과 40% 기준) */
  isMinorDonee: boolean;
  /**
   * §57① 단서 — 증여자의 최근친(最근친)인 직계비속이 사망하여,
   * 그 사망자의 최근친인 직계비속이 증여받은 경우 → 세대생략 할증 미적용.
   *
   * 예: 조부(증여자) → 손자(수증자), 부(父)가 이미 사망한 경우.
   *
   * true 시 donorGroup=B이어도 §57① 할증 전액 배제.
   * 상속세 Heir.isSubstituteInheritance와 동일 개념의 증여세 버전.
   * 미입력(undefined/false) 시 기존 동작 100% 보존.
   */
  isSubstituteGift?: boolean;
  deductionInput: GiftDeductionInput;
  creditInput: GiftTaxCreditInput;
  /** 평가기준일 (기본: 증여일) */
  valuationBaseDate?: string;
  /** 감정평가수수료 입력 (§55①·시행령 §46의2 → §20의3 준용) */
  appraisalFee?: AppraisalFeeInput;
  /** 분납 신청 여부 (§70②) — 결정세액 1천만 초과 시 별지10호 ㊼ 연동 */
  applyInstallmentSplit?: boolean;
  /** 분납 희망액 (§70② "이하" 범위 — 미입력 시 최대 분납액) */
  requestedSplitAmount?: number;
  /** 증여자가 수증자의 증여세를 대신 납부하는지 (대납 — §36 채무면제 재차증여) */
  donorPaysGiftTax?: boolean;
  /**
   * 증여자가 §4의2⑥ 연대납세의무자로서 대납하는지.
   * true: 재차증여 아님(국세청 해석 [207328]) → gross-up 미적용.
   * false/undefined: 비연대 대납 → §36 재차증여 → gross-up 적용.
   */
  donorHasJointLiability?: boolean;
  /**
   * 수증자가 본인 부담으로 납부하는 증여세액(원). 증여자는 (총세액 − 이 금액)인 부족분만 대납.
   * 미입력/0 = 증여자 전액 대납(기존 동작). donorPaysGiftTax=true 일 때만 유효.
   * §36 재차증여는 증여자가 실제 변제한 부족분(D)뿐 → gross-up 가산분 = max(0, finalTax − doneePaidGiftTax).
   */
  doneePaidGiftTax?: number;
  /**
   * 내부 전용 — calcGiftTaxWithDonorPaidTax가 반복 회차에서 주입하는 대납 가산분.
   * Zod·UI·API 노출 금지. 외부 호출자 직접 세팅 금지.
   */
  _donorPaidTaxAddition?: number;
}

/** 증여세 계산 결과 전체 */
export interface GiftTaxResult extends TaxResultMeta {
  /** 증여재산가액 (평가 후) */
  grossGiftValue: number;
  /** 비과세 차감액 */
  exemptAmount: number;
  /** 동일인 10년 합산 증여가액 */
  aggregatedGiftValue: number;
  /** 증여재산공제 */
  totalDeduction: number;
  /** 과세표준 (50만원 미만이면 0) */
  taxBase: number;
  /** 산출세액 ⑦ */
  computedTax: number;
  /**
   * 세대생략 할증액 (Phase A 의미 재정의):
   *   - 단독 신고 (priorGifts=0) 시: ⑧ surchargeBase 와 동일
   *   - 합산 신고 시: ⑫ additionalSurcharge (추가 할증세액)
   * filingFormRows·결과 카드에는 generationSkipSurchargeDetail 사용.
   */
  generationSkipSurcharge: number;
  /** 세액공제 합계 */
  totalTaxCredit: number;
  /** 결정세액 ⑫(사례1) 또는 ⑱(사례2) */
  finalTax: number;
  deductionDetail: GiftDeductionResult;
  creditDetail: TaxCreditResult;
  valuationResults: PropertyValuationResult[];
  // ===== Phase A 신규 detail =====
  /** 현재 증여자의 그룹 분기 추적용 (A~G) */
  donorGroup: DonorGroup;
  /** ⑫ 추가 할증세액 (단독 신고면 0, 합산 신고 시 §57 한도 차감 후 잔여) */
  additionalGenerationSkipSurcharge: number;
  /** §57 할증과세 세부 (donorGroup=B 일 때만 not null) */
  generationSkipSurchargeDetail: GenerationSkipSurchargeDetail | null;
  /**
   * §57① 단서 적용 여부 echo (표시 전용 — 산식 무변경).
   * isSubstituteGift=true 로 할증이 배제된 경우에만 true.
   * undefined/false = 단서 미적용 (일반 케이스).
   * Map 금지 — Record/원시값만 사용 (memory: feedback_engine_result_map_json_loss).
   */
  generationSkipProvisoApplied?: boolean;
  /** §58 안분 한도 세부 (priorGifts 그룹 일치 1건 이상일 때만 not null) */
  priorGiftCreditDetail: PriorGiftCreditDetail | null;
  /** 신고서 양식 표 행 (12행 사례1 / 18행 사례2) — 후속 PR에서 besshi10Rows 로 대체 예정 */
  filingFormRows: FilingFormRow[];

  // ===== 별지 제10호서식 [2020.03.13. 개정] 표시 전용 (default 0, 회귀 영향 없음) =====
  publicInterestExclusion?: number;  // ⑲ §48 공익법인 출연재산가액
  publicTrustExclusion?: number;     // ⑳ §52 공익신탁 재산가액
  disabledTrustExclusion?: number;   // ㉑ §52의2 장애인 신탁 재산가액
  debtAssumed?: number;              // ㉒ §47 채무액 (부담부증여 — 본 PR 범위 외)
  disasterLossDeduction?: number;    // ㉘ §54 재해손실공제
  appraisalFeeDeduction?: number;    // ㉙ 감정평가수수료 (500만원 한도)
  appraisalFeeDetail?: AppraisalFeeResult;  // 호별 내역·경고 (결과 ▼펼침)
  interestEquivalent?: number;       // ㉟ 이자상당액
  museumDeferredTax?: number;        // ㊱ §75 박물관자료 등 징수유예세액
  underreportPenalty?: number;       // ㊷ 국기법 §47의2·§47의3
  latePaymentPenalty?: number;       // ㊸ 국기법 §47의4
  publicInterestPenalty?: number;    // ㊹ §78 공익법인 등 관련 가산세
  installmentPayment?: number;       // ㊻ §71 연부연납
  cashDeferred?: number;             // ㊼ §70② 현금 분납
  /** 별지 제10호서식 좌·우 컬럼 행 배열 (총 34행) — UI는 본 배열만 읽음 */
  besshi10Rows: FilingFormRow[];

  aggregationExcludedDetail?: { grossValue: number; taxBase: number; computedTax: number; generationSkipSurcharge: number; totalCredit: number; finalTax: number; breakdown: { label: string; amount: number; lawRef?: string; note?: string }[] }; // §47① 합산배제(§41의3·§41의5) 별도 스트림 echo

  // ===== 조특법 특례 2-스트림 분리과세 결과 (2026-06-11) =====
  /**
   * 특례 스트림 세액 (§30의5·§30의6 해당분).
   *
   * 법령 근거:
   *   §30의5: 창업자금 — 5억 공제, 10% 단일세율, §69 배제
   *   §30의6: 가업승계 — 10억 공제, 120억 이하 10%/초과 20%, §69 배제
   *   §30의5①후단: 기간무관 합산(과거 특례 prior 포함), 기납부 특례세액 차감
   *
   * specialTreatment 미선택 시 0.
   * Map 금지 — Record/원시값만 사용 (memory: feedback_engine_result_map_json_loss).
   */
  specialStreamTax?: number;

  /**
   * 일반 스트림 세액 (§47·§53·§56·§57·§58·§69 일반 과세).
   *
   * specialTreatment 미선택 시 computedTax와 동일(단일 스트림).
   * 혼합 증여(특례+일반) 시 일반 자산 분 세액만.
   */
  ordinaryStreamTax?: number;

  /**
   * 특례 스트림 기반 합산 과세가액 (별지 표시·결과뷰용).
   *
   * = 신규 특례 자산가액 + 과거 특례 prior 가액(기간무관 합산)
   * specialTreatment 미선택 시 undefined.
   */
  specialStreamAggregatedValue?: number;

  /**
   * 특례 스트림 §47① 인수 채무 (한도 차감 적용분 = min(특례 자산 채무, 특례 자산가액)).
   *
   * 별지 ㉒ debtAssumed는 일반 스트림 채무만 담으므로(besshi10·결과뷰 요약 = 일반 스트림 컨텍스트),
   * 특례 자산 부담부증여 채무는 본 필드로 분리하여 2-스트림 카드에 표시한다.
   * 채무 0 또는 특례 미선택 시 undefined.
   */
  specialStreamDebt?: number;

  /**
   * @deprecated 조특법 특례 2-스트림 분리과세(2026-06-11) 이후 의미 없음.
   *
   * 이전 구조: "절감액 공제" 방식 — 일반 산출세액에서 특례세액을 공제.
   * 신규 구조: 특례 자산은 처음부터 특례 스트림(10%/20%)으로만 계산되므로
   *            "일반 산출세액"이 존재하지 않음. 본 필드는 0으로 고정됨.
   *
   * creditDetail.specialTreatmentCredit은 항상 0.
   * 특례 세액은 specialStreamTax 필드로 접근할 것.
   */
  _deprecatedSpecialTreatmentCredit_alwaysZero?: never;

  /**
   * 금번 증여 순 과세가액 (echo — 2-pass 동시증여 안분 분모 산출용).
   * = max(0, grossGiftValue − exemptAmount − assumedDebtTotal)
   * gift-tax.ts STEP 3 계산값을 노출. 산식·계산 영향 0 (echo-field-pattern).
   * calcSimultaneousGifts PASS1에서 정확한 안분 분모를 얻기 위해 사용.
   */
  netCurrentGiftValue?: number;

  /**
   * 대납 gross-up 상세 (echo — UI 표시 전용, 미적용 시 applied=false).
   * Map 금지 — Record/원시값만 사용 (memory: feedback_engine_result_map_json_loss).
   */
  donorPaidTaxGrossUp?: {
    /** gross-up 적용 여부 */
    applied: boolean;
    /** 미적용 사유 (applied=false 시에만) */
    reasonNotApplied?: "joint_liability" | "toggle_off";
    /** 수렴 반복 횟수 (applied=true 시만 의미 있음) */
    iterations: number;
    /**
     * gross-up 전 순증여가액 A = netCurrentGiftValue
     * = max(0, grossGiftValue − exemptAmount − assumedDebtTotal)
     * 공제(§53)는 STEP4에서 차감되므로 여기 미포함.
     */
    originalNetGift: number;
    /**
     * 수렴 후 aggregatedGiftValue V* = A + donorPaidTax(증여자 대납분 D).
     * (사전증여 없으면 = A + D)
     * 과세표준(taxBase)이 아님 — 공제 차감 전 합산 과세가액.
     */
    grossedUpNetGift: number;
    /**
     * 증여자 대납분 D = max(0, 총세액 T* − 수증자 납부 P) (§36 재차증여가액).
     * 부분대납: 수증자가 P를 본인 부담하면 증여자는 부족분만 대납.
     * 전액대납(P=0): D == totalGiftTax.
     * ※ besshi10 ㉓ 역산이 이 값을 차감 — 항상 주입 가산분(addition)과 동일 유지(T* 환원 금지).
     */
    donorPaidTax: number;
    /** 총 결정세액 T* = 수렴 finalTax (= 증여자 대납분 D + 수증자 부담 doneePaidTax). applied=true 시 세팅. */
    totalGiftTax?: number;
    /** 수증자 본인 납부액 = min(입력 P, 총세액 T*) (세액 한도 캡 — 자기일관). applied=true 시 세팅. */
    doneePaidTax?: number;
    /** 비대납 결정세액 (비교용 echo) */
    baselineTax: number;
  };

  /**
   * 조특법 §71 농지 감면 상세 (gift-farmland-reduction-71). 미신청 시 null.
   * reductionAmount만 finalTax·§69 base 반영, 나머지 echo. Map 금지(feedback_engine_result_map_json_loss).
   */
  farmlandReductionDetail?: {
    farmlandValue: number; // 금번 감면농지 평가액 합계
    farmlandComputedTax: number; // ㉣ 농지분 산출세액=합산−직전(한도없음,≥0) — 안분 분모
    reductionLimitRemaining: number; // 5년 한도 잔여=max(0,1억−5년기감면)
    reductionAmount: number; // ㉤ 감면세액=min(㉣,잔여)
    reducedFarmlandValue: number; // ㉮ 감면범위=farmlandValue×㉤/㉣
    excessFarmlandValue: number; // ㉯ 초과분=farmlandValue−㉮
    cumulative5yrReduction: number; // 5년 누적 감면 echo(1억 도달)
  } | null;
}
