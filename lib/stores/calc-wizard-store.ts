/**
 * 계산기 StepWizard 전역 상태
 * zustand + sessionStorage persist — 새로고침 시 입력 데이터 유지
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

/** 비사업용 토지 사업용 사용기간 항목 (폼 문자열 버전) */
export interface NblBusinessUsePeriod {
  startDate: string;
  endDate: string;
  usageType: string;
}

/** 다른 보유 주택 항목 (폼 문자열 버전) */
export interface HouseEntry {
  id: string;
  region: "capital" | "non_capital";
  acquisitionDate: string;
  officialPrice: string;
  isInherited: boolean;
  isLongTermRental: boolean;
  isApartment: boolean;
  isOfficetel: boolean;
  isUnsoldHousing: boolean;
}

export interface TransferFormData {
  // Step 1: 물건 유형
  propertyType: "housing" | "land" | "building" | "right_to_move_in" | "presale_right";
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
  standardPriceAtAcquisitionLabel: string;
  standardPriceAtTransferLabel: string;
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
  /** [I4] 신축/미분양 감면 지역 — 4값으로 확장 (outside_overconcentration: 수도권 과밀억제권역 외) */
  reductionRegion: "metropolitan" | "non_metropolitan" | "outside_overconcentration";
  annualBasicDeductionUsed: string;
  // Step 4: 일시적 2주택 특례
  temporaryTwoHouseSpecial: boolean;
  previousHouseAcquisitionDate: string;
  newHouseAcquisitionDate: string;
  // Step 4: 합가 특례 (P2)
  marriageDate: string;
  parentalCareMergeDate: string;
  // Step 4: 비사업용 토지 정밀 판정 (P0-A)
  nblLandType: string;
  nblLandArea: string;
  nblZoneType: string;
  nblFarmingSelf: boolean;
  nblFarmerResidenceDistance: string;
  nblBusinessUsePeriods: NblBusinessUsePeriod[];
  // Step 4: 다른 보유 주택 목록 (P0-B)
  houses: HouseEntry[];
  /** [C4] 양도 주택의 권역 구분 (수도권/지방) — isRegulatedArea와 별개 */
  sellingHouseRegion: "capital" | "non_capital";

  // §114조의2 가산세 판정용 필드
  /** 취득가 산정 방식 — "actual" = 실거래가, "estimated" = 환산취득가, "appraisal" = 감정가액 */
  acquisitionMethod: "actual" | "estimated" | "appraisal";
  /** 감정가액 (acquisitionMethod === "appraisal" 시 필수) */
  appraisalValue: string;
  /** 본인이 신축 또는 증축한 건물 여부 */
  isSelfBuilt: boolean;
  /** 신축/증축 구분: "new" = 신축, "extension" = 증축, "" = 미선택 */
  buildingType: "new" | "extension" | "";
  /** 신축일 또는 증축 완공일 */
  constructionDate: string;
  /** 증축 바닥면적 합계 (㎡) — buildingType === "extension" 시 필수 */
  extensionFloorArea: string;

  // Step 6: 가산세 (선택 입력)
  /** 가산세 계산 여부 토글 */
  enablePenalty: boolean;
  /** 신고 유형: none=무신고, under=과소신고, excess_refund=초과환급신고, correct=정상신고 */
  filingType: "none" | "under" | "excess_refund" | "correct";
  /** 부정행위 유형: normal=일반, fraudulent=부정행위, offshore_fraud=역외거래부정행위 */
  penaltyReason: "normal" | "fraudulent" | "offshore_fraud";
  /** 기납부세액 (예정신고 납부액 포함) */
  priorPaidTax: string;
  /** 당초 신고세액 (과소신고 시) */
  originalFiledTax: string;
  /** 초과환급신고 환급세액 */
  excessRefundAmount: string;
  /** 세법에 따른 이자상당액 가산액 */
  interestSurcharge: string;
  /** 미납·미달납부세액 (지연납부가산세용) */
  unpaidTax: string;
  /** 납부기한 */
  paymentDeadline: string;
  /** 실제 납부일 */
  actualPaymentDate: string;
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
  standardPriceAtAcquisitionLabel: "",
  standardPriceAtTransferLabel: "",
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
  marriageDate: "",
  parentalCareMergeDate: "",
  nblLandType: "",
  nblLandArea: "",
  nblZoneType: "",
  nblFarmingSelf: false,
  nblFarmerResidenceDistance: "",
  nblBusinessUsePeriods: [],
  houses: [],
  sellingHouseRegion: "capital",
  acquisitionMethod: "actual",
  appraisalValue: "",
  isSelfBuilt: false,
  buildingType: "",
  constructionDate: "",
  extensionFloorArea: "",
  enablePenalty: false,
  filingType: "correct",
  penaltyReason: "normal",
  priorPaidTax: "0",
  originalFiledTax: "0",
  excessRefundAmount: "0",
  interestSurcharge: "0",
  unpaidTax: "0",
  paymentDeadline: "",
  actualPaymentDate: "",
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
      // [I7] result(계산 결과)·pendingMigration은 sessionStorage 제외 — 민감정보 보호 + Date 직렬화 오류 방지
      partialize: (state) => ({
        currentStep: state.currentStep,
        formData: state.formData,
        pendingMigration: state.pendingMigration,
      }),
      // 저장된 상태에 새 필드가 없을 때 defaultFormData로 채움 (필드 추가 시 하위 호환)
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<CalcWizardState>),
        formData: {
          ...defaultFormData,
          ...((persisted as Partial<CalcWizardState>).formData ?? {}),
        },
      }),
    },
  ),
);
