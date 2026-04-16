/**
 * 종합부동산세 계산기 StepWizard 전역 상태 (T-13)
 * zustand + sessionStorage persist — 새로고침 시 입력 데이터 유지
 * result는 partialize 제외 (민감정보 + Date 직렬화 오류 방지)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ComprehensiveTaxResult } from "@/lib/tax-engine/types/comprehensive.types";

// ============================================================
// 개별 주택 폼 항목 (문자열 기반)
// ============================================================

export interface PropertyEntry {
  id: string;                      // 임시 식별자 (uuid 대신 타임스탬프)
  assessedValue: string;           // 공시가격 (원, 문자열 — CurrencyInput 호환)
  area: string;                    // 전용면적 (㎡)
  location: "metro" | "non_metro"; // 수도권 여부
  exclusionType: string;           // 합산배제 유형
  // ── 소재지 (공시가격 조회용) ──
  jibun: string;                   // 지번 주소
  road: string;                    // 도로명 주소
  building: string;                // 건물명
  dong: string;                    // 동 (공동주택)
  ho: string;                      // 호수 (공동주택)
  // ── 임대주택 합산배제 상세 ──
  rentalRegistrationType: string;
  rentalRegistrationDate: string;  // YYYY-MM-DD
  rentalStartDate: string;         // YYYY-MM-DD
  currentRent: string;             // 현재 임대료 (원)
  previousRent: string;            // 직전 임대료 (원)
  isInitialContract: boolean;
  // ── 기타 합산배제 상세 ──
  recruitmentNoticeDate: string;   // 미분양: 입주자모집공고일
  acquisitionDate: string;         // 미분양: 취득일
  isFirstSale: boolean;
  hasDaycarePermit: boolean;
  isActuallyUsedAsDaycare: boolean;
  isProvidedToEmployee: boolean;
  rentalFeeRate: string;           // 사원용: 임대료율 (%)
}

// ============================================================
// 종합합산 토지 폼 항목
// ============================================================

export interface AggregateLandForm {
  totalOfficialValue: string;   // 공시지가 합산 (원)
  propertyTaxBase: string;      // 재산세 과세표준 (원)
  propertyTaxAmount: string;    // 재산세 부과세액 (원)
  previousYearTotalTax: string; // 전년도 세액 (원, 선택)
}

// ============================================================
// 별도합산 토지 폼 항목
// ============================================================

export interface SeparateLandEntry {
  id: string;
  publicPrice: string;       // 개별공시지가 × 면적 (원)
  propertyTaxBase: string;   // 재산세 과세표준 (원)
  propertyTaxAmount: string; // 재산세 부과세액 (원)
}

// ============================================================
// 전체 폼 상태
// ============================================================

export interface ComprehensiveFormData {
  // ── Step 1: 기본 정보 ──
  assessmentYear: string;          // 과세연도 (숫자 입력용 문자열)
  isOneHouseOwner: boolean;
  birthDate: string;               // 생년월일 YYYY-MM-DD (고령자 공제용)
  acquisitionDate: string;         // 최초 취득일 YYYY-MM-DD (장기보유 공제용)

  // ── Step 2: 주택 목록 ──
  properties: PropertyEntry[];

  // ── Step 4: 토지 정보 ──
  hasAggregateLand: boolean;       // 종합합산 토지 보유 여부
  landAggregate: AggregateLandForm;
  hasSeparateLand: boolean;        // 별도합산 토지 보유 여부
  landSeparate: SeparateLandEntry[];

  // ── Step 5: 세부담 상한 ──
  isMultiHouseInAdjustedArea: boolean;
  previousYearTotalTax: string;    // 전년도 종부세+재산세 합계 (원)
}

function makeProperty(): PropertyEntry {
  return {
    id: String(Date.now()) + String(Math.random()).slice(2, 6),
    assessedValue: "",
    area: "",
    location: "metro",
    exclusionType: "none",
    jibun: "",
    road: "",
    building: "",
    dong: "",
    ho: "",
    rentalRegistrationType: "private_purchase_long",
    rentalRegistrationDate: "",
    rentalStartDate: "",
    currentRent: "",
    previousRent: "",
    isInitialContract: true,
    recruitmentNoticeDate: "",
    acquisitionDate: "",
    isFirstSale: true,
    hasDaycarePermit: false,
    isActuallyUsedAsDaycare: false,
    isProvidedToEmployee: false,
    rentalFeeRate: "",
  };
}

const DEFAULT_LAND_AGGREGATE: AggregateLandForm = {
  totalOfficialValue: "",
  propertyTaxBase: "",
  propertyTaxAmount: "",
  previousYearTotalTax: "",
};

const defaultFormData: ComprehensiveFormData = {
  assessmentYear: String(new Date().getFullYear()),
  isOneHouseOwner: false,
  birthDate: "",
  acquisitionDate: "",
  properties: [makeProperty()],
  hasAggregateLand: false,
  landAggregate: { ...DEFAULT_LAND_AGGREGATE },
  hasSeparateLand: false,
  landSeparate: [],
  isMultiHouseInAdjustedArea: false,
  previousYearTotalTax: "",
};

// ============================================================
// 스토어 인터페이스
// ============================================================

interface ComprehensiveWizardState {
  currentStep: number;
  formData: ComprehensiveFormData;
  result: ComprehensiveTaxResult | null;

  // ── 네비게이션 ──
  setStep: (step: number) => void;

  // ── 폼 전체 업데이트 ──
  updateFormData: (data: Partial<ComprehensiveFormData>) => void;

  // ── 주택 목록 액션 ──
  addProperty: () => void;
  removeProperty: (id: string) => void;
  updateProperty: (id: string, data: Partial<PropertyEntry>) => void;

  // ── 별도합산 토지 목록 액션 ──
  addSeparateLand: () => void;
  removeSeparateLand: (id: string) => void;
  updateSeparateLand: (id: string, data: Partial<SeparateLandEntry>) => void;

  // ── 결과 ──
  setResult: (result: ComprehensiveTaxResult | null) => void;

  // ── 초기화 ──
  reset: () => void;
}

// ============================================================
// 스토어 생성
// ============================================================

export const useComprehensiveWizardStore = create<ComprehensiveWizardState>()(
  persist(
    (set) => ({
      currentStep: 0,
      formData: defaultFormData,
      result: null,

      setStep: (step) => set({ currentStep: step }),

      updateFormData: (data) =>
        set((state) => ({ formData: { ...state.formData, ...data } })),

      addProperty: () =>
        set((state) => ({
          formData: {
            ...state.formData,
            properties: [...state.formData.properties, makeProperty()],
          },
        })),

      removeProperty: (id) =>
        set((state) => ({
          formData: {
            ...state.formData,
            properties: state.formData.properties.filter((p) => p.id !== id),
          },
        })),

      updateProperty: (id, data) =>
        set((state) => ({
          formData: {
            ...state.formData,
            properties: state.formData.properties.map((p) =>
              p.id === id ? { ...p, ...data } : p,
            ),
          },
        })),

      addSeparateLand: () =>
        set((state) => ({
          formData: {
            ...state.formData,
            landSeparate: [
              ...state.formData.landSeparate,
              {
                id: String(Date.now()) + String(Math.random()).slice(2, 5),
                publicPrice: "",
                propertyTaxBase: "",
                propertyTaxAmount: "",
              },
            ],
          },
        })),

      removeSeparateLand: (id) =>
        set((state) => ({
          formData: {
            ...state.formData,
            landSeparate: state.formData.landSeparate.filter((l) => l.id !== id),
          },
        })),

      updateSeparateLand: (id, data) =>
        set((state) => ({
          formData: {
            ...state.formData,
            landSeparate: state.formData.landSeparate.map((l) =>
              l.id === id ? { ...l, ...data } : l,
            ),
          },
        })),

      setResult: (result) => set({ result }),

      reset: () => {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("comprehensive-tax-wizard");
        }
        set({ currentStep: 0, formData: defaultFormData, result: null });
      },
    }),
    {
      name: "comprehensive-tax-wizard",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") return sessionStorage;
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      // result는 sessionStorage 제외 — 민감정보 보호 + Date 직렬화 오류 방지
      partialize: (state) => ({
        currentStep: state.currentStep,
        formData: state.formData,
      }),
    },
  ),
);

export { makeProperty };
