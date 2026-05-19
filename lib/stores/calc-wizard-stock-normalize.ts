/**
 * 주식 양도세 폼 normalize — sessionStorage 마이그레이션 호환 (③ 동기화 지점).
 *
 * [GAP-4] calc-wizard-stock-store.ts 800줄 정책 분리.
 * normalize/factory/lot sanitizer 함수를 본 파일에 격리하여 main store 모듈을 슬림화.
 *
 * 3중 패턴 source of truth:
 *   factory default = normalize 빈문자 처리 = UI 명시값
 */

import {
  type StockTransferFormData,
  type AcquisitionLotForm,
  type TransferLotForm,
  type SpecificMatchingForm,
  createInitialStockFormData,
} from "./calc-wizard-stock-store";

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
    securityName: strField("securityName"),
    securityCode: strField("securityCode"),
    brokerage: strField("brokerage"),
    accountNumberMasked: strField("accountNumberMasked"),

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
    // 마이그레이션: undefined → true (기존 sessionStorage 호환 — silent 비과세 동작 유지)
    isOnMarketTransaction: boolField("isOnMarketTransaction", defaults.isOnMarketTransaction),
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
    acquisitionMode: enumField("acquisitionMode", ["actual", "sale_case", "estimated", "face_value"], defaults.acquisitionMode),
    acquisitionActualInputMode: enumField("acquisitionActualInputMode", ["per_share", "lots"], defaults.acquisitionActualInputMode),
    perShareAcquisitionPrice: strField("perShareAcquisitionPrice"),
    // R-1' 매매사례가액
    acquisitionMarketSamplePrice: strField("acquisitionMarketSamplePrice"),
    acquisitionMarketSampleDate: strField("acquisitionMarketSampleDate"),
    acquisitionMarketSampleCounterparty: strField("acquisitionMarketSampleCounterparty"),
    transferMarketSamplePrice: strField("transferMarketSamplePrice"),
    transferMarketSampleDate: strField("transferMarketSampleDate"),
    transferMarketSampleCounterparty: strField("transferMarketSampleCounterparty"),
    // R-2 자본조정
    capitalAdjustments: Array.isArray(d.capitalAdjustments)
      ? (d.capitalAdjustments as unknown[]).map((row) => {
          const r = (row ?? {}) as Record<string, unknown>;
          const typeStr = typeof r.type === "string" ? r.type : "bonus_capital_reserve";
          const allowedTypes = ["bonus_capital_reserve", "bonus_retained_earnings", "reduction_proportional", "reduction_capital_return"] as const;
          const safeType = (allowedTypes as readonly string[]).includes(typeStr)
            ? (typeStr as typeof allowedTypes[number])
            : "bonus_capital_reserve";
          return {
            type: safeType,
            eventDate: typeof r.eventDate === "string" ? r.eventDate : "",
            ratio: typeof r.ratio === "string" ? r.ratio : "",
            notes: typeof r.notes === "string" ? r.notes : "",
          };
        })
      : [],
    transferDatePriceAvg1Month: strField("transferDatePriceAvg1Month"),
    acquisitionDatePriceAvg1Month: strField("acquisitionDatePriceAvg1Month"),
    transferStdInputMode: enumField("transferStdInputMode", ["direct", "daily"], defaults.transferStdInputMode),
    transferPriceDates: Array.isArray(d.transferPriceDates) ? (d.transferPriceDates as string[]) : [],
    transferPriceClosing: Array.isArray(d.transferPriceClosing) ? (d.transferPriceClosing as string[]) : [],
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
    filingViolation: enumField("filingViolation", ["none", "under_report", "non_report"], defaults.filingViolation),
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

    // ── [사례 49] 취득시 장부분실 액면가 (2 필드) ──
    acqFaceValueOnly: boolField("acqFaceValueOnly", defaults.acqFaceValueOnly),
    acqFaceValuePerShare: strField("acqFaceValuePerShare"),

    // ── 비상장 §165④ 보충적 평가 — 행-수준 직접계산 모드 (74 신규 필드 + 1 enum) ──
    unlistedValuationMode: enumField("unlistedValuationMode", ["simple", "full"], defaults.unlistedValuationMode),
    // NI — 양도연도 (EUTransfer) 18 필드
    niAddRow1EUTransfer: strField("niAddRow1EUTransfer"), niAddRow2EUTransfer: strField("niAddRow2EUTransfer"),
    niAddRow3EUTransfer: strField("niAddRow3EUTransfer"), niAddRow4EUTransfer: strField("niAddRow4EUTransfer"),
    niSubRow5EUTransfer: strField("niSubRow5EUTransfer"), niSubRow6EUTransfer: strField("niSubRow6EUTransfer"),
    niSubRow7EUTransfer: strField("niSubRow7EUTransfer"), niSubRow8EUTransfer: strField("niSubRow8EUTransfer"),
    niSubRow9EUTransfer: strField("niSubRow9EUTransfer"), niSubRow10EUTransfer: strField("niSubRow10EUTransfer"),
    niSubRow11EUTransfer: strField("niSubRow11EUTransfer"), niSubRow12EUTransfer: strField("niSubRow12EUTransfer"),
    niSubRow13EUTransfer: strField("niSubRow13EUTransfer"), niSubRow14EUTransfer: strField("niSubRow14EUTransfer"),
    niSubRow15EUTransfer: strField("niSubRow15EUTransfer"), niSubRow16EUTransfer: strField("niSubRow16EUTransfer"),
    niShareCountEUTransfer: strField("niShareCountEUTransfer"),
    niDiscountRateEUTransfer: strField("niDiscountRateEUTransfer") || defaults.niDiscountRateEUTransfer,
    // NI — 취득연도 (EUAcq) 18 필드
    niAddRow1EUAcq: strField("niAddRow1EUAcq"), niAddRow2EUAcq: strField("niAddRow2EUAcq"),
    niAddRow3EUAcq: strField("niAddRow3EUAcq"), niAddRow4EUAcq: strField("niAddRow4EUAcq"),
    niSubRow5EUAcq: strField("niSubRow5EUAcq"), niSubRow6EUAcq: strField("niSubRow6EUAcq"),
    niSubRow7EUAcq: strField("niSubRow7EUAcq"), niSubRow8EUAcq: strField("niSubRow8EUAcq"),
    niSubRow9EUAcq: strField("niSubRow9EUAcq"), niSubRow10EUAcq: strField("niSubRow10EUAcq"),
    niSubRow11EUAcq: strField("niSubRow11EUAcq"), niSubRow12EUAcq: strField("niSubRow12EUAcq"),
    niSubRow13EUAcq: strField("niSubRow13EUAcq"), niSubRow14EUAcq: strField("niSubRow14EUAcq"),
    niSubRow15EUAcq: strField("niSubRow15EUAcq"), niSubRow16EUAcq: strField("niSubRow16EUAcq"),
    niShareCountEUAcq: strField("niShareCountEUAcq"),
    niDiscountRateEUAcq: strField("niDiscountRateEUAcq") || defaults.niDiscountRateEUAcq,
    // NA — 양도연도 (EUTransfer) 19 필드
    naAssetTotalRow1EUTransfer: strField("naAssetTotalRow1EUTransfer"),
    naAssetAddRow2EUTransfer: strField("naAssetAddRow2EUTransfer"), naAssetAddRow3EUTransfer: strField("naAssetAddRow3EUTransfer"),
    naAssetAddRow4EUTransfer: strField("naAssetAddRow4EUTransfer"), naAssetAddRow5EUTransfer: strField("naAssetAddRow5EUTransfer"),
    naAssetSubRow6EUTransfer: strField("naAssetSubRow6EUTransfer"), naAssetSubRow7EUTransfer: strField("naAssetSubRow7EUTransfer"),
    naLiabTotalRow8EUTransfer: strField("naLiabTotalRow8EUTransfer"),
    naLiabAddRow9EUTransfer: strField("naLiabAddRow9EUTransfer"), naLiabAddRow10EUTransfer: strField("naLiabAddRow10EUTransfer"),
    naLiabAddRow11EUTransfer: strField("naLiabAddRow11EUTransfer"), naLiabAddRow12EUTransfer: strField("naLiabAddRow12EUTransfer"),
    naLiabAddRow13EUTransfer: strField("naLiabAddRow13EUTransfer"), naLiabAddRow14EUTransfer: strField("naLiabAddRow14EUTransfer"),
    naLiabSubRow15EUTransfer: strField("naLiabSubRow15EUTransfer"), naLiabSubRow16EUTransfer: strField("naLiabSubRow16EUTransfer"),
    naLiabSubRow17EUTransfer: strField("naLiabSubRow17EUTransfer"),
    naGoodwillRow19EUTransfer: strField("naGoodwillRow19EUTransfer"),
    naShareCountEUTransfer: strField("naShareCountEUTransfer"),
    // NA — 취득연도 (EUAcq) 19 필드
    naAssetTotalRow1EUAcq: strField("naAssetTotalRow1EUAcq"),
    naAssetAddRow2EUAcq: strField("naAssetAddRow2EUAcq"), naAssetAddRow3EUAcq: strField("naAssetAddRow3EUAcq"),
    naAssetAddRow4EUAcq: strField("naAssetAddRow4EUAcq"), naAssetAddRow5EUAcq: strField("naAssetAddRow5EUAcq"),
    naAssetSubRow6EUAcq: strField("naAssetSubRow6EUAcq"), naAssetSubRow7EUAcq: strField("naAssetSubRow7EUAcq"),
    naLiabTotalRow8EUAcq: strField("naLiabTotalRow8EUAcq"),
    naLiabAddRow9EUAcq: strField("naLiabAddRow9EUAcq"), naLiabAddRow10EUAcq: strField("naLiabAddRow10EUAcq"),
    naLiabAddRow11EUAcq: strField("naLiabAddRow11EUAcq"), naLiabAddRow12EUAcq: strField("naLiabAddRow12EUAcq"),
    naLiabAddRow13EUAcq: strField("naLiabAddRow13EUAcq"), naLiabAddRow14EUAcq: strField("naLiabAddRow14EUAcq"),
    naLiabSubRow15EUAcq: strField("naLiabSubRow15EUAcq"), naLiabSubRow16EUAcq: strField("naLiabSubRow16EUAcq"),
    naLiabSubRow17EUAcq: strField("naLiabSubRow17EUAcq"),
    naGoodwillRow19EUAcq: strField("naGoodwillRow19EUAcq"),
    naShareCountEUAcq: strField("naShareCountEUAcq"),
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
