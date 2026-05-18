/**
 * 주식 양도소득세 폼 상태 store (zustand)
 *
 * 소득세법 2026.4.21. 시행
 * 부동산 양도세 store와 완전히 분리된 독립 도메인.
 *
 * 3중 패턴 적용 필드 (feedback_store_default_vs_ui_display_fallback):
 *   factory default = normalize 빈문자 처리 = UI 명시값 (display fallback 단독 금지)
 *
 * 14필드 명시 default (store factory ↔ validate ↔ API 3중 일치):
 *   acquisitionMode: "actual"
 *   transferPriceMode: "actual"
 *   acquisitionCause: "purchase"
 *   filingType: "preliminary"
 *   acquiredBeforeListing: false
 *   tradingHaltAtTransfer: false
 *   isVentureCompany: false
 *   isKOTCTrading: false
 *   isLargestShareholderGroup: false
 *   bookLost: false
 *   isElectronicFiling: false
 *   isFraudulent: false
 *   isInternationalTransaction: false
 *   realEstateGroupBasicDeductionUsed: 0
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// ============================================================
// 분할 매수·분할 양도 lot 타입 (Plan v2.2)
// ============================================================

export interface AcquisitionLotForm {
  id: string;                                  // UUID (UI key, specificMatchings 참조)
  acquisitionDate: string;                     // "YYYY-MM-DD" (gift는 수증일)
  shareCount: string;                          // 주
  perShareAcquisitionPrice: string;            // 원 (상속/증여 lot도 §163⑨ 평가가액 직접 입력)
  acquisitionCause: "purchase" | "inheritance" | "gift" | "merger_split";
  decedentAcquisitionDate?: string;            // 상속 시 피상속인 취득일 (§104②1)
  preMergerAcquisitionDate?: string;           // 합병·분할 시 종전 주식 취득일 (§104②3)
}

export interface TransferLotForm {
  id: string;
  transferDate: string;
  shareCount: string;
  perShareTransferPrice: string;
}

export interface SpecificMatchingForm {
  transferLotId: string;
  acquisitionLotId: string;
  shareCount: string;
}

// ============================================================
// 폼 상태 타입 (① 동기화 지점)
// 모든 통화 필드는 문자열 (CurrencyInput 호환)
// 모든 날짜 필드는 문자열 "YYYY-MM-DD" (DateInput 호환)
// boolean 필드는 boolean
// ============================================================

export interface StockTransferFormData {
  // ── 시장·회사 분류 ──
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted" | "other_asset" | "";

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

  // ── 거래 일자·수량 ──
  acquisitionDate: string;       // "YYYY-MM-DD"
  transferDate: string;          // "YYYY-MM-DD"
  shareCount: string;            // 정수 문자열
  totalIssuedShares: string;     // 정수 문자열

  // ── 보유기간 기산점 §104② ──
  acquisitionCause: "purchase" | "inheritance" | "gift" | "merger_split";  // 3중 패턴 default: "purchase"
  decedentAcquisitionDate: string;     // 상속: 피상속인 취득일
  donorAcquisitionDate: string;        // 증여
  preMergerAcquisitionDate: string;    // 합병·분할

  // ── §94①4 다목 누적 ──
  cumulativeTransferRatio: string;   // 소수점 "0.3" = 30%

  // ── 양도가액 ──
  transferPriceMode: "actual" | "exchange";  // 3중 패턴 default: "actual"
  transferActualInputMode: "per_share" | "total";  // 3중 패턴 default: "per_share" (실가 입력 방식)
  transferTotalPrice: string;        // 원 — total 모드 시 양도가액 합계 직접 입력
  perShareTransferPrice: string;     // 원
  exchangePropertyValue: string;     // 교환: 부동산 가액
  exchangeDebtRelief: string;        // 교환: 채무면제액
  exchangeCash: string;              // 교환: 현금

  // ── 취득가액 ──
  acquisitionMode: "actual" | "sale_case" | "appraisal" | "estimated" | "face_value";  // 3중 패턴 default: "actual"
  acquisitionActualInputMode: "per_share" | "lots";  // 3중 패턴 default: "per_share" — 실가 입력 방식 (lots-only 모드)
  perShareAcquisitionPrice: string;  // 실가 취득가

  // ── 환산 — 상장 (1개월 종가평균) ──
  transferDatePriceAvg1Month: string;    // 양도일 직전 1개월 평균 (원)
  listingDate: string;                    // 상장일 "YYYY-MM-DD"
  listingDatePriceAvg1Month: string;     // 상장일 직전 1개월 평균 (원)
  acquiredBeforeListing: boolean;        // 3중 패턴 default: false
  tradingHaltAtTransfer: boolean;        // 3중 패턴 default: false

  // ── 환산 — 비상장 보충적 평가 (3시점) ──
  transferYearNetIncomePerShare: string;
  transferYearNetAssetPerShare: string;
  listingYearNetIncomePerShare: string;
  listingYearNetAssetPerShare: string;
  acquisitionYearNetIncomePerShare: string;
  acquisitionYearNetAssetPerShare: string;

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
  isFraudulent: boolean;                 // 3중 패턴 default: false
  isInternationalTransaction: boolean;   // 3중 패턴 default: false

  // ── §103② 기본공제 그룹 ──
  realEstateGroupBasicDeductionUsed: string;  // 3중 패턴 default: "0"

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
  listingPriceHasIncrease: boolean;                       // 증자·합병 (default false)

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
}

// ============================================================
// 초기값 팩토리 (② 동기화 지점)
// 14필드 명시 default = 3중 패턴 source of truth
// ============================================================

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
  };
}

export function createInitialStockFormData(): StockTransferFormData {
  return {
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

    acquisitionDate: "",
    transferDate: "",
    shareCount: "",
    totalIssuedShares: "",

    acquisitionCause: "purchase",        // 3중 패턴 default
    decedentAcquisitionDate: "",
    donorAcquisitionDate: "",
    preMergerAcquisitionDate: "",

    cumulativeTransferRatio: "",

    transferPriceMode: "actual",         // 3중 패턴 default
    transferActualInputMode: "per_share", // 3중 패턴 default
    transferTotalPrice: "",
    perShareTransferPrice: "",
    exchangePropertyValue: "",
    exchangeDebtRelief: "",
    exchangeCash: "",

    acquisitionMode: "actual",           // 3중 패턴 default
    acquisitionActualInputMode: "per_share", // 3중 패턴 default
    perShareAcquisitionPrice: "",

    transferDatePriceAvg1Month: "",
    listingDate: "",
    listingDatePriceAvg1Month: "",
    acquiredBeforeListing: false,        // 3중 패턴 default
    tradingHaltAtTransfer: false,        // 3중 패턴 default

    transferYearNetIncomePerShare: "",
    transferYearNetAssetPerShare: "",
    listingYearNetIncomePerShare: "",
    listingYearNetAssetPerShare: "",
    acquisitionYearNetIncomePerShare: "",
    acquisitionYearNetAssetPerShare: "",

    bookLost: false,                     // 3중 패턴 default
    faceValuePerShare: "",

    netAssetOnlyReason: "",

    expenseMode: "actual",
    actualExpenses: "",

    filingType: "preliminary",           // 3중 패턴 default
    filingDate: "",
    isElectronicFiling: false,           // 3중 패턴 default
    isFraudulent: false,                 // 3중 패턴 default
    isInternationalTransaction: false,   // 3중 패턴 default

    realEstateGroupBasicDeductionUsed: "0",  // 3중 패턴 default

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
  };
}

// ============================================================
// normalize — sessionStorage 마이그레이션 호환 (③ 동기화 지점)
// ============================================================

export function normalizeStockFormData(raw: unknown): StockTransferFormData {
  const d = (raw ?? {}) as Record<string, unknown>;
  const defaults = createInitialStockFormData();

  // boolean 필드 (3중 패턴 — undefined → 명시 default)
  const boolField = (key: keyof StockTransferFormData, def: boolean): boolean => {
    const v = d[key];
    if (typeof v === "boolean") return v;
    return def;
  };

  // 문자열 필드 (undefined → "")
  const strField = (key: keyof StockTransferFormData): string => {
    const v = d[key];
    if (typeof v === "string") return v;
    return "";
  };

  // enum 필드 (잘못된 값 → default)
  const enumField = <T extends string>(
    key: keyof StockTransferFormData,
    valid: readonly T[],
    def: T
  ): T => {
    const v = d[key];
    if (typeof v === "string" && (valid as readonly string[]).includes(v)) return v as T;
    return def;
  };

  return {
    marketType: enumField("marketType", ["kospi", "kosdaq", "konex", "unlisted", "other_asset", ""], ""),
    isMajorShareholder: boolField("isMajorShareholder", false),
    selfShareRatio: strField("selfShareRatio"),
    selfMarketCap: strField("selfMarketCap"),
    isLargestShareholderGroup: boolField("isLargestShareholderGroup", defaults.isLargestShareholderGroup),
    combinedShareRatio: strField("combinedShareRatio"),
    combinedMarketCap: strField("combinedMarketCap"),
    priorYearEndDate: strField("priorYearEndDate"),
    selfShareRatioMode: enumField("selfShareRatioMode", ["direct", "shares"], defaults.selfShareRatioMode),
    selfOwnedShares: strField("selfOwnedShares"),
    combinedShareRatioMode: enumField("combinedShareRatioMode", ["direct", "shares"], defaults.combinedShareRatioMode),
    combinedOwnedShares: strField("combinedOwnedShares"),
    isQualifyingBlockShareholder: boolField("isQualifyingBlockShareholder", false),
    isHeavyRealEstateForRate: boolField("isHeavyRealEstateForRate", false),
    isHeavyRealEstateForValuation: boolField("isHeavyRealEstateForValuation", false),
    isSmallMediumEnterprise: boolField("isSmallMediumEnterprise", false),
    isMidsizeEnterprise: boolField("isMidsizeEnterprise", false),
    isListedSmallShareholder: boolField("isListedSmallShareholder", false),
    isVentureCompany: boolField("isVentureCompany", defaults.isVentureCompany),
    isKOTCTrading: boolField("isKOTCTrading", defaults.isKOTCTrading),
    acquisitionDate: strField("acquisitionDate"),
    transferDate: strField("transferDate"),
    shareCount: strField("shareCount"),
    totalIssuedShares: strField("totalIssuedShares"),
    acquisitionCause: enumField("acquisitionCause", ["purchase", "inheritance", "gift", "merger_split"], defaults.acquisitionCause),
    decedentAcquisitionDate: strField("decedentAcquisitionDate"),
    donorAcquisitionDate: strField("donorAcquisitionDate"),
    preMergerAcquisitionDate: strField("preMergerAcquisitionDate"),
    cumulativeTransferRatio: strField("cumulativeTransferRatio"),
    transferPriceMode: enumField("transferPriceMode", ["actual", "exchange"], defaults.transferPriceMode),
    transferActualInputMode: enumField("transferActualInputMode", ["per_share", "total"], defaults.transferActualInputMode),
    transferTotalPrice: strField("transferTotalPrice"),
    perShareTransferPrice: strField("perShareTransferPrice"),
    exchangePropertyValue: strField("exchangePropertyValue"),
    exchangeDebtRelief: strField("exchangeDebtRelief"),
    exchangeCash: strField("exchangeCash"),
    acquisitionMode: enumField("acquisitionMode", ["actual", "sale_case", "appraisal", "estimated", "face_value"], defaults.acquisitionMode),
    acquisitionActualInputMode: enumField("acquisitionActualInputMode", ["per_share", "lots"], defaults.acquisitionActualInputMode),
    perShareAcquisitionPrice: strField("perShareAcquisitionPrice"),
    transferDatePriceAvg1Month: strField("transferDatePriceAvg1Month"),
    listingDate: strField("listingDate"),
    listingDatePriceAvg1Month: strField("listingDatePriceAvg1Month"),
    acquiredBeforeListing: boolField("acquiredBeforeListing", defaults.acquiredBeforeListing),
    tradingHaltAtTransfer: boolField("tradingHaltAtTransfer", defaults.tradingHaltAtTransfer),
    transferYearNetIncomePerShare: strField("transferYearNetIncomePerShare"),
    transferYearNetAssetPerShare: strField("transferYearNetAssetPerShare"),
    listingYearNetIncomePerShare: strField("listingYearNetIncomePerShare"),
    listingYearNetAssetPerShare: strField("listingYearNetAssetPerShare"),
    acquisitionYearNetIncomePerShare: strField("acquisitionYearNetIncomePerShare"),
    acquisitionYearNetAssetPerShare: strField("acquisitionYearNetAssetPerShare"),
    bookLost: boolField("bookLost", defaults.bookLost),
    faceValuePerShare: strField("faceValuePerShare"),
    netAssetOnlyReason: enumField("netAssetOnlyReason", ["liquidation_or_owner_death", "no_business_or_short_or_closed", "stock_holding_company", "remaining_term_under_3y", ""], ""),
    expenseMode: enumField("expenseMode", ["actual", "estimated"], "actual"),
    actualExpenses: strField("actualExpenses"),
    filingType: enumField("filingType", ["preliminary", "final", "revised"], defaults.filingType),
    filingDate: strField("filingDate"),
    isElectronicFiling: boolField("isElectronicFiling", defaults.isElectronicFiling),
    isFraudulent: boolField("isFraudulent", defaults.isFraudulent),
    isInternationalTransaction: boolField("isInternationalTransaction", defaults.isInternationalTransaction),
    realEstateGroupBasicDeductionUsed: strField("realEstateGroupBasicDeductionUsed") || defaults.realEstateGroupBasicDeductionUsed,

    // ── 분할 매수·분할 양도 (Plan v2.2) ──
    lotsMode: enumField("lotsMode", ["single", "split"], defaults.lotsMode),
    costAllocationMethod: enumField(
      "costAllocationMethod",
      ["specific", "fifo", "moving_avg"],
      defaults.costAllocationMethod,
    ),
    acquisitionLots: normalizeAcquisitionLots(d.acquisitionLots),
    transferLots: normalizeTransferLots(d.transferLots),
    specificMatchings: normalizeSpecificMatchings(d.specificMatchings),

    // ── 취득 후 상장 환산 PDF 사례 재현 (80 신규 필드 — Phase D~G) ──
    unlistedDetailMode: enumField("unlistedDetailMode", ["simple", "listing_only", "full"], defaults.unlistedDetailMode),
    monthlyAccrualToggle: boolField("monthlyAccrualToggle", defaults.monthlyAccrualToggle),
    listingPriceDates: Array.isArray(d.listingPriceDates) ? (d.listingPriceDates as string[]) : [],
    listingPriceClosing: Array.isArray(d.listingPriceClosing) ? (d.listingPriceClosing as string[]) : [],
    listingPriceBasisDate: strField("listingPriceBasisDate"),
    listingPriceHasIncrease: boolField("listingPriceHasIncrease", defaults.listingPriceHasIncrease),
    // 순손익 — 상장연도 (18 필드)
    niAddRow1Listing: strField("niAddRow1Listing"), niAddRow2Listing: strField("niAddRow2Listing"),
    niAddRow3Listing: strField("niAddRow3Listing"), niAddRow4Listing: strField("niAddRow4Listing"),
    niSubRow5Listing: strField("niSubRow5Listing"), niSubRow6Listing: strField("niSubRow6Listing"),
    niSubRow7Listing: strField("niSubRow7Listing"), niSubRow8Listing: strField("niSubRow8Listing"),
    niSubRow9Listing: strField("niSubRow9Listing"), niSubRow10Listing: strField("niSubRow10Listing"),
    niSubRow11Listing: strField("niSubRow11Listing"), niSubRow12Listing: strField("niSubRow12Listing"),
    niSubRow13Listing: strField("niSubRow13Listing"), niSubRow14Listing: strField("niSubRow14Listing"),
    niSubRow15Listing: strField("niSubRow15Listing"), niSubRow16Listing: strField("niSubRow16Listing"),
    niShareCountListing: strField("niShareCountListing"),
    niDiscountRateListing: strField("niDiscountRateListing") || defaults.niDiscountRateListing,
    // 순손익 — 취득연도 (18 필드)
    niAddRow1Acq: strField("niAddRow1Acq"), niAddRow2Acq: strField("niAddRow2Acq"),
    niAddRow3Acq: strField("niAddRow3Acq"), niAddRow4Acq: strField("niAddRow4Acq"),
    niSubRow5Acq: strField("niSubRow5Acq"), niSubRow6Acq: strField("niSubRow6Acq"),
    niSubRow7Acq: strField("niSubRow7Acq"), niSubRow8Acq: strField("niSubRow8Acq"),
    niSubRow9Acq: strField("niSubRow9Acq"), niSubRow10Acq: strField("niSubRow10Acq"),
    niSubRow11Acq: strField("niSubRow11Acq"), niSubRow12Acq: strField("niSubRow12Acq"),
    niSubRow13Acq: strField("niSubRow13Acq"), niSubRow14Acq: strField("niSubRow14Acq"),
    niSubRow15Acq: strField("niSubRow15Acq"), niSubRow16Acq: strField("niSubRow16Acq"),
    niShareCountAcq: strField("niShareCountAcq"),
    niDiscountRateAcq: strField("niDiscountRateAcq") || defaults.niDiscountRateAcq,
    // 순자산 — 상장연도 (19 필드)
    naAssetTotalRow1Listing: strField("naAssetTotalRow1Listing"),
    naAssetAddRow2Listing: strField("naAssetAddRow2Listing"), naAssetAddRow3Listing: strField("naAssetAddRow3Listing"),
    naAssetAddRow4Listing: strField("naAssetAddRow4Listing"), naAssetAddRow5Listing: strField("naAssetAddRow5Listing"),
    naAssetSubRow6Listing: strField("naAssetSubRow6Listing"), naAssetSubRow7Listing: strField("naAssetSubRow7Listing"),
    naLiabTotalRow8Listing: strField("naLiabTotalRow8Listing"),
    naLiabAddRow9Listing: strField("naLiabAddRow9Listing"), naLiabAddRow10Listing: strField("naLiabAddRow10Listing"),
    naLiabAddRow11Listing: strField("naLiabAddRow11Listing"), naLiabAddRow12Listing: strField("naLiabAddRow12Listing"),
    naLiabAddRow13Listing: strField("naLiabAddRow13Listing"), naLiabAddRow14Listing: strField("naLiabAddRow14Listing"),
    naLiabSubRow15Listing: strField("naLiabSubRow15Listing"), naLiabSubRow16Listing: strField("naLiabSubRow16Listing"),
    naLiabSubRow17Listing: strField("naLiabSubRow17Listing"),
    naGoodwillRow19Listing: strField("naGoodwillRow19Listing"),
    naShareCountListing: strField("naShareCountListing"),
    // 순자산 — 취득연도 (19 필드)
    naAssetTotalRow1Acq: strField("naAssetTotalRow1Acq"),
    naAssetAddRow2Acq: strField("naAssetAddRow2Acq"), naAssetAddRow3Acq: strField("naAssetAddRow3Acq"),
    naAssetAddRow4Acq: strField("naAssetAddRow4Acq"), naAssetAddRow5Acq: strField("naAssetAddRow5Acq"),
    naAssetSubRow6Acq: strField("naAssetSubRow6Acq"), naAssetSubRow7Acq: strField("naAssetSubRow7Acq"),
    naLiabTotalRow8Acq: strField("naLiabTotalRow8Acq"),
    naLiabAddRow9Acq: strField("naLiabAddRow9Acq"), naLiabAddRow10Acq: strField("naLiabAddRow10Acq"),
    naLiabAddRow11Acq: strField("naLiabAddRow11Acq"), naLiabAddRow12Acq: strField("naLiabAddRow12Acq"),
    naLiabAddRow13Acq: strField("naLiabAddRow13Acq"), naLiabAddRow14Acq: strField("naLiabAddRow14Acq"),
    naLiabSubRow15Acq: strField("naLiabSubRow15Acq"), naLiabSubRow16Acq: strField("naLiabSubRow16Acq"),
    naLiabSubRow17Acq: strField("naLiabSubRow17Acq"),
    naGoodwillRow19Acq: strField("naGoodwillRow19Acq"),
    naShareCountAcq: strField("naShareCountAcq"),
  };
}

// ============================================================
// 분할 lot 배열 sanitizer (③ 동기화 지점)
// ============================================================

function normalizeAcquisitionLots(raw: unknown): AcquisitionLotForm[] {
  if (!Array.isArray(raw)) return [];
  const validCauses = ["purchase", "inheritance", "gift", "merger_split"] as const;
  return raw
    .map((r): AcquisitionLotForm | null => {
      if (!r || typeof r !== "object") return null;
      const o = r as Record<string, unknown>;
      const idVal = typeof o.id === "string" ? o.id : null;
      if (!idVal) return null;
      const cause = typeof o.acquisitionCause === "string" && (validCauses as readonly string[]).includes(o.acquisitionCause)
        ? (o.acquisitionCause as AcquisitionLotForm["acquisitionCause"])
        : "purchase";
      return {
        id: idVal,
        acquisitionDate: typeof o.acquisitionDate === "string" ? o.acquisitionDate : "",
        shareCount: typeof o.shareCount === "string" ? o.shareCount : "",
        perShareAcquisitionPrice: typeof o.perShareAcquisitionPrice === "string" ? o.perShareAcquisitionPrice : "",
        acquisitionCause: cause,
        decedentAcquisitionDate: typeof o.decedentAcquisitionDate === "string" ? o.decedentAcquisitionDate : undefined,
        preMergerAcquisitionDate: typeof o.preMergerAcquisitionDate === "string" ? o.preMergerAcquisitionDate : undefined,
      };
    })
    .filter((l): l is AcquisitionLotForm => l !== null);
}

function normalizeTransferLots(raw: unknown): TransferLotForm[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): TransferLotForm | null => {
      if (!r || typeof r !== "object") return null;
      const o = r as Record<string, unknown>;
      const idVal = typeof o.id === "string" ? o.id : null;
      if (!idVal) return null;
      return {
        id: idVal,
        transferDate: typeof o.transferDate === "string" ? o.transferDate : "",
        shareCount: typeof o.shareCount === "string" ? o.shareCount : "",
        perShareTransferPrice: typeof o.perShareTransferPrice === "string" ? o.perShareTransferPrice : "",
      };
    })
    .filter((l): l is TransferLotForm => l !== null);
}

function normalizeSpecificMatchings(raw: unknown): SpecificMatchingForm[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): SpecificMatchingForm | null => {
      if (!r || typeof r !== "object") return null;
      const o = r as Record<string, unknown>;
      const tId = typeof o.transferLotId === "string" ? o.transferLotId : null;
      const aId = typeof o.acquisitionLotId === "string" ? o.acquisitionLotId : null;
      if (!tId || !aId) return null;
      return {
        transferLotId: tId,
        acquisitionLotId: aId,
        shareCount: typeof o.shareCount === "string" ? o.shareCount : "",
      };
    })
    .filter((m): m is SpecificMatchingForm => m !== null);
}

// ============================================================
// Store 상태·액션
// ============================================================

export interface StockTransferStoreState {
  currentStep: number;
  formData: StockTransferFormData;
  result: StockTransferResult | null;
  error: string | null;
  isLoading: boolean;
}

export interface StockTransferStoreActions {
  setStep: (step: number) => void;
  updateFormData: (patch: Partial<StockTransferFormData>) => void;
  setResult: (result: StockTransferResult | null) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

type StockTransferStore = StockTransferStoreState & StockTransferStoreActions;

// ============================================================
// Zustand store (sessionStorage persist)
// result는 partialize에서 제외 (Date 직렬화 + 민감정보)
// ============================================================

export const useStockTransferStore = create<StockTransferStore>()(
  persist(
    (set) => ({
      currentStep: 0,
      formData: createInitialStockFormData(),
      result: null,
      error: null,
      isLoading: false,

      setStep: (step) => set({ currentStep: step }),
      updateFormData: (patch) =>
        set((state) => ({ formData: { ...state.formData, ...patch } })),
      setResult: (result) => set({ result }),
      setError: (error) => set({ error }),
      setLoading: (loading) => set({ isLoading: loading }),
      reset: () =>
        set({
          currentStep: 0,
          formData: createInitialStockFormData(),
          result: null,
          error: null,
          isLoading: false,
        }),
    }),
    {
      name: "stock-transfer-tax-wizard",
      storage: createJSONStorage(() => sessionStorage),
      // result 제외 — Date 직렬화 불가 + 민감 정보
      partialize: (state) => ({
        currentStep: state.currentStep,
        formData: state.formData,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // ③ normalize — sessionStorage 구형 데이터 마이그레이션
          state.formData = normalizeStockFormData(state.formData);
        }
      },
    }
  )
);
