/**
 * 계산기 StepWizard 전역 상태
 * zustand + sessionStorage persist — 새로고침 시 입력 데이터 유지
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import { migrateLegacyForm } from "./calc-wizard-migration";
import {
  makeDefaultAsset,
  migrateAsset,
} from "./calc-wizard-asset";
import type { AssetForm, HouseEntry, PriorReductionUsageItem } from "./calc-wizard-asset";

export type {
  NblBusinessUsePeriod,
  ResidenceHistoryInput,
  GracePeriodInput,
  HouseEntry,
  AssetReductionForm,
  ReductionType,
  PriorReductionUsageItem,
  ParcelFormItem,
  AssetForm,
  CompanionAssetForm,
} from "./calc-wizard-asset";

export {
  makeDefaultAsset,
  makeDefaultCompanionAsset,
  migrateAsset,
  migrateParcel,
} from "./calc-wizard-asset";

function parseRaw(v: string | undefined): number {
  return parseInt((v ?? "").replace(/[^0-9]/g, "") || "0", 10);
}

export interface TransferFormData {
  // ── Step 1: 자산 목록 + 양도 기본 정보 ──
  /** 모든 양도 자산 (최소 1건). assets[0]이 대표 자산. */
  assets: AssetForm[];
  /** 계약서 단위 총 양도가액 (모든 자산 합계) */
  contractTotalPrice: string;
  /**
   * 일괄양도 양도가액 결정 모드 (계약서 단위 단일 결정).
   * - "actual": 계약서에 자산별 가액이 구분 기재된 경우 (§166⑥ 본문)
   * - "apportioned": 구분 불분명 → 기준시가 비율 안분 (§166⑥ 단서)
   */
  bundledSaleMode: "actual" | "apportioned";
  /** 양도일 (YYYY-MM-DD) */
  transferDate: string;
  /** 양도소득세 신고일 (YYYY-MM-DD) */
  filingDate: string;

  // ── Step 2 (구 Step3 잔여): 대표 자산 고급 취득 정보 ──
  /** 대표 자산 취득가 산정 방식 (3지선다 — assets[0].useEstimatedAcquisition 과 동기화) */
  acquisitionMethod: "actual" | "estimated" | "appraisal";
  appraisalValue: string;
  isSelfBuilt: boolean;
  buildingType: "new" | "extension" | "";
  constructionDate: string;
  extensionFloorArea: string;
  pre1990Enabled: boolean;
  pre1990PricePerSqm_1990: string;
  pre1990PricePerSqm_atTransfer: string;
  pre1990Grade_current: string;
  pre1990Grade_prev: string;
  pre1990Grade_atAcq: string;
  pre1990GradeMode: "number" | "value";

  // ── Step 3 (구 Step4): 보유 상황 (세대·납세자 단위) ──
  isOneHousehold: boolean;
  householdHousingCount: string;
  residencePeriodMonths: string;
  isRegulatedArea: boolean;
  wasRegulatedAtAcquisition: boolean;
  isUnregistered: boolean;
  temporaryTwoHouseSpecial: boolean;
  previousHouseAcquisitionDate: string;
  newHouseAcquisitionDate: string;
  marriageDate: string;
  parentalCareMergeDate: string;
  houses: HouseEntry[];
  sellingHouseRegion: "capital" | "non_capital";

  // ── Step 4 (구 Step5): 감면·공제 ──
  /** 당해 연도 기사용 기본공제 (사람 단위, 연간 한도 250만원) */
  annualBasicDeductionUsed: string;
  /**
   * 인별 5년 합산 한도 산정용 과거 감면 이력 (조특법 §133).
   * 최근 4개 과세연도 사용분을 입력.
   */
  priorReductionUsage: PriorReductionUsageItem[];

  // ── Step 5 (가산세) ──
  enablePenalty: boolean;
  filingType: "none" | "under" | "excess_refund" | "correct";
  penaltyReason: "normal" | "fraudulent" | "offshore_fraud";
  priorPaidTax: string;
  originalFiledTax: string;
  excessRefundAmount: string;
  interestSurcharge: string;
  unpaidTax: string;
  paymentDeadline: string;
  actualPaymentDate: string;
}

const defaultFormData: TransferFormData = {
  assets: [makeDefaultAsset(1)],
  contractTotalPrice: "",
  bundledSaleMode: "apportioned",
  transferDate: "",
  filingDate: "",
  acquisitionMethod: "actual",
  appraisalValue: "",
  isSelfBuilt: false,
  buildingType: "",
  constructionDate: "",
  extensionFloorArea: "",
  pre1990Enabled: false,
  pre1990PricePerSqm_1990: "",
  pre1990PricePerSqm_atTransfer: "",
  pre1990Grade_current: "",
  pre1990Grade_prev: "",
  pre1990Grade_atAcq: "",
  pre1990GradeMode: "number",
  isOneHousehold: true,
  householdHousingCount: "1",
  residencePeriodMonths: "0",
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  temporaryTwoHouseSpecial: false,
  previousHouseAcquisitionDate: "",
  newHouseAcquisitionDate: "",
  marriageDate: "",
  parentalCareMergeDate: "",
  houses: [],
  sellingHouseRegion: "capital",
  annualBasicDeductionUsed: "0",
  priorReductionUsage: [],
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

/** defaultFormData를 복사하여 반환하는 팩토리 (MultiTransferTaxCalculator 등 외부에서 사용) */
export function createDefaultTransferFormData(): TransferFormData {
  return {
    ...defaultFormData,
    assets: [makeDefaultAsset(1)],
  };
}

interface CalcWizardState {
  currentStep: number;
  formData: TransferFormData;
  result: TransferAPIResult | null;
  pendingMigration: boolean;
  setStep: (step: number) => void;
  updateFormData: (data: Partial<TransferFormData>) => void;
  setResult: (result: TransferAPIResult) => void;
  clearPendingMigration: () => void;
  reset: () => void;
}

export interface TransferSummary {
  totalSalePrice: number;
  totalAcqPrice: number;
  totalNecessaryExpense: number;
  netTransferIncome: number;
  estimatedTax: number | null;
  /** 검용주택 모드 시 입력값으로 즉시 계산되는 미리보기 메타 */
  mixedUse?: {
    /** 주택연면적 비율 (0~1) */
    housingRatio: number;
    /** 주택부수토지 면적 (㎡) */
    residentialLandArea: number;
    /** 상가부수토지 면적 (㎡) */
    commercialLandArea: number;
    /** 주택부분 양도가액 (안분 후) — 기준시가 모두 입력된 경우만 */
    housingTransferPrice: number | null;
    /** 상가부분 양도가액 (안분 후) — 기준시가 모두 입력된 경우만 */
    commercialTransferPrice: number | null;
  };
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
      partialize: (state) => ({
        currentStep: state.currentStep,
        formData: state.formData,
        pendingMigration: state.pendingMigration,
      }),
      merge: (persisted, current) => {
        const ps = persisted as Partial<CalcWizardState>;
        const legacyForm = ps.formData as Record<string, unknown> | undefined;

        let formData: TransferFormData;
        if (
          legacyForm &&
          (
            "propertyType" in legacyForm ||
            "companionAssets" in legacyForm ||
            "propertyAddressRoad" in legacyForm ||
            "reductionType" in legacyForm ||
            "parcelMode" in legacyForm ||
            "acquisitionMethod" in legacyForm ||
            "appraisalValue" in legacyForm ||
            "isSelfBuilt" in legacyForm ||
            "pre1990Enabled" in legacyForm
          )
        ) {
          formData = migrateLegacyForm(legacyForm, defaultFormData);
        } else {
          formData = {
            ...defaultFormData,
            ...(ps.formData ?? {}),
            assets: ((ps.formData as TransferFormData | undefined)?.assets ?? [makeDefaultAsset(1)]).map(migrateAsset),
          };
        }

        const STEP_MIGRATION: Record<number, number> = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
        const persistedStep = ps.currentStep ?? 0;
        const migratedStep = STEP_MIGRATION[persistedStep] ?? Math.min(persistedStep, 4);

        return { ...current, ...ps, formData, currentStep: migratedStep };
      },
    },
  ),
);

/** useMemo 없이 사용하면 매 렌더마다 새 객체가 생성되어 무한 루프 발생.
 *  TransferTaxCalculator 에서 useMemo(() => computeTransferSummary(...), [formData, result]) 패턴으로 사용할 것. */
export function computeTransferSummary(
  formData: TransferFormData,
  result: import("@/lib/calc/transfer-tax-api").TransferAPIResult | null
): TransferSummary {
  const totalSalePrice = formData.assets.reduce(
    (acc, a) => acc + parseRaw(a.actualSalePrice),
    0
  );
  const totalAcqPrice = formData.assets.reduce(
    (acc, a) => acc + parseRaw(a.fixedAcquisitionPrice),
    0
  );
  const totalNecessaryExpense = formData.assets.reduce(
    (acc, a) => acc + parseRaw(a.directExpenses),
    0
  );
  const estimatedTax =
    result?.mode === "single"
      ? (result.result.totalTax ?? null)
      : result?.mode === "mixed-use"
        ? (result.result.total.totalPayable ?? null)
        : null;

  // 검용주택 모드 — 입력값만으로 산출 가능한 메타
  const primary = formData.assets[0];
  let mixedUse: TransferSummary["mixedUse"];
  if (primary?.assetKind === "housing" && primary.isMixedUseHouse) {
    const residentialFloor = parseFloat(primary.residentialFloorArea || "0") || 0;
    const commercialFloor = parseFloat(primary.nonResidentialFloorArea || "0") || 0;
    const totalLand = parseFloat(primary.mixedUseTotalLandArea || "0") || 0;
    const totalFloor = residentialFloor + commercialFloor;
    const housingRatioByArea = totalFloor > 0 ? residentialFloor / totalFloor : 0;
    // 소수점 2자리 반올림 — 화면 표시와 계산값 일치
    const residentialLandArea = parseFloat((totalLand * housingRatioByArea).toFixed(2));
    const commercialLandArea = parseFloat((totalLand - residentialLandArea).toFixed(2));

    // 양도가액 안분: 기준시가 합계 비율
    const housingStdPrice = parseRaw(primary.mixedTransferHousingPrice);
    const transferLandPerSqm = parseRaw(primary.mixedTransferLandPricePerSqm);
    const transferCommercialBuilding = parseRaw(primary.mixedTransferCommercialBuildingPrice);
    const commercialStdPrice =
      Math.floor(transferLandPerSqm * commercialLandArea) + transferCommercialBuilding;
    const totalStd = housingStdPrice + commercialStdPrice;
    const transferPrice = parseRaw(primary.actualSalePrice);

    let housingTransferPrice: number | null = null;
    let commercialTransferPrice: number | null = null;
    if (totalStd > 0 && transferPrice > 0) {
      const ratio = housingStdPrice / totalStd;
      housingTransferPrice = Math.floor(transferPrice * ratio);
      commercialTransferPrice = transferPrice - housingTransferPrice;
    }

    mixedUse = {
      housingRatio: housingRatioByArea,
      residentialLandArea,
      commercialLandArea,
      housingTransferPrice,
      commercialTransferPrice,
    };
  }

  return {
    totalSalePrice,
    totalAcqPrice,
    totalNecessaryExpense,
    netTransferIncome: totalSalePrice - totalAcqPrice - totalNecessaryExpense,
    estimatedTax,
    mixedUse,
  };
}
