/**
 * 주식 양도소득세 — Input·Result 타입 정의
 *
 * 소득세법 2026.4.21. 시행 기준
 * PR-1 범위: 상장 대주주 + 취득 후 상장 + 비과세 + §94② + 거래정지 + 임계 이력 + 단기 기산점
 * PR-2: 비상장 보충 평가 (stock-valuation.ts placeholder)
 */

// 취득 후 상장 환산 결과 — sibling 분리(800줄 정책). import는 StockTransferResult가 참조,
// export는 외부 import 경로 무변경용 re-export.
import type { PostListingValuationResult } from "./post-listing-result.types";
import type { Cross1045Adjustment } from "../../comparative-104-5-cross";
export type { PostListingValuationResult };

// ============================================================
// Input
// ============================================================

export type StockTransferInput = {
  // §94①3 — 시장 분류
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted" | "other_asset";

  // 대주주 판정 (시행령 §157) — 2-step 판정
  isMajorShareholder: boolean;
  /** 본인 단독 지분율 (0.01 = 1%) */
  selfShareRatio: number;
  /** 본인 단독 시총 (원) */
  selfMarketCap: number;
  /** 본인+특수관계인 합산 최대주주그룹 여부 */
  isLargestShareholderGroup: boolean;
  /** 합산 지분율 (isLargestShareholderGroup=true 시) */
  combinedShareRatio: number;
  /** 합산 시총 (isLargestShareholderGroup=true 시) */
  combinedMarketCap: number;
  /** 직전 사업연도 종료일 */
  priorYearEndDate: Date;

  /**
   * F-15 (2026-05-19) — 대차주식 수 (시행령 §157 2013.2.15. 이후 분).
   * 본인이 대여 중인 주식 수. 대주주 판정 시 자동 합산되어 지분율 가산 (교재 §3장 이미지 51 ⑧).
   * 2013.2.15. 이후 양도분에만 적용 — 그 이전 양도는 무시.
   * `totalIssuedShares` 와 함께 지분율 가산. 시가총액 합산은 사용자 책임 (가격 외부 의존).
   * @default 0
   */
  lentSharesCount?: number;

  /**
   * F-16 (2026-05-19) — 사모펀드 간접소유 주식 수 (시행령 §157 2013.2.15. 이후 분).
   * 본인·기타주주가 사모펀드를 통해 간접소유하고 있는 주식 수 (교재 §3장 이미지 51 ⑨).
   * 대주주 판정 시 자동 합산되어 지분율 가산. 2013.2.15. 이후 양도분에만 적용.
   * `totalIssuedShares` 와 함께 지분율 가산. 시가총액 합산은 사용자 책임.
   * @default 0
   */
  pefIndirectSharesCount?: number;

  /**
   * F-09/F-10/F-14/F-23 (2026-05-19) — 대주주 판정 기준일 override (합병·분할·신설법인 특수분기).
   *
   * 통상은 priorYearEndDate를 기준일로 사용하나, 다음 경우는 별도 일자 기준:
   *   - F-09 합병등기일 (피합병법인 주주 신주 교부 후 양도 — 2010 소령 157⑧)
   *   - F-10 분할등기일 (분할 전 법인 분할등기일 현재 보유 현황 기준)
   *   - F-14 분할신설법인 — 분할 전 분할법인 직전사업연도 종료일
   *   - F-23 설립등기일 (신설법인 직전사업연도 미존재 시 — 소령 157④)
   *
   * 값이 있으면 매트릭스 조회 시 이 일자 사용. 미지정 시 priorYearEndDate 사용.
   * 교재 §3장 이미지 50·51 Check Point ②③⑦⑯.
   */
  judgmentDateOverride?: Date;

  /**
   * F-09/F-10/F-14/F-23 (2026-05-19) — judgmentDateOverride 사유 분류 (UI 라벨링용).
   * 값이 있을 때만 의미. 결과 카드에 적용 사유 명시.
   */
  judgmentBasis?: "merger" | "split" | "split_new_entity" | "incorporation";

  // §94①4 — 기타자산 판정
  /** §94①4 다목 — 과점주주 */
  isQualifyingBlockShareholder: boolean;
  /** §94①4 라목 — 부동산과다보유법인 (80% + 골프장 등) */
  isHeavyRealEstateForRate: boolean;
  /** 시행령 §165⑤ 가중치 반전용 (별개 임계 50%) */
  isHeavyRealEstateForValuation: boolean;
  /**
   * §104①9호 판정용 — 해당 **법인의 자산총액 중 비사업용토지 가액이 차지하는 비율**.
   * **0~1 소수**다(형제 필드 `cumulativeTransferRatio`와 같은 단위 — UI는 %, API가 ×0.01).
   * 시행령 §167의7이 「**100분의 50 이상**」이면 §104①9호(기본세율 + 10%p)로 정한다.
   * 비사업용토지는 「**법인세법」 §55의2②** 기준이다(소득세법 §104의3이 아니다).
   *
   * **미입력(undefined) = 9호 미해당**(§104①1호 유지) — 법 근거 없이 불리하게 적용하지 않는다.
   * 임계 판정은 **엔진이 한다**(사용자가 「9호 해당」을 스스로 판단하지 않는다) — 계획서 §4 D-1.
   */
  nblRatioOfCorpAssets?: number;
  /**
   * §104⑤ **크로스 조정** — 같은 과세기간에 양도한 **부동산 §104①8호(비사업용 토지) 과세표준**(원).
   *
   * 본문 후단이 「제1항**제8호 및 제9호**의 자산은 **동일한 자산으로 보고**」라 정하므로,
   * 이 신고의 §104①9호분과 **한 버킷으로 합산**했을 때 늘어나는 세액을 안내하기 위해 받는다.
   * 부동산 결과 화면의 「§104①8호 버킷 과세표준」을 옮겨 적는다(두 엔진이 분리돼 자동 연동이
   * 불가능하다 — `realEstateGroupBasicDeductionUsed`와 같은 층위).
   *
   * ⚠️ **세액에 반영하지 않는다** — §104⑤은 전체 산출세액을 하나로 정하므로 조정액에 귀속이 없다.
   *   결과에 `cross1045Adjustment`로 echo해 **안내**로만 쓴다. 미입력이면 조정 미적용.
   */
  crossClause8TaxBase?: number;

  // 회사 분류
  isSmallMediumEnterprise: boolean;
  isMidsizeEnterprise: boolean;
  /** K-OTC·벤처 소액주주 */
  isListedSmallShareholder: boolean;
  /** 벤처기업 (조특법 §14①7호 K-OTC 비대주주 비과세) */
  isVentureCompany: boolean;
  /** K-OTC 거래 여부 */
  isKOTCTrading: boolean;

  /**
   * 거래소 장내 거래 여부 (소득세법 §94①3 가목 1) 단서).
   *
   * - true: KOSPI/KOSDAQ/KONEX 증권시장 장내 거래 — 비대주주 시 가목 1) 단서 비과세.
   * - false: 장외 거래(블록딜·대량매매·시간외·개인간 양도·증여성 양도 등) — 비대주주여도 과세.
   *
   * KOSPI/KOSDAQ/KONEX + 비대주주 + 非K-OTC 케이스에서만 의미 있음.
   * 대주주·비상장·K-OTC·기타자산 분기는 본 필드 무시.
   *
   * @default true (기존 동작 호환)
   */
  isOnMarketTransaction?: boolean;

  // 거래 일자·수량
  acquisitionDate: Date;
  transferDate: Date;
  shareCount: number;
  totalIssuedShares: number;

  /** 보유기간 기산점 분기 §104② */
  acquisitionCause: "purchase" | "inheritance" | "gift" | "merger_split";
  /** 상속: 피상속인 취득일 §104②1 */
  decedentAcquisitionDate?: Date;
  /** §97의2 적용 시 증여자 취득일 §104②2 (주식은 §97의2 미적용 → 일반 증여는 수증일 기산) */
  donorAcquisitionDate?: Date;
  /** 합병·분할: 종전 주식 취득일 §104②3 */
  preMergerAcquisitionDate?: Date;

  /** §94①4 다목 — 3년 누적 양도 비율 */
  cumulativeTransferRatio?: number;

  // 양도가액 모드
  transferPriceMode: "actual" | "exchange";
  /**
   * 실가 입력 방식 (transferPriceMode === "actual" 한정).
   * - "per_share" (default): 1주당 단가 × 주식수 (현행)
   * - "total": 양도가액 합계 직접 입력 (§96① 실지거래가액, 계약서 총액 케이스)
   */
  transferActualInputMode?: "per_share" | "total";
  /** 1주당 양도가액 (transferActualInputMode === "per_share" 또는 미지정 시 필수, 원) */
  perShareTransferPrice?: number;
  /** 양도가액 합계 직접 입력 (transferActualInputMode === "total" 시 필수, 원) */
  transferTotalPrice?: number;
  exchangePropertyValue?: number;
  exchangeDebtRelief?: number;
  exchangeCash?: number;

  // 취득가액 모드
  acquisitionMode: "actual" | "sale_case" | "estimated" | "face_value";

  // ── 매매사례가액 모드 (sale_case 강화 — 영§176의2③1호 비상장 한정) ──
  /** 취득 매매사례 1주당 가액 (원) — sale_case 모드 활성 시 perShareAcquisitionPrice 대신 우선 적용 가능 */
  acquisitionMarketSamplePrice?: number;
  acquisitionMarketSampleDate?: Date;
  acquisitionMarketSampleCounterparty?: string;
  /** 양도 매매사례 1주당 가액 (원) — transferPriceMode === "actual"에서 perShareTransferPrice 대신 우선 적용 */
  transferMarketSamplePrice?: number;
  transferMarketSampleDate?: Date;
  transferMarketSampleCounterparty?: string;

  // ── 자본조정 (무상증자·감자) — 법§17② 단서·집행기준 97-163-12 ──
  capitalAdjustments?: {
    type:
      | "bonus_capital_reserve"      // 자본준비금 무상증자 (양도세 — 단가 희석)
      | "bonus_retained_earnings"    // 이익잉여금 무상증자 (의제배당 — skip)
      | "reduction_proportional"     // 비례감자·결손보전 (양도세 — 단가 상승)
      | "reduction_capital_return";  // 자본환급 무상감자 (의제배당 — skip)
    eventDate: Date;
    ratio: number;
    notes?: string;
  }[];
  perShareAcquisitionPrice?: number;

  // 환산 모드 — 상장 (1개월 종가평균)
  /** 양도일 직전 1개월 종가평균 (1주당, 원) — 모법 §99①3, 시행령 §165③ 준용 (상증령 §52의2④ 거래일 분모) */
  transferDatePriceAvg1Month?: number;
  /**
   * 취득일 직전 1개월 종가평균 (1주당, 원) — 모법 §99①3, 시행령 §165③ 준용 분자.
   *
   * 환산취득가 산식: 환산취득가 = 양도가 × (취득시 기준시가 / 양도시 기준시가)
   * 개산공제 §163⑥4: estimatedBase = acquisitionDatePriceAvg1Month × shareCount
   *
   * 일반 상장(KOSPI/KOSDAQ/KONEX) + 환산 모드 + acquiredBeforeListing=false +
   * tradingHaltAtTransfer=false 경로에서만 사용. 신규 필드 — 기존 동작 보존을 위해 optional.
   */
  acquisitionDatePriceAvg1Month?: number;

  /**
   * 양도시 기준시가 입력 방식 (UI 메타 — 산식 영향 없음).
   * "direct": 사용자가 1주당 평균을 단일 숫자로 직접 입력 (기존 동작).
   * "daily": 양도일 직전 1개월 거래일별 종가를 일자별 입력 → UI mirror 패턴으로
   *          transferDatePriceAvg1Month 자동 산정.
   * @default "direct"
   */
  transferStdInputMode?: "direct" | "daily";
  listingDate?: Date;
  listingDatePriceAvg1Month?: number;
  /** 취득 후 상장 §165⑤ 단서 분기 */
  acquiredBeforeListing: boolean;
  /** 양도일 거래정지·관리종목 */
  tradingHaltAtTransfer: boolean;
  /**
   * [C-1] 취득일 거래정지·관리종목 (소령 §165③ 후문 "양도일ㆍ취득일 이전 1개월" — 취득 시점).
   * true 시 취득시 기준시가만 §165④ 보충 평가(취득연도 NI/NA), 양도시 기준시가는 1개월 종가평균 유지.
   * §165⑤ 비적용 판정(계산식이 상장일 기반 취득 후 상장 전제 — plan §1.2). optional — 기존 호출부 보존.
   */
  tradingHaltAtAcquisition?: boolean;

  // 환산 모드 — 비상장 보충적 평가 (3시점: 양도일·상장일·취득일 직전 사업연도)
  transferYearNetIncomePerShare?: number;
  transferYearNetAssetPerShare?: number;
  listingYearNetIncomePerShare?: number;
  listingYearNetAssetPerShare?: number;
  acquisitionYearNetIncomePerShare?: number;
  acquisitionYearNetAssetPerShare?: number;

  // 소칙 §81④ 1호 월할 가산 — 전전연도·월수 입력은 두 경로 공용:
  //   ① §165⑤ 후단 준용 (취득 후 상장, monthlyAccrualToggle·PostListingDetailInput 중첩)
  //   ② §165⑨ 본체 (비상장 환산 양도·취득 기준시가 동일, unlistedSameBizYearToggle 아래)
  /** 취득일이 속하는 사업연도의 전전사업연도 1주당 순손익가치 (전 모드 직접 입력) */
  prePriorYearNetIncomePerShare?: number;
  /** 전전사업연도 1주당 순자산가치 */
  prePriorYearNetAssetPerShare?: number;
  /** 직전사업연도의 월수 (1~12, 미입력 시 12 — 사업연도 변경 법인 대응) */
  priorBizYearMonths?: number;
  /**
   * [B-4 §165⑨ 본체] 비상장 환산에서 양도·취득 기준시가 동일 시 동일 사업연도 취득·양도(§81④ 1호) 토글.
   * true + 전전연도 입력 시 양도 당시 기준시가를 §81④ 월할 상승분으로 보정(취득→양도 보유월수).
   * PostListingDetailInput.monthlyAccrualToggle(준용·상장)과 별개 — weighted_avg 경로 전용. default false.
   */
  unlistedSameBizYearToggle?: boolean;

  /** 장부분실 §99①4 (face_value 모드 — 양/취 모두 액면가) */
  bookLost: boolean;
  faceValuePerShare?: number;

  /**
   * [사례 49] 취득시 장부분실 — 액면가만 사용 (§99①4 후단).
   *   `marketType === "unlisted" && acquisitionMode === "estimated"` 활성 조건.
   *   양도기준시가는 §165④ 보충 평가 정상 적용 (취득시점만 액면가).
   *   기존 `bookLost`(face_value 모드, 양/취 모두 액면가)와 독립.
   *   동시 활성은 validate에서 차단.
   */
  acqFaceValueOnly?: boolean;
  /** [사례 49] 1주당 액면가 (원) — acqFaceValueOnly === true 시 필수 */
  acqFaceValuePerShare?: number;

  /**
   * 순자산 단독 평가 사유 (시행령 §165④3)
   * 가: 청산 진행·사업자 사망
   * 나: 사업개시 전·1년 미만·휴폐업
   * 다: 주식가액 80% 이상 (지주회사형)
   * 라: 정관상 잔여 존속기한 3년 이내
   */
  netAssetOnlyReason?:
    | "liquidation_or_owner_death"
    | "no_business_or_short_or_closed"
    | "stock_holding_company"
    | "remaining_term_under_3y";

  // 필요경비
  expenseMode: "actual" | "estimated";
  actualExpenses?: number;

  // 신고
  filingType: "preliminary" | "final" | "revised";
  filingDate: Date;
  isElectronicFiling: boolean;
  /**
   * 신고 위반 여부 (가산세 게이트) — default "none"
   * - "none"        : 정상 신고 (가산세 0)
   * - "under_report": 과소신고 (§47의2②2 10%, 부정행위 동반 시 40%/60%)
   * - "non_report"  : 무신고 (§47의2①1 20%, 부정행위 동반 시 40%/60%)
   */
  filingViolation: "none" | "under_report" | "non_report";
  isFraudulent: boolean;
  isInternationalTransaction: boolean;

  /** §103② — §94② 발동 시 같은 해 부동산 그룹에서 이미 사용한 기본공제 */
  realEstateGroupBasicDeductionUsed: number;

  // ── 분할 매수·분할 양도 (선택) — split 모드 활성 시 사용 ──
  // 미입력 시 단건 모드로 호환 (acquisitionDate·shareCount·perShareAcquisitionPrice 단일 필드 사용)
  /** 분할 매수 lot 배열 */
  acquisitionLots?: AcquisitionLot[];
  /** 분할 매도 lot 배열 */
  transferLots?: TransferLot[];
  /** 취득가 산정방법 — split 모드 필수 (specific=개별법, fifo=선입선출법, moving_avg=총평균법) */
  costAllocationMethod?: "specific" | "fifo" | "moving_avg";
  /** 개별법(specific) 모드 사용자 명시 매칭 */
  specificMatchings?: SpecificMatching[];

  /**
   * 취득 후 상장 환산 상세 입력 (§165⑤ PDF 사례 48 완전 재현).
   * unlistedDetailMode === "full" 또는 "listing_only" 시 사용.
   * "simple" 모드는 기존 4 필드(listingYearNet*PerShare 등) 사용.
   *
   * Phase A KoreanLaw 검증 2026-05-18 — Round 4 C-02·C-03 반영.
   */
  postListingDetail?: PostListingDetailInput;

  /**
   * [부담부증여 전용] §159 개산공제 base 안분 비율 — B(채무인수액) / C(증여가액).
   *
   * 적용 대상: acquisitionMode === "estimated" && marketType === "unlisted" 경로.
   * 비상장 §165④ 보충평가로 산출된 estimatedBase(acquisitionStdPriceTotal, 개산공제 §163⑥4 base)에만 곱함.
   *
   * 이중 안분 금지 — acquisitionPrice(totalAcquisitionPrice)는 양도가(transferPrice=채무B) 기반
   * 환산이라 transferPrice=B 주입 시 자동으로 B/C 안분됨. 여기에 또 비율을 곱하면 이중 안분.
   *
   * actual 모드: 클라이언트가 취득가를 B/C 안분 후 perShareAcquisitionPrice로 직접 주입 → 미사용.
   * 상장 estimated 모드: transferPrice=B 기반 환산 자동 → 미사용.
   *
   * 범위: 0 < burdenedGiftDebtRatio <= 1.
   * @default undefined — 일반 주식 양도(기존 동작 100% 보존)
   */
  burdenedGiftDebtRatio?: number;
};

// ============================================================
// 취득 후 상장 환산 상세 입력 (PDF 사례 48 3개 다이얼로그)
// ============================================================

/** PDF 사례 48 — 3개 다이얼로그 재현용 nested 입력 */
export type PostListingDetailInput = {
  /** 모드: simple = 기존 4 필드만, listing_only = 상장연도 상세, full = 80필드 모두 */
  unlistedDetailMode: "simple" | "listing_only" | "full";

  /** 상장일 이후 1개월 종가 (소령 §165⑤ — Phase A 결론) */
  closing?: {
    /** YYYY-MM-DD. 최대 32 슬롯, 가변 길이 */
    dates: string[];
    /** 원. 휴일·주말은 빈 문자열 또는 0 */
    closes: number[];
    /** 평가기준일 YYYY-MM-DD (자동 = 상장일 또는 상장일 + 1일) */
    basisDate: string;
    /** [B-5] 평가기간 중 증자·합병 발생 여부 (상증령 §52의2②2호 기간 절단 — 환산주식수 아님) */
    hasIncrease: boolean;
    /** [B-5] 증자·합병 발생일 YYYY-MM-DD — hasIncrease=true 시 필수. 이 날짜 이전 종가만 평균(발생일·이후 제외) */
    increaseDate?: string;
  };

  /** 순손익 계산서 — PDF 24행 (16 데이터행 × 2열 + 보조 4) */
  netIncome?: {
    listing: NIYear;
    acquisition: NIYear;
  };

  /** 순자산가액 계산서 — PDF 20행 (18 데이터행 × 2열 + 보조 2) */
  netAsset?: {
    listing: NAYear;
    acquisition: NAYear;
  };

  /** §81④ 월할 가산 수동 토글 (default false). 동일 사업연도 케이스. */
  monthlyAccrualToggle: boolean;
};

/**
 * 순손익 계산서 1열 (상장연도 또는 취득연도) — PDF 24행 정밀화.
 *
 * (A) 행 1~4: 가산항목 (소득금액·과오납 환급금 이자·수익배당금 입금불산입·기부금 한도초과)
 * (B) 행 5~16: 차감항목 (벌금·손금불산입 공과금·업무무관 지출 등 12행)
 * 행 17 = A − B = 순손익액
 * 행 20 = 사업연도말 주식 또는 환산주식수
 * 행 21 = 1주당 순손익액 (17÷20)
 * 행 23 = 환원율 (default 10% — 시행규칙 §81② → 상증령 §17)
 * 행 24 = 1주당 가액 (21÷23)
 */
export type NIYear = {
  /** 행 1~4 (가산항목 4개) */
  addA: number[];
  /** 행 5~16 (차감항목 12개) */
  subB: number[];
  /** 행 20: 사업연도말 주식 또는 환산주식수 (주, 정수) */
  shareCount: number;
  /** 행 23: 환원율 (decimal — 0.10 = 10%) */
  discountRate: number;
};

/**
 * 순자산가액 계산서 1열 (상장연도 또는 취득연도) — PDF 20행 정밀화 (Round 4 C-01).
 *
 * 행 1 = 재무상태표상 자산가액 (자산총계)
 * 행 2~5 = 자산 가산 4행 (평가차액·법인세 유보·유상증자·기타)
 * 행 6·7 = 자산 차감 2행 (선급비용·증자일전잉여금)
 * 행 가 = 자산총계 ((1+2+3+4+5)−(6+7))
 * 행 8 = 재무상태표상 부채액
 * 행 9~14 = 부채 가산 6행 (법인세·농특세·지방소득세·배당금·퇴직급여·기타)
 * 행 15~17 = 부채 차감 3행 (제준비금·제충당금·외화환산대)
 * 행 나 = 부채총계 ((8+9+...+14)−(15+16+17))
 * 행 18 = 영업권포함전순자산가액 (가 − 나)
 * 행 19 = 영업권
 * 행 20 = 순자산가액 (18 + 19)
 */
export type NAYear = {
  /** 행 1: 재무상태표상 자산가액 */
  assetTotalRow1: number;
  /** 행 2~5: 자산 가산 4개 */
  assetAdd: number[];
  /** 행 6·7: 자산 차감 2개 */
  assetSub: number[];
  /** 행 8: 재무상태표상 부채액 */
  liabTotalRow8: number;
  /** 행 9~14: 부채 가산 6개 */
  liabAdd: number[];
  /** 행 15~17: 부채 차감 3개 */
  liabSub: number[];
  /** 행 19: 영업권 (optional, default 0) */
  goodwillRow19: number;
  /** 사업연도말 발행주식총수 (보통 NIYear.shareCount와 동일, 분할·증자 시 분리) */
  shareCount: number;
};

// ============================================================
// 분할 lot 타입 (소득세법 §104② lot별 §163⑨ 평가가액)
// ============================================================

export interface AcquisitionLot {
  /** UI key 용 UUID — 엔진은 사용 안 함 (specificMatchings 참조용) */
  id?: string;
  /** lot 자체 취득일 (gift는 수증일) */
  acquisitionDate: Date;
  shareCount: number;
  /** 1주당 단가 (원). 상속/증여 lot도 §163⑨ 평가가액을 직접 입력 */
  perShareAcquisitionPrice: number;
  /** lot별 취득원인 — §104② 보유기간 기산점 분기 */
  acquisitionCause: "purchase" | "inheritance" | "gift" | "merger_split";
  /** 상속 lot: 피상속인 취득일 (§104②1) */
  decedentAcquisitionDate?: Date;
  /** 합병·분할 lot: 종전 주식 취득일 (§104②3) */
  preMergerAcquisitionDate?: Date;
  // donorAcquisitionDate 제외 — 주식은 §97의2 미적용 (helpers.ts:54-58)
}

export interface TransferLot {
  id?: string;
  transferDate: Date;
  shareCount: number;
  perShareTransferPrice: number;
}

export interface SpecificMatching {
  /** TransferLot.id 참조 */
  transferLotId: string;
  /** AcquisitionLot.id 참조 */
  acquisitionLotId: string;
  /** 이 매칭에서 차감하는 주식수 */
  shareCount: number;
}

// ============================================================
// 분할 lot 결과 타입 (lotMatchingDetail echo)
// ============================================================

export interface MatchedSubLot {
  saleDate: Date;
  saleShares: number;
  perShareSalePrice: number;
  /** §104② lot별 기산점 적용된 일자 (purchase=취득일, inheritance=피상속인취득일, gift=수증일, merger_split=종전주식취득일) */
  acquisitionDate: Date;
  buyShares: number;
  perShareBuyPrice: number;
  holdingDays: number;
  /** < 365일 */
  isShortTerm: boolean;
  /** (saleP - buyP) × matchedShares (음수 가능 — 양도손실) */
  perLotGain: number;
  /** sub-lot별 적용 세율 (단기 0.30 / 누진 / 단일 등) */
  appliedRate: number;
  /** sub-lot별 산출세액 (절사 전, 비대주주 분기에서는 0 — 합산 단일 세율) */
  subLotTax: number;
}

export interface LotMatchingDetail {
  method: "specific" | "fifo" | "moving_avg";
  matched: MatchedSubLot[];
  totalTransferPrice: number;
  totalAcquisitionPrice: number;
  /** 음수 가능 (양도손실) */
  totalGain: number;
  /** 단기 sub-lot 차익 합 (대주주+비SME 게이트 충족 시만 의미 있음) */
  shortTermGain: number;
  /** 장기 sub-lot 차익 합 */
  longTermGain: number;
  /** [B-3] moving_avg 이동평균 단가 — 마지막 매도 적용 단가(echo). 매도별 단가는 matched[].perShareBuyPrice */
  weightedAvgPerShare?: number;
  warnings: string[];
}

// ============================================================
// Result
// ============================================================

export type StockTransferResult = {
  /** §94 분류 결과 (8차 정정 — 비과세·비대주주 케이스 enum 보강) */
  taxCategory:
    | "listed_major"
    | "listed_non_major_in_market"
    | "listed_otc_non_major"
    | "listed_off_market_non_major"
    | "unlisted_major"
    | "unlisted_non_major"
    | "kotc_sme_mid_exempt"
    | "kotc_venture_exempt"
    | "other_asset_block_shareholder"
    | "other_asset_heavy_re"
    /**
     * §104①**9호** — 비사업용 토지 과다소유법인 주식(시행령 §167의7). 분류는 다목·라목
     * 그대로이고 **세율만** 기본세율 + 10%p라 **둘 다**에 얹히므로 2종이다.
     * 플래그가 아니라 카테고리로 둔 이유는 `stock-transfer-rate-calc.ts` 분기 주석 참조.
     */
    | "other_asset_block_shareholder_nbl"
    | "other_asset_heavy_re_nbl"
    | "out_of_scope_foreign"
    | "foreign_stock"
    | "exit_tax";

  appliedSection94:
    | "①3가1)"
    | "①3가2)"
    | "①3나_본문"
    | "①3나_단서"
    | "①4다"
    | "①4라";

  section94_2Applied: boolean;
  isExempt: boolean;
  exemptReason?: "kotc_sme_mid" | "kotc_venture" | "non_major_in_market";

  // 양도가액
  transferPrice: number;
  transferPriceBreakdown?: { property: number; debt: number; cash: number };

  // 취득가액
  acquisitionPrice: number;
  acquisitionMode: StockTransferInput["acquisitionMode"];
  usedEstimatedAcquisition: boolean;
  /** 환산 base (취득기준시가) */
  estimatedBase?: number;
  /** 개산공제 (취득기준시가 × 1%) */
  estimatedDeduction?: number;

  /** [B-2] §97②2호 단서 swap 발동 여부 — (환산취득가+개산공제) < (자본적지출+양도비) 시 후자를 필요경비로 */
  swapApplied?: boolean;
  /** [B-2] §97②2호 단서 비교 echo (환산 모드 + actualExpenses 입력 시만 — 비교 비발동이면 undefined) */
  swapComparison?: {
    /** 가목 = 환산취득가 + 개산공제 (§97②2호 단서 가목) */
    estimatedSide: number;
    /** 나목 = 자본적지출 + 양도비 합계 (actualExpenses 입력) */
    directSide: number;
    chosen: "estimated" | "direct";
  };

  // 평가 detail
  valuationDetail?: {
    method:
      | "actual_acquisition"
      | "weighted_avg"
      | "net_asset_only"
      | "face_value"
      | "acq_face_value_only"
      | "post_listing_conversion"
      | "monthly_avg_listed"
      | "halt_acquisition_conversion";
    weightedAvgPerShare?: number;
    netAssetFloorApplied: boolean;
    netAssetFloorValue?: number;
    finalPerShareValue: number;
    /** §163⑨ 환산 진단 — 분자(취득시 1주당 기준시가) */
    conversionAcqStdPerShare?: number;
    /** §163⑨ 환산 진단 — 분모(양도시 1주당 기준시가, fallback 시 1주당 양도가) */
    conversionTransferStd?: number;
    /** §163⑨ 환산 진단 — true면 transferDatePriceAvg1Month 미입력으로 1주당 양도가 fallback 사용 */
    conversionUsedFallback?: boolean;
    /** daily 모드 사용 여부 (input.transferStdInputMode echo) */
    transferDailyModeUsed?: boolean;
    /** daily 모드 자동 산정 평균 (= input.transferDatePriceAvg1Month, UI mirror된 값) */
    transferDailyAverage?: number;

    // ── [사례 49 GAP-D] FormulaCard 입력값 직접 노출 (역산 회피) ──
    /** [사례 49] 1주당 액면가 (input.acqFaceValuePerShare echo) */
    acqFaceValuePerShare?: number;
    /** [사례 49] 1주당 순손익가치 (양도연도 echo) · [C-1] 취득연도 echo 겸용 */
    niPerShare?: number;
    /** [사례 49] 1주당 순자산가치 (양도연도 echo) · [C-1] 취득연도 echo 겸용 */
    naPerShare?: number;
    /** [사례 49] 부동산과다보유 가중치 반전 (input.isHeavyRealEstateForValuation echo) */
    isHeavyRE?: boolean;
    /** [사례 49] 순자산 단독 사유 (input.netAssetOnlyReason echo) */
    netAssetOnlyReason?: string;
    /** [사례 49] 취득기준시가 총액 (acqFaceValuePerShare × shareCount) · [C-1] 보충평가 × shareCount 겸용 */
    acquisitionStdPriceTotal?: number;
    /**
     * [B-4 §165⑨ 본체] 양도·취득 기준시가 동일 → §81④ 1호 월할로 양도기준시가 보정 발동 시 echo.
     * 미발동(M-1·M-3·M-6) 시 undefined.
     */
    section1659Detail?: {
      /** 동일 기준시가 (= 보정 전 양도기준시가 = 취득기준시가) */
      prior: number;
      /** 전전 사업연도 평가 */
      prePrior: number;
      /** 보유월수 (취득→양도, 절상) */
      holdingMonths: number;
      /** 직전 사업연도 월수 */
      priorBizYearMonths: number;
      /** 보정된 양도기준시가 (= 환산 분모) */
      adjusted: number;
    };
  };

  // 매매사례가액 detail (R-1' — sale_case 강화)
  marketSampleDetail?: {
    acquisitionApplied: boolean;
    transferApplied: boolean;
    acquisitionPerShare?: number;
    transferPerShare?: number;
    /** 취득 사례 거래일 vs 취득일 차이 (일) */
    acquisitionDeltaDays?: number;
    /** 양도 사례 거래일 vs 양도일 차이 (일) */
    transferDeltaDays?: number;
    /** ±3개월 초과 warning 발동 여부 */
    acquisitionOverThreeMonths: boolean;
    transferOverThreeMonths: boolean;
    warnings: string[];
  };

  // 자본조정 detail (R-2)
  capitalAdjustmentsDetail?: {
    baseShareCount: number;
    adjustedShareCount: number;
    baseTotalCost: number;
    adjustedPerShareCost: number;
    applied: {
      type:
        | "bonus_capital_reserve"
        | "bonus_retained_earnings"
        | "reduction_proportional"
        | "reduction_capital_return";
      eventDate: Date;
      ratio: number;
      beforeShares: number;
      afterShares: number;
      skipped: boolean;
      reason?: string;
    }[];
    warnings: string[];
  };

  // [A-2] 분할 모드 lot별 자본조정 detail (단일 모드 capitalAdjustmentsDetail과 별개)
  lotCapitalAdjustmentsDetail?: {
    lotId?: string;
    beforeShares: number;
    afterShares: number;
    baseTotalCost: number;
    adjustedPerShareCost: number;
    appliedTypes: (
      | "bonus_capital_reserve"
      | "bonus_retained_earnings"
      | "reduction_proportional"
      | "reduction_capital_return"
    )[];
    skippedReasons: string[];
  }[];

  // 기본공제 그룹
  basicDeductionGroup: "real_estate_and_other_asset" | "stock";
  /**
   * §104⑤ 본문 후단(8호·9호 동일 자산 의제) **조정액 echo** — `crossClause8TaxBase`가 입력되고
   * 이 종목이 §104①9호일 때만 만들어진다. **세액에는 반영되지 않는다**(귀속이 없다).
   */
  cross1045Adjustment?: Cross1045Adjustment;

  // 필요경비
  expenses: number;
  expenseMode: "actual" | "estimated";

  // 소득금액·과세표준
  transferIncome: number;
  basicDeduction: number;
  taxBase: number;

  // 세율·세액
  appliedRate: number;
  progressiveDeduction?: number;
  calculatedTax: number;

  // 가산세·공제
  underReportPenalty: number;
  latePaymentPenalty: number;
  electronicFilingCredit: number;

  // 최종
  finalTax: number;
  /** 지방소득세 — 10원 미만 절사 (국고금 관리법 §47③ 준용) */
  localIncomeTax: number;

  // 보유기간
  holdingPeriodMonths: number;
  holdingPeriodDays: number;
  isShortTermHolding: boolean;

  // 부동산 엔진 호환
  lthdStartDate: null;

  /**
   * §157/§167의8 대주주 판정에 적용된 임계 echo
   * - 상장 3시장(kospi/kosdaq/konex): §157 임계
   * - 비상장(unlisted): §167의8①2호 임계 (F-5 확장)
   * - 기타자산(other_asset)은 undefined (§94①4 별도 트랙)
   * - buildExemptResult(비과세 조기 반환) 경로에도 동일하게 전파됨
   */
  appliedThreshold?: {
    shareRatio: number;
    marketCap: number;
    marketType: "kospi" | "kosdaq" | "konex" | "unlisted";
    /** 직전 사업연도 종료일 (ISO YYYY-MM-DD) */
    priorYearEndDate: string;
    /** 해당 임계 적용 시작일 (ISO YYYY-MM-DD) */
    fromDate: string;
    /**
     * 비상장 벤처기업 임계 적용 여부 (Phase B 신설, 2026-05-19).
     * `marketType === "unlisted" && isVentureCompany === true` 시 true → 시총 임계 40억 적용.
     * UI 결과 카드에서 violet "비상장 벤처기업 임계 적용" 배지 분기에 사용.
     */
    isVentureRule?: boolean;
    /**
     * 적용 규칙 출처 (Phase B 신설, 2026-05-19).
     * - "§157": 상장 (kospi/kosdaq/konex)
     * - "§167의8①2호": 비상장 일반
     * - "§167의8①2호_벤처": 비상장 벤처기업
     */
    ruleSource?: "§157" | "§167의8①2호" | "§167의8①2호_벤처";
    /**
     * F-15·F-16 (2026-05-19) — 대차주식·사모펀드 간접소유 자동 가산 적용 여부.
     * `transferDate >= 2013-02-15 && (lentSharesCount > 0 || pefIndirectSharesCount > 0)` 시 true.
     * UI 결과 카드에서 "대차주식·사모펀드 자동 가산 적용" 안내 분기.
     */
    shareAugmentationApplied?: boolean;
    /**
     * F-15·F-16 (2026-05-19) — 자동 가산된 주식수 (lentSharesCount + pefIndirectSharesCount).
     * 사용자 검증용 echo. shareAugmentationApplied === true 일 때만 의미 있음.
     */
    augmentedShares?: number;
    /**
     * F-09/F-10/F-14/F-23 (2026-05-19) — judgmentDateOverride 적용 사유 echo.
     * 값이 있으면 priorYearEndDate 대신 judgmentDateOverride 일자가 매트릭스 조회에 사용됨.
     * UI 결과 카드에 "합병등기일 기준" 등 분기 라벨 표시.
     */
    judgmentBasis?: "default" | "merger" | "split" | "split_new_entity" | "incorporation";
    /**
     * F-24 (2026-05-19) — 본인 미보유 시 자동 강제 합산 적용 여부.
     * `selfShareRatio === 0 && selfMarketCap === 0 && (combinedShareRatio > 0 || combinedMarketCap > 0)`
     * 시 `isLargestShareholderGroup` 토글 OFF여도 자동 합산 판정 강제 (기획재정부 금융세제-327, 2020.12.10.).
     * UI 결과 카드에 "본인 미보유 → 특수관계인 합산 강제" 안내 분기.
     */
    forcedCombinedJudgment?: boolean;
  };

  // 디버그·경고
  warnings: string[];
  appliedRules: Array<
    | "§94②우선"
    | "80%하한"
    | "80%하한미적용"
    | "단기30%"
    | "거래정지우회"
    | "취득일거래정지우회"
    | "§97②단서swap"
    | "KOTC중소중견비과세"
    | "KOTC벤처비과세"
    | "월할가산"
    | "의제취득일적용"
    | "장부분실액면가"
    | "기타자산우선§55누진"
    | "기본공제부동산그룹합산"
    | "로트개별법"
    | "로트선입선출"
    | "로트이동평균"
    | "F15F16대차사모펀드자동가산"
    | "판정기준일특수분기"
    | "본인미보유강제합산"
  >;

  /**
   * 분할 매수·분할 양도 echo (split 모드 활성 시).
   * single 모드는 undefined.
   * 비과세 분기에서도 검산용으로 echo (산출세액 0이지만 lot별 차익은 표시).
   */
  lotMatchingDetail?: LotMatchingDetail;

  /**
   * Round 4 C-02 echo — 취득 후 상장 환산 활성 여부.
   * UI 결과 카드 PostListingDetailCard 노출 게이트.
   * Input.acquiredBeforeListing 그대로 echo.
   */
  acquiredBeforeListing: boolean;

  /**
   * Round 4 C-04 — 취득 후 상장 환산 상세 결과 (모드별 활성).
   * unlistedDetailMode 별 채움 조건:
   *   - "simple": detail = { mode, floor80NotApplied } 만
   *   - "listing_only": closing + netIncome.listing + netAsset.listing 채움
   *   - "full": 전체 채움
   */
  postListingDetail?: PostListingValuationResult;

  /**
   * 증권거래세 정보성 산출 echo (Phase 1 — 2경로 통합).
   * 양도세와 별도 납부 의무이므로 합산 금지 (정보성 표시 전용).
   * plain object (JSON-safe — memory feedback_engine_result_map_json_loss, Map 금지).
   *
   * 표시 게이트 (UI): stx && (stx.totalTax > 0 || stx.warning)
   *   - C-06 기타자산: totalTax=0이지만 warning 있음 → 표시
   *   - transferPrice=0: totalTax=0·warning 없음 → 미표시
   */
  securitiesTransactionTax?: import("../securities-transaction-tax").SecuritiesTransactionTaxResult;
};

// PostListingValuationResult는 파일 상단에서 import + re-export (sibling 분리).
