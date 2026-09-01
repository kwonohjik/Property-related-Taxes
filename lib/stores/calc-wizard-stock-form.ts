/**
 * 주식 양도소득세 — 폼 데이터 타입 + 초기값 팩토리
 *
 * [800줄 정책 분할] `calc-wizard-stock-store.ts`에서 추출.
 * 기존 import 경로는 store의 re-export로 **100% 보존**된다(import 무변경).
 *
 * 3중 패턴 적용 필드 (feedback_store_default_vs_ui_display_fallback):
 *   factory default = normalize 빈문자 처리 = UI 명시값 (display fallback 단독 금지)
 */

import type {
  ExitTaxHoldingForm,
  CapitalAdjustmentForm,
  AcquisitionLotForm,
  TransferLotForm,
  SpecificMatchingForm,
} from "./calc-wizard-stock-types";

// ============================================================
// 폼 상태 타입 (① 동기화 지점)
// 모든 통화 필드는 문자열 (CurrencyInput 호환)
// 모든 날짜 필드는 문자열 "YYYY-MM-DD" (DateInput 호환)
// boolean 필드는 boolean
// ============================================================

export interface StockTransferFormData {
  // ── 종목 메타데이터 (엔진 미전달 — 저장·이력·신고서 표시용) ──
  securityName: string;           // 종목명 (필수 — 빈문자 = 검증 오류)
  securityCode: string;           // 종목코드 (선택) — 키움 자동조회 트리거로 재활용
  brokerage: string;              // 증권사 (선택)
  accountNumberMasked: string;    // 계좌번호 마스킹 (선택)
  // 키움 자동조회 메타 (UI/이력 표시 전용 — F-12 출처 라벨링)
  kiwoomTradingHalt: boolean;
  kiwoomLastFetchedAt: string;    // 가격/시총 fetch
  securityMetaFetchedAt: string;  // 종목코드 메타 fetch

  // ── 시장·회사 분류 ──
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted" | "other_asset" | "foreign_stock" | "exit_tax" | "";

  // ── 대주주 판정 (시행령 §157) 2-step ──
  isMajorShareholder: boolean;
  selfShareRatio: string;       // % 단위 (예: "3" = 3%) — MajorShareholderBlock에서 * 0.01 정규화
  selfMarketCap: string;        // 원 정수 문자열
  isLargestShareholderGroup: boolean;
  combinedShareRatio: string;   // % 단위 (예: "3" = 3%)
  combinedMarketCap: string;    // 원 정수 문자열
  priorYearEndDate: string;     // "YYYY-MM-DD"

  // ── 지분율 입력 모드 (UI 보조 — 엔진 미전달) ──
  // direct: % 직접 입력 / shares: 보유 주식수 ÷ totalIssuedShares × 100 자동 산출
  selfShareRatioMode: "direct" | "shares";
  selfOwnedShares: string;          // 본인 단독 보유 주식수 (분자, shares 모드)
  combinedShareRatioMode: "direct" | "shares";
  combinedOwnedShares: string;      // 본인+특수관계인 합산 보유 주식수 (분자, shares 모드)

  // ── §94①4 기타자산 ──
  isQualifyingBlockShareholder: boolean;
  isHeavyRealEstateForRate: boolean;
  isHeavyRealEstateForValuation: boolean;

  // ── 회사 분류 ──
  isSmallMediumEnterprise: boolean;
  isMidsizeEnterprise: boolean;
  isListedSmallShareholder: boolean;
  isVentureCompany: boolean;     // 3중 패턴 default: false
  isKOTCTrading: boolean;        // 3중 패턴 default: false
  // F-15·F-16 (default "0"), F-09/F-10/F-14/F-23 판정 기준일 override (2026-05-19)
  lentSharesCount: string;
  pefIndirectSharesCount: string;
  judgmentDateOverride: string;
  judgmentBasis: "default" | "merger" | "split" | "split_new_entity" | "incorporation";
  /**
   * 거래소 장내 거래 여부 (§94①3 가목 1) 단서).
   * KOSPI/KOSDAQ/KONEX 비대주주 + 非K-OTC 시 비과세 판정의 명시 입력.
   * 3중 패턴 default: true (기존 동작 유지).
   */
  isOnMarketTransaction: boolean;

  // ── 거래 일자·수량 ──
  acquisitionDate: string;       // "YYYY-MM-DD"
  transferDate: string;          // "YYYY-MM-DD"
  shareCount: string;            // 정수 문자열
  totalIssuedShares: string;     // 정수 문자열

  // ── 보유기간 기산점 §104② ──
  /**
   * 3중 패턴 default: "purchase".
   * `carryover_gift` = 배우자·직계존비속 증여로 **§97의2①이 적용되는** 주식(2025.1.1.~ 증여분).
   * 단순 증여(`gift`)와 갈라 두어야 §104②2호 통산 여부를 사용자가 선언할 수 있다.
   */
  acquisitionCause: "purchase" | "inheritance" | "gift" | "carryover_gift" | "merger_split";
  decedentAcquisitionDate: string;     // 상속: 피상속인 취득일
  donorAcquisitionDate: string;        // 이월과세(carryover_gift): 증여자 취득일 §104②2

  // ── §97의2① 이월과세 **본체(필요경비)** — `carryover_gift` 전용 ──
  /** ① 본문 관계 요건 — 배우자 사별·직계존비속 양도당시 사망이면 §97의2① 미해당 */
  donorRelation: "spouse" | "lineal" | "other" | "";
  /** ① 본문 관계 요건 — 증여자 사망 사실 */
  donorDeceased: boolean;
  /** ①1호 가목 — 증여자 취득 당시 1주당 실지거래가액 */
  donorAcquisitionPrice: string;
  /** ①1호 나목 — 증여자 취득 당시 1주당 기준시가 (실가를 확인할 수 없어 환산하는 경우) */
  donorAcquisitionStdPrice: string;
  /** ①2호 — 증여자가 지출한 자본적지출액 총액 (⚠️ 양도비 §97①3호는 제외) */
  donorCapitalExpenditure: string;
  /** ①3호 × 영 §163의2②1호 — 증여세 산출세액 */
  giftTaxAmount: string;
  /** 영 §163의2②2호 — 양도한 해당 자산가액 (안분 분자) */
  transferredAssetValue: string;
  /** 영 §163의2②3호 — 상증법 §47 증여세 과세가액 (안분 분모) */
  giftTaxableValue: string;

  preMergerAcquisitionDate: string;    // 합병·분할

  // ── §94①4 다목 누적 ──
  cumulativeTransferRatio: string;   // % 단위 "30" = 30% (API에서 ×0.01 → 엔진 decimal)
  /** §104①9호 — 법인 자산총액 중 비사업용토지 가액 비율. % 단위 "50" (API에서 ×0.01 → 엔진 decimal) */
  nblRatioOfCorpAssets: string;

  // ── 양도가액 ──
  transferPriceMode: "actual" | "exchange";  // 3중 패턴 default: "actual"
  transferActualInputMode: "per_share" | "total";  // 3중 패턴 default: "total" (실가 입력 방식 — 합계 직접 입력)
  transferTotalPrice: string;        // 원 — total 모드 시 양도가액 합계 직접 입력
  perShareTransferPrice: string;     // 원
  exchangePropertyValue: string;     // 교환: 부동산 가액
  exchangeDebtRelief: string;        // 교환: 채무면제액
  exchangeCash: string;              // 교환: 현금

  // ── 취득가액 ──
  acquisitionMode: "actual" | "sale_case" | "estimated" | "face_value";  // 3중 패턴 default: "actual" (appraisal 제거 — §176의2③2호 단서 주식 적용 불가)

  // ── R-1' 매매사례가액 (영§176의2③1호) — sale_case 모드 확장 (2026-05-19) ──
  acquisitionMarketSamplePrice: string;       // 원
  acquisitionMarketSampleDate: string;         // "YYYY-MM-DD"
  acquisitionMarketSampleCounterparty: string;
  transferMarketSamplePrice: string;
  transferMarketSampleDate: string;
  transferMarketSampleCounterparty: string;

  // ── R-2 자본조정 (법§17② 단서 + 집행기준 97-163-12) — 2026-05-19 ──
  capitalAdjustments: CapitalAdjustmentForm[];
  acquisitionActualInputMode: "per_share" | "lots";  // 3중 패턴 default: "per_share" — 실가 입력 방식 (lots-only 모드)
  perShareAcquisitionPrice: string;  // 실가 취득가

  // ── 환산 — 상장 (1개월 종가평균) ──
  transferDatePriceAvg1Month: string;    // 양도일 직전 1개월 평균 (원) — §163⑨ 분모
  acquisitionDatePriceAvg1Month: string; // 취득일 직전 1개월 평균 (원) — §163⑨ 분자
  /**
   * 양도시 기준시가 입력 방식 — direct(단일 숫자 직접 입력) | daily(일자별 종가 입력).
   * 3중 패턴 default: "direct" (기존 동작 보존).
   */
  transferStdInputMode: "direct" | "daily";
  /** daily 모드 — 양도일 직전 1개월 일자 배열 (UTC, 28~31일 가변) */
  transferPriceDates: string[];
  /** daily 모드 — 거래일별 종가 입력 (주말·공휴일은 빈 문자) */
  transferPriceClosing: string[];
  listingDate: string;                    // 상장일 "YYYY-MM-DD"
  listingDatePriceAvg1Month: string;     // 상장일 직전 1개월 평균 (원)
  acquiredBeforeListing: boolean;        // 3중 패턴 default: false
  tradingHaltAtTransfer: boolean;        // 3중 패턴 default: false
  tradingHaltAtAcquisition: boolean;     // [C-1] 3중 패턴 default: false

  // ── 환산 — 비상장 보충적 평가 (3시점) ──
  transferYearNetIncomePerShare: string;
  transferYearNetAssetPerShare: string;
  listingYearNetIncomePerShare: string;
  listingYearNetAssetPerShare: string;
  acquisitionYearNetIncomePerShare: string;
  acquisitionYearNetAssetPerShare: string;
  // ── 간이 모드 «순액 입력» (§165④1 원천값에서 1주당 가치 자동 산정) ──
  // 위 4필드는 «결과값»이다. 아래는 그 결과값을 만들어내는 원천값으로,
  // simpleValueInputMode === "amounts" 일 때만 입력받아 위 4필드로 mirror한다.
  // ⚠️ 주식수는 «한 연도에 1개»다 — 순손익·순자산이 공유한다(§165④4호).
  //    완전재현 모드(NIYear·NAYear)는 각자 shareCount를 갖는다 — 두 모드가 이 점에서 다르다.
  simpleValueInputMode: "direct" | "amounts";   // 3중 패턴 default: "direct"
  listingYearNetIncomeAmount: string;
  listingYearShareCount: string;
  listingYearNetAssetAmount: string;            // 영업권 «포함 전»
  listingYearGoodwill: string;                  // 해당 시 (빈칸 = 0)
  acquisitionYearNetIncomeAmount: string;
  acquisitionYearShareCount: string;
  acquisitionYearNetAssetAmount: string;        // 영업권 «포함 전»
  acquisitionYearGoodwill: string;              // 해당 시 (빈칸 = 0)
  // 소칙 §81④ 1호 월할 가산 (전전사업연도 평가 + 직전사업연도 월수) — 본체·준용 공용
  prePriorYearNetIncomePerShare: string;
  prePriorYearNetAssetPerShare: string;
  priorBizYearMonths: string;
  // [B-4 §165⑨ 본체] 비상장 환산 양도·취득 기준시가 동일 동일사업연도 토글 (3중 패턴 default: false)
  unlistedSameBizYearToggle: boolean;

  // ── 장부분실 §99①4 ──
  bookLost: boolean;                     // 3중 패턴 default: false
  faceValuePerShare: string;             // 원

  // ── 순자산 단독 평가 사유 §165④3 ──
  netAssetOnlyReason: "liquidation_or_owner_death" | "no_business_or_short_or_closed" | "stock_holding_company" | "remaining_term_under_3y" | "";

  // ── 필요경비 ──
  expenseMode: "actual" | "estimated";
  actualExpenses: string;               // 원

  // ── 신고 ──
  filingType: "preliminary" | "final" | "revised";  // 3중 패턴 default: "preliminary"
  filingDate: string;                    // "YYYY-MM-DD"
  isElectronicFiling: boolean;           // 3중 패턴 default: false
  filingViolation: "none" | "under_report" | "non_report";  // 3중 패턴 default: "none" — 가산세 게이트
  isFraudulent: boolean;                 // 3중 패턴 default: false
  isInternationalTransaction: boolean;   // 3중 패턴 default: false

  // ── 가산세 상세 (선택) — 국세기본법 §47조의3①「과소신고납부세액등」·§47조의4 ──
  /** 당초 신고한 납부세액 — 과소신고 가산세 base 에서 차감. 3중 패턴 default: "0" */
  originalFiledTax: string;
  /** 기납부세액(예정신고 납부분) — base 에서 차감. 3중 패턴 default: "0" */
  priorPaidTax: string;
  /** 이자상당가산액 — §47조의3① 괄호로 base 에서 제외. 3중 패턴 default: "0" */
  interestSurcharge: string;
  /** 부정행위로 인한 과소신고납부세액등 — §47조의3①1호 가목 base. 빈값 = 전액 부정 */
  fraudulentPortion: string;
  /** 미납·과소납부세액 — 납부지연가산세 base. 3중 패턴 default: "0" */
  unpaidTax: string;
  /** 법정납부기한 "YYYY-MM-DD" — 미입력이면 납부지연가산세를 계산하지 않는다 */
  paymentDeadline: string;
  /** 실제 납부일 "YYYY-MM-DD" — 미입력 시 오늘 기준 */
  actualPaymentDate: string;

  // ── §103② 기본공제 그룹 ──
  realEstateGroupBasicDeductionUsed: string;  // 3중 패턴 default: "0"
  /** §104⑤ 크로스 조정 — 같은 과세기간 부동산 §104①8호(비사업용 토지) 과세표준. 원 단위. 미입력이면 조정 미적용 */
  crossClause8TaxBase: string;

  // ── 분할 매수·분할 양도 (Plan v2.2) ──
  lotsMode: "single" | "split";                          // 3중 패턴 default: "single"
  costAllocationMethod: "specific" | "fifo" | "moving_avg"; // 3중 패턴 default: "fifo"
  acquisitionLots: AcquisitionLotForm[];                 // 3중 패턴 default: []
  transferLots: TransferLotForm[];                       // 3중 패턴 default: []
  specificMatchings: SpecificMatchingForm[];             // 3중 패턴 default: []

  // ── 취득 후 상장 환산 PDF 사례 재현 (Phase D~G — 80 신규 필드) ──
  // [[feedback_ui_input_path_enumeration]] — simple/listing_only/full 3 분기 enumerate
  unlistedDetailMode: "simple" | "listing_only" | "full"; // 3중 패턴 default: "simple"
  monthlyAccrualToggle: boolean;                          // §81④ — 3중 패턴 default: false

  // 상장일 이후 1개월 종가 (4필드, 단일 array 32 슬롯)
  listingPriceDates: string[];                            // YYYY-MM-DD × 32
  listingPriceClosing: string[];                          // 원 (CurrencyInput parse 값 string) × 32
  listingPriceBasisDate: string;                          // 평가기준일 (자동 = 상장일)
  listingPriceHasIncrease: boolean;                       // [B-5] 증자·합병 발생 (default false)
  listingPriceIncreaseDate: string;                       // [B-5] 증자·합병 발생일 (§52의2②2호 절단)

  // 순손익 — 상장연도 (18 필드, PDF 행 1~16 + 보조 2)
  niAddRow1Listing: string; niAddRow2Listing: string; niAddRow3Listing: string; niAddRow4Listing: string;
  niSubRow5Listing: string; niSubRow6Listing: string; niSubRow7Listing: string; niSubRow8Listing: string;
  niSubRow9Listing: string; niSubRow10Listing: string; niSubRow11Listing: string; niSubRow12Listing: string;
  niSubRow13Listing: string; niSubRow14Listing: string; niSubRow15Listing: string; niSubRow16Listing: string;
  niShareCountListing: string;                            // 행 20: 사업연도말 주식수
  niDiscountRateListing: string;                          // 행 23: 환원율 (% — default "10")

  // 순손익 — 취득연도 (18 필드)
  niAddRow1Acq: string; niAddRow2Acq: string; niAddRow3Acq: string; niAddRow4Acq: string;
  niSubRow5Acq: string; niSubRow6Acq: string; niSubRow7Acq: string; niSubRow8Acq: string;
  niSubRow9Acq: string; niSubRow10Acq: string; niSubRow11Acq: string; niSubRow12Acq: string;
  niSubRow13Acq: string; niSubRow14Acq: string; niSubRow15Acq: string; niSubRow16Acq: string;
  niShareCountAcq: string;
  niDiscountRateAcq: string;

  // 순자산 — 상장연도 (19 필드, PDF 행 1·2~5·6~7·8·9~14·15~17·19 + 보조 1)
  naAssetTotalRow1Listing: string;
  naAssetAddRow2Listing: string; naAssetAddRow3Listing: string; naAssetAddRow4Listing: string; naAssetAddRow5Listing: string;
  naAssetSubRow6Listing: string; naAssetSubRow7Listing: string;
  naLiabTotalRow8Listing: string;
  naLiabAddRow9Listing: string; naLiabAddRow10Listing: string; naLiabAddRow11Listing: string;
  naLiabAddRow12Listing: string; naLiabAddRow13Listing: string; naLiabAddRow14Listing: string;
  naLiabSubRow15Listing: string; naLiabSubRow16Listing: string; naLiabSubRow17Listing: string;
  naGoodwillRow19Listing: string;
  naShareCountListing: string;

  // 순자산 — 취득연도 (19 필드)
  naAssetTotalRow1Acq: string;
  naAssetAddRow2Acq: string; naAssetAddRow3Acq: string; naAssetAddRow4Acq: string; naAssetAddRow5Acq: string;
  naAssetSubRow6Acq: string; naAssetSubRow7Acq: string;
  naLiabTotalRow8Acq: string;
  naLiabAddRow9Acq: string; naLiabAddRow10Acq: string; naLiabAddRow11Acq: string;
  naLiabAddRow12Acq: string; naLiabAddRow13Acq: string; naLiabAddRow14Acq: string;
  naLiabSubRow15Acq: string; naLiabSubRow16Acq: string; naLiabSubRow17Acq: string;
  naGoodwillRow19Acq: string;
  naShareCountAcq: string;

  // ── PR-4B 국외전출세 전용 필드 (§118의9~§118의16) ──
  // 활성 조건: marketType === "exit_tax" (StockTransferFormData에 통합, 별도 store 미분리)
  /** 출국일 전 10년 중 국내 주소·거소 합계 거주 연수 (만 년 수) — 5년 이상 납세의무 */
  etYearsResidentLast10: string;
  /** 출국일 "YYYY-MM-DD" */
  etDepartureDate: string;
  /** 직전 연도말 대주주 여부 (§178의8 → §167의8 준용) */
  etIsMajorShareholder: boolean;
  /** 보유 종목 다건 (ExitTaxHoldingForm 배열) */
  etHoldings: ExitTaxHoldingForm[];
  /** 납부유예 신청 여부 (§118의16) */
  etDeferralRequested: boolean;
  /**
   * 납부유예 사유 (3중 패턴 default: "none")
   * "none"         → 납부유예 미신청
   * "study_abroad" → 국외유학 등 10년 유예 사유
   * "other_10yr"   → 기타 10년 사유
   */
  etDeferralReason: "none" | "study_abroad" | "other_10yr";
  /** 납부유예 후 실양도일 (경정청구 §118의12용) */
  etActualTransferDate: string;
  /** 납부유예 후 실양도 1주당 단가 (원) */
  etActualTransferPricePerShare: string;
  /** 외국납부세액 (원화 직접 입력, §118의13) */
  etForeignTaxPaid: string;
  /**
   * 외국납부세액 — **외화 금액**. 해외주식과 같은 축이다.
   * 외화·환율이 둘 다 있으면 엔진이 `외화 × 환율`(원 미만 절사)로 환산해 우선 적용한다.
   */
  etForeignTaxPaidForeign: string;
  /** 외국납부세액 통화 코드 (표시용). 3중 패턴 default: "USD" */
  etForeignTaxCurrencyCode: string;
  /** 납세일 기준환율 (원/외화) — 소득세법 시행령 §178의5 */
  etForeignTaxExchangeRate: string;
  /**
   * §118의13② 적용 배제 사유 (3중 패턴 default: "none")
   * "none"           → 배제 사유 없음 → 공제 적용
   * "credit_allowed" → 1호: 외국정부가 산출세액에 대해 세액공제 허용
   * "step_up"        → 2호: 외국정부가 취득가액을 출국일 시가로 조정
   */
  etForeignTaxExclusionReason: "none" | "credit_allowed" | "step_up";
  /** §118의14 비거주자 원천징수 세액 (원) */
  etDomesticSourceTaxWithheld: string;
  /** 보유현황 신고 완료 여부 (§118의15) */
  etHasFiledHoldingsReport: boolean;
  /** 보유현황 미신고 가산세 계산용 액면금액 합계 (원) */
  etTotalFaceValue: string;
  /** [B-1②b] 5년 이내 미양도 재입국 거주자 §118의17①1호 (환급/취소 정보성) */
  etReenteredWithin5Years: boolean;
  /** [B-1②a] 납부유예 이자상당액 — 유예 일수 (§178의12③) */
  etDeferralInterestDays: string;
  /** [B-1②a] 1일당 이자율 (소수, 국기령 §43의3② 연도별 변동 — 사용자 입력) */
  etDeferralInterestDailyRate: string;

  // ── PR-4A 해외주식 전용 필드 (§94①3 다목 · §118② 준용 트랙) ──
  // 활성 조건: marketType === "foreign_stock"
  /** 국내 주소·거소 거주 연수 (만 년 수) — 5년 이상 시 납세의무 충족 (§118의2) */
  yearsResidentInKorea: string;         // DecimalInput 소수 없이 정수 문자열 "7"
  /** §157의3①1호: 외국법인 발행 주식 여부 */
  isListedForeignCorp: boolean;         // 3중 패턴 default: true
  /** ISO 2자리 국가코드 (예: "US") */
  fgCountryCode: string;                // 3중 패턴 default: "US"
  /** 양도가액 입력 방식 (해외주식 전용) */
  fgTransferPriceMode: "per_share" | "total";  // 3중 패턴 default: "per_share"
  /** 1주당 외화 양도단가 (fgTransferPriceMode="per_share" 시) — DecimalInput */
  perShareTransferPriceForeign: string;
  /** 총 외화 양도가액 (fgTransferPriceMode="total" 시) — DecimalInput */
  totalTransferPriceForeign: string;
  /** 양도 통화코드 (ISO 4217, 예: "USD") */
  transferCurrencyCode: string;         // 3중 패턴 default: "USD"
  /** 양도일 기준환율 (원/외화, 소수점 2자리) — DecimalInput 4자리 */
  transferExchangeRate: string;         // 빈문자 → validate 차단
  /** 해외주식 취득가액 모드: 실가 | §178의3 시가 산정 */
  acquisitionModeFS: "actual" | "market_price";  // 3중 패턴 default: "actual"
  /** 1주당 외화 취득단가 (actual 모드) — DecimalInput */
  perShareAcquisitionPriceForeign: string;
  /** 취득 통화코드 (ISO 4217) */
  acquisitionCurrencyCode: string;      // 3중 패턴 default: "USD"
  /** 취득일 기준환율 (원/외화) — DecimalInput 4자리 */
  acquisitionExchangeRate: string;      // 빈문자 → validate 차단
  /** 자본적지출액 (외화) — DecimalInput */
  capitalExpenditureForeign: string;
  /** 양도비 (외화) — DecimalInput */
  transferCostForeign: string;
  /** 외국납부세액 유무 (§118의6) */
  hasForeignTax: boolean;               // 3중 패턴 default: false
  /** 외국납부세액 (외화) — DecimalInput */
  foreignTaxPaidForeign: string;
  /** 외국납부세액 통화코드 */
  foreignTaxCurrencyCode: string;       // 3중 패턴 default: "USD"
  /** 납세일 기준환율 — DecimalInput 4자리 */
  foreignTaxExchangeRate: string;
  /** §118의6 처리 방법: 세액공제 | 필요경비 산입 */
  foreignTaxMethod: "credit" | "expense";  // 3중 패턴 default: "credit"

  // ── FS-09 §178의5② 장기할부 분할 수령 ──
  /**
   * 양도가액 수령 방식 (§178의5②)
   * "single": 단일 양도일 기준환율 (기본값, 기존 동작 유지)
   * "installments": 장기할부 분할 수령 — 시점별 환율 적용
   * 3중 패턴 default: "single"
   */
  fsTransferReceiptMode: "single" | "installments";
  /**
   * §178의5② 분할 수령 배열
   * 각 행: { receiptDate: string; amountForeign: string; exchangeRate: string }
   * 3중 패턴 default: []
   */
  fsTransferInstallmentReceipts: Array<{
    /** 수령일 (YYYY-MM-DD) — DateInput */
    receiptDate: string;
    /** 수령액 (외화) — DecimalInput */
    amountForeign: string;
    /** 수령일 기준환율 (원/외화) — DecimalInput 4자리 */
    exchangeRate: string;
  }>;

  // ── [사례 49] 취득시 장부분실 액면가 + 양도시 보충적 평가 혼합 ──
  // 소득세법 §99①4 후단 + 시행령 §165④ + §163⑥4 (개산공제 1% 자동)
  /** 활성 조건: marketType==="unlisted" + acquisitionMode==="estimated" + true */
  acqFaceValueOnly: boolean;            // 3중 패턴 default: false
  /** 1주당 액면가 (원) — acqFaceValueOnly === true 시 필수 */
  acqFaceValuePerShare: string;         // 3중 패턴 default: ""

  // ── 비상장 §165④ 보충적 평가 — 행-수준 직접계산 모드 (74 신규 필드) ──
  // [stock-transfer-unlisted-direct-calc] §165④ EstimatedUnlistedBlock 확장
  // simple(현행 4 필드) vs full(행-수준 산출) 3중 패턴 default: "simple"
  unlistedValuationMode: "simple" | "full";

  // NI — 양도연도 (EUTransfer) 18 필드
  niAddRow1EUTransfer: string; niAddRow2EUTransfer: string; niAddRow3EUTransfer: string; niAddRow4EUTransfer: string;
  niSubRow5EUTransfer: string; niSubRow6EUTransfer: string; niSubRow7EUTransfer: string; niSubRow8EUTransfer: string;
  niSubRow9EUTransfer: string; niSubRow10EUTransfer: string; niSubRow11EUTransfer: string; niSubRow12EUTransfer: string;
  niSubRow13EUTransfer: string; niSubRow14EUTransfer: string; niSubRow15EUTransfer: string; niSubRow16EUTransfer: string;
  niShareCountEUTransfer: string;
  niDiscountRateEUTransfer: string;

  // NI — 취득연도 (EUAcq) 18 필드
  niAddRow1EUAcq: string; niAddRow2EUAcq: string; niAddRow3EUAcq: string; niAddRow4EUAcq: string;
  niSubRow5EUAcq: string; niSubRow6EUAcq: string; niSubRow7EUAcq: string; niSubRow8EUAcq: string;
  niSubRow9EUAcq: string; niSubRow10EUAcq: string; niSubRow11EUAcq: string; niSubRow12EUAcq: string;
  niSubRow13EUAcq: string; niSubRow14EUAcq: string; niSubRow15EUAcq: string; niSubRow16EUAcq: string;
  niShareCountEUAcq: string;
  niDiscountRateEUAcq: string;

  // NA — 양도연도 (EUTransfer) 19 필드
  naAssetTotalRow1EUTransfer: string;
  naAssetAddRow2EUTransfer: string; naAssetAddRow3EUTransfer: string; naAssetAddRow4EUTransfer: string; naAssetAddRow5EUTransfer: string;
  naAssetSubRow6EUTransfer: string; naAssetSubRow7EUTransfer: string;
  naLiabTotalRow8EUTransfer: string;
  naLiabAddRow9EUTransfer: string; naLiabAddRow10EUTransfer: string; naLiabAddRow11EUTransfer: string;
  naLiabAddRow12EUTransfer: string; naLiabAddRow13EUTransfer: string; naLiabAddRow14EUTransfer: string;
  naLiabSubRow15EUTransfer: string; naLiabSubRow16EUTransfer: string; naLiabSubRow17EUTransfer: string;
  naGoodwillRow19EUTransfer: string;
  naShareCountEUTransfer: string;

  // NA — 취득연도 (EUAcq) 19 필드
  naAssetTotalRow1EUAcq: string;
  naAssetAddRow2EUAcq: string; naAssetAddRow3EUAcq: string; naAssetAddRow4EUAcq: string; naAssetAddRow5EUAcq: string;
  naAssetSubRow6EUAcq: string; naAssetSubRow7EUAcq: string;
  naLiabTotalRow8EUAcq: string;
  naLiabAddRow9EUAcq: string; naLiabAddRow10EUAcq: string; naLiabAddRow11EUAcq: string;
  naLiabAddRow12EUAcq: string; naLiabAddRow13EUAcq: string; naLiabAddRow14EUAcq: string;
  naLiabSubRow15EUAcq: string; naLiabSubRow16EUAcq: string; naLiabSubRow17EUAcq: string;
  naGoodwillRow19EUAcq: string;
  naShareCountEUAcq: string;
}

// ============================================================
// 초기값 팩토리 (② 동기화 지점)
// 14필드 명시 default = 3중 패턴 source of truth
// ============================================================


export function createInitialStockFormData(): StockTransferFormData {
  return {
    securityName: "",
    securityCode: "",
    brokerage: "",
    accountNumberMasked: "",
    kiwoomTradingHalt: false,
    kiwoomLastFetchedAt: "",
    securityMetaFetchedAt: "",

    marketType: "",
    isMajorShareholder: false,
    selfShareRatio: "",
    selfMarketCap: "",
    isLargestShareholderGroup: false,    // 3중 패턴 default
    combinedShareRatio: "",
    combinedMarketCap: "",
    priorYearEndDate: "",

    selfShareRatioMode: "direct",        // 3중 패턴 default
    selfOwnedShares: "",
    combinedShareRatioMode: "direct",    // 3중 패턴 default
    combinedOwnedShares: "",

    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,

    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,             // 3중 패턴 default
    isKOTCTrading: false,                // 3중 패턴 default
    isOnMarketTransaction: true,         // 3중 패턴 default (§94①3 가목 1) 단서 — 기존 비과세 동작 보존)
    lentSharesCount: "0", pefIndirectSharesCount: "0",
    judgmentDateOverride: "", judgmentBasis: "default",

    acquisitionDate: "",
    transferDate: "",
    shareCount: "",
    totalIssuedShares: "",

    acquisitionCause: "purchase",        // 3중 패턴 default
    decedentAcquisitionDate: "",
    donorAcquisitionDate: "",
    donorRelation: "",
    donorDeceased: false,
    donorAcquisitionPrice: "",
    donorAcquisitionStdPrice: "",
    donorCapitalExpenditure: "",
    giftTaxAmount: "",
    transferredAssetValue: "",
    giftTaxableValue: "",
    preMergerAcquisitionDate: "",

    cumulativeTransferRatio: "",
    nblRatioOfCorpAssets: "",

    transferPriceMode: "actual",         // 3중 패턴 default
    transferActualInputMode: "total", // 3중 패턴 default
    transferTotalPrice: "",
    perShareTransferPrice: "",
    exchangePropertyValue: "",
    exchangeDebtRelief: "",
    exchangeCash: "",

    acquisitionMode: "actual",           // 3중 패턴 default
    acquisitionActualInputMode: "per_share", // 3중 패턴 default
    perShareAcquisitionPrice: "",
    // R-1' 매매사례가액
    acquisitionMarketSamplePrice: "",
    acquisitionMarketSampleDate: "",
    acquisitionMarketSampleCounterparty: "",
    transferMarketSamplePrice: "",
    transferMarketSampleDate: "",
    transferMarketSampleCounterparty: "",
    // R-2 자본조정
    capitalAdjustments: [],

    transferDatePriceAvg1Month: "",
    acquisitionDatePriceAvg1Month: "",
    transferStdInputMode: "direct",  // 3중 패턴 default — 기존 동작 보존
    transferPriceDates: [],
    transferPriceClosing: [],
    listingDate: "",
    listingDatePriceAvg1Month: "",
    acquiredBeforeListing: false,        // 3중 패턴 default
    tradingHaltAtTransfer: false,        // 3중 패턴 default
    tradingHaltAtAcquisition: false,     // [C-1] 3중 패턴 default

    transferYearNetIncomePerShare: "",
    transferYearNetAssetPerShare: "",
    listingYearNetIncomePerShare: "",
    listingYearNetAssetPerShare: "",
    acquisitionYearNetIncomePerShare: "",
    acquisitionYearNetAssetPerShare: "",
    simpleValueInputMode: "direct", // 3중 패턴 default — 기존 「결과값 직접 입력」 보존
    listingYearNetIncomeAmount: "",
    listingYearShareCount: "",
    listingYearNetAssetAmount: "",
    listingYearGoodwill: "",
    acquisitionYearNetIncomeAmount: "",
    acquisitionYearShareCount: "",
    acquisitionYearNetAssetAmount: "",
    acquisitionYearGoodwill: "",
    prePriorYearNetIncomePerShare: "",
    prePriorYearNetAssetPerShare: "",
    priorBizYearMonths: "12", // §81④ 직전사업연도 월수 default
    unlistedSameBizYearToggle: false, // [B-4 §165⑨ 본체] 3중 패턴 default

    bookLost: false,                     // 3중 패턴 default
    faceValuePerShare: "",

    netAssetOnlyReason: "",

    expenseMode: "actual",
    actualExpenses: "",

    filingType: "preliminary",           // 3중 패턴 default
    filingDate: "",
    isElectronicFiling: false,           // 3중 패턴 default
    filingViolation: "none",             // 3중 패턴 default — 가산세 게이트 OFF
    isFraudulent: false,                 // 3중 패턴 default
    isInternationalTransaction: false,   // 3중 패턴 default
    originalFiledTax: "0",               // 3중 패턴 default
    priorPaidTax: "0",                   // 3중 패턴 default
    interestSurcharge: "0",              // 3중 패턴 default
    fraudulentPortion: "",               // 빈값 = 전액 부정(종전 동작)
    unpaidTax: "0",                      // 3중 패턴 default
    paymentDeadline: "",
    actualPaymentDate: "",

    realEstateGroupBasicDeductionUsed: "0",  // 3중 패턴 default
    crossClause8TaxBase: "",

    lotsMode: "single",                      // 3중 패턴 default
    costAllocationMethod: "fifo",            // 3중 패턴 default
    acquisitionLots: [],
    transferLots: [],
    specificMatchings: [],

    // ── 취득 후 상장 환산 PDF 사례 재현 (Phase D~G — 80 신규 필드) ──
    unlistedDetailMode: "simple",            // 3중 패턴 default
    monthlyAccrualToggle: false,             // 3중 패턴 default
    listingPriceDates: [],
    listingPriceClosing: [],
    listingPriceBasisDate: "",
    listingPriceHasIncrease: false,
    listingPriceIncreaseDate: "",
    niAddRow1Listing: "", niAddRow2Listing: "", niAddRow3Listing: "", niAddRow4Listing: "",
    niSubRow5Listing: "", niSubRow6Listing: "", niSubRow7Listing: "", niSubRow8Listing: "",
    niSubRow9Listing: "", niSubRow10Listing: "", niSubRow11Listing: "", niSubRow12Listing: "",
    niSubRow13Listing: "", niSubRow14Listing: "", niSubRow15Listing: "", niSubRow16Listing: "",
    niShareCountListing: "",
    niDiscountRateListing: "10",             // 시행규칙 §81② → 상증령 §17 default 10%
    niAddRow1Acq: "", niAddRow2Acq: "", niAddRow3Acq: "", niAddRow4Acq: "",
    niSubRow5Acq: "", niSubRow6Acq: "", niSubRow7Acq: "", niSubRow8Acq: "",
    niSubRow9Acq: "", niSubRow10Acq: "", niSubRow11Acq: "", niSubRow12Acq: "",
    niSubRow13Acq: "", niSubRow14Acq: "", niSubRow15Acq: "", niSubRow16Acq: "",
    niShareCountAcq: "",
    niDiscountRateAcq: "10",
    naAssetTotalRow1Listing: "",
    naAssetAddRow2Listing: "", naAssetAddRow3Listing: "", naAssetAddRow4Listing: "", naAssetAddRow5Listing: "",
    naAssetSubRow6Listing: "", naAssetSubRow7Listing: "",
    naLiabTotalRow8Listing: "",
    naLiabAddRow9Listing: "", naLiabAddRow10Listing: "", naLiabAddRow11Listing: "",
    naLiabAddRow12Listing: "", naLiabAddRow13Listing: "", naLiabAddRow14Listing: "",
    naLiabSubRow15Listing: "", naLiabSubRow16Listing: "", naLiabSubRow17Listing: "",
    naGoodwillRow19Listing: "",
    naShareCountListing: "",
    naAssetTotalRow1Acq: "",
    naAssetAddRow2Acq: "", naAssetAddRow3Acq: "", naAssetAddRow4Acq: "", naAssetAddRow5Acq: "",
    naAssetSubRow6Acq: "", naAssetSubRow7Acq: "",
    naLiabTotalRow8Acq: "",
    naLiabAddRow9Acq: "", naLiabAddRow10Acq: "", naLiabAddRow11Acq: "",
    naLiabAddRow12Acq: "", naLiabAddRow13Acq: "", naLiabAddRow14Acq: "",
    naLiabSubRow15Acq: "", naLiabSubRow16Acq: "", naLiabSubRow17Acq: "",
    naGoodwillRow19Acq: "",
    naShareCountAcq: "",

    // ── PR-4B 국외전출세 전용 초기값 (② 동기화 지점) ──
    etYearsResidentLast10: "",
    etDepartureDate: "",
    etIsMajorShareholder: false,
    etHoldings: [],
    etDeferralRequested: false,
    etDeferralReason: "none",          // 3중 패턴 default
    etActualTransferDate: "",
    etActualTransferPricePerShare: "",
    etForeignTaxPaid: "",
    etForeignTaxPaidForeign: "",
    etForeignTaxCurrencyCode: "USD",     // 3중 패턴 default
    etForeignTaxExchangeRate: "",
    etForeignTaxExclusionReason: "none",  // 3중 패턴 default
    etDomesticSourceTaxWithheld: "",
    etHasFiledHoldingsReport: false,
    etTotalFaceValue: "",
    etReenteredWithin5Years: false,
    etDeferralInterestDays: "",
    etDeferralInterestDailyRate: "",

    // ── PR-4A 해외주식 전용 초기값 (② 동기화 지점) ──
    yearsResidentInKorea: "",
    isListedForeignCorp: true,           // 3중 패턴 default: 외국법인 발행 주식
    fgCountryCode: "US",                 // 3중 패턴 default: 미국
    fgTransferPriceMode: "per_share",    // 3중 패턴 default
    perShareTransferPriceForeign: "",
    totalTransferPriceForeign: "",
    transferCurrencyCode: "USD",         // 3중 패턴 default
    transferExchangeRate: "",
    acquisitionModeFS: "actual",         // 3중 패턴 default
    perShareAcquisitionPriceForeign: "",
    acquisitionCurrencyCode: "USD",      // 3중 패턴 default
    acquisitionExchangeRate: "",
    capitalExpenditureForeign: "",
    transferCostForeign: "",
    hasForeignTax: false,                // 3중 패턴 default
    foreignTaxPaidForeign: "",
    foreignTaxCurrencyCode: "USD",       // 3중 패턴 default
    foreignTaxExchangeRate: "",
    foreignTaxMethod: "credit",          // 3중 패턴 default

    // ── FS-09 §178의5② 장기할부 분할 수령 초기값 ──
    fsTransferReceiptMode: "single",     // 3중 패턴 default: 단일 수령
    fsTransferInstallmentReceipts: [],   // 3중 패턴 default: 빈 배열

    // ── [사례 49] 취득시 장부분실 액면가 + 양도시 보충적 평가 혼합 ──
    acqFaceValueOnly: false,
    acqFaceValuePerShare: "",

    // ── 비상장 §165④ 보충적 평가 — 행-수준 직접계산 모드 ──
    unlistedValuationMode: "simple",         // 3중 패턴 default
    niAddRow1EUTransfer: "", niAddRow2EUTransfer: "", niAddRow3EUTransfer: "", niAddRow4EUTransfer: "",
    niSubRow5EUTransfer: "", niSubRow6EUTransfer: "", niSubRow7EUTransfer: "", niSubRow8EUTransfer: "",
    niSubRow9EUTransfer: "", niSubRow10EUTransfer: "", niSubRow11EUTransfer: "", niSubRow12EUTransfer: "",
    niSubRow13EUTransfer: "", niSubRow14EUTransfer: "", niSubRow15EUTransfer: "", niSubRow16EUTransfer: "",
    niShareCountEUTransfer: "",
    niDiscountRateEUTransfer: "10",          // 시행규칙 §81② → 상증령 §17
    niAddRow1EUAcq: "", niAddRow2EUAcq: "", niAddRow3EUAcq: "", niAddRow4EUAcq: "",
    niSubRow5EUAcq: "", niSubRow6EUAcq: "", niSubRow7EUAcq: "", niSubRow8EUAcq: "",
    niSubRow9EUAcq: "", niSubRow10EUAcq: "", niSubRow11EUAcq: "", niSubRow12EUAcq: "",
    niSubRow13EUAcq: "", niSubRow14EUAcq: "", niSubRow15EUAcq: "", niSubRow16EUAcq: "",
    niShareCountEUAcq: "",
    niDiscountRateEUAcq: "10",
    naAssetTotalRow1EUTransfer: "",
    naAssetAddRow2EUTransfer: "", naAssetAddRow3EUTransfer: "", naAssetAddRow4EUTransfer: "", naAssetAddRow5EUTransfer: "",
    naAssetSubRow6EUTransfer: "", naAssetSubRow7EUTransfer: "",
    naLiabTotalRow8EUTransfer: "",
    naLiabAddRow9EUTransfer: "", naLiabAddRow10EUTransfer: "", naLiabAddRow11EUTransfer: "",
    naLiabAddRow12EUTransfer: "", naLiabAddRow13EUTransfer: "", naLiabAddRow14EUTransfer: "",
    naLiabSubRow15EUTransfer: "", naLiabSubRow16EUTransfer: "", naLiabSubRow17EUTransfer: "",
    naGoodwillRow19EUTransfer: "",
    naShareCountEUTransfer: "",
    naAssetTotalRow1EUAcq: "",
    naAssetAddRow2EUAcq: "", naAssetAddRow3EUAcq: "", naAssetAddRow4EUAcq: "", naAssetAddRow5EUAcq: "",
    naAssetSubRow6EUAcq: "", naAssetSubRow7EUAcq: "",
    naLiabTotalRow8EUAcq: "",
    naLiabAddRow9EUAcq: "", naLiabAddRow10EUAcq: "", naLiabAddRow11EUAcq: "",
    naLiabAddRow12EUAcq: "", naLiabAddRow13EUAcq: "", naLiabAddRow14EUAcq: "",
    naLiabSubRow15EUAcq: "", naLiabSubRow16EUAcq: "", naLiabSubRow17EUAcq: "",
    naGoodwillRow19EUAcq: "",
    naShareCountEUAcq: "",
  };
}
