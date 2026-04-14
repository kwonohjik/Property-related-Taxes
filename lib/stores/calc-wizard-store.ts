/**
 * 계산기 StepWizard 전역 상태
 * zustand + sessionStorage persist — 새로고침 시 입력 데이터 유지
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

export interface TransferFormData {
  // Step 1: 물건 유형
  propertyType: "housing" | "land" | "building";
  // Step 2: 양도 정보 + 소재지
  transferPrice: string;
  transferDate: string;
  /** 도로명 주소 (Vworld road) */
  propertyAddressRoad: string;
  /** 지번 주소 (Vworld parcel) */
  propertyAddressJibun: string;
  /** 건물명 (Vworld bldnm) */
  propertyBuildingName: string;
  /** 상세주소 (동/호수 등 사용자 직접 입력) */
  propertyAddressDetail: string;
  /** 경도 (Vworld point.x) */
  propertyLongitude: string;
  /** 위도 (Vworld point.y) */
  propertyLatitude: string;
  // Step 3: 취득 정보
  acquisitionPrice: string;
  acquisitionDate: string;
  expenses: string;
  useEstimatedAcquisition: boolean;
  standardPriceAtAcquisition: string;
  standardPriceAtTransfer: string;
  // Step 4: 보유 상황
  isOneHousehold: boolean;
  householdHousingCount: string;
  residencePeriodMonths: string;
  isRegulatedArea: boolean;
  wasRegulatedAtAcquisition: boolean;
  isUnregistered: boolean;
  isNonBusinessLand: boolean;
  // Step 5: 감면 확인
  reductionType: "" | "self_farming" | "long_term_rental" | "new_housing" | "unsold_housing";
  farmingYears: string;
  rentalYears: string;
  rentIncreaseRate: string;
  reductionRegion: "metropolitan" | "non_metropolitan";
  annualBasicDeductionUsed: string;
  // Step 4: 일시적 2주택 특례
  temporaryTwoHouseSpecial: boolean;
  previousHouseAcquisitionDate: string;
  newHouseAcquisitionDate: string;
}

const defaultFormData: TransferFormData = {
  propertyType: "housing",
  transferPrice: "",
  transferDate: "",
  propertyAddressRoad: "",
  propertyAddressJibun: "",
  propertyBuildingName: "",
  propertyAddressDetail: "",
  propertyLongitude: "",
  propertyLatitude: "",
  acquisitionPrice: "",
  acquisitionDate: "",
  expenses: "0",
  useEstimatedAcquisition: false,
  standardPriceAtAcquisition: "",
  standardPriceAtTransfer: "",
  isOneHousehold: true,
  householdHousingCount: "1",
  residencePeriodMonths: "0",
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  reductionType: "",
  farmingYears: "0",
  rentalYears: "0",
  rentIncreaseRate: "0",
  reductionRegion: "metropolitan",
  annualBasicDeductionUsed: "0",
  temporaryTwoHouseSpecial: false,
  previousHouseAcquisitionDate: "",
  newHouseAcquisitionDate: "",
};

interface CalcWizardState {
  currentStep: number;
  formData: TransferFormData;
  result: TransferTaxResult | null;
  /** 비로그인 상태에서 계산 후 로그인 전환 시 이관할 대기 결과 */
  pendingMigration: boolean;
  setStep: (step: number) => void;
  updateFormData: (data: Partial<TransferFormData>) => void;
  setResult: (result: TransferTaxResult) => void;
  /** 비로그인 → 로그인 이관 완료 후 플래그 초기화 */
  clearPendingMigration: () => void;
  reset: () => void;
}

export const useCalcWizardStore = create<CalcWizardState>()(
  persist(
    (set) => ({
      currentStep: 0,
      formData: defaultFormData,
      result: null,
      pendingMigration: false,
      setStep: (step) => set({ currentStep: step }),
      updateFormData: (data) =>
        set((state) => ({ formData: { ...state.formData, ...data } })),
      setResult: (result) => set({ result, pendingMigration: true }),
      clearPendingMigration: () => set({ pendingMigration: false }),
      reset: () => {
        // sessionStorage persist 키도 함께 제거하여 새로고침 후 이전 입력값 재출현 방지
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("transfer-tax-wizard");
        }
        set({ currentStep: 0, formData: defaultFormData, result: null, pendingMigration: false });
      },
    }),
    {
      name: "transfer-tax-wizard",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") return sessionStorage;
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
    },
  ),
);
