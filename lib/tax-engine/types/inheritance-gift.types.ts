/**
 * 상속세·증여세 계산 엔진 타입 정의
 *
 * 5개 모듈 간 데이터 계약:
 *   - inheritance-tax.ts (메인 엔진)
 *   - gift-tax.ts (메인 엔진)
 *   - property-valuation.ts (재산평가)
 *   - inheritance-deductions.ts + gift-deductions.ts (공제)
 *   - inheritance-gift-tax-credit.ts (세액공제)
 *   - exemption-rules.ts (비과세)
 */


// ============================================================
// 공통 공유 타입
// ============================================================

/** 계산 단계별 산식·금액 내역 (결과 breakdown 공통) */
export interface CalculationStep {
  label: string;
  amount: number;
  /** 상증법 §XX 등 근거 조문 */
  lawRef?: string;
  note?: string;
}

/** 공통 계산 결과 메타 */
export interface TaxResultMeta {
  breakdown: CalculationStep[];
  appliedLaws: string[];
  warnings: string[];
  /** 계산에 적용된 세법 기준일 (YYYY-MM-DD) */
  appliedLawDate: string;
}

// ============================================================
// 재산평가 (property-valuation.ts)
// ============================================================

/** 평가 방법 우선순위 (상증법 §60 원칙) */
export type ValuationMethod =
  | "market_value"           // 시가 (매매·감정·수용·경매)
  | "similar_sales"          // 유사매매사례가액 (시행령 §49①5호)
  | "standard_price"         // 보충적 평가 — 개별공시지가·기준시가
  | "appraisal"              // 감정평가액
  | "acquisition_cost"       // 취득가액 (예외적 보충)
  | "book_value";            // 장부가액 (비상장주식 보충)

/** 평가 대상 자산 종류 */
export type AssetCategory =
  | "real_estate_land"       // 토지
  | "real_estate_building"   // 건물
  | "real_estate_apartment"  // 아파트 (시세 조회 가능)
  | "listed_stock"           // 상장주식
  | "unlisted_stock"         // 비상장주식
  | "cash"                   // 현금 (지폐·동전 — §22 금융재산공제 대상 아님)
  | "financial"              // 예금·펀드·채권 (§22 금융재산공제 대상)
  | "deposit"                // 전세보증금 반환채권 (임차인인 경우 — 상속세 전용)
  | "other";                 // 기타재산

/** 재산 평가 입력 (단일 자산). 위치 필드 5종(좌표·주소·시·군·구 코드)은 EstateLocationFields mixin */
export interface EstateItem extends EstateLocationFields {
  id: string;
  category: AssetCategory;
  name: string;
  /** 시가 (직접 입력 or 조회) — null이면 보충적 평가 */
  marketValue?: number;
  /** 개별공시지가 (토지) or 기준시가 (건물·아파트) */
  standardPrice?: number;
  /** 감정평가액 */
  appraisedValue?: number;
  /** 상장주식: 전후 2개월 일평균 종가 */
  listedStockAvgPrice?: number;
  listedStockShares?: number;
  /** 상장주식 종목코드 (F-01 키움 자동조회 트리거 — 선택) */
  listedStockCode?: string;
  /** 비상장주식 평가 데이터 (legacy 입력 모드) */
  unlistedStockData?: UnlistedStockData;
  /** 비상장주식 V2 평가 입력 (별지 부표3 완전 재현 — Phase 2~4) */
  unlistedStockValuationV2?: UnlistedStockValuationInput;
  /**
   * 비상장주식 간편/정식 평가 모드 선택 (PR-K: 모드 선택기 재설계).
   * - "simple": 간편평가 — 순손익·순자산 회사 전체값 2개 수치 입력 (calcUnlistedStockPerShareValue)
   * - "formal": 정식평가 — 별지 부표3 완전 재현 (evaluateUnlistedStockV2)
   * - undefined: 레거시 호환 (unlistedStockValuationV2 존재 시 formal, 없으면 simple로 동작)
   * 모드 전환 시 반대 모드 데이터는 폼 state에 보존 (데이터 손실 0).
   * 엔진 전달 전 resolveActiveUnlistedValuation 헬퍼가 비활성 데이터를 strip.
   */
  unlistedValuationMode?: "simple" | "formal";
  /** 임대차 정보 (임대보증금 차감) */
  leaseDeposit?: number;
  /** 저당권 설정 여부 */
  mortgageAmount?: number;

  // ===== 종합사례 PDF 확장 (Design §2-1) =====
  /** 협의분할 — 상속인별 분배 (합 = valuatedAmount) */
  heirAllocations?: HeirAllocation[];
  /** 간주상속재산 표시 분류 (본법 §8 보험금 / §9 신탁 / §10 퇴직금). 결과 카드 분리 노출용. */
  deemedCategory?: "retirement" | "insurance" | "trust";
  /** 가업상속재산 여부 — 직접 입력 모드 표시용 */
  isFamilyBusinessAsset?: boolean;

  // ===== §22 금융재산상속공제 자동화 (2026-05-21) =====
  /**
   * §22 금융재산공제 대상 여부 (사용자 명시 체크).
   * 법령: 상증령 §19① — 금융회사등 취급 예금·적금·신탁(금전)·보험금·주식·채권·수익증권 등.
   * 우선순위: 명시값 > deemedCategory override > 카테고리 default.
   * - undefined: 자동 추론 (resolveFinancialEligibility 헬퍼)
   * - true: 명시 포함
   * - false: 명시 제외 (§22② 차명·미신고 등)
   * 안전 default 정책: 모호한 경우(특히 신탁) false 채택 — 사용자가 명시적으로 포함 체크 필요.
   */
  isFinancialAssetForDeduction?: boolean;
  /**
   * 신탁 유형 — deemedCategory==="trust"일 때만 의미.
   * §19① "금전신탁만" §22 적용 — trustType==="cash_trust"만 default true, 그 외 false.
   * 미입력 시 보수적으로 §22 미적용.
   */
  trustType?: "cash_trust" | "real_estate" | "security" | "other";

  // ===== 영농상속공제 자동화 (2026-05-21, §18의3 + 시행령 §16⑤) =====
  /**
   * 영농상속 자산 분류 (시행령 §16⑤ 1호 가~사 + 2호).
   * undefined: 영농 자산 아님.
   * suggestFarmingAssetValue가 본 필드로 자동 필터링.
   * 카테고리 호환:
   *   - real_estate_* · other: farmland/pasture/forest_land/fishing_vessel/fishing_right/agricultural_building/salt_field
   *   - listed_stock · unlisted_stock: corporate_stock만 가능
   *   - financial · cash · deposit: 영농 자산 불가 (UI에서 미노출)
   */
  farmingCategory?:
    | "farmland"              // 가. 농지법 §2①가 농지
    | "pasture"               // 나. 초지법 §5 초지조성허가 초지
    | "forest_land"           // 다. 보전산지 산림지 (5년 이상 조림)
    | "fishing_vessel"        // 라. 어선법 §2① 어선
    | "fishing_right"         // 마. 어업권·양식업권
    | "agricultural_building" // 바. 농업용 건축물 + 부속토지
    | "salt_field"            // 사. 염전
    | "corporate_stock";      // §16⑤2호 법인 영농 주식

  /**
   * 어업권·양식업권 면허 제외 (PR-RE-1, 시행령 §16⑤마목 단서).
   * 마을어업 면허·협동양식업 면허는 영농상속재산가액에서 제외.
   * farmingCategory==="fishing_right"일 때만 의미. true 시 suggestFarmingAssetValue에서 본 자산 제외.
   * KoreanLaw MCP 검증 (mst=283637) — §16⑤마목 "어업권 또는 「양식산업발전법」에 따른 양식업권
   *   (「수산업법」 제8조에 따른 마을어업 면허 및 「양식산업발전법」 제10조제1항에 따른 협동양식업
   *   면허는 제외한다)"
   */
  fishingLicenseExcluded?: boolean;

  /** 가업상속 자산 분류 (상증령 §15⑤). farmingCategory 동시 선택 시 validate 차단 (asset_dual_category_conflict). 타입: inheritance-family-business.types.ts */
  familyBusinessCategory?: FamilyBusinessCategory;
  /** 법인 영농·가업상속 주식 사업무관자산 (시행령 §15⑤2호 + §16⑤2호). corporate_stock일 때만 의미. 타입: inheritance-corporate-non-business.types.ts */
  corporateNonBusinessAssets?: CorporateNonBusinessAssets;
  /** 법인 총자산 (사업무관자산 비율 분모). 미입력 시 차감 미적용 (legacy). */
  corporateTotalAssets?: number;

  // 위치 필드(좌표·주소·시·군·구 코드)는 EstateLocationFields mixin — 본 인터페이스에 직접 정의 안 함
}

/**
 * 시행령 §54④ 순자산가치만 적용 사유.
 *   - liquidation: 1호 청산절차 진행·사업계속 곤란
 *   - lt3y: 2호 사업개시 전·3년 미만·휴업·폐업
 *   - real_estate_80: 3호 부동산 비율 80% 이상 (단서: 가중평균 < 1주당 순자산가치인 경우만)
 *   - stock_80: 5호 주식 등 가액 80% 이상 (단서: 가중평균 < 1주당 순자산가치인 경우만)
 *   - remaining_3y: 6호 잔여 존속기한 3년 이내
 */
export type UnlistedAssetValueOnlyReason =
  | "liquidation"
  | "lt3y"
  | "real_estate_80"
  | "stock_80"
  | "remaining_3y";

/** 비상장주식 평가 데이터 (시행령 §54) */
export interface UnlistedStockData {
  totalShares: number;
  ownedShares: number;
  /** 최근 3년 순손익 가중평균 (분자) */
  weightedNetIncome: number;
  /** 순자산가치 */
  netAssetValue: number;
  /** 자본환원율 (기본 10%) */
  capitalizationRate: number;
  /**
   * §54④ 순자산가치만 적용 사유 (선택).
   * 1·2·6호는 무조건 순자산가치 / 3·5호는 단서(가중평균 < 1주당 순자산가치인 경우만) 적용.
   */
  assetValueOnlyReason?: UnlistedAssetValueOnlyReason;
}

/** 재산 평가 결과 (단일 자산) */
export interface PropertyValuationResult {
  estateItemId: string;
  method: ValuationMethod;
  valuatedAmount: number;
  breakdown: CalculationStep[];
  warnings: string[];
}

// ============================================================
// 비상장주식 V2 평가 — unlisted-stock-valuation.types.ts로 분리 (2026-05-22, 800줄 정책)
// ============================================================
// 기존 import 경로 보존을 위한 barrel re-export
import type {
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
};

// ============================================================
// 비과세·과세가액 불산입 — inheritance-exemption.types.ts로 분리 (2026-05-21, 800줄 정책)
// ============================================================
// 기존 import 경로 보존을 위한 barrel re-export
import type {
  ExemptionCheckedItem,
  ExemptionInput,
  ExemptionResult,
} from "./inheritance-exemption.types";
export type { ExemptionCheckedItem, ExemptionInput, ExemptionResult };

// ============================================================
// 사전증여 내역 (상증법 §13·§47)
// ============================================================

// ============================================================
// 증여자 관계 (§47② 동일인 그룹화 + §57 적용 판정)
// ============================================================

/**
 * 증여자(donor)와 수증자의 관계 — 동일인 그룹화 기준 (상증법 §47 ②).
 *
 * 그룹 매핑:
 *   A: father, mother           — 직계존속·부모 (§47② 동일인)
 *   B: grandparent              — 직계존속·조부모 (§47② 동일인, §57 세대생략 할증 대상)
 *   C: spouse                   — 배우자
 *   D: lineal_descendant        — 직계비속
 *   E: sibling                  — 형제자매
 *   F: other_relative           — 기타친족
 *   G: other                    — 기타·타인
 */
export type GiftDonorRelation =
  | "father"
  | "mother"
  | "grandparent"
  | "spouse"
  | "lineal_descendant"
  | "sibling"
  | "other_relative"
  | "other";

export type DonorGroup = "A" | "B" | "C" | "D" | "E" | "F" | "G";

// PriorGift·GiftPriorPropertyCategory·EstatePropertyKindCode — sibling 파일로 분리 (800줄 정책, 2026-05-22)
import type { PriorGift } from "./inheritance-prior-gift.types";
export type { PriorGift, GiftPriorPropertyCategory, EstatePropertyKindCode } from "./inheritance-prior-gift.types";

// ============================================================
// §57 할증 한도 detail (사례 2 PDF 표 ⑧⑨⑩⑪⑫⑬ 재현용)
// ============================================================

export interface GenerationSkipSurchargeDetail {
  /** ⑧ 할증과세 = ⑦ × (부모 제외 직계존속 재산가액 / 총 증여재산가액) × 할증율 */
  surchargeBase: number;
  /** 부모 제외 직계존속 비율 (0~1) — 그룹 B 합산 시 1, 그 외 0 */
  nonParentLinealRatio: number;
  /** 할증율 (0.30 원칙 / 0.40 미성년+20억 초과) */
  surchargeRate: number;
  /** ⑨ 누적 기할증과세액 = Σ⑫_prior (사전증여 회차들의 추가할증 누계) */
  priorAdditionalCumulative: number;
  /** ⑩ 공제한도 = ⑦ × ⑤_prior / ⑤ × 할증율 */
  surchargeCreditLimit: number;
  /** ⑪ 차감 기할증과세액 = Min(⑨, ⑩) */
  priorSurchargeCredit: number;
  /** ⑫ 추가 할증세액 = Max(0, ⑧ − ⑪) */
  additionalSurcharge: number;
  /** ⑬ 산출세액합계 = ⑦ + ⑫ */
  totalComputedTaxWithSurcharge: number;
}

// ============================================================
// §58 안분 한도 detail (사례 1 ⑧⑨⑩ / 사례 2 ⑭⑮⑯ 재현용)
// ============================================================

export interface PriorGiftCreditDetail {
  /** ⑭ 가산 증여재산의 산출세액 = 가장 최근 합산 회차의 ⑦ */
  priorComputedTax: number;
  /** ⑤_prior = 가장 최근 합산 회차의 합산과세표준 */
  priorAddedTaxBase: number;
  /** ⑤ = 금번 합산과세표준 */
  aggregatedTaxBase: number;
  /** ⑮ 한도 = ⑦ × ⑤_prior / ⑤ */
  creditLimit: number;
  /** ⑯ 공제액 = Min(⑭, ⑮) */
  priorPaidCredit: number;
}

// ============================================================
// 신고서 양식 표 행 (12행 사례 1 / 18행 사례 2)
// ============================================================

export interface FilingFormRow {
  /** "①" ~ "⑱" (사례 1·2) 또는 "⑰" ~ "㊼" (별지 제10호서식) PDF 표 행 번호. 헤더·도출 행은 빈 문자열 */
  number: string;
  label: string;
  amount: number;
  /**
   * "—" 표기가 필요한 산식 무의미 행 (priorGifts=0 시 ⑩⑪⑭⑮ 등) /
   * "header" = 그룹 머리글 행 (별지 양식 "납부방법")
   */
  display: "amount" | "dash" | "rate" | "header";
  /** 행에 표시할 산식 hint (선택) */
  formula?: string;
  lawRef?: string;
  /** 별지 제10호서식 2-column grid 배치 (구 buildFilingFormRows는 undefined → UI 단일 컬럼 fallback) */
  column?: "left" | "right";
}

// ============================================================
// 상속인 정보
// ============================================================

/** 상속인 관계 */
export type HeirRelation =
  | "spouse"
  | "child"
  | "lineal_ascendant"
  | "sibling"
  | "other"
  // ===== 종합사례 PDF 확장 (Design §2-0) =====
  | "legatee"         // 비상속인 수유자 (자연인, 예: 손녀)
  | "corporate";      // 비상속인 영리법인 수증자

/** 상속인 정보 */
export interface Heir {
  id: string;
  relation: HeirRelation;
  name?: string;
  birthDate?: string;
  isDisabled?: boolean;
  actualShareRatio?: number;
  isCohabitant?: boolean;
  // ===== 종합사례 PDF 확장 =====
  /** 상속인 vs 수유자·영리법인 구분. 미입력 시 relation으로 자동 추론. */
  isHeir?: boolean;
  /** 세대생략 수유자(직계비속 손자녀) — §27 ② 30%/40% 할증 대상 */
  isGenerationSkipBeneficiary?: boolean;
  /** 영리법인 수증자만: 사전증여 당시 증여세 산출세액 (§3의2② 면제 한도용) */
  corporateGiftComputedTax?: number;

  // ===== PR 2 (2026-05-22) — 부표 5 영리법인 면제 및 납부 명세서 =====
  /**
   * 영리법인 사업자등록번호 — 별지 제9호서식 부표 5 ② 컬럼.
   * relation === "corporate" 일 때만 의미.
   */
  businessRegistrationNumber?: string;
  /**
   * 영리법인 사업장 소재지 — 별지 제9호서식 부표 5 ③ 컬럼.
   * relation === "corporate" 일 때만 의미.
   */
  businessAddress?: string;
  /**
   * 영리법인 주주 중 상속인·직계비속 명세 (부표 5 나. 표).
   *
   * 상증법 §3의2② 작성방법 6:
   *   ⑪ 면제분 납부세액 = [면제세액(⑤) − 유증가액(④)×10%] × 지분율(⑩)
   *
   * relation === "corporate" 일 때만 의미.
   * 합 ≤ 1.0 (외부 주주 — 상속인 아닌 자 — 보유분은 명세 제외, validate 미차단)
   */
  shareholders?: ShareholderInfo[];
}

/**
 * PR 2 — 영리법인 주주 명세 (부표 5 나. 표).
 *
 * §3의2② 본문: "그 영리법인의 주주 또는 출자자 중 상속인, 상속인의 배우자,
 * 상속인의 직계비속 또는 그 직계비속의 배우자"
 */
export interface ShareholderInfo {
  id: string;
  /**
   * 부표 5 ⑦ 구분.
   *   - "heir": 상속인
   *   - "heir_spouse": 상속인의 배우자
   *   - "lineal_descendant_of_heir": 상속인의 직계비속
   *   - "spouse_of_lineal_descendant": 직계비속의 배우자
   */
  relation:
    | "heir"
    | "heir_spouse"
    | "lineal_descendant_of_heir"
    | "spouse_of_lineal_descendant";
  /** 부표 5 ⑧ 성명 */
  name: string;
  /** 부표 5 ⑨ 주민등록번호 (옵션 — 신고서 표시용) */
  residentNumber?: string;
  /** 부표 5 ⑩ 지분율. 0 ≤ r ≤ 1 (1=100%). 합 ≤1 (외부 주주분 제외) */
  shareRatio: number;
}

// ============================================================
// 자산-수준 협의분할 (Design §2-1)
// ============================================================

export interface HeirAllocation {
  /** Heir.id 참조 */
  heirId: string;
  /** 분배 금액 (원). 합계 = 자산 평가액 */
  amount: number;
  /** 분배 면적 (선택, 표시용) */
  areaM2?: number;
}

// ============================================================
// 추정상속재산 §15 (Design §2-3)
// ============================================================

export type PresumedCategory =
  | "real_estate"      // 부동산 및 부동산권리
  | "deposit"          // 예금 인출
  | "other_asset"      // 기타재산
  | "financial_debt";  // 금융기관채무

export interface PresumedInheritanceItem {
  id: string;
  category: PresumedCategory;
  /** 1년 이내 처분·인출·차입 금액 (원) */
  amountWithin1Y: number;
  /** 1년 초과 ~ 2년 이내 처분·인출·차입 금액 (원) */
  amountWithin2Y: number;
  /** 사용처가 객관적으로 확인된 금액 */
  verifiedUseAmount: number;
  /** 상속인별 분배 (선택) */
  heirAllocations?: HeirAllocation[];
}

export interface PresumedInheritanceItemResult {
  id: string;
  category: PresumedCategory;
  /** 임계 발동 여부 (1년 2억 OR 2년 5억) */
  thresholdTriggered: boolean;
  /** 소명대상 합계 = 1Y + 2Y (임계 미만 시 0) */
  scrutinyAmount: number;
  /** 미소명 = 소명대상 − 확인금액 */
  unverifiedAmount: number;
  /** Min(처분금액 × 20%, 2억) */
  baseDeduction: number;
  /** 추정상속재산 가산액 = max(0, 미소명 − baseDeduction) */
  addedAmount: number;
  breakdown: CalculationStep[];
}

// ============================================================
// 채무·공과금·장례비 협의분할 (Design §2-3-1)
// ============================================================

export type DebtCategory =
  | "financial"      // 금융기관 채무
  | "tax"            // 공과금
  | "personal"       // 사적 채무
  | "funeral";       // 장례비

export interface DebtItem {
  id: string;
  category: DebtCategory;
  name: string;
  /** 금액 (원). 장례비는 한도 적용 전 금액. */
  amount: number;
  /** 장례비 봉안시설 사용료 여부 (true 시 한도 500만, false 시 한도 1,000만) */
  isBongan?: boolean;
  /** 협의분할 — 상속인별 변제 분배 */
  heirAllocations?: HeirAllocation[];
  /**
   * §22 순금융재산 산식의 차감 채무 여부 (사용자 명시 체크).
   * 법령: 상증령 §19④ — §10① 1호로 입증된 금융회사등에 대한 채무만 차감 가능.
   * UI: category !== "financial"이면 체크박스 disabled (resolveFinancialDebt에서 강제 false).
   * - undefined: financial 카테고리 default true / 그 외 default false
   * - true: 명시 — §10① 1호 입증 완료
   * - false: 명시 제외 — 입증 미비 등
   * 본 플래그는 §22 순금융 계산에만 영향. 채무 본래의 과세가액 차감(§14)은 그대로 작동.
   */
  isFinancialDebtForDeduction?: boolean;
}

// ============================================================
// 상속인별 배부 + 영리법인 면제 — inheritance-allocation-result.types.ts로 분리
// (2026-05-21, 800줄 정책). 기존 import 경로 보존을 위한 barrel re-export.
// ============================================================
import type {
  HeirTaxBreakdown,
  HeirAllocationResult,
  CorporateExemptionResult,
  PerCorporateExemptionDetail,
  ShareholderPaymentDetail,
} from "./inheritance-allocation-result.types";
export type {
  HeirTaxBreakdown,
  HeirAllocationResult,
  CorporateExemptionResult,
  PerCorporateExemptionDetail,
  ShareholderPaymentDetail,
};

// ============================================================
// 상속공제 입력 (inheritance-deductions.ts)
// ============================================================

/** 상속공제 입력 (7종 + §24 종합한도) */
export interface InheritanceDeductionInput {
  heirs: Heir[];
  /** 배우자 실제 상속금액 (미입력 시 법정상속분으로 산정) */
  spouseActualAmount?: number;
  /** 일괄공제 선택 여부 (§21 5억 / 기초+인적공제 자동비교) */
  preferLumpSum?: boolean;
  /** 순금융재산 (§22 금융재산공제 계산용) */
  netFinancialAssets?: number;
  /** 동거주택 — 상속주택 공시가격 */
  cohabitHouseStdPrice?: number;
  /** 영농상속 — 농지·목장용지·어선 가액 */
  farmingAssetValue?: number;
  /** 가업상속 — 가업상속재산가액 */
  familyBusinessValue?: number;
  /** 가업 영위 기간 (년) */
  familyBusinessYears?: number;
  /**
   * 상속개시일 (ISO date) — 미성년자·연로자·장애인 인적공제의 나이 기준일.
   * 상증법 §20: 상속개시일 현재 나이로 판정해야 하므로 반드시 전달해야 함.
   * 미제공 시 계산일 기준으로 fallback (소급 계산 오류 가능).
   */
  deathDate?: string;

  // ===== 종합사례 PDF Phase D·E 확장 =====
  /**
   * 가업상속공제 직접 입력 (Phase E).
   * 제공 시 요건 판정 생략하고 입력값 그대로 적용. familyBusinessValue 우선.
   */
  familyBusinessDirectAmount?: number;
  /**
   * 동거주택공제 직접 입력 (Phase E).
   * 제공 시 80% 산정 생략하고 입력값 그대로 적용 (한도 6억은 유지).
   */
  cohabitDirectAmount?: number;
  /**
   * §19 배우자 법정상속분 직접 입력 (Phase D).
   * 제공 시 calcSpouseDeduction이 법정상속분 자동 산정 대신 입력값 사용.
   * 미입력 시 orchestrator가 PDF 책 1862 표 산식으로 자동 계산.
   */
  spouseLegalShareOverride?: number;
  // ===== Phase D §24 분자 보정 (orchestrator → calcInheritanceDeductions 전달) =====
  /** 상속인 외 자에게 유증한 금액 (§24 분자 차감) */
  legateeAmountNonHeir?: number;
  /** 증여재산공제 합계 (§24 분자 보정용) */
  priorGiftDeductionTotal?: number;
  /** 신고기한 내 재해손실공제 (§24 분자 보정용) */
  disasterLossDeduction?: number;

  // ===== 영농상속공제 정밀화 (2026-05-21, §18의3 + 시행령 §16) =====
  /**
   * 영농상속 자격·요건 입력. 미제공 시 legacy 호환 (evaluated=false, eligible=true 가정).
   * 신규 사용자는 본 객체 제공 권장.
   */
  farming?: FarmingInheritanceInput;

  // ===== 가업상속공제 정밀화 (2026-05-21, 상증법 §18의2 + 상증령 §15) =====
  /**
   * 가업상속 자격·요건 입력 (Phase B). 미제공 시 legacy 호환.
   * familyBusinessDirectAmount 제공 시 본 객체 무시 (Phase E escape hatch).
   * EstateItem 자동 합산은 orchestrator에서 InheritanceTaxInput.estateItems 직접 사용.
   */
  familyBusiness?: FamilyBusinessInheritanceInput;
}

// 분리 타입 barrel (800줄 정책)
import type { FarmingInheritanceInput, FarmingDeductionDetail } from "./inheritance-farming.types";
import type { FamilyBusinessCategory, FamilyBusinessInheritanceInput, FamilyBusinessDeductionDetail } from "./inheritance-family-business.types";
import type { CorporateNonBusinessAssets } from "./inheritance-corporate-non-business.types";
import type { EstateLocationFields } from "./inheritance-asset-location.types";
export type { FarmingInheritanceInput, FarmingDeductionDetail, FarmingEligibilityResult } from "./inheritance-farming.types";
export type { FamilyBusinessCategory, FamilyBusinessInheritanceInput, FamilyBusinessIneligibleReason, FamilyBusinessDeductionDetail, FamilyBusinessCap, FamilyBusinessMediumGuard } from "./inheritance-family-business.types";
export type { CorporateNonBusinessAssets, CorporateStockAdjustedResult } from "./inheritance-corporate-non-business.types";
export type { LatLng, EstateAddress } from "./inheritance-asset-location.types";
export { FARMING_MAX } from "./inheritance-farming.types";
export { FAMILY_BUSINESS_CAP_10Y, FAMILY_BUSINESS_CAP_20Y, FAMILY_BUSINESS_CAP_30Y, FAMILY_BUSINESS_SCALE_THRESHOLD, FAMILY_BUSINESS_OTHER_ESTATE_RATIO } from "./inheritance-family-business.types";

/** 상속공제 계산 결과 */
export interface InheritanceDeductionResult {
  basicDeduction: number;
  spouseDeduction: number;
  personalDeductionTotal: number;
  lumpSumDeduction: number;
  financialDeduction: number;
  cohabitationDeduction: number;
  farmingDeduction: number;
  /** 영농상속공제 상세 (2026-05-21, §18의3 정밀화). farming 미입력 시 evaluated=false. */
  farmingDetail?: FarmingDeductionDetail;
  familyBusinessDeduction: number;
  /** 가업상속공제 상세 (2026-05-21, §18의2 정밀화). familyBusiness 미입력 시 undefined (legacy). */
  familyBusinessDetail?: FamilyBusinessDeductionDetail;
  /** §24 종합한도 적용 후 최종 공제액 */
  totalDeduction: number;
  /** 일괄공제 vs 개별공제 선택 근거 */
  chosenMethod: "lump_sum" | "itemized";
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

// ============================================================
// 증여공제 입력 (gift-deductions.ts)
// ============================================================

/** 증여자와 수증자의 관계 */
export type DonorRelation =
  | "spouse"
  | "lineal_ascendant_adult"    // 성인 직계존속
  | "lineal_ascendant_minor"    // 미성년자 직계존속
  | "lineal_descendant"         // 직계비속
  | "other_relative";           // 기타 친족

/** 증여공제 입력 */
export interface GiftDeductionInput {
  donorRelation: DonorRelation;
  /** 혼인 공제 (§53의2) — ≤ 1억 */
  marriageExemption?: number;
  /** 출산 공제 (§53의2) — ≤ 1억 */
  birthExemption?: number;
  /** 10년 이내 동일인(동일 관계 그룹)에 대한 기사용 공제 합산 */
  priorUsedDeduction?: number;
}

/** 증여공제 계산 결과 */
export interface GiftDeductionResult {
  relationDeduction: number;
  marriageBirthDeduction: number;
  totalDeduction: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

// ============================================================
// 세액공제 입력 (credits/)
// ============================================================

/** 상속세 세액공제 입력 */
// 세액공제 타입은 inheritance-tax-credit.types.ts로 분리 (800줄 정책)
import type {
  InheritanceTaxCreditInput,
  GiftTaxCreditInput,
  TaxCreditResult,
} from "./inheritance-tax-credit.types";
export type {
  InheritanceTaxCreditInput,
  GiftTaxCreditInput,
  TaxCreditResult,
};

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
   * 장례비 (최대 1,500만원, 봉안시설 추가 시 +500만)
   * @deprecated debtItems(category="funeral") 사용 권장
   */
  funeralExpense: number;
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
}

/** 상속세 계산 결과 전체 */
export interface InheritanceTaxResult extends TaxResultMeta {
  /** 상속재산가액 (평가 후) */
  grossEstateValue: number;
  /** 비과세 차감액 */
  exemptAmount: number;
  /** 장례·채무 차감 */
  deductedBeforeAggregation: number;
  /** 사전증여재산 합산 */
  priorGiftAggregated: number;
  /** 상속세 과세가액 */
  taxableEstateValue: number;
  /** 공제 합계 (§24 한도 적용 후) */
  totalDeduction: number;
  /** 과세표준 */
  taxBase: number;
  /** 산출세액 (누진세율) */
  computedTax: number;
  /** 세대생략 할증액 */
  generationSkipSurcharge: number;
  /** 세액공제 합계 */
  totalTaxCredit: number;
  /** 결정세액 */
  finalTax: number;
  deductionDetail: InheritanceDeductionResult;
  creditDetail: TaxCreditResult;
  valuationResults: PropertyValuationResult[];

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
  deductionInput: GiftDeductionInput;
  creditInput: GiftTaxCreditInput;
  /** 평가기준일 (기본: 증여일) */
  valuationBaseDate?: string;
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
  interestEquivalent?: number;       // ㉟ 이자상당액
  museumDeferredTax?: number;        // ㊱ §75 박물관자료 등 징수유예세액
  underreportPenalty?: number;       // ㊷ 국기법 §47의2·§47의3
  latePaymentPenalty?: number;       // ㊸ 국기법 §47의4
  publicInterestPenalty?: number;    // ㊹ §78 공익법인 등 관련 가산세
  installmentPayment?: number;       // ㊻ §71 연부연납
  cashDeferred?: number;             // ㊼ §70② 현금 분납
  /** 별지 제10호서식 좌·우 컬럼 행 배열 (총 34행) — UI는 본 배열만 읽음 */
  besshi10Rows: FilingFormRow[];
}
