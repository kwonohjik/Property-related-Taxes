/**
 * 재산평가·자산 입력 타입 — inheritance-gift.types.ts에서 분리 (800줄 정책, 2026-06-19).
 *
 * EstateItem(재산평가 입력)·PropertyValuationResult·UnlistedStockData + 추정상속재산 §15·채무 §14.
 * 의존: common(CalculationStep)·heir(HeirAllocation) + 기존 sibling 평가 타입.
 */

import type { CalculationStep } from "./inheritance-gift-common.types";
import type { HeirAllocation } from "./inheritance-gift-heir.types";
import type {
  ListedStockClass,
  ListedCompanySize,
  ListedPremiumExclusionReason,
  ListedStockMonthGroups,
  ListedStockBesshiData,
} from "./listed-stock-valuation.types";
import type { UnlistedStockValuationInput } from "./unlisted-stock-valuation.types";
import type { FamilyBusinessCategory } from "./inheritance-family-business.types";
import type { CorporateNonBusinessAssets } from "./inheritance-corporate-non-business.types";
import type { EstateLocationFields } from "./inheritance-asset-location.types";

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
  /** 유사매매사례가액 (상증법 시행령 §49①·④ — "시가로 본다"). market·appraised 존재 시 §49② 단서로 배제(if-chain 자연 후순위). */
  similarSalesValue?: number;
  /**
   * 유사매매사례가액 출처 메타 — §9 D8 (1필드만, similarSalesCandidates 금지).
   * "manual": 사용자 수동 입력 (기존 동작)
   * "rtms_auto": RTMS 자동조회 후 사용자가 선택하여 채움
   * 엔진(resolveValuationMethod)은 이 필드를 소비하지 않음 — UI 표시·출처 추적 전용.
   */
  similarSalesSource?: "manual" | "rtms_auto";
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
  /** 월 임대료 (원) — §61⑤·시행규칙 §15의2 임대료환산가액=(월세×12÷0.12)+임대보증금. 보충평가(standard_price) 시만 비교. */
  monthlyRent?: number;
  /** 신용보증기관 보증액 (원) — 시행령 §63② 저당 담보채권액에서 차감(§66 1호 한정, 음수 가드). */
  creditGuaranteeAmount?: number;

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

  // ===== 물납 충당순위 분류 (상증령 §74②, 갭4) — 물납 안내 카드 전용(결정세액 미영향) =====
  /**
   * 상속인 거주 주택·부수토지 (§74②6호) — 충당 최후순위.
   * 부동산 자산 한정. true 시 충당순서 표시상 일반 국내부동산(3호)에서 분리되어 6순위로,
   * §73④ 비상장 캡 기준에서 차감. 요건1(§73①1호 부동산·유가증권 분자)에는 포함(국내 부동산).
   * (유가증권 분류 government_bond/restricted_listed는 §73①3호 "금융재산" 정의와의
   *  이중계상 검증 후 후속 — 본 PR은 거주주택만.)
   */
  isHeirResidenceProperty?: boolean;
  /** 가업상속재산 여부 — 직접 입력 모드 표시용 */
  isFamilyBusinessAsset?: boolean;
  /**
   * §23의2 동거주택 상속공제 — 자산 카드에서 명시 지정한 동거주택(단일).
   * true 시 deriveCohabitHouseStdPrice가 본 자산의 standardPrice(gross)와 mortgageAmount(담보채무)를
   * cohabitHouseStdPrice·cohabitSecuredDebt로 도출. 복수 지정은 자동도출 포기(isApplicable=false).
   */
  isCohabitantHouse?: boolean;
  /**
   * §23의2 동거주택 자산 유형 구분 (폼·UI용).
   * isCohabitantHouse=true 시 함께 지정.
   *
   * - "house":              일반 주택 (기본값, undefined=house 동일 취급)
   * - "single_redev_right": 1세대1주택 멸실 취득 단일 조합원입주권 → 적용
   *                         (재산세제과-230·237, NTS[113036] V-1 확정)
   * - "one_plus_one_right":  1주택→2입주권 재개발 → 미적용 (조심 2021중6665)
   * - "sale_right":          주택분양권 → 미적용 (§23의2① "주택" 문언)
   */
  cohabitHouseRightType?: "house" | "single_redev_right" | "one_plus_one_right" | "sale_right";

  // ===== 상속개시자료 요약 4표 — Table A 비고/수량 열 (2026-05-28) =====
  /**
   * 평가방식 enum — 결과뷰 Table A 비고 열 단일 도출. 기존 `ValuationMethod` 타입 재사용.
   * 2026-06-08: UI 라디오 삭제. 잔존=하위호환·수동 override 여지(D-5).
   * 소비처는 `item.valuationMethod ?? resolveValuationMethod(item)` 패턴(명시 우선, 없으면 입력 금액에서 도출).
   * 도출 우선순위(§49②④): marketValue→"시가" / appraisedValue→"감정가액" / similarSalesValue→"매매사례가액" / standardPrice→"기준시가".
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

  // ===== §74 지정문화유산 등 징수유예 (상증법 §74 / 상증령 §76①) =====
  /**
   * §74①각호 지정문화유산 분류. undefined=해당 없음.
   * 담보 면제(§74⑤): "designated"·"natural_monument"만 가능.
   * 2호 박물관자료: 사립은 공익법인등만(UI 안내, 엔진은 type 신뢰).
   * 징수유예세액 = 산출세액 × (해당 재산가액 ÷ 상속재산[§13 가산증여 포함]) — 비례 방식(조심 940708).
   */
  culturalHeritageType?:
    | "heritage_data"      // 1호 문화유산자료등
    | "museum"             // 2호 박물관자료등
    | "designated"         // 3호 국가지정문화유산등 (담보 면제)
    | "natural_monument";  // 4호 천연기념물등       (담보 면제)

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

  // ===== 조특법 특례 2-스트림 분리과세 (2026-06-11, §30의5⑪·§30의6⑤) =====
  /**
   * 해당 자산이 조특법 특례(창업자금·가업승계) 귀속 자산인지 여부.
   *
   * 법령 근거:
   *   §30의5⑪: 창업자금 외의 일반 증여재산은 특례 과세가액에 §47② 합산 금지.
   *             → 자산별로 특례 스트림 vs 일반 스트림을 명시 구분해야 함.
   *
   * 귀속 규칙:
   *   - giftItems 1개 + specialTreatment 선택: 자동 특례 귀속 (본 필드 불필요)
   *   - giftItems N개 + specialTreatment 선택: 자산-수준 명시 필수.
   *     true  → 특례 스트림 (창업자금·가업승계 자산)
   *     false → 일반 스트림
   *     undefined + N개 혼합: validation 차단 ("특례 귀속 자산을 선택해 주세요")
   *   - specialTreatment 미선택: 본 필드 무시
   */
  isSpecialTreatmentAsset?: boolean;

  // ===== §47① 부담부증여 채무인수 (gift-burdened-debt-47-1) =====
  /**
   * §47① 부담부증여 수증자 인수 채무액 (원).
   *
   * 법령: 상증법 §47① — "증여세 과세가액은 증여재산가액을 합친 금액에서
   *       그 증여재산에 담보된 채무(그 증여재산에 관련된 채무 등 대통령령으로 정하는
   *       채무를 포함한다)로서 수증자가 인수한 금액을 뺀 금액으로 한다."
   *
   * 성질 구분:
   *   - 이 필드: §47① **과세가액 차감** (증여 전용)
   *   - mortgageAmount: §66 MAX 평가 상향 + 선택적으로 §14 상속채무 공제 (상속 전용)
   *   두 필드는 동일 자산에 공존 가능 — §66 MAX 교차 케이스 허용.
   *
   * undefined/0: 부담부증여 아님 (기본).
   * 양수: 수증자가 인수하기로 한 채무액.
   * 음수 가드: Math.max(0, ...) 엔진에서 처리.
   * §47③ 배우자·직계존비속: UI에서 안내 문구 표시, 차단 안 함.
   */
  assumedDebtForGift?: number;

  /**
   * §47③ 부담부증여 채무 인수 객관적 입증 여부 토글 (배우자·직계존비속 한정).
   *
   * 법령: 상증법 §47③ — "배우자·직계존비속 간 부담부증여는 채무 인수를 추정하지 아니한다.
   *       다만, 객관적으로 인정되는 것인 경우에는 그러하지 아니하다."
   *
   * - undefined/false: 미입증 (기본 — §47③ 추정 배제).
   * - true: 입증됨 (금융기관 채무 확인서 등 객관적 증빙 첨부).
   *
   * 엔진은 assumedDebtForGift > 0이면 관계 불문 차감 처리.
   * UI에서 donorRelation이 배우자/직계존비속인 경우 이 토글 ON 시 안내 문구 표시.
   * 자동 차단(validation 오류) 금지 — §47③ 단서 "객관적으로 인정되는 것"에 해당 시 인정.
   */
  burdenedGiftDebtConfirmed?: boolean;

  /**
   * 부담부증여 양도소득세 함께 계산 — 토글 ON 시 존재, OFF 시 undefined (3-state).
   *
   * 법령 근거: 소득세법 §88 — 채무인수분은 유상양도로 보아 증여자에게 양도소득세 과세.
   *           소득세법 시행령 §159 — 상증법 기준시가 안분으로 취득가액·양도가액 산정.
   *
   * 적용 대상: mode==="gift" && category∈{real_estate_land·real_estate_building·real_estate_apartment}
   *            && assumedDebtForGift > 0
   *
   * - undefined: 토글 OFF (기본)
   * - 객체: 토글 ON — 양도세 API 호출에 필요한 추가 입력값
   *
   * 증여세 엔진(gift-tax.ts)은 이 필드를 읽지 않는다(양도세 전용).
   * 계산 결과는 EstateItem에 저장하지 않음(휘발) — 계산 액션 시점 API 호출 후 결과뷰 props로 주입.
   */
  burdenedGiftTransferTax?: BurdenedGiftTransferTaxInput;

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
// 부담부증여 양도소득세 추가 입력 (EstateItem.burdenedGiftTransferTax)
// 설계: docs/02-design/features/gift-burdened-transfer-tax.design.md §5
// ============================================================

/**
 * 부담부증여 양도소득세 함께 계산 — 토글 ON 시 EstateItem에 포함되는 추가 입력.
 *
 * MVP: 단일 자산 · 상증법 기준시가 모드(valuationMode: "sangjeungbeop_standard" 고정).
 * 취득가액 = 취득시 기준시가 안분(소득세법 시행령 §159①1호).
 *
 * 납세의무자: 증여자 (소득세법 §88 — 채무인수분은 유상양도).
 * 양도일=증여일, 취득일=증여자 당초 취득일.
 *
 * 증여세 엔진(gift-tax.ts)은 이 필드를 읽지 않음 — 양도세 API(/api/calc/transfer) 전용.
 */
export interface BurdenedGiftTransferTaxInput {
  // ===== 전 category 필수 =====
  /** 증여자 당초 취득일 (보유기간·LTHD·단기세율 기준) */
  acquisitionDate: Date;
  /**
   * 취득시 기준시가 — §159①1호 안분 분자.
   * - real_estate_land: 개별공시지가 총액 (원). UI: LandPriceLookupField 필수.
   * - real_estate_building / real_estate_apartment: 건물기준시가 / 공동주택공시가격 (원).
   */
  standardPriceAtAcquisition: number;

  // ===== real_estate_building 전용 =====
  /**
   * 건물의 주택 여부 (real_estate_building만 적용).
   * - true → propertyType:"housing" (비과세·LTHD·중과 활성)
   * - false → propertyType:"building"
   * real_estate_apartment는 항상 housing → 이 필드 불필요.
   * real_estate_land는 항상 land → 이 필드 불필요.
   */
  isHousing?: boolean;

  // ===== housing(isHousing=true or apartment) 전용 =====
  /** 세대 보유 주택 수 (비과세·중과 판정용, 기본 1). 증여자 기준. */
  householdHousingCount?: number;
  /** 1세대1주택 여부 (기본 false — 안전 방향, 미입력 시 비과세 미적용). 증여자 기준. */
  isOneHousehold?: boolean;
  /** 양도시(=증여일) 조정대상지역 여부 */
  isRegulatedArea?: boolean;
  /** 취득시 조정대상지역 여부 (거주요건 경과규정 판단) */
  wasRegulatedAtAcquisition?: boolean;
  /**
   * 거주기간 (개월, 정수). 1세대1주택 LTHD 표2 적용 기준.
   * isOneHousehold=true 시 필수(⑧ validation 차단).
   */
  residencePeriodMonths?: number;
  /**
   * 일시적 2주택 비과세 특례.
   * householdHousingCount===2 일 때만 UI 노출.
   * - previousAcquisitionDate: 종전 주택 취득일
   * - newAcquisitionDate: 신규 주택(=이번 증여 주택) 취득일
   */
  temporaryTwoHouse?: {
    previousAcquisitionDate: Date;
    newAcquisitionDate: Date;
  };

  // ===== real_estate_land 전용 =====
  /** 비사업용 토지 여부 (중과 +10%p 적용) */
  isNonBusinessLand?: boolean;

  // ===== 공통 선택 =====
  /**
   * 미등기 양도 여부 (기본 false).
   * true 시 LTHD 배제 + 중과세율 70% 적용.
   */
  isUnregistered?: boolean;

  // ===== K-4/K-5 취득가액 실지·환산 모드 (§159①1호 게이트) =====
  /**
   * 평가 방식. 미입력 = 기준시가 모드(K-1~K-3) 유지.
   * - "sangjeungbeop_standard": 상증법 기준시가 안분 (K-1~K-3)
   * - "sangjeungbeop_market":   시가 평가 → 실지 또는 환산 (K-4/K-5)
   */
  valuationMode?: "sangjeungbeop_standard" | "sangjeungbeop_market";

  /**
   * 시가 평가 시 분모 C: 양도시 시가 (원).
   * sangjeungbeop_market 선택 시 필수. K-5 환산취득가 = 취득기준시가 × (채무 / C).
   */
  marketValueAtTransfer?: number;

  /**
   * 취득가액 산정 방식 (sangjeungbeop_market 선택 시 필수).
   * - "actual":    실지취득가액 안분 (K-4)
   * - "converted": 환산취득가액 §176의2②2호 (K-5)
   */
  acquisitionMethod?: "actual" | "converted";

  /**
   * 실지 취득가액 합계 (원) — K-4 전용, 건물+토지 통합 입력.
   * 증여 category에는 general_building 없음 → 분리입력 불요, 합계 단일 필드.
   * acquisitionMethod==="actual" 시 필수.
   */
  actualAcquisitionTotal?: number;

  /**
   * 타입 호환용: 양도세 엔진 actualLandAcquisitionPrice (증여세 탭에서는 미사용).
   * buildGiftBurdenedTransferBody에서 건물분과 통합하여 전송.
   */
  actualLandAcquisitionPrice?: number;

  /**
   * 타입 호환용: 양도세 엔진 actualBuildingAcquisitionPrice (증여세 탭에서는 미사용).
   * buildGiftBurdenedTransferBody에서 actualAcquisitionTotal로 통합 전송.
   */
  actualBuildingAcquisitionPrice?: number;

  /**
   * 자본적 지출 (원) — K-4 실지 모드 시 선택입력. body 최상위 capitalExpenditure.
   * K-5 환산 모드에서는 §176의2②2호 적용 → 무시됨.
   */
  capitalExpenditure?: number;

  /**
   * 양도비용 (원) — K-4 실지 모드 시 선택입력. body 최상위 transferExpense.
   * K-5에서는 개산공제 §163⑥(3%)가 대신 적용되므로 무시됨.
   */
  transferExpense?: number;

  /**
   * 토지 양도시 기준시가 (원) — 토지 자산의 K-5 환산 분자.
   * real_estate_land + sangjeungbeop_market + converted 조합 시 필수.
   * 주택·건물 자산에서는 standardPrice(양도시 기준시가)가 이미 있으므로 불필요.
   */
  landStdPriceAtTransfer?: number;
}
