/**
 * 주식 평가 독립 도구 폼 store — /tools/stock-valuation.
 *
 * 세금 계산 마법사가 아닌 단일 화면 도구 → 경량 store(평가기준일 + 주식 목록)만.
 * sessionStorage persist로 새로고침·이력 복원(resume) 지원. result는 컴포넌트에서 useMemo 파생(미저장).
 *
 * Plan: docs/00-pm/stock-valuation-tool.plan.md
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

export interface StockValuationFormData {
  /** 평가기준일 (YYYY-MM-DD) — 상장주식 종가평균 조회·V2 evaluationDate fallback */
  valuationDate: string;
  /** 주식 목록 (listed_stock | unlisted_stock) */
  stockItems: EstateItem[];
}

export const INITIAL_STOCK_VALUATION_FORM: StockValuationFormData = {
  valuationDate: "",
  stockItems: [],
};

/**
 * 이력 복원·persist 역직렬화 시 형태 보정.
 * stockItems가 배열이 아니면 빈 배열, valuationDate가 문자열이 아니면 빈 문자열.
 */
export function normalizeStockValuationFormData(
  raw: unknown,
): StockValuationFormData {
  const r = (raw ?? {}) as Partial<StockValuationFormData>;
  return {
    valuationDate: typeof r.valuationDate === "string" ? r.valuationDate : "",
    stockItems: Array.isArray(r.stockItems) ? (r.stockItems as EstateItem[]) : [],
  };
}

interface StockValuationStore {
  formData: StockValuationFormData;
  setFormData: (patch: Partial<StockValuationFormData>) => void;
  reset: () => void;
}

export const useStockValuationStore = create<StockValuationStore>()(
  persist(
    (set) => ({
      formData: INITIAL_STOCK_VALUATION_FORM,
      setFormData: (patch) =>
        set((state) => ({ formData: { ...state.formData, ...patch } })),
      reset: () => set({ formData: INITIAL_STOCK_VALUATION_FORM }),
    }),
    {
      name: "stock-valuation-tool",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
