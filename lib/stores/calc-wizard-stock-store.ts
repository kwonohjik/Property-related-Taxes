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
import type { StockTransferAggregateResult } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";
// 서브 폼 타입 + 빈 행 팩토리 — 분리 sibling: calc-wizard-stock-types.ts
export type {
  ExitTaxHoldingForm,
  CapitalAdjustmentForm,
  AcquisitionLotForm,
  TransferLotForm,
  SpecificMatchingForm,
} from "./calc-wizard-stock-types";
export {
  createEmptyAcquisitionLot,
  createEmptyExitTaxHolding,
  SYNTH_SINGLE_TRANSFER_ID,
} from "./calc-wizard-stock-types";

// ============================================================
// 폼 데이터 타입 + 초기값 팩토리 — 분리 sibling: calc-wizard-stock-form.ts (800줄 정책)
// 기존 import 경로 호환을 위해 import + re-export
// ============================================================
import type { StockTransferFormData } from "./calc-wizard-stock-form";
import { createInitialStockFormData } from "./calc-wizard-stock-form";
export type { StockTransferFormData };
export { createInitialStockFormData };


// ============================================================
// [GAP-4] normalize 함수는 calc-wizard-stock-normalize.ts로 분리 (800줄 정책)
// 기존 import 경로 호환을 위해 import + re-export
// ============================================================
import { normalizeStockFormData } from "./calc-wizard-stock-normalize";
export { normalizeStockFormData };

// ============================================================
// 다종목 — 신고 단위 필드 승계
// ============================================================

/**
 * 종목을 확정하고 편집기를 비울 때 **신고 단위 필드는 그대로 이어받는다**.
 *
 * 이 7개는 「종목」이 아니라 「그 신고」의 속성이다 — 종목마다 다른 신고일·전자신고 여부를
 * 갖는 것은 성립하지 않는다(하나의 양도소득과세표준 신고서다). 매번 다시 입력하게 하면
 * 사용자가 종목별로 다른 값을 넣어 **가산세가 종목마다 달라지는** 잘못된 결과가 나온다.
 *
 * · `filingType`·`filingDate` — 예정/확정/수정 신고와 그 날짜
 * · `isElectronicFiling` — 조특법 §104의8 전자신고 세액공제(합산 1회)
 * · `filingViolation`·`isFraudulent`·`isInternationalTransaction` — 국세기본법 §47의2~4 가산세 게이트
 * · `realEstateGroupBasicDeductionUsed` — §103①1호(부동산 그룹) 기소진액
 */
function carryFilingFields(prev: StockTransferFormData): StockTransferFormData {
  const fresh = createInitialStockFormData();
  return {
    ...fresh,
    filingType: prev.filingType,
    filingDate: prev.filingDate,
    isElectronicFiling: prev.isElectronicFiling,
    filingViolation: prev.filingViolation,
    isFraudulent: prev.isFraudulent,
    isInternationalTransaction: prev.isInternationalTransaction,
    realEstateGroupBasicDeductionUsed: prev.realEstateGroupBasicDeductionUsed,
  };
}

// ============================================================
// Store 상태·액션
// ============================================================

export interface StockTransferStoreState {
  currentStep: number;
  formData: StockTransferFormData;
  /**
   * 다종목 합산신고 — **확정된 다른 종목들**.
   *
   * ## 왜 「편집기 + 목록」인가
   *
   * `StockTransferFormData`는 240개 넘는 필드가 **한 종목**을 서술한다(대주주 판정·환산 3시점·
   * 비상장 보충평가 행-수준·국외 필드…). 이것을 종목별로 쪼개면 38개 Block 컴포넌트의 props를
   * 전부 바꿔야 하고, 그 과정에서 세액 로직에 닿지 않는 변경이 대량으로 생긴다.
   *
   * ⇒ `formData`는 **지금 편집 중인 종목**으로 두고, 확정한 종목을 이 배열에 쌓는다.
   *   계산 시 `[...savedItems, formData]`를 items로 보낸다. 기존 입력 UI는 **한 줄도 바뀌지 않는다**.
   *
   * ## 법령 근거 — 왜 국내·국외를 한 배열에 담는가
   *
   * · §102①2호 — 국내·국외주식이 **같은 호** ⇒ 양도차손 통산 대상
   * · §103①2호 — 기본공제 250만원 **공동 그룹** 연 1회
   * · 별지 제84호서식 작성요령 7번 — 「주식은 … **국내ㆍ국외주식 양도소득금액 통산액**에서 연 250만원」
   *
   * ⚠️ **국외전출세(`exit_tax`)는 이 배열에 넣지 않는다** — §118의10④가 별도 기본공제 그룹이고
   *    과세 트랙 자체가 다르다(양도가 아니라 출국 의제). route도 별도 분기다.
   */
  savedItems: StockTransferFormData[];
  result: StockTransferResult | null;
  /** 다종목 계산 결과 (savedItems.length > 0 일 때) */
  aggregateResult: StockTransferAggregateResult | null;
  error: string | null;
  isLoading: boolean;
}

export interface StockTransferStoreActions {
  setStep: (step: number) => void;
  updateFormData: (patch: Partial<StockTransferFormData>) => void;
  setResult: (result: StockTransferResult | null) => void;
  setAggregateResult: (result: StockTransferAggregateResult | null) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;

  /** 편집 중인 종목을 목록에 확정하고 편집기를 비운다(신고 단위 필드는 승계). */
  commitCurrentItem: () => void;
  /** 목록의 종목을 편집기로 되돌린다(편집 중이던 것은 목록 끝에 확정). */
  editSavedItem: (index: number) => void;
  /** 목록에서 종목을 제거한다. */
  removeSavedItem: (index: number) => void;
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
      savedItems: [],
      result: null,
      aggregateResult: null,
      error: null,
      isLoading: false,

      setStep: (step) => set({ currentStep: step }),
      updateFormData: (patch) =>
        set((state) => ({ formData: { ...state.formData, ...patch } })),
      setResult: (result) => set({ result }),
      setAggregateResult: (aggregateResult) => set({ aggregateResult }),
      setError: (error) => set({ error }),
      setLoading: (loading) => set({ isLoading: loading }),
      reset: () =>
        set({
          currentStep: 0,
          formData: createInitialStockFormData(),
          savedItems: [],
          result: null,
          aggregateResult: null,
          error: null,
          isLoading: false,
        }),

      commitCurrentItem: () =>
        set((state) => ({
          savedItems: [...state.savedItems, state.formData],
          formData: carryFilingFields(state.formData),
          // 종목 구성이 바뀌면 이전 결과는 무효다 — 남겨두면 화면이 stale 세액을 보인다.
          result: null,
          aggregateResult: null,
        })),

      editSavedItem: (index) =>
        set((state) => {
          const target = state.savedItems[index];
          if (!target) return state;
          // 편집 중이던 종목은 잃지 않는다 — 목록 끝으로 확정하고 대상만 편집기로 올린다.
          const rest = state.savedItems.filter((_, i) => i !== index);
          return {
            savedItems: [...rest, state.formData],
            formData: target,
            result: null,
            aggregateResult: null,
          };
        }),

      removeSavedItem: (index) =>
        set((state) => ({
          savedItems: state.savedItems.filter((_, i) => i !== index),
          result: null,
          aggregateResult: null,
        })),
    }),
    {
      name: "stock-transfer-tax-wizard",
      storage: createJSONStorage(() => sessionStorage),
      // result·currentStep 제외 — Date 직렬화 불가 + 민감 정보 + 재진입 시 항상 첫 스텝.
      partialize: (state) => ({
        formData: state.formData,
        savedItems: state.savedItems,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 재진입·새로고침 시 항상 첫 스텝부터 (구 sessionStorage 잔존 currentStep 무시).
          state.currentStep = 0;
          // ③ normalize — sessionStorage 구형 데이터 마이그레이션
          state.formData = normalizeStockFormData(state.formData);
          // ③ 다종목 목록도 **각 항목마다** normalize한다. 구형 sessionStorage에는 이 키가
          //    아예 없으므로 `?? []` 가드가 필수다([[feedback_new_asset_field_stale_sessionstorage_guard]]).
          state.savedItems = (state.savedItems ?? []).map(normalizeStockFormData);
        }
      },
    }
  )
);
