/**
 * 1세대1주택 비과세 **판정 메뉴** store (P4-2b-1)
 *
 * 계획서 §5.2 · UI 설계 §10 ①②③. 패턴은 `calc-wizard-stock-store.ts`(4단계 마법사 정본).
 *
 * ## 계산기 store와 **공유하지 않는다**
 *
 * 판정 메뉴는 별도 화면이고 별도 이력이다. `useCalcWizardStore`를 함께 쓰면 계산기에서
 * 작업하던 폼이 판정 메뉴 입력으로 덮이고, 그 반대도 생긴다. persist 키도 별도다.
 * 사실 **전달**(P5)은 store 공유가 아니라 **단일 진입 헬퍼**로 한다(계획서 §5.3).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "./one-house-judgment-form.types";

export interface OneHouseJudgmentState {
  currentStep: number;
  formData: OneHouseJudgmentFormData;
  /** 판정 결과 — persist 대상이 **아니다**(아래 partialize) */
  result: OneHouseExemptionResponse | null;
  error: string | null;
  isLoading: boolean;
}

export interface OneHouseJudgmentActions {
  setStep: (step: number) => void;
  updateFormData: (patch: Partial<OneHouseJudgmentFormData>) => void;
  setResult: (result: OneHouseExemptionResponse | null) => void;
  setError: (error: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  reset: () => void;
}

type OneHouseJudgmentStore = OneHouseJudgmentState & OneHouseJudgmentActions;

export const useOneHouseJudgmentStore = create<OneHouseJudgmentStore>()(
  persist(
    (set) => ({
      currentStep: 0,
      formData: createInitialOneHouseJudgmentForm(),
      result: null,
      error: null,
      isLoading: false,

      setStep: (currentStep) => set({ currentStep }),
      /**
       * 🔴 입력이 바뀌면 결과를 **무효화**한다.
       * 남겨 두면 ④ 화면이 옛 판정을 계속 보여준다
       * (`feedback_store_update_must_invalidate_result`).
       */
      updateFormData: (patch) =>
        set((state) => ({ formData: { ...state.formData, ...patch }, result: null })),
      setResult: (result) => set({ result }),
      setError: (error) => set({ error }),
      setLoading: (isLoading) => set({ isLoading }),
      reset: () =>
        set({
          currentStep: 0,
          formData: createInitialOneHouseJudgmentForm(),
          result: null,
          error: null,
          isLoading: false,
        }),
    }),
    {
      name: "one-house-judgment-wizard",
      storage: createJSONStorage(() => sessionStorage),
      /**
       * `formData`만 보존한다 — **화이트리스트**이므로 여기 없는 것은 전부 제외된다.
       * `result`는 Date를 품고 있어(`pending[].deadline`) 직렬화하면 string으로 되살아나
       * 화면이 `Date` 메서드를 부르다 깨진다. `currentStep`은 재진입 시 항상 첫 단계다.
       */
      partialize: (state) => ({ formData: state.formData }),
      /**
       * ③ normalize — 구 버전 세션에 없던 필드를 초기값으로 채운다.
       *
       * 🔑 구 스키마 판별을 **키 화이트리스트로 하지 않는다**. 계산기 store가 정확히 그렇게 했다가
       *    「모든 신 스키마 폼이 구 스키마로 오분류돼 F5마다 자산 전부 소실」된 전례가
       *    `calc-wizard-store.ts:221-247`에 남아 있다. 여기서는 **초기값 위에 덮어쓰기**만 한다 —
       *    판별 자체를 하지 않으므로 오분류가 성립하지 않는다.
       */
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.currentStep = 0;
        state.result = null;
        state.formData = { ...createInitialOneHouseJudgmentForm(), ...state.formData };
      },
    },
  ),
);
