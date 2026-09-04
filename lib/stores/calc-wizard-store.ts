/**
 * 계산기 StepWizard 전역 상태
 * zustand + sessionStorage persist — 새로고침 시 입력 데이터 유지
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import { computeDerivedAreas } from "@/lib/tax-engine/mixed-use-derived-areas";
import { calculateEstimatedAcquisitionPrice, computeEstimatedDeduction, applyRatio } from "@/lib/tax-engine/tax-utils";
import { migrateLegacyForm, migrateGracePeriod } from "./calc-wizard-migration";
import {
  makeDefaultAsset,
  migrateAsset,
} from "./calc-wizard-asset";
import type { AssetForm, HouseEntry, PresaleRightEntry, PriorReductionUsageItem, SpecialHouseExclusionFormItem } from "./calc-wizard-asset";
import { isSeparateAcquisition, separateAcqPartsSum } from "@/lib/calc/transfer-tax-split-acq-mode";

export type {
  AssetForm,
  HouseEntry,
  PresaleRightEntry,
  PriorReductionUsageItem,
  SpecialHouseExclusionFormItem,
  NblBusinessUsePeriod,
  ResidenceHistoryInput,
  GracePeriodInput,
  NblGracePeriodInput,
  AssetReductionForm,
  ReductionType,
  ParcelFormItem,
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

// ─── 폼 타입 — calc-wizard-form.types.ts로 분리 (800줄 정책, 재export 호환) ───
export type { TransferFormData } from "./calc-wizard-form.types";
import type { TransferFormData } from "./calc-wizard-form.types";

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
  isRegulatedAreaTouched: false,
  wasRegulatedAtAcquisitionTouched: false,
  isUnregistered: false,
  temporaryTwoHouseSpecial: false,
  newHouseAcquisitionDate: "",
  publicInstitutionRelocation: false,
  relocatedInstitutionJibun: "",
  relocatedSigunguCode: "",
  newHouseJibun: "",
  newHouseSigunguCode: "",
  disposalDelayReason: "",
  unavoidableOutsideCapitalSpecial: false,
  unavoidableOutsideCapitalReason: "work",
  unavoidableOutsideCapitalResolvedDate: "",
  ruralHouseSpecial: false,
  ruralHouseKind: "inherited",
  ruralHouseOutsideCapitalEupMyeon: false,
  ruralHouseJibun: "",
  ruralHouseRegionCode: "",
  ruralHouseLocationTouched: false,
  ruralHouseDecedentResidenceYears: "",
  ruralHouseOwnerResidenceYears: "",
  ruralHouseAcquisitionDate: "",
  ruralHouseHighPriceAtAcquisition: false,
  ruralHouseLandAreaSqm: "",
  ruralHouseWholeHouseholdMoved: false,
  replacementHouseSpecial: false,
  replBusinessApprovalDate: "",
  replCompletionDate: "",
  replResidenceMonths: "",
  replWillResideNewHouse: false,
  rightThreeYearExceptionKind: "",
  rightNewHouseCompletionDate: "",
  rightMovedInWithin3Years: false,
  rightResidedOneYearOrMore: false,
  rightDisposalDelayReason: "",
  rightDisposedByThatMethod: false,
  mergedHouseholdFirstHouseKind: "",
  mergedHouseholdAcquiredAfterApproval: false,
  mergedHouseholdResidedOneYear: false,
  mergedHouseholdOwnedBeforeRight: false,
  marriageDate: "",
  culturalHeritageHouseSpecial: false,
  isFirstTransferredInMerge: false,
  generalHouseGiftedFromDecedentWithin2yr: false,
  generalHouseHeldAtInheritance: false,
  inheritedRightChoiceWhenBothHeld: "",
  parentalCareMergeDate: "",
  provisoReason: "",
  provisoDepartureDate: "",
  provisoExpropriationDate: "",
  provisoBusinessApprovalDate: "",
  provisoPreContractNoHouse: false,
  houses: [],
  presaleRights: [],
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
  fraudulentPortion: "",   // 빈값 = 전액 부정(종전 동작)
  lateFilingNotified: false, // 기본 = 감면 적용(§48②2호·3호라목). 배제는 예외다.
  unpaidTax: "0",
  paymentDeadline: "",
  actualPaymentDate: "",
  amendmentMode: false,
  originalDeterminedTax: "",
  amendmentSourceId: "",
  statutoryFilingDeadline: "",
  amendedFilingDate: "",
  applyUnderReportingPenalty: false,
  underReportingReason: "normal",
  underReductionMode: "exempt",
  priorAssessmentNotified: false,
  applyLatePaymentPenalty: false,
  amendedPaymentDate: "",
  correctionKind: "amend",
  claimReasonType: "ordinary",
  posteriorEventDate: "",
  originalPaymentDate: "",
};


/** defaultFormData를 복사하여 반환하는 팩토리 (MultiTransferTaxCalculator 등 외부에서 사용) */
export function createDefaultTransferFormData(): TransferFormData {
  return {
    ...defaultFormData,
    assets: [makeDefaultAsset(1)],
  };
}

export interface CalcWizardState {
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

/**
 * persist rehydration 병합 — **구 스키마 판별은 `assets` 배열 유무로만** 한다.
 *
 * ## 왜 키 화이트리스트를 쓰면 안 되는가 (2026-07-28 정정, 원 보고 2026-07-14)
 *
 * 종전에는 `"acquisitionMethod" in form || "appraisalValue" in form || …` 9개 키 중 하나라도
 * 있으면 구 스키마로 보고 `migrateLegacyForm`을 돌렸다. 그런데 그 키들 중 **4개
 * (`acquisitionMethod`·`appraisalValue`·`isSelfBuilt`·`pre1990Enabled`)가 현행
 * `defaultFormData`에 그대로 남아 있다** — 자산-수준 통합(2026-04-25) 후 deprecated로만 표시되고
 * 필드 자체는 유지됐기 때문이다.
 *
 * 결과: **모든 신 스키마 폼이 구 스키마로 오분류**돼 새로고침(F5)마다 마이그레이션이 돌고
 * 입력한 자산이 전부 소실됐다. 실측(현행 master):
 *
 *     자산 2개(상가 3억 + 토지 2억) → **1개(빈 주택)** · contractTotalPrice 10억 → ""
 *
 * sessionStorage raw JSON은 정상 보존돼 있었다 — 순수 rehydration 결함이다.
 * 완료된 계산은 IndexedDB 이력에 별도 저장되므로 영향 범위는 **진행 중 마법사 폼**이다.
 *
 * → 판별을 **구조 기반**(`!Array.isArray(assets)`)으로 바꾼다. 신 스키마는 정의상 항상 `assets`
 *   배열을 갖고 구 스키마는 갖지 않으므로, deprecated 필드가 남아 있든 말든 영향받지 않는다.
 *   키 목록을 늘리는 방식으로 되돌리지 말 것 — 스키마가 바뀔 때마다 같은 결함이 재발한다.
 *
 * export하는 이유는 **테스트 가능성**이다(인라인 클로저는 단위 검증이 불가능했다).
 */
export function mergePersistedWizard(
  persisted: unknown,
  current: CalcWizardState,
): CalcWizardState {
  const ps = persisted as Partial<CalcWizardState>;
  const legacyForm = ps.formData as Record<string, unknown> | undefined;

  let formData: TransferFormData;
  if (legacyForm && !Array.isArray(legacyForm.assets)) {
    formData = migrateLegacyForm(legacyForm, defaultFormData);
  } else {
    formData = {
      ...defaultFormData,
      ...(ps.formData ?? {}),
      assets: ((ps.formData as TransferFormData | undefined)?.assets ?? [makeDefaultAsset(1)]).map(migrateAsset),
    };
  }

  // gracePeriod 구 필드(isLandPermitArea) → 신규 isLandPermitTarget 의미 승계 이전
  formData = { ...formData, gracePeriod: migrateGracePeriod(formData.gracePeriod) };

  // currentStep은 복원하지 않고 항상 0 — 구 sessionStorage에 남은 잔존값을 무시.
  return { ...current, ...ps, formData, currentStep: 0 };
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
      // currentStep은 persist하지 않음 — 홈 재진입·새로고침 시 항상 첫 스텝부터 시작.
      partialize: (state) => ({
        formData: state.formData,
        pendingMigration: state.pendingMigration,
      }),
      merge: mergePersistedWizard,
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
    // 별개 취득(토지·건물 취득시기 상이): 자산 전체 취득가액 입력이 UI에서 숨겨지므로
    // 파트 합계로 대체한다. 미확정 파트(환산·미입력)가 있으면 0 — 부분합을 합계로
    // 표시하면 총액으로 오독된다(feedback_engine_result_display_drift).
    const sep = isSeparateAcquisition(a) ? separateAcqPartsSum(a) : null;
    const raw = sep
      ? (sep.pending ? 0 : sep.sum)
      : a.isSalesCaseAcquisition
      ? parseRaw(a.similarSalesValue)
      : a.useEstimatedAcquisition
        ? // 환산취득가 = 양도가액 × (취득기준시가 ÷ 양도기준시가) — 엔진 단일소스(BigInt 가드).
          // std 2값 + 양도가 입력되면 result 이전에도 즉시 산출.
          calculateEstimatedAcquisitionPrice(
            parseRaw(a.actualSalePrice),
            parseRaw(a.standardPriceAtAcq),
            parseRaw(a.standardPriceAtTransfer),
          )
        : parseRaw(a.fixedAcquisitionPrice);
    const n = parseFloat(a.ownershipNumerator || "100");
    const d = parseFloat(a.ownershipDenominator || "100");
    const fractional = isFinite(n) && isFinite(d) && d > 0 && n > 0 && n < d;
    return acc + (fractional ? Math.floor(raw * (n / d)) : raw);
  }, 0);
  // 필요경비 합계: 지분 모드 자산은 capex/transferExpense × ratio
  const totalNecessaryExpense = formData.assets.reduce((acc, a) => {
    const n = parseFloat(a.ownershipNumerator || "100");
    const d = parseFloat(a.ownershipDenominator || "100");
    const fractional = isFinite(n) && isFinite(d) && d > 0 && n > 0 && n < d;
    const ratio = fractional ? n / d : 1;

    let baseExp: number;
    if (a.useEstimatedAcquisition || a.isAppraisalAcquisition) {
      // 환산·감정 모드: 실경비(capex/양도비) 대신 개산공제(§163⑥ = 취득 당시 기준시가 × 3%,
      // 미등기 0.3%)를 즉시 산출 — result 도착 전에도 표시 가능.
      //
      // ⚠️ 산출을 **엔진 헬퍼에 위임**한다. 지분 모드에서 절사 순서가 갈리면
      //    사이드바 미리보기와 엔진 결과가 1원 어긋난다(실측 0.96%). 종전 이 자리는
      //    `floor(std × rate)` 후 아래에서 `floor(× 지분)`으로 **율을 먼저** 적용했으나,
      //    엔진 정본은 순서 A(`floor(floor(std × 지분) × rate)`)다.
      //    → 여기서 지분까지 적용하고 하단 공통 지분 적용은 건너뛴다.
      const rate = formData.isUnregistered ? 0.003 : 0.03;
      return acc + computeEstimatedDeduction(parseRaw(a.standardPriceAtAcq), rate, ratio);
    } else if (a.assetKind === "housing" && a.isMixedUseHouse) {
      // 겸용주택은 공통 capex/transferExpense를 엔진이 소비하지 않음 —
      // 주택/상가 섹션별 실제 필요경비(상속·증여·매매실가 중 활성 1세트만 채워짐)를 합산.
      baseExp =
        parseRaw(a.mixedHousingInheritedExpense) +
        parseRaw(a.mixedCommercialInheritedExpense) +
        parseRaw(a.mixedHousingGiftExpense) +
        parseRaw(a.mixedCommercialGiftExpense) +
        parseRaw(a.mixedHousingActualExpense) +
        parseRaw(a.mixedCommercialActualExpense);
    } else {
      const capExp = parseRaw(a.capitalExpenditure);
      const trExp = parseRaw(a.transferExpense);
      const splitTotal = capExp + trExp;
      baseExp = splitTotal > 0 ? splitTotal : parseRaw(a.directExpenses);
    }
    // 실경비(자본적지출·양도비)는 금액 자체가 지분분이므로 단순 스케일 — 순서 문제 없음.
    return acc + (fractional ? applyRatio(baseExp, ratio) : baseExp);
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
    // 부수토지·정착면적 안분 — leaf 헬퍼 단일 소스 + override 반영 (three-state 문자열 분기)
    const overrideStr = primary.mixedResidentialLandAreaOverride ?? "";
    const commOverrideStr = primary.mixedCommercialLandAreaOverride ?? "";
    const fpOverrideStr = primary.mixedResidentialFootprintOverride ?? "";
    // 부수토지 override는 PHD 무관(2026-07-15 배타 해제 — API·UI·validate 동일)
    const mixedDerived = computeDerivedAreas({
      residentialFloorArea: residentialFloor,
      nonResidentialFloorArea: commercialFloor,
      buildingFootprintArea: parseFloat(primary.buildingFootprintArea || "0") || 0,
      totalLandArea: totalLand,
      ...(overrideStr.trim() !== ""
        ? { residentialLandAreaOverride: parseFloat(overrideStr) || 0 }
        : {}),
      ...(commOverrideStr.trim() !== ""
        ? { commercialLandAreaOverride: parseFloat(commOverrideStr) || 0 }
        : {}),
      ...(fpOverrideStr.trim() !== ""
        ? { residentialFootprintOverride: parseFloat(fpOverrideStr) || 0 }
        : {}),
    });
    const housingRatioByArea = mixedDerived.residentialRatio;
    const commercialLandArea = mixedDerived.commercialLandArea;

    // 양도가액 안분: 기준시가 합계 비율
    const housingStdPrice = parseRaw(primary.mixedTransferHousingPrice);
    // PHD ③ 양도시 공시지가 fallback — UI 표시·API 변환과 동일 우선순위(동일 필지 = 단가 공유)
    const transferLandPerSqm =
      parseRaw(primary.mixedTransferLandPricePerSqm) || parseRaw(primary.phdLandPricePerSqmAtTransfer);
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
      residentialLandArea: mixedDerived.residentialLandArea,
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

  // result 도착 후 권위값 override — 단건 모드는 엔진이 실제 차감한 필요경비(result.expenses =
  // expensesApplied)로 확정. 환산 본문은 expenses=개산공제, swap은 expenses=자본·양도비(개산공제는 미차감
  // echo), 실지는 expenses=실경비. estimatedDeduction과 합산 금지(본문 모드 이중계산 — 실측 확인).
  const resultNecessaryExpense =
    result?.mode === "single" ? (result.result.expenses ?? 0) : null;
  const finalNecessaryExpense = resultNecessaryExpense ?? totalNecessaryExpense;

  // 취득가액도 단건 result 도착 시 엔진 확정값으로 override. estimatedBase = 환산취득가 base(개산공제 제외,
  // 환산/감정/매매사례 모드에서만 설정) — 실지취득 모드는 undefined라 입력 기반 totalAcqPrice 유지.
  const finalAcqPrice =
    result?.mode === "single" && result.result.estimatedBase != null
      ? result.result.estimatedBase
      : totalAcqPrice;

  return {
    totalSalePrice,
    totalAcqPrice: finalAcqPrice,
    totalNecessaryExpense: finalNecessaryExpense,
    netTransferIncome: totalSalePrice - finalAcqPrice - finalNecessaryExpense,
    estimatedTax,
    mixedUse,
    burdenedGift,
  };
}
