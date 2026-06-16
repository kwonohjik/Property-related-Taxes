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
import type { AssetForm, HouseEntry, PresaleRightEntry, PriorReductionUsageItem, SpecialHouseExclusionFormItem } from "./calc-wizard-asset";

export type {
  NblBusinessUsePeriod,
  ResidenceHistoryInput,
  GracePeriodInput,
  NblGracePeriodInput,
  HouseEntry,
  PresaleRightEntry,
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
   * 폼-수준 총 양도비 (지분 모드 자동 안분용, 선택).
   * 양도 시 1회 발생하는 부대비용(중개수수료·인지대 등)을 한 번만 입력.
   * 지분 모드에서 시스템이 자산별 ratio 비율로 자동 안분 (assets[i].transferExpense 우선 — 자산별 직접 입력이 있으면 우선).
   * 단독 소유는 자산-수준 transferExpense 그대로 사용.
   */
  totalTransferExpense: string;
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
  /**
   * 세대 보유 조합원입주권 수 (양도일 현재).
   * §89①4호 가목 1세대1입주권 비과세 판단 — "1" 고정 (사례 36).
   * right_to_move_in 자산 유형에서만 의미. 기본값 "0".
   */
  householdRightCount: string;
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
  /** 세대 보유 분양권·입주권 (2021.1.1 이후 취득분 주택 수 산입 — 소령 §167의11) */
  presaleRights: PresaleRightEntry[];
  sellingHouseRegion: "capital" | "non_capital";
  /**
   * 다주택 중과세 한시 유예 조건부 판정 (소령 §167의3 중과 한시 배제 2022.5.10~2026.5.9).
   * 폼-전역 단수 객체 — undefined면 유예 윈도우 blanket 판정, 객체면 정밀 조건 판정.
   * 3-state: undefined(미입력) / 객체(입력). 날짜는 폼 문자열(YYYY-MM-DD).
   */
  gracePeriod?: {
    contractDate: string;
    isLandPermitArea: boolean;
    hasTenantInResidence: boolean;
    areaDesignatedDate?: string;
  };
  /**
   * 양도(selling) 주택의 3주택+ 전용 중과배제 특례 (소령 §167의10 — 양도 주택 자체가 배제 항목 해당).
   * 양도 주택을 기술하므로 폼-전역. effectiveHouseCount≥3에서만 의미. 날짜·연수는 폼 문자열.
   */
  sellingHouseExclusion?: {
    /** 저당권 실행·채권변제 취득 (취득 후 3년 이내) */
    isMortgageExecution?: boolean;
    /** 사원용 주택 (10년 이상 무상 제공) */
    isEmployeeHousing?: boolean;
    freeProvisionYears?: string;
    /** 조세특례제한법 특례 적용 주택 */
    isTaxSpecialExemption?: boolean;
    /** 국가유산(문화재) 주택 */
    isCulturalHeritage?: boolean;
    /** 어린이집 운영 주택 (5년 이상) */
    isDayCareCenter?: boolean;
    dayCareOperationYears?: string;
  };

  // ── Step 4 (구 Step5): 감면·공제 ──
  /** 당해 연도 기사용 기본공제 (사람 단위, 연간 한도 250만원) */
  annualBasicDeductionUsed: string;
  /**
   * 인별 5년 합산 한도 산정용 과거 감면 이력 (조특법 §133).
   * 최근 4개 과세연도 사용분을 입력.
   */
  priorReductionUsage: PriorReductionUsageItem[];
  /** P5 모드 2 — 보유 감면주택 주택수 제외 (§89①3호 의제, 폼-전역) */
  specialHouseExclusions: SpecialHouseExclusionFormItem[];

  // appurtenantLandRateMode 필드 제거 (사례 28 landNature 명시 입력 정책으로 대체, 2026-05-07)
  // 자산-수준 landNature("appurtenant"|"standalone")가 폼-수준 모드 결정을 대체.
  // 엔진이 자산-수준 landNature를 읽어 자동 분기 — 사용자 수동 모드 선택 불필요.

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
  totalTransferExpense: "",
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
  householdRightCount: "0",
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
  presaleRights: [],
  sellingHouseRegion: "capital",
  annualBasicDeductionUsed: "0",
  priorReductionUsage: [],
  specialHouseExclusions: [],
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
  /** 겸용주택 모드 시 입력값으로 즉시 계산되는 미리보기 메타 */
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
  /**
   * 부담부증여 메타 — Phase 2 (2026-05-12)
   * 사이드바에 명시 라벨로 노출 (silent fallback 금지 원칙 ⑥).
   * B/C > 1 시 hasOvershoot=true 경고 배지.
   */
  burdenedGift?: {
    /** 인수 채무액 (= §159 양도가액) */
    assumedDebt: number;
    /** 채무비율 B/C */
    debtRatio: number;
    /** B/C > 1 (초과부담부) — 사이드바 경고 배지 + 다음 버튼 차단 */
    hasOvershoot: boolean;
    /** Phase 3: 증여세 결정세액 (수증자 자진납부세액) — result 도착 후 노출 */
    giftFinalTax?: number;
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
  // 자산이 모두 동일 물건의 지분 단계취득(ratio<1.0 자산 1개 이상)인 경우,
  // actualSalePrice는 UI에서 비활성(자동 계산 카드)이라 빈 문자열. 이때 양도가액 합계는
  // contractTotalPrice 그대로 사용 (이미 100% 기준 = 모든 지분의 합).
  const hasAnyFractional = formData.assets.some((a) => {
    const n = parseFloat(a.ownershipNumerator || "100");
    const d = parseFloat(a.ownershipDenominator || "100");
    return isFinite(n) && isFinite(d) && d > 0 && n > 0 && n < d;
  });
  const totalSalePrice = hasAnyFractional
    ? parseRaw(formData.contractTotalPrice)
    : formData.assets.reduce(
        (acc, a) => acc + parseRaw(a.actualSalePrice),
        0
      );
  // 취득가액 합계: 지분 모드 자산은 100% 기준 입력 × ratio 적용으로 합산
  // salesCase 모드는 similarSalesValue를 취득가액으로 사용
  const totalAcqPrice = formData.assets.reduce((acc, a) => {
    const raw = a.isSalesCaseAcquisition
      ? parseRaw(a.similarSalesValue)
      : parseRaw(a.fixedAcquisitionPrice);
    const n = parseFloat(a.ownershipNumerator || "100");
    const d = parseFloat(a.ownershipDenominator || "100");
    const fractional = isFinite(n) && isFinite(d) && d > 0 && n > 0 && n < d;
    return acc + (fractional ? Math.floor(raw * (n / d)) : raw);
  }, 0);
  // 필요경비 합계: 지분 모드 자산은 capex/transferExpense × ratio
  const totalNecessaryExpense = formData.assets.reduce((acc, a) => {
    const capExp = parseRaw(a.capitalExpenditure);
    const trExp = parseRaw(a.transferExpense);
    const splitTotal = capExp + trExp;
    const baseExp = splitTotal > 0 ? splitTotal : parseRaw(a.directExpenses);
    const n = parseFloat(a.ownershipNumerator || "100");
    const d = parseFloat(a.ownershipDenominator || "100");
    const fractional = isFinite(n) && isFinite(d) && d > 0 && n > 0 && n < d;
    return acc + (fractional ? Math.floor(baseExp * (n / d)) : baseExp);
  }, 0);
  const estimatedTax =
    result?.mode === "single"
      ? (result.result.totalTax ?? null)
      : result?.mode === "mixed-use"
        ? (result.result.total.totalPayable ?? null)
        : null;

  // 겸용주택 모드 — 입력값만으로 산출 가능한 메타
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

  // ── 부담부증여 메타 (Phase 2, 2026-05-12) ──
  // 사이드바 ⑥ 동기화: silent fallback 금지 원칙 — 채무액 직접 계산 + 명시 라벨.
  // B/C > 1 검출 시 hasOvershoot=true (사이드바 amber 배지 + 다음 버튼 차단 신호).
  let burdenedGift: TransferSummary["burdenedGift"];
  const isBurdenedGiftMeta = primary?.transferType === "burdened_gift";
  if (isBurdenedGiftMeta) {
    const lending = parseRaw(primary!.bgLendingDepositTotal);
    const mortgage = parseRaw(primary!.bgMortgageDebtAmount);
    const assumedDebt = lending + mortgage;
    // 증여가액 C (Max 평가) 추정 — UI 사전 검출용 간이 계산.
    // 시가 모드 시 marketValueAtTransfer 직접 사용. 기준시가 모드는 단순 보수적 계산.
    let approxValuation = 0;
    if (primary!.bgValuationMode === "sangjeungbeop_market") {
      approxValuation = parseRaw(primary!.bgMarketValueAtTransfer);
    } else {
      // 보충적 평가 추정: standardPriceAtTransfer (housing·building·land 단일) + bgMortgageSet/임대 보조
      const standard = parseRaw(primary!.standardPriceAtTransfer);
      const annualRent = parseRaw(primary!.bgAnnualRentTotal);
      const mortgageSet = primary!.bgMortgageSetAmount
        ? parseRaw(primary!.bgMortgageSetAmount)
        : mortgage;
      const rentalCap = annualRent > 0 ? Math.floor(annualRent / 0.12) : 0;
      const rentalVal = lending + rentalCap;
      const mortgageVal = lending + mortgageSet;
      approxValuation = Math.max(standard, mortgageVal, rentalVal);
    }
    const debtRatio = approxValuation > 0 ? assumedDebt / approxValuation : 0;
    // Phase 3: result에서 증여세 결정세액 추출 (도착 후만 노출).
    // single 모드(housing/land/building/commercial) + bundled 모드(일반건물) 양쪽 지원.
    const giftFinalTax =
      result?.mode === "single"
        ? result.result.transferBurdenedGiftBreakdown?.giftTax?.finalTax
        : result?.mode === "bundled"
          ? result.transferBurdenedGiftBreakdown?.giftTax?.finalTax
          : undefined;
    burdenedGift = {
      assumedDebt,
      debtRatio,
      hasOvershoot: approxValuation > 0 && assumedDebt > approxValuation,
      giftFinalTax: giftFinalTax && giftFinalTax > 0 ? giftFinalTax : undefined,
    };
  }

  return {
    totalSalePrice,
    totalAcqPrice,
    totalNecessaryExpense,
    netTransferIncome: totalSalePrice - totalAcqPrice - totalNecessaryExpense,
    estimatedTax,
    mixedUse,
    burdenedGift,
  };
}
