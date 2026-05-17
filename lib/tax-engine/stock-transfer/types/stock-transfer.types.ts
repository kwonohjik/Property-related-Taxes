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
  perShareTransferPrice?: number;
  exchangePropertyValue?: number;
  exchangeDebtRelief?: number;
  exchangeCash?: number;

  // 취득가액 모드
  acquisitionMode: "actual" | "sale_case" | "appraisal" | "estimated" | "face_value";
  perShareAcquisitionPrice?: number;

  // 환산 모드 — 상장 (1개월 종가평균)
  transferDatePriceAvg1Month?: number;
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
};
