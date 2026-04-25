/**
 * 다건 양도소득세 마법사 전역 상태
 * zustand + sessionStorage persist (단건 calc-wizard-store와 완전 격리)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TransferFormData } from "./calc-wizard-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";

/** 건별 자산 항목 (TransferFormData + 식별자) */
export interface PropertyItem {
  propertyId: string;
  propertyLabel: string;
  form: TransferFormData;
  /** 건별 완성도 (0~100%) — UI 표시용 */
  completionPercent: number;
}

/** 4단계 플로우 */
export type MultiStep = "list" | "edit" | "settings" | "result";

export interface MultiTransferFormData {
  /** 과세기간 */
  taxYear: number;
  /** 자산 목록 */
  properties: PropertyItem[];
  /** 현재 편집 중인 자산 인덱스 */
  activePropertyIndex: number;
  /** 현재 4단계 중 활성 단계 */
  activeStep: MultiStep;
  // 공통 설정 (Step C)
  annualBasicDeductionUsed: string;
  basicDeductionAllocation: "MAX_BENEFIT" | "FIRST" | "EARLIEST_TRANSFER";
  // 가산세는 자산별로 입력 — 자산 form(TransferFormData)에 보관됨.
}

const defaultFormData: MultiTransferFormData = {
  taxYear: new Date().getFullYear(),
  properties: [],
  activePropertyIndex: 0,
  activeStep: "list",
  annualBasicDeductionUsed: "0",
  basicDeductionAllocation: "MAX_BENEFIT",
};

interface MultiTransferState {
  form: MultiTransferFormData;
  result: AggregateTransferResult | null;
  isCalculating: boolean;

  // 폼 업데이트
  setForm: (updates: Partial<MultiTransferFormData>) => void;

  // 자산 관리
  addProperty: (item: PropertyItem) => void;
  updateProperty: (index: number, item: Partial<PropertyItem>) => void;
  removeProperty: (index: number) => void;
  duplicateProperty: (index: number) => void;
  reorderProperties: (from: number, to: number) => void;
  setActiveProperty: (index: number) => void;

  // 단계 이동
  setStep: (step: MultiStep) => void;

  // 결과
  setResult: (result: AggregateTransferResult | null) => void;
  setIsCalculating: (v: boolean) => void;

  // 초기화
  reset: () => void;
}

let propertyCounter = 1;

function generatePropertyId(): string {
  return `prop-${Date.now()}-${propertyCounter++}`;
}

export const useMultiTransferStore = create<MultiTransferState>()(
  persist(
    (set, get) => ({
      form: defaultFormData,
      result: null,
      isCalculating: false,

      setForm: (updates) =>
        set((state) => ({ form: { ...state.form, ...updates } })),

      addProperty: (item) =>
        set((state) => ({
          form: {
            ...state.form,
            properties: [...state.form.properties, item],
          },
        })),

      updateProperty: (index, item) =>
        set((state) => {
          const properties = [...state.form.properties];
          properties[index] = { ...properties[index], ...item };
          return { form: { ...state.form, properties } };
        }),

      removeProperty: (index) =>
        set((state) => {
          const properties = state.form.properties.filter((_, i) => i !== index);
          const activePropertyIndex = Math.min(
            state.form.activePropertyIndex,
            Math.max(0, properties.length - 1),
          );
          return { form: { ...state.form, properties, activePropertyIndex } };
        }),

      duplicateProperty: (index) =>
        set((state) => {
          const original = state.form.properties[index];
          if (!original) return state;
          const copy: PropertyItem = {
            ...original,
            propertyId: generatePropertyId(),
            propertyLabel: `${original.propertyLabel} (복사)`,
          };
          const properties = [...state.form.properties];
          properties.splice(index + 1, 0, copy);
          return { form: { ...state.form, properties } };
        }),

      reorderProperties: (from, to) =>
        set((state) => {
          const properties = [...state.form.properties];
          const [item] = properties.splice(from, 1);
          properties.splice(to, 0, item);
          return { form: { ...state.form, properties } };
        }),

      setActiveProperty: (index) =>
        set((state) => ({ form: { ...state.form, activePropertyIndex: index } })),

      setStep: (step) =>
        set((state) => ({ form: { ...state.form, activeStep: step } })),

      setResult: (result) => set({ result }),
      setIsCalculating: (v) => set({ isCalculating: v }),

      reset: () => {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("multi-transfer-tax-wizard");
        }
        set({ form: defaultFormData, result: null, isCalculating: false });
      },
    }),
    {
      name: "multi-transfer-tax-wizard",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        form: state.form,
        // result 제외 (민감정보 + 직렬화 복잡도)
      }),
    },
  ),
);

export { generatePropertyId };
