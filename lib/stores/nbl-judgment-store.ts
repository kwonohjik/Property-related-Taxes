/**
 * 비사업용 토지 **판정 메뉴** store (계획서 `nbl-judgment-menu.ui.plan.md` §3)
 *
 * 패턴은 `one-house-judgment-store.ts`(슬롯 하나). 계산기 store(`useCalcWizardStore`)와 **공유하지 않는다** —
 * 판정 메뉴는 별도 화면·별도 이력이고, 공유하면 계산기에서 작업하던 폼이 판정 입력으로 덮인다(반대도). persist 키도 별도다.
 * 사실 **전달**은 store 공유가 아니라 단일 헬퍼(`openTransferWithNblFacts`)로 한다.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { NonBusinessLandJudgmentResponse } from "@/app/api/calc/non-business-land-judgment/route";
import type { AssetForm } from "./calc-wizard-asset";
import { useProfessionalStore } from "./professional-store";
import {
  createInitialNblJudgmentForm,
  forceNblFacts,
  normalizeNblJudgmentForm,
  type NblJudgmentFormData,
} from "./nbl-judgment-form.types";

export interface NblJudgmentState {
  currentStep: number;
  formData: NblJudgmentFormData;
  /** 판정 결과 — persist 대상이 **아니다**(아래 partialize) */
  result: NonBusinessLandJudgmentResponse | null;
  /**
   * 그 결과를 **판정 요청한 시점의 의뢰인**(세무사 모드 `activeClientId`) — persist 대상이 아니다.
   * 의뢰인이 바뀐 뒤에는 화면 표시·자동저장·계산기 전달 어디에도 쓰지 않는다(의뢰인 격리).
   */
  resultClientId: string | null;
  error: string | null;
  isLoading: boolean;
}

export interface NblJudgmentActions {
  setStep: (step: number) => void;
  /** 폼-전역 칸(양도일 등)을 고친다 — 결과를 같은 `set`에서 무효화한다. */
  updateFormData: (patch: Partial<NblJudgmentFormData>) => void;
  /** 토지(`assets[0]`) 칸을 고친다 — 세 플래그(`forceNblFacts`)를 **항상** 다시 세운다. 결과를 같은 `set`에서 무효화한다. */
  updateAsset: (patch: Partial<AssetForm>) => void;
  /** @param clientId 판정을 **요청한 시점**의 의뢰인. 응답 도착 시점의 값이 아니다. */
  setResult: (result: NonBusinessLandJudgmentResponse | null, clientId?: string | null) => void;
  /** 다른 의뢰인의 결과를 비우고 1단계로 — 입력(formData)은 유지한다. */
  discardResultForClientChange: () => void;
  setError: (error: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  reset: () => void;
}

type NblJudgmentStore = NblJudgmentState & NblJudgmentActions;

export const useNblJudgmentStore = create<NblJudgmentStore>()(
  persist(
    (set) => ({
      currentStep: 0,
      formData: createInitialNblJudgmentForm(),
      result: null,
      resultClientId: null,
      error: null,
      isLoading: false,

      setStep: (currentStep) => set({ currentStep }),
      /**
       * 🔴 입력이 바뀌면 결과를 **무효화**한다 — 남겨 두면 ④ 화면이 옛 판정을 계속 보여준다.
       */
      updateFormData: (patch) =>
        set((state) => ({
          formData: { ...state.formData, ...patch },
          result: null,
          resultClientId: null,
        })),
      updateAsset: (patch) =>
        set((state) => ({
          formData: {
            ...state.formData,
            assets: [forceNblFacts({ ...state.formData.assets[0], ...patch })],
          },
          result: null,
          resultClientId: null,
        })),
      setResult: (result, clientId = null) => set({ result, resultClientId: result ? clientId : null }),
      discardResultForClientChange: () =>
        set((state) =>
          state.result !== null
            ? { result: null, resultClientId: null, currentStep: 0, error: null, isLoading: false }
            : {},
        ),
      setError: (error) => set({ error }),
      setLoading: (isLoading) => set({ isLoading }),
      reset: () =>
        set({
          currentStep: 0,
          formData: createInitialNblJudgmentForm(),
          result: null,
          resultClientId: null,
          error: null,
          isLoading: false,
        }),
    }),
    {
      name: "nbl-judgment-wizard",
      storage: createJSONStorage(() => sessionStorage),
      /**
       * `formData`만 보존한다 — **화이트리스트**. `result`는 Date를 품어 직렬화하면 string으로 되살아나고(민감정보이기도 하다),
       * `currentStep`은 재진입 시 항상 첫 단계다.
       */
      partialize: (state) => ({ formData: state.formData }),
      /** ③ normalize — 이력 재개(`history-resume-entry`)와 **같은 leaf**를 쓴다. 초기값 위에 덮어쓰기만 한다(판별 없음). */
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.currentStep = 0;
        state.result = null;
        state.resultClientId = null;
        state.formData = normalizeNblJudgmentForm(state.formData as unknown as Record<string, unknown>);
      },
    },
  ),
);

/**
 * 🔴 **의뢰인이 바뀌면 남은 판정 결과를 비우고 1단계로 보낸다** — 입력은 유지한다. 의뢰인을 바꾸는 **사용자 동작(store 이벤트)** 에서
 * 한 번 비운다 — `useEffect`로 store에 쓰는 미러링이 아니다(렌더 루프 없음). 결과가 있을 때만 비운다.
 */
useProfessionalStore.subscribe((state, prev) => {
  if (state.activeClientId === prev.activeClientId) return;
  if (useNblJudgmentStore.getState().result !== null) {
    useNblJudgmentStore.getState().discardResultForClientChange();
  }
});
