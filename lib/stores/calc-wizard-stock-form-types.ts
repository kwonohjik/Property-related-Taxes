/**
 * 주식 양도소득세 — 폼 데이터 **타입 전용** 파일
 *
 * [800줄 정책 분할 2단계] `calc-wizard-stock-form.ts`가 795줄에 이르러 갈랐다(2026-09-11).
 * 1단계 분할은 `calc-wizard-stock-store.ts` → `-form.ts`였다(헤더 아래 주석 참조).
 *
 * 🔑 **이 파일이 leaf다.** `-form.ts`가 여기서 타입을 가져다 쓰고 소비처를 위해 재export한다.
 *    반대 방향으로 갈랐다면 「재export ↔ 타입 import」가 **순환**한다
 *    (memory `feedback_800line_split_playbook` — 순환은 재export 때문에 생긴다).
 *
 * ⚠️ **import 경로는 무변경이다** — 소비처 72파일은 계속 `calc-wizard-stock-form`에서
 *    가져온다. 신규 코드도 그 경로를 쓸 것(여기를 직접 import하지 말 것).
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

/**
 * 상장 환산 기준시가 산정 방식 — 배타적 4상태 (계획서 Q-2 3안).
 * 값 이름은 엔진 boolean과 1:1로 읽히도록 골랐다.
 */
export type AcquisitionStdMode =
  | "monthly_avg"
  | "halt_acquisition"
  | "post_listing"
  | "halt_transfer";

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
  /**
   * 취득시 기준시가 입력 방식 — direct(단일 숫자) | daily(일자별 종가). 분모 축의 거울.
   * 3중 패턴 default: "direct" (기존 동작 보존).
   *
   * ⚠️ 라디오가 `acquisitionStdMode === "monthly_avg"` 카드 **안에만** 있다 —
   *    다른 방식에서 daily가 남으면 되돌릴 UI가 없다(F-10 dead-end).
   *    ⇒ normalize가 `listingStdInputMode`와 같은 형태로 게이팅한다.
   */
  acquisitionStdInputMode: "direct" | "daily";
  /** daily 모드 — 취득일 이전 1개월 일자 배열 (UTC, 29~32일 가변) */
  acquisitionPriceDates: string[];
  /** daily 모드 — 거래일별 종가 입력 (주말·휴장일은 빈 문자) */
  acquisitionPriceClosing: string[];
  listingDate: string;                    // 상장일 "YYYY-MM-DD"
  /**
   * 상장일 **이후** 1개월 종가평균 (원) — 소령 §165⑤ 계산식 첫 항.
   * `listingStdInputMode === "direct"`일 때만 정본이다. daily에서는 종가 표에서 파생한다
   * (`resolveListingClosingAvg` — 저장 mirror 금지. 상장일만 바꿔도 stale이 되기 때문).
   */
  listingDatePriceAvg1Month: string;
  /**
   * 상장일 이후 1개월 종가 입력 방식 — direct(단일 숫자) | daily(일자별 종가 표).
   * 3중 패턴 default: "direct" (기존 동작 보존).
   * ⚠️ `unlistedDetailMode !== "simple"`(재무제표 모드)에서는 종가도 항상 일자별이라
   *    이 축이 의미를 갖지 않는다 — 라디오도 그때는 노출하지 않는다.
   */
  listingStdInputMode: "direct" | "daily";
  /**
   * 상장 환산의 «기준시가 산정 방식» — **배타적 4상태**.
   *
   * 종전에는 boolean 3개(`acquiredBeforeListing`·`tradingHaltAtTransfer`·
   * `tradingHaltAtAcquisition`)의 조합이었다. 조합 중 둘은 **법령상 양립 불가**라
   * ⑧·⑫가 런타임으로 막고 있었는데, 축을 하나로 합쳐 **표현 자체를 없앴다**
   * (계획서 Q-2 3안, `docs/00-pm/stock-listed-conversion-unification.plan.md`).
   *
   * 엔진 `StockTransferInput`은 **여전히 boolean 3개**를 받는다 — ④가 펼친다.
   * 엔진 if-체인(`stock-acquisition-basis.ts:128·165·257·303`)과 1:1이다:
   *
   *   post_listing     → acquiredBeforeListing     (§165⑤ 취득 후 상장)
   *   halt_transfer    → tradingHaltAtTransfer     (§165③ 양도일 정지 — **분모까지** 대체)
   *   halt_acquisition → tradingHaltAtAcquisition  (§165③ 취득일 정지 — 분자만)
   *   monthly_avg      → 셋 다 false               (일반 §176의2②1호)
   */
  acquisitionStdMode: AcquisitionStdMode;

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

  // ── §103① 기본공제 그룹 ──
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
  unlistedDetailMode: "simple" | "listing_only" | "full"; // 3중 패턴 default: "full" (부재값 해석은 "simple")
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

  /**
   * 계산서 열 헤더의 «사업연도» — 이미지 7 원본 화면의 `2008` / `2003`.
   *
   * 🔑 **표시 전용이다.** 평가 산식에 쓰이지 않고 엔진·API를 거치지 않는다
   *    (결과 화면에 계산서가 재현되지 않음 — 계획서 §3.2 실측).
   *    ⇒ 동기화 지점은 ①폼타입 ②initial ③normalize ⑤UI **4곳뿐**이다.
   *
   * 🔑 **순손익·순자산이 «한 벌»을 공유한다** — 「상장연도 직전 사업연도」는 두 계산서가
   *    같은 연도다. ni/na로 쪼개면 두 화면이 조용히 갈라진다. 계획서 §5.1.
   */
  fiscalYearListing: string;
  fiscalYearAcq: string;

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

  /** 비상장 §165④ 계산서 열 헤더의 사업연도 — 표시 전용(위 `fiscalYearListing` 주석 참조) */
  fiscalYearEUTransfer: string;
  fiscalYearEUAcq: string;

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
