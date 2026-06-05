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

import type {
  ListedStockClass,
  ListedCompanySize,
  ListedPremiumExclusionReason,
  ListedStockMonthGroups,
  ListedStockBesshiData,
} from "./listed-stock-valuation.types";
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
  /**
   * §63②3호 (PR-L3): 상장된 법인의 증자로 취득한 새 주식으로서 평가기준일 현재 미상장.
   * true 시 평가 = (상장 가목 평가액: listedStockAvgPrice) − 배당차액. 이때 listedStockShares는
   * "증자 신주(미상장) 보유 수"로 의미 전환.
   */
  isCapitalIncreaseUnlistedShare?: boolean;
  /**
   * §63②3호 미상장 신주 모드 — UI 선택 상태 단일 진실 필드 (H-2 데드락 수정).
   *
   * 라디오 value·패널 가시성 게이트·엔진 플래그(`isCapitalIncreaseUnlistedShare`)의
   * 단일 출처. 날짜 존재 여부에서 파생하지 않음(데드락 원인 제거).
   *
   * - "none": 해당없음 (기본, 일반 상장주식)
   * - "capital_increase": 증자 신주(미상장) — capitalIncreaseDate 별도 입력
   * - "merger": 합병 신주(미상장) — mergerDate 별도 입력
   * - undefined: 레거시 호환 — 로드 시 capitalIncreaseDate/mergerDate 존재로 1회 유도
   *
   * onChange: 'none' 선택 시 관련 플래그·날짜 초기화.
   *           'capital_increase'/'merger' 선택 시 isCapitalIncreaseUnlistedShare=true + 반대측 날짜 초기화.
   * 엔진은 isCapitalIncreaseUnlistedShare 플래그만 소비 — 본 필드는 UI 메타.
   */
  unlistedShareMode?: "none" | "capital_increase" | "merger";
  /** §63②3호 배당차액 (원/주, 직접 입력 — 시행규칙 §18② / 산식 박스 L-1) */
  listedStockDividendDifference?: number;
  /** §18② 단서: 정관상 신주의 배당기산일을 기존 상장주식과 동일하게 정함 → 배당차액 0 */
  dividendBaseDateSameAsListed?: boolean;

  // ============================================================
  // 상장주식 평가조서(갑·을) 재현용 필드 (PR-LS-01 ~ LS-10)
  // 계획: docs/00-pm/listed-stock-besshi-form-replica.plan.md
  // 디자인: docs/02-design/features/listed-stock-besshi-form-replica.engine.design.md
  // ============================================================
  /** 갑지 ① 법인명 */
  companyName?: string;
  /** 갑지 ② 대표자 */
  representative?: string;
  /** 갑지 ③ 법인 소재지 */
  companyAddress?: string;
  /** 갑지 ⑤ 평가대상 주식 종류 (보통주/우선주) */
  stockClass?: ListedStockClass;
  /** 갑지 ⑥ 상장일자 */
  listingDate?: Date | string;
  /** 갑지 ⑦ 증자일자 — §63②3호·시행령 §52의2② 평가구간 단축 트리거 */
  capitalIncreaseDate?: Date | string;
  /** 갑지 ⑧ 합병일자 — §63②3호·시행령 §52의2② */
  mergerDate?: Date | string;

  /** §63③ 최대주주 등 할증평가 적용 토글 */
  isMaxShareholder?: boolean;
  /** §53④ 기업 규모 (중소·중견 자동 배제) */
  companySize?: ListedCompanySize;
  /** §53⑧ 1~9호 + 중소·중견 배제 사유 */
  premiumExclusionReason?: ListedPremiumExclusionReason;

  /** 갑지 ⑪ 직전기 배당률 (decimal 0~1, store 단위) */
  priorDividendRate?: number;
  /** 1주당 액면가 — §63②3호 분기 시 명시 입력 필수 (자동 fallback 금지) */
  faceValuePerShare?: number;
  /** 갑지 ⑬ 배당기산일 (주금납입 다음날) */
  dividendBaseDate?: Date | string;

  /**
   * 을지 일자별 종가 4그룹 캐시 — 자동조회 채널-fill 전용.
   * UI 입력 폼은 보유하지 않음. lib/calc/listed-stock-besshi.ts 어댑터가 채움.
   * [[mirror-pattern]] 예외: 사용자 입력 mirror가 아닌 외부 시세 응답의 1회 캐시.
   */
  listedStockDailyGroupsInput?: ListedStockMonthGroups;

  // ============================================================
  // 평가기준일 anchor shift (상증령 §52의2 — 이미지 13)
  // 자동조회 응답 channel-fill 전용. 갑지 ④·평가구간 표시.
  // ============================================================
  /** anchor 보정 결과 ISO YYYY-MM-DD (사용자 입력 valuationDate이 거래일이면 동일) */
  resolvedValuationAnchor?: string;
  /** anchor가 사용자 입력과 다른지 여부 */
  valuationAnchorShifted?: boolean;
  /** shift 사유 라벨 ("토요일" / "일요일" / "납회기간" / "휴장일" 등) */
  valuationAnchorShiftReason?: string;
  /** 평가구간 시작 (anchor − 2개월 + 1일) */
  valuationPeriodStart?: string;
  /** 평가구간 종료 (anchor + 2개월 − 1일) */
  valuationPeriodEnd?: string;

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

  // ===== 담보채무 §14 자동 반영 (collateral-debt-auto-deduction) =====
  /**
   * 명시 opt-in — ON 시 담보채권액(`mortgageAmount + leaseDeposit`)을 §14①3호 부채로 자동 공제.
   * undefined/false=미반영 (자동 침묵 금지). 물상보증(타인 채무 담보)은 §14 공제 대상 아니므로 OFF 유지.
   */
  deductSecuredClaimAsDebt?: boolean;
  /**
   * `mortgageAmount`(저당)가 §10①1호 입증 금융회사 채무인지 — §22 순금융재산 차감 여부.
   * `leaseDeposit`(임대보증금)은 §19④ 금융회사 채무가 아니므로 §22 차감에서 항상 제외.
   */
  securedClaimIsFinancialDebt?: boolean;
  /** 담보채무 자동노출 카드 표시명 (미입력 시 "{name} 담보채무") */
  securedClaimCreditorName?: string;

  // ===== 종합사례 PDF 확장 (Design §2-1) =====
  /** 협의분할 — 상속인별 분배 (합 = valuatedAmount) */
  heirAllocations?: HeirAllocation[];
  /** 간주상속재산 표시 분류 (본법 §8 보험금 / §9 신탁 / §10 퇴직금). 결과 카드 분리 노출용. */
  deemedCategory?: "retirement" | "insurance" | "trust";
  /** 가업상속재산 여부 — 직접 입력 모드 표시용 */
  isFamilyBusinessAsset?: boolean;
  /**
   * §23의2 동거주택 상속공제 — 자산 카드에서 명시 지정한 동거주택(단일).
   * true 시 deriveCohabitHouseStdPrice가 본 자산의 standardPrice(gross)와 mortgageAmount(담보채무)를
   * cohabitHouseStdPrice·cohabitSecuredDebt로 도출. 복수 지정은 자동도출 포기(isApplicable=false).
   */
  isCohabitantHouse?: boolean;

  // ===== 상속개시자료 요약 4표 — Table A 비고/수량 열 (2026-05-28) =====
  /**
   * 평가방식 enum — 결과뷰 Table A 비고 열 단일 도출. 기존 `ValuationMethod` 타입 재사용.
   * undefined 시 fallback 우선순위: marketValue→"시가" / appraisedValue→"감정가액" / standardPrice→"기준시가".
   */
  valuationMethod?: ValuationMethod;
  /** 부동산 면적 (㎡) — Table A "수량(면적)" 열 표시용. 미입력 시 Σ(heirAllocations.areaM2) fallback. */
  areaSqm?: number;
  /** 기타자산 수량 (점 등) — category==="other"일 때 Table A 수량 열 표시. */
  quantityCount?: number;

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
   * §22② 최대주주 보유주식 법정 강제 배제 (상장·비상장 V1·V2 공용 직속 필드).
   *
   * 법령: 상속세 및 증여세법 §22② — 최대주주 및 최대출자자와 그 특수관계인이 보유하는 주식등은
   *       §22 금융재산공제 금융재산에 포함되지 아니한다.
   *
   * - true : §22② 적용 → resolveFinancialEligibility 우선순위 0 가드에 의해 eligible=false (강제 배제)
   * - false : §22② 미적용 → §19① 기본 eligible(true) 보존
   * - undefined : 미설정 → 하위 경로(V2 nested 포함) 또는 카테고리 default 추론
   *
   * OR 호환: 비상장 V2의 기존 필드 `unlistedStockValuationV2.isSection22MajorShareholder`와
   *          OR 체크 — 어느 쪽이든 true이면 배제. V2 nested 경로는 변경 없이 유지.
   *
   * 우선순위: 직속·V2 nested(우선순위 0) > isFinancialAssetForDeduction(우선순위 1)
   */
  isSection22MajorShareholder?: boolean;
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
  /**
   * 영농상속재산 — 피상속인이 상속개시일 2년 전부터 영농에 사용 (§16⑤1호 본문).
   * undefined=충족 가정(legacy 호환), false=미충족 → suggestFarmingAssetValue에서 제외.
   *
   * farmingUseStartDate 입력 시 자동판정 우선, 미입력 시 본 필드 수동 fallback.
   */
  farmingUsedTwoYears?: boolean;
  /**
   * 영농 사용 개시일 (YYYY-MM-DD, §16⑤1호 — "상속개시일 2년 전부터 영농에 사용한 자산").
   *
   * 판정 기준: 취득일이 아닌 실제 영농 사용 시작일 (조심2014중4319: 상속개시 2년 이내 취득·사용
   * 농지는 §16⑤1호 미충족). 자동판정: farmingUseStartDate <= twoYearsBefore(deathDate)이면 충족.
   *
   * 우선순위: farmingUseStartDate(자동) > farmingUsedTwoYears(수동 boolean fallback).
   * string 비교 YYYY-MM-DD — Date 변환 금지 ([[feedback_api_date_serialize]]).
   * 2/29 edge는 드물어 무시 (주석).
   */
  farmingUseStartDate?: string;

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
  /**
   * @deprecated 직접 입력 폐지 — netIncomeY1~Y3 가중평균으로 대체.
   * legacy 저장 데이터 fallback용으로 유지. resolveWeightedNetIncome() 경유 사용.
   */
  weightedNetIncome: number;
  /**
   * 평가기준일 직전 1사업연도 순손익액 (회사 전체, 가중치 ×3) — 상증령 §56①
   * 결손 연도는 음수 입력 허용.
   */
  netIncomeY1?: number;
  /** 직전 2사업연도 순손익액 (가중치 ×2) — 상증령 §56① */
  netIncomeY2?: number;
  /** 직전 3사업연도 순손익액 (가중치 ×1) — 상증령 §56① */
  netIncomeY3?: number;
  /** 순자산가치 */
  netAssetValue: number;
  /** 자본환원율 (기본 10%) */
  capitalizationRate: number;
  /**
   * §54④ 순자산가치만 적용 사유 (선택).
   * 1·2·6호는 무조건 순자산가치 / 3·5호는 단서(가중평균 < 1주당 순자산가치인 경우만) 적용.
   */
  assetValueOnlyReason?: UnlistedAssetValueOnlyReason;
  /**
   * 부동산과다보유법인 여부 (소법 §94①4호다목) — 가중치 반전(순손익가치×2 + 순자산가치×3 ÷ 5).
   * 상증령 §54① 본문 괄호. 미지정 시 false(일반 법인, 순손익×3 + 순자산×2 ÷ 5).
   */
  isRealEstateHeavy?: boolean;
}

/** 재산 평가 결과 (단일 자산) */
export interface PropertyValuationResult {
  estateItemId: string;
  method: ValuationMethod;
  valuatedAmount: number;
  breakdown: CalculationStep[];
  warnings: string[];
  /**
   * 상장주식 평가조서(갑·을) 100% 재현용 echo 데이터.
   * `evaluateListedStock` 만 채움 (다른 평가 함수는 undefined).
   * UI/PDF가 본 echo를 single source로 사용 — UI 재계산 금지.
   */
  besshiData?: ListedStockBesshiData;
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
// §27 세대생략 할증 per-heir detail (상속세 전용 — 증여세 GenerationSkipSurchargeDetail 재사용 금지)
// ============================================================

/**
 * §27 세대생략 수유자 1인 할증 계산 행
 * feedback_no_internal_id_in_result: heirName은 내부 id 대신 표시용 이름 사용
 */
export interface InheritanceGenerationSkipHeirRow {
  /** Heir.id — 배부 연결용 */
  heirId: string;
  /** 표시용 이름 (내부 id 노출 금지) */
  heirName?: string;
  /** 분자 = 직접 유증·상속분 + §13 cutoff 내 사전증여 */
  numerator: number;
  /** 할증율 0.30 / 0.40 */
  rate: number;
  /** 미성년 여부 (resolveMinorBeneficiary 도출) */
  isMinor: boolean;
  /** floor(computedTax × numerator × rate / denominator) — 개별 단일 floor */
  surcharge: number;
}

/**
 * §27 세대생략 할증 전체 상세 (상속세 전용)
 * InheritanceTaxResult.generationSkipDetail 에 저장.
 * 레거시 단일 경로에서도 rows 1행으로 통일하여 결과 카드 공통 표시 가능.
 */
export interface InheritanceGenerationSkipDetail {
  /** adjustedDenominator = taxableEstateValue − nonHeirNonLegateeGifts */
  denominator: number;
  /** 산출세액 (할증 전) */
  computedTax: number;
  /** per-heir 할증 행 배열 */
  rows: InheritanceGenerationSkipHeirRow[];
  /** Σ surcharge */
  total: number;
  /**
   * L-3: 안분 산식(분자÷분모) 실제 적용 여부.
   * true  = per-heir 경로 — rows[i].surcharge = computedTax × numerator × rate / denominator
   * false = 레거시 경로 — surcharge = applyRate(computedTax, rate) 전액 할증 (분모 미사용)
   * 결과 카드(GenerationSkipFormulaRows)가 이 플래그로 산식 표시를 분기해야 함.
   */
  prorationActive: boolean;
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
  /** 주민등록번호 (각 신고서 인적사항 칸 — 계산 미사용, 식별정보) */
  residentNumber?: string;
  birthDate?: string;
  isDisabled?: boolean;
  /**
   * @deprecated 2026-05-26 — 전역 협의분할 비율 폐지. 협의분할은 자산별 `heirAllocations`로 일원화,
   * 미입력 자산은 법정상속분 자동 배분(`inheritance-legal-share.ts`). 엔진 미사용 —
   * sessionStorage 기존 데이터 호환을 위해 타입만 잔류(validator/UI 제거됨).
   */
  actualShareRatio?: number;
  isCohabitant?: boolean;
  // ===== 종합사례 PDF 확장 =====
  /** 상속인 vs 수유자·영리법인 구분. 미입력 시 relation으로 자동 추론. */
  isHeir?: boolean;
  /**
   * 영리법인 여부 (relation === "corporate"일 때만 의미) — Step1에서 결정 (donee-phase2).
   * undefined·true = 영리법인(§3의2② 면제·산출세액 상당액 자동), false = 비영리법인(§3의2② 미적용).
   * 미설정 시 영리법인으로 간주(기존 corporate Heir 호환).
   */
  isForProfit?: boolean;
  /** 세대생략 수유자(직계비속 손자녀) — §27 ② 30%/40% 할증 대상 */
  isGenerationSkipBeneficiary?: boolean;
  /**
   * §27 미성년 여부 수동 override (3-state).
   * - undefined: birthDate 기반 자동 판정 (differenceInYears(deathDate, birthDate) < 19, 민법 §4)
   * - true:  강제 미성년 처리 (연령 개정 대비 or birthDate 미입력 시 수동)
   * - false: 강제 성년 처리 (자동 판정 결과 무효화)
   */
  isMinorOverride?: boolean;
  /**
   * 영리법인 수증자 사전증여 당시 증여세 산출세액 (§3의2② 면제 한도용).
   * ※ 현재 입력 UI·API 경로 없음 — ⑩a 배부 표는 PriorGift.corporateGiftComputedTax(doneeId 합산)를
   *   단일 진실로 사용(inheritance-allocation.ts). 이 Heir 필드는 하위호환 fallback만 잔류.
   */
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
  /**
   * ⑦에서 "입력된 상속인"을 선택한 경우 그 Heir.id.
   * 미설정 = 기타 관계(수동 입력).
   * 엔진 미사용 — 신고서 표시·연결 추적 전용.
   */
  heirRef?: string;
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

  // ===== 상속개시자료 요약 4표 — Table C 채권자/비고 열 (2026-05-28) =====
  /** 채권자 주소 — Table C "채권자 주소 등" 열. */
  creditorAddress?: string;
  /** 채무 발생일 (ISO date) — Table C "비고" 열 "YYYY.M.D. 발생" 형식. */
  incurredDate?: string;
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
  AllocationMismatch,
  CorporateExemptionResult,
  PerCorporateExemptionDetail,
  ShareholderPaymentDetail,
} from "./inheritance-allocation-result.types";
export type {
  HeirTaxBreakdown,
  HeirAllocationResult,
  AllocationMismatch,
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
  /** 순금융재산 (§22 금융재산공제 계산용) */
  netFinancialAssets?: number;
  /** 동거주택 — 상속주택 공시가격 (gross, 담보채무 차감 전) */
  cohabitHouseStdPrice?: number;
  /** §23의2① 담보된 피상속인 채무(저당). cohabitHouseStdPrice(gross)에서 엔진이 단일 차감. */
  cohabitSecuredDebt?: number;
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
import type { FamilyBusinessPostMgmtMeta } from "./inheritance-family-business-postmgmt.types";
import type { CorporateNonBusinessAssets } from "./inheritance-corporate-non-business.types";
import type { EstateLocationFields } from "./inheritance-asset-location.types";
import type {
  LumpSumComparisonDetail,
  SpouseDeductionDetail,
  FinancialDeductionDetail,
  CohabitDeductionDetail,
  DeductionLimitCeilingDetail,
} from "./inheritance-deduction-detail.types";
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
} from "./inheritance-deduction-detail.types";
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
  /** §21② 배우자 단독상속 → 일괄공제 배제 여부 (true면 chosenMethod="itemized" 강제) */
  lumpSumExcludedBySpouseSoleHeir?: boolean;
  breakdown: CalculationStep[];
  appliedLaws: string[];
  // ── 계산 근거 detail (2026-05-31 신설) ──────────────────────────
  /** ① §21 일괄 vs 항목별 비교 detail */
  lumpSumComparisonDetail?: LumpSumComparisonDetail;
  /** ③ §19 배우자공제 계산 근거 detail */
  spouseDeductionDetail?: SpouseDeductionDetail;
  /** ④ §22 금융재산공제 계산 근거 detail (rows[]는 orchestrator 주입) */
  financialDeductionDetail?: FinancialDeductionDetail;
  /** ⑤ §23의2 동거주택공제 계산 근거 detail */
  cohabitDeductionDetail?: CohabitDeductionDetail;
  /** ⑥ §24 종합한도 계산 근거 detail */
  deductionLimitDetail?: DeductionLimitCeilingDetail;
  /** §24 한도 적용 전 공제 합계 (rawTotal — UI 표시용) */
  rawTotalDeduction?: number;
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
  ShortTermReinheritAsset,
  ShortTermReinheritPerAsset,
} from "./inheritance-tax-credit.types";
export type {
  InheritanceTaxCreditInput,
  GiftTaxCreditInput,
  TaxCreditResult,
  ShortTermReinheritAsset,
  ShortTermReinheritPerAsset,
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
  /** 감정평가수수료 입력 (§25①2호·시행령 §20의3) */
  appraisalFee?: AppraisalFeeInput;
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
  deductionInput: GiftDeductionInput;
  creditInput: GiftTaxCreditInput;
  /** 평가기준일 (기본: 증여일) */
  valuationBaseDate?: string;
  /** 감정평가수수료 입력 (§55①·시행령 §46의2 → §20의3 준용) */
  appraisalFee?: AppraisalFeeInput;
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
}
