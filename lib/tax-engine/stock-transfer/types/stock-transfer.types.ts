/**
 * 주식 양도소득세 — Input·Result 타입 정의
 *
 * 소득세법 2026.4.21. 시행 기준
 * PR-1 범위: 상장 대주주 + 취득 후 상장 + 비과세 + §94② + 거래정지 + 임계 이력 + 단기 기산점
 * PR-2: 비상장 보충 평가 (stock-valuation.ts placeholder)
 */

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

  // §94①4 — 기타자산 판정
  /** §94①4 다목 — 과점주주 */
  isQualifyingBlockShareholder: boolean;
  /** §94①4 라목 — 부동산과다보유법인 (80% + 골프장 등) */
  isHeavyRealEstateForRate: boolean;
  /** 시행령 §165⑤ 가중치 반전용 (별개 임계 50%) */
  isHeavyRealEstateForValuation: boolean;

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
  acquisitionMode: "actual" | "sale_case" | "appraisal" | "estimated" | "face_value";
  perShareAcquisitionPrice?: number;

  // 환산 모드 — 상장 (1개월 종가평균)
  /** 양도일 직전 1개월 종가평균 (1주당, 원) — 모법 §99①3, 시행령 §163⑨ 분모 */
  transferDatePriceAvg1Month?: number;
  /**
   * 취득일 직전 1개월 종가평균 (1주당, 원) — 시행령 §163⑨ 분자.
   *
   * 환산취득가 산식: 환산취득가 = 양도가 × (취득시 기준시가 / 양도시 기준시가)
   * 개산공제 §163⑥4: estimatedBase = acquisitionDatePriceAvg1Month × shareCount
   *
   * 일반 상장(KOSPI/KOSDAQ/KONEX) + 환산 모드 + acquiredBeforeListing=false +
   * tradingHaltAtTransfer=false 경로에서만 사용. 신규 필드 — 기존 동작 보존을 위해 optional.
   */
  acquisitionDatePriceAvg1Month?: number;
  listingDate?: Date;
  listingDatePriceAvg1Month?: number;
  /** 취득 후 상장 §165⑤ 단서 분기 */
  acquiredBeforeListing: boolean;
  /** 양도일 거래정지·관리종목 */
  tradingHaltAtTransfer: boolean;

  // 환산 모드 — 비상장 보충적 평가 (3시점: 양도일·상장일·취득일 직전 사업연도)
  transferYearNetIncomePerShare?: number;
  transferYearNetAssetPerShare?: number;
  listingYearNetIncomePerShare?: number;
  listingYearNetAssetPerShare?: number;
  acquisitionYearNetIncomePerShare?: number;
  acquisitionYearNetAssetPerShare?: number;

  /** 장부분실 §99①4 */
  bookLost: boolean;
  faceValuePerShare?: number;

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
    /** 증자·합병 여부 (default false, 환산주식수 후속 PR 신호) */
    hasIncrease: boolean;
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
  /** moving_avg 가중평균 단가 (해당 모드만) */
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
    | "out_of_scope_foreign";

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

  // 평가 detail
  valuationDetail?: {
    method:
      | "actual_acquisition"
      | "weighted_avg"
      | "net_asset_only"
      | "face_value"
      | "post_listing_conversion"
      | "monthly_avg_listed";
    weightedAvgPerShare?: number;
    netAssetFloorApplied: boolean;
    netAssetFloorValue?: number;
    finalPerShareValue: number;
  };

  // 기본공제 그룹
  basicDeductionGroup: "real_estate_and_other_asset" | "stock";

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
  };

  // 디버그·경고
  warnings: string[];
  appliedRules: Array<
    | "§94②우선"
    | "80%하한"
    | "80%하한미적용"
    | "단기30%"
    | "거래정지우회"
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
};

// ============================================================
// 취득 후 상장 환산 결과 (UI 결과 카드 PostListingDetailCard용)
// ============================================================

export type PostListingValuationResult = {
  /** 상장연도 직전 사업연도 1주당 비상장 평가액 (가중평균) */
  listingYearPerShareValue: number;
  /** 취득연도 직전 사업연도 1주당 비상장 평가액 (가중평균) */
  acquisitionYearPerShareValue: number;
  /** 환산비율 = 취득연도 평가 / 상장연도 평가 */
  conversionRatio: number;
  /** 1주당 취득기준시가 = floor(상장일 1개월 종가평균 × 환산비율) */
  finalPerShareValue: number;
  /** 총 환산취득가 = 1주당 × 주식수 */
  totalAcquisitionPrice: number;
  /** 월할 가산 적용 여부 (시행규칙 §81④) */
  monthlyAccrualApplied: boolean;
  appliedRules: string[];
  warnings: string[];

  /** Round 4 H-04 — full/listing_only 모드의 상세 산출 echo */
  detail?: {
    /** 종가 1개월 평균 계산 결과 (full 모드 또는 listing_only 모드) */
    closing?: {
      tradingDays: number;
      sum: number;
      avg: number;
    };
    /** 순손익 계산서 산출 결과 (full = 양 연도, listing_only = 상장연도만) */
    netIncome?: {
      listing: { netIncomeAmount: number; perShareIncome: number; perShareValue: number };
      acquisition?: { netIncomeAmount: number; perShareIncome: number; perShareValue: number };
    };
    /** 순자산 계산서 산출 결과 (full = 양 연도, listing_only = 상장연도만) */
    netAsset?: {
      listing: { netAssetAmount: number; perShareAsset: number };
      acquisition?: { netAssetAmount: number; perShareAsset: number };
    };
    /** 사용된 모드 (디버깅·결과 카드 배지용) */
    mode: "simple" | "listing_only" | "full";
    /** 80% 하한 비적용 명시 — 환산비율 단계 (회귀 보호용 echo) */
    floor80NotApplied: true;
  };
};
