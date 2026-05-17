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
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

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
  selfShareRatio: string;       // 소수점 (예: "0.05" = 5%)
  selfMarketCap: string;        // 원 정수 문자열
  isLargestShareholderGroup: boolean;
  combinedShareRatio: string;   // 소수점
  combinedMarketCap: string;    // 원 정수 문자열
  priorYearEndDate: string;     // "YYYY-MM-DD"

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
  perShareTransferPrice: string;     // 원
  exchangePropertyValue: string;     // 교환: 부동산 가액
  exchangeDebtRelief: string;        // 교환: 채무면제액
  exchangeCash: string;              // 교환: 현금

  // ── 취득가액 ──
  acquisitionMode: "actual" | "sale_case" | "appraisal" | "estimated" | "face_value";  // 3중 패턴 default: "actual"
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
}

// ============================================================
// 초기값 팩토리 (② 동기화 지점)
// 14필드 명시 default = 3중 패턴 source of truth
// ============================================================

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
    perShareTransferPrice: "",
    exchangePropertyValue: "",
    exchangeDebtRelief: "",
    exchangeCash: "",

    acquisitionMode: "actual",           // 3중 패턴 default
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
    perShareTransferPrice: strField("perShareTransferPrice"),
    exchangePropertyValue: strField("exchangePropertyValue"),
    exchangeDebtRelief: strField("exchangeDebtRelief"),
    exchangeCash: strField("exchangeCash"),
    acquisitionMode: enumField("acquisitionMode", ["actual", "sale_case", "appraisal", "estimated", "face_value"], defaults.acquisitionMode),
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
  };
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
