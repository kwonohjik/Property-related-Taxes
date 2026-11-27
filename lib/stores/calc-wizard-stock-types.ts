/**
 * 주식 양도소득세 폼 - 서브 객체 타입 + 빈 행 팩토리.
 *
 * `calc-wizard-stock-store.ts`에서 분리 (800줄 정책).
 * StockTransferFormData 본체는 store에 유지.
 */

import { nanoid } from "nanoid";

// ============================================================
// PR-4B 국외전출세 — 보유 종목 폼 타입 (ExitTaxHoldingForm)
// ============================================================

export interface ExitTaxHoldingForm {
  /** UI key (nanoid) */
  id: string;
  /** 종목명 */
  stockName: string;
  /**
   * 시장 분류 (§178의9: 보유 종목은 국내 상장·비상장 주식).
   * `"foreign_stock"`(§94①3다목 국외주식등)은 **출국일 2027.1.1. 이후**일 때만 입력 버튼이 열린다 —
   * 출국일이 바뀌어 era 밖이 된 뒤에도 행은 지우지 않는다(입력한 종목이다). 엔진이 제외·고지한다.
   */
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted" | "foreign_stock";
  /** 보유 주식수 (정수 문자열) */
  shareCount: string;
  /** 취득일 "YYYY-MM-DD" */
  acquisitionDate: string;
  /** 1주당 취득가액 (원) 문자열 */
  perShareAcquisitionPrice: string;
  /**
   * 출국일 시가 산정 모드 (§178의9)
   * "market_price"    → 출국일 거래가액 직접 입력
   * "prior_year_std"  → §99①3 기준시가 (1개월 종가평균)
   * "unlisted_sample" → 전후 각 3개월 매매사례가액
   * "unlisted_std"    → §99①4 비상장 기준시가
   * "foreign_market_price" → (국외주식) 출국일 외화 거래가액 1주당 × 출국일 기준환율
   * "foreign_decree_178_3" → (국외주식) 시행령 §178의3 시가 1주당(외화, 직접 입력) × 출국일 기준환율
   */
  departureDayValuationMode:
    | "market_price"
    | "prior_year_std"
    | "unlisted_sample"
    | "unlisted_std"
    | "foreign_market_price"
    | "foreign_decree_178_3";
  /** 출국일 거래가액 1주당 (market_price 모드) */
  departureDayMarketPrice: string;
  /** §99①3 1개월 종가평균 1주당 (prior_year_std 모드) */
  priorYearEndMonthAvg: string;
  /** 전후 각 3개월 매매사례가액 1주당 (unlisted_sample 모드) */
  unlistedSamplePrice: string;
  /** §99①4 비상장 기준시가 1주당 (unlisted_std 모드) */
  unlistedStdPricePerShare: string;

  // ── 국외주식(`marketType === "foreign_stock"`) 전용 — 소득세법 §94①3다목 · 시행령 §157의3 ──
  // 외화 금액은 **전용 필드**로만 받는다 — 원화 칸(위 `departureDayMarketPrice` 등)을 «국외면 외화로 읽기»로
  // 재사용하지 않는다(시장 전환 시 stale 값이 다른 단위로 해석되는 것을 막는다, 계획 D-4).
  /** §157의3 분류 — true(3중 패턴 default) = 1호 외국법인 발행 / false = 2호 내국법인 발행 해외상장. 해외주식 트랙과 같은 이름·의미 */
  isListedForeignCorp: boolean;
  /** 중소기업 여부 (§118의11 2호가목 10%) — `isListedForeignCorp`가 true면 무시(④가 false로 보낸다) */
  isSmallMediumEnterprise: boolean;
  /** ISO 2자리 국가코드 (표시용 — 계산 무영향). 3중 패턴 default "US" */
  countryCode: string;
  /** 통화 코드 (표시용 — 계산 무영향). 3중 패턴 default "USD" */
  foreignCurrencyCode: string;
  /** 출국일 시가 1주당 외화 금액 (외화 시가 모드) */
  departureDayPriceForeign: string;
  /** 출국일 기준환율 (원/외화, 소수 4자리까지) */
  departureExchangeRate: string;
  /** 취득가액 1주당 외화 금액 */
  perShareAcquisitionPriceForeign: string;
  /** 취득일 기준환율 (원/외화, 소수 4자리까지) */
  acquisitionExchangeRate: string;

  // ── 보유현황 신고서(별지 제104호서식) 표시 전용 — **엔진 미전달** ──
  //
  // §118의15 보유현황 신고서는 세액 계산에 쓰이지 않는 칸을 요구한다. `securityName` 이
  // 「엔진 미전달 — 저장·이력·신고서 표시용」인 것과 같은 층위다.

  /** ⑩ 주식등 종목코드 또는 사업자등록번호 (해외주식은 ISIN코드와 국가명) */
  stockCodeOrBizNumber?: string;
  /** ⑫ 액면총액 산정용 — 1주당 액면가 (원) */
  faceValuePerShare?: string;
  /** ⑬ 보유 지분율 (%) */
  ownershipRatio?: string;

  // ── 종목별 실제 양도 (경정청구 §118의12~§118의14 · PR-7b) ──
  /**
   * 이 종목을 **실제 양도했는가**. `null` = 양도하지 않음(토글 OFF — 값이 없다). 객체 = 토글 ON.
   * 토글을 끄면 객체 전체를 버린다(숨은 값 금지, #3707과 같은 원칙). 3중 패턴 default `null`.
   * ④는 **종목별 입력 모드**일 때만 싣는다(`previewExitTaxActualMode`) — 모드가 다르면 보내지 않고 ⑧이 막는다.
   */
  actualTransfer: ExitTaxHoldingActualForm | null;
}

/**
 * 종목별 실제 양도 입력 (PR-7b) — 필드명은 엔진 `ExitTaxHoldingActualTransfer`와 같다(검증 오류 경로 `holdings.<id>.actualTransfer.<key>` ↔ 입력칸 앵커).
 * 양도가는 종목 종류로 갈린다: 국내 종목 = 원화 `pricePerShare`, 국외주식 = 외화 `priceForeign` + 실제 양도일 기준환율 `exchangeRate`.
 * 반대 쪽 칸은 화면에 없고 ④가 싣지 않는다(시장을 바꿔도 이전 시장의 값이 엔진에 가지 않는다).
 */
export interface ExitTaxHoldingActualForm {
  /** 실제 양도 주식 수 (1 이상, 보유 주식 수 이하의 정수) */
  shareCount: string;
  /** 실제 양도일 "YYYY-MM-DD" (선택 — 출국일 이전이면 엔진이 거부) */
  transferDate: string;
  /** 국내 종목 — 1주당 실제 양도가 (원) */
  pricePerShare: string;
  /** 국외주식 — 1주당 실제 양도가 (외화) */
  priceForeign: string;
  /** 국외주식 — 실제 양도일 기준환율 (원/외화) */
  exchangeRate: string;
  /**
   * 이 종목의 외국납부세액 입력 방식 — 원화·외화+환율은 **한쪽만**(엔진이 동시 입력을 거부한다).
   * "none" = 외국납부세액 없음 · "krw" = 원화 · "foreign" = 외화 + 납세일 기준환율. 3중 패턴 default "none".
   */
  foreignTaxInput: "none" | "krw" | "foreign";
  foreignTaxPaid: string;
  foreignTaxPaidForeign: string;
  /** 외국납부세액 통화 (표시용). 3중 패턴 default "USD" */
  foreignTaxCurrencyCode: string;
  foreignTaxExchangeRate: string;
  /** §118의14① 비거주자 원천징수액 (원) — 외국법인 발행 국외주식(2호)에는 입력칸이 없다(엔진이 거부) */
  domesticSourceTaxWithheld: string;
}

/** 종목별 실제 양도 빈 입력(토글 ON 직후) */
export function createEmptyExitTaxActualTransfer(): ExitTaxHoldingActualForm {
  return {
    shareCount: "",
    transferDate: "",
    pricePerShare: "",
    priceForeign: "",
    exchangeRate: "",
    foreignTaxInput: "none",       // 3중 패턴 default
    foreignTaxPaid: "",
    foreignTaxPaidForeign: "",
    foreignTaxCurrencyCode: "USD", // 3중 패턴 default
    foreignTaxExchangeRate: "",
    domesticSourceTaxWithheld: "",
  };
}

/** 신규 국외전출세 보유 종목 빈 행 팩토리 */
export function createEmptyExitTaxHolding(): ExitTaxHoldingForm {
  return {
    id: nanoid(),
    stockName: "",
    marketType: "kospi",           // 3중 패턴 default
    shareCount: "",
    acquisitionDate: "",
    perShareAcquisitionPrice: "",
    departureDayValuationMode: "market_price",  // 3중 패턴 default
    departureDayMarketPrice: "",
    priorYearEndMonthAvg: "",
    unlistedSamplePrice: "",
    unlistedStdPricePerShare: "",
    isListedForeignCorp: true,           // 3중 패턴 default: 외국법인 발행 (해외주식 트랙과 동일)
    isSmallMediumEnterprise: false,
    countryCode: "US",                   // 3중 패턴 default
    foreignCurrencyCode: "USD",          // 3중 패턴 default
    departureDayPriceForeign: "",
    departureExchangeRate: "",
    perShareAcquisitionPriceForeign: "",
    acquisitionExchangeRate: "",
    stockCodeOrBizNumber: "",
    faceValuePerShare: "",
    ownershipRatio: "",
    actualTransfer: null,                // 3중 패턴 default: 양도하지 않음
  };
}

// ============================================================
// 분할 매수·분할 양도 lot 타입 (Plan v2.2)
// ============================================================

// R-2 자본조정 폼 (UI 측 string Date·string ratio)
export interface CapitalAdjustmentForm {
  type:
    | "bonus_capital_reserve"
    | "bonus_retained_earnings"
    | "reduction_proportional"
    | "reduction_capital_return";
  eventDate: string;       // "YYYY-MM-DD"
  ratio: string;            // parseDecimal로 변환
  notes: string;
}

export interface AcquisitionLotForm {
  id: string;                                  // UUID (UI key, specificMatchings 참조)
  acquisitionDate: string;                     // "YYYY-MM-DD" (gift는 수증일)
  shareCount: string;                          // 주
  perShareAcquisitionPrice: string;            // 원 (상속/증여 lot도 §163⑨ 평가가액 직접 입력)
  /** `carryover_gift` = §97의2①이 적용되는 증여 (2025.1.1.~ 증여분 · 배우자·직계존비속) */
  acquisitionCause: "purchase" | "rights_issue" | "bonus_taxed" | "bonus_untaxed" | "inheritance" | "gift" | "carryover_gift" | "merger_split";
  decedentAcquisitionDate?: string;            // 상속 시 피상속인 취득일 (§104②1)
  donorAcquisitionDate?: string;               // 이월과세 시 증여자 취득일 (§104②2)
  /** 이월과세 lot — 증여자 취득 당시 1주당 실지거래가액 (§97의2①1호). 없으면 승계하지 않는다. */
  donorAcquisitionPrice?: string;
  /**
   * 이월과세 lot — 증여자 자본적지출 (§97의2①2호). **이 lot 전체 주식수 기준 총액**을 넣는다.
   * 엔진이 매도된 주식수 비율로 안분한다.
   */
  donorCapitalExpenditure?: string;
  /** 이월과세 lot — 그 증여 건의 증여세 **산출세액** (§97의2①3호 · 영 §163의2②1호) */
  donorGiftTaxAmount?: string;
  /** 이월과세 lot — 그 증여 건의 증여세 **과세가액** (영 §163의2②3호 · 안분 분모) */
  donorGiftTaxableValue?: string;
  /** 이월과세 lot — 증여자와의 관계 (§97의2① 본문) */
  donorRelation?: "spouse" | "lineal" | "other";
  /** 이월과세 lot — 증여자 사망 (배우자=사별 / 직계존비속=양도 당시 사망) */
  donorDeceased?: boolean;
  preMergerAcquisitionDate?: string;           // 합병·분할 시 종전 주식 취득일 (§104②3)
  /**
   * 상속 lot — §97의2④ 가업상속공제 주식 (단건 `StockTransferFormData`와 **같은 이름 7필드**).
   * 상속개시일 = 이 lot 취득일, 상속개시일 평가액 = 이 lot 1주당 단가. 취득원인이 상속이 아니거나 술어
   * (`allowsStockFbLot`)를 통과하지 못하면 잔존값은 inert다(④ 미전송 · ⑧ 미검증 — 계획서 Q-10).
   * optional인 이유: 다른 원인별 보조 필드(`donor*`)와 같은 규약이다. 기본값은 `lotFbFields`가 한 곳에서 준다.
   */
  familyBusinessInheritance?: boolean;
  /** 피상속인의 1주당 취득가액 (원) */
  fbDecedentPerSharePrice?: string;
  /** 피상속인 자본적지출 — **이 lot 전체 주식수** 기준 총액(원). 엔진이 매도에 배정된 주식수 몫만 산입한다 */
  fbDecedentCapitalExpenditure?: string;
  /** 구 ③ 가업상속공제금액 (매도일 2026.2.26. 이전) */
  fbDeductionAmount?: string;
  /** 구 ③ 가업상속 재산가액 (매도일 2026.2.26. 이전) */
  fbBusinessEstateValue?: string;
  /** ③2호 법인 총자산가액 (매도일 2026.2.27. 이후) */
  fbCorpTotalAssets?: string;
  /** ③2호 사업무관자산가액 (매도일 2026.2.27. 이후) */
  fbCorpNonBusinessAssets?: string;
}

export interface TransferLotForm {
  id: string;
  transferDate: string;
  shareCount: string;
  perShareTransferPrice: string;
  /** 양도 당시 1주당 기준시가 — 의제취득일 전 매수 lot ① 환산의 분모(`preDeemedLotClause1Mode === "estimated"` 일 때만 전송) */
  transferStdPricePerShare?: string;
}

export interface SpecificMatchingForm {
  transferLotId: string;
  acquisitionLotId: string;
  shareCount: string;
}

/**
 * 취득 다건 + 양도 단건 모드(lots-only)에서 API가 합성하는 단일 매도 lot의 sentinel ID.
 * 개별법(specific)에서 specificMatchings.transferLotId가 이 값을 가리킨다.
 * api.ts(합성)·AcquisitionLotsMatrix(매칭 입력)·validate(합계 검증) 단일 소스 (A-1).
 */
export const SYNTH_SINGLE_TRANSFER_ID = "__synth_single_transfer__";

/**
 * 매수 lot 빈 row 팩토리 — SplitLotsBlock, AcquisitionLotsMatrix, Step2 자동 1행 추가에서 공유.
 * R-12 (계획서) 해결.
 */
export function createEmptyAcquisitionLot(): AcquisitionLotForm {
  return {
    id: nanoid(),
    acquisitionDate: "",
    shareCount: "",
    perShareAcquisitionPrice: "",
    acquisitionCause: "purchase",
    // §97의2④ 가업상속 — 기본값은 `lotFbFields`(lib/calc/stock-family-business-lots.ts)와 같다
    familyBusinessInheritance: false,
    fbDecedentPerSharePrice: "",
    fbDecedentCapitalExpenditure: "",
    fbDeductionAmount: "",
    fbBusinessEstateValue: "",
    fbCorpTotalAssets: "",
    fbCorpNonBusinessAssets: "",
  };
}
