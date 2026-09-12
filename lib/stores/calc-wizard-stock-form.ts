/**
 * 주식 양도소득세 — 초기값 팩토리 + 구 boolean 역산
 *
 * [800줄 정책 분할] `calc-wizard-stock-store.ts`에서 추출 → 795줄에서 다시 갈랐다(2026-09-11).
 * 타입 선언(`StockTransferFormData`·`AcquisitionStdMode`)은 leaf인
 * `calc-wizard-stock-form-types.ts`로 내리고, **여기서 재export**한다.
 * 기존 import 경로는 그대로다(소비처 72파일 무변경 — store의 re-export도 함께 살아 있다).
 *
 * 3중 패턴 적용 필드 (feedback_store_default_vs_ui_display_fallback):
 *   factory default = normalize 빈문자 처리 = UI 명시값 (display fallback 단독 금지)
 */

import type { AcquisitionStdMode, StockTransferFormData } from "./calc-wizard-stock-form-types";

// 소비처는 계속 이 경로에서 타입을 가져온다 — 분할이 새어 나가지 않게 한다.
export type { AcquisitionStdMode, StockTransferFormData } from "./calc-wizard-stock-form-types";

/**
 * 구 boolean 3개 → `acquisitionStdMode` 역산.
 *
 * 🔴 **순서가 곧 계약이다.** 엔진 if-체인이 `acquiredBeforeListing`을 **선두**로 두므로
 *    (`stock-acquisition-basis.ts:128`), 게이트가 생기기 전의 stale 데이터에 두 플래그가
 *    함께 켜져 있으면 엔진은 `post_listing`을 택했다. 순서를 뒤집으면 **과거 세액이 바뀐다**.
 *    anchor: `__tests__/calc/stock-std-mode-migration.anchor.test.ts` MIG-1~5
 */
export function deriveAcquisitionStdMode(raw: {
  acquiredBeforeListing?: unknown;
  tradingHaltAtTransfer?: unknown;
  tradingHaltAtAcquisition?: unknown;
}): AcquisitionStdMode {
  if (raw.acquiredBeforeListing === true) return "post_listing";
  if (raw.tradingHaltAtTransfer === true) return "halt_transfer";
  if (raw.tradingHaltAtAcquisition === true) return "halt_acquisition";
  return "monthly_avg";
}

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
    acquisitionStdInputMode: "direct",  // 3중 패턴 default — 기존 동작 보존
    acquisitionPriceDates: [],
    acquisitionPriceClosing: [],
    listingDate: "",
    listingDatePriceAvg1Month: "",
    listingStdInputMode: "direct",   // 3중 패턴 default — 기존 동작 보존
    acquisitionStdMode: "monthly_avg",   // 3중 패턴 default

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
    unlistedDetailMode: "full",              // 3중 패턴 default (신규 폼 초기 선택)
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
    fiscalYearListing: "",
    fiscalYearAcq: "",
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
    fiscalYearEUTransfer: "",
    fiscalYearEUAcq: "",
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
