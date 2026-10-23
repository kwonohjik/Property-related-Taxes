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
import type { MultiHouseSurchargeJudgmentResponse } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import { useProfessionalStore } from "./professional-store";
import {
  createInitialSurchargeSimulationInput,
  type SurchargeSimulationInputForm,
} from "@/lib/calc/surcharge-simulation-input";
import {
  createInitialOneHouseJudgmentForm,
  normalizeOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "./one-house-judgment-form.types";

/**
 * 다주택 중과 판정 메뉴의 결과·단계·오류·로딩(계획서 `multi-house-surcharge-judgment-menu.plan.md` §5.2 · T7).
 *
 * 두 판정 메뉴는 **입력(`formData`)을 함께 쓰고** 결과·단계는 메뉴별로 둔다. 같은 store에 두는 이유는 무효화다 —
 * `updateFormData`가 한 `set`에서 두 메뉴의 결과를 함께 비워야 어느 메뉴도 옛 입력의 판정을 보여주지 않는다.
 */
export interface SurchargeJudgmentSlot {
  currentStep: number;
  /** persist 대상이 아니다(`partialize`가 `formData`만 남긴다) */
  result: MultiHouseSurchargeJudgmentResponse | null;
  /** 판정을 요청한 시점의 의뢰인 — 1주택 `resultClientId`와 같은 규약 */
  resultClientId: string | null;
  error: string | null;
  isLoading: boolean;
  /**
   * ⑤ 세부담 시뮬레이션 입력(P8) — 판정 사실이 아니라 공유 폼에 두지 않는다. 입력이 바뀌어도 판정은 그대로이므로 결과는 두고
   * 시뮬레이션만 비운다(`setSurchargeSimulationInput`). persist 대상이 아니다.
   */
  simulationInput: SurchargeSimulationInputForm;
}

export function createInitialSurchargeSlot(): SurchargeJudgmentSlot {
  return {
    currentStep: 0,
    result: null,
    resultClientId: null,
    error: null,
    isLoading: false,
    simulationInput: createInitialSurchargeSimulationInput(),
  };
}

export interface OneHouseJudgmentState {
  currentStep: number;
  formData: OneHouseJudgmentFormData;
  /** 판정 결과 — persist 대상이 **아니다**(아래 partialize) */
  result: OneHouseExemptionResponse | null;
  /**
   * 그 결과를 **판정 요청한 시점의 의뢰인**(세무사 모드 `activeClientId`) — persist 대상이 아니다.
   * 결과는 이 의뢰인에게만 쓴다: 의뢰인이 바뀐 뒤에는 화면 표시·자동저장·「이 결과로 세액 계산」 어디에도 쓰지 않는다
   * (의뢰인 격리 — `resultBelongsToClient`). `null`은 의뢰인 없음(일반 모드) 또는 결과 없음이다.
   */
  resultClientId: string | null;
  error: string | null;
  isLoading: boolean;
  /** 다주택 중과 판정 메뉴 슬롯 — 입력은 위 `formData`를 함께 쓴다 */
  surcharge: SurchargeJudgmentSlot;
}

export interface OneHouseJudgmentActions {
  setStep: (step: number) => void;
  updateFormData: (patch: Partial<OneHouseJudgmentFormData>) => void;
  /** @param clientId 판정을 **요청한 시점**의 의뢰인. 응답 도착 시점의 값이 아니다. */
  setResult: (result: OneHouseExemptionResponse | null, clientId?: string | null) => void;
  /** 다른 의뢰인의 결과를 비우고 1단계로 — 입력(formData)은 유지한다. 결과가 있는 메뉴(1주택·중과)만 비운다. */
  discardResultForClientChange: () => void;
  setError: (error: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  reset: () => void;
  setSurchargeStep: (step: number) => void;
  /** @param clientId 판정을 **요청한 시점**의 의뢰인 */
  setSurchargeResult: (result: MultiHouseSurchargeJudgmentResponse | null, clientId?: string | null) => void;
  setSurchargeError: (error: string | null) => void;
  setSurchargeLoading: (isLoading: boolean) => void;
  /** 시뮬레이션 입력을 고친다 — 옛 입력으로 낸 시뮬레이션은 같은 `set`에서 비운다(판정 결과는 둔다) */
  setSurchargeSimulationInput: (patch: Partial<SurchargeSimulationInputForm>) => void;
}

type OneHouseJudgmentStore = OneHouseJudgmentState & OneHouseJudgmentActions;

export const useOneHouseJudgmentStore = create<OneHouseJudgmentStore>()(
  persist(
    (set) => ({
      currentStep: 0,
      formData: createInitialOneHouseJudgmentForm(),
      result: null,
      resultClientId: null,
      error: null,
      isLoading: false,
      surcharge: createInitialSurchargeSlot(),

      setStep: (currentStep) => set({ currentStep }),
      /**
       * 🔴 입력이 바뀌면 결과를 **무효화**한다.
       * 남겨 두면 ④ 화면이 옛 판정을 계속 보여준다
       * (`feedback_store_update_must_invalidate_result`). 입력을 함께 쓰는 중과 판정 결과도 **같은 `set`** 에서 비운다
       * (단계·오류는 그대로).
       */
      updateFormData: (patch) =>
        set((state) => ({
          formData: { ...state.formData, ...patch },
          result: null,
          resultClientId: null,
          surcharge: { ...state.surcharge, result: null, resultClientId: null },
        })),
      setResult: (result, clientId = null) =>
        set({ result, resultClientId: result ? clientId : null }),
      /** 결과가 있는 메뉴만 비우고 1단계로 — 다른 메뉴가 입력 도중이면 그 단계는 둔다(아래 구독의 「결과가 있을 때만」과 같은 원칙). */
      discardResultForClientChange: () =>
        set((state) => ({
          ...(state.result !== null
            ? { result: null, resultClientId: null, currentStep: 0, error: null, isLoading: false }
            : {}),
          ...(state.surcharge.result !== null ? { surcharge: createInitialSurchargeSlot() } : {}),
        })),
      setError: (error) => set({ error }),
      setLoading: (isLoading) => set({ isLoading }),
      reset: () =>
        set({
          currentStep: 0,
          formData: createInitialOneHouseJudgmentForm(),
          result: null,
          resultClientId: null,
          error: null,
          isLoading: false,
          surcharge: createInitialSurchargeSlot(),
        }),
      setSurchargeStep: (currentStep) => set((state) => ({ surcharge: { ...state.surcharge, currentStep } })),
      setSurchargeResult: (result, clientId = null) =>
        set((state) => ({ surcharge: { ...state.surcharge, result, resultClientId: result ? clientId : null } })),
      setSurchargeError: (error) => set((state) => ({ surcharge: { ...state.surcharge, error } })),
      setSurchargeLoading: (isLoading) => set((state) => ({ surcharge: { ...state.surcharge, isLoading } })),
      setSurchargeSimulationInput: (patch) =>
        set((state) => {
          const { result } = state.surcharge;
          return {
            surcharge: {
              ...state.surcharge,
              simulationInput: { ...state.surcharge.simulationInput, ...patch },
              result: result?.simulation ? { ...result, simulation: undefined } : result,
            },
          };
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
        state.resultClientId = null;
        state.surcharge = createInitialSurchargeSlot();
        // 이력 재개(`HistoryClient`·`HistoryDetailDrawer`)와 **같은 leaf**를 쓴다.
        state.formData = normalizeOneHouseJudgmentForm(
          state.formData as unknown as Record<string, unknown>,
        );
      },
    },
  ),
);

/**
 * 🔴 **의뢰인이 바뀌면 남은 판정 결과를 비우고 1단계로 보낸다**(S13-3 · 결정 #39 B) — 입력은 유지한다.
 *
 * 세무사 모드에서 결과 화면에 머문 채 헤더 「변경」으로 의뢰인을 바꾸면 계산기가 내렸다 올라오는데, 메모리 store의 직전 의뢰인 판정은 그대로
 * 남아 있어 종전에는 새 의뢰인 이력에 저장됐다. 의뢰인을 바꾸는 **사용자 동작(store 이벤트)** 에서 한 번 비운다 — `useEffect`로
 * store에 쓰는 미러링이 아니다(렌더 루프 없음). 결과가 있을 때만 비운다: 입력 도중 의뢰인을 바꿔도 사용자가 있던 단계는 유지한다.
 * 이 구독이 놓친 경로(결과를 다른 의뢰인 몫으로 직접 심은 경우)는 화면의 `resultClientId` 대조가 따로 막는다.
 */
useProfessionalStore.subscribe((state, prev) => {
  if (state.activeClientId === prev.activeClientId) return;
  const { result, surcharge } = useOneHouseJudgmentStore.getState();
  if (result !== null || surcharge.result !== null) {
    useOneHouseJudgmentStore.getState().discardResultForClientChange();
  }
});
