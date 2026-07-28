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
  /** 조정대상지역 토글 수동 조작 여부 (UI 전용 — API 미전송). true면 자동판별 결과를 재반영하지 않음 */
  isRegulatedAreaTouched: boolean;
  wasRegulatedAtAcquisitionTouched: boolean;
  /** 양도 자산 법정동코드(10자리 — AddressSearch PNU 앞10). 제공 시 정밀 판정, 미제공 시 boolean fallback */
  regionCode?: string;
  isUnregistered: boolean;
  temporaryTwoHouseSpecial: boolean;
  // 종전주택 취득일은 별도 필드를 두지 않고 양도 자산(assets[0])의 acquisitionDate를 단일소스로 사용(§155① 종전주택 = 양도주택).
  newHouseAcquisitionDate: string;
  // §156의2⑤ 대체주택 비과세 특례 FLAT 필드 (API에서 replacementHouse nested로 조립)
  replacementHouseSpecial: boolean;
  replBusinessApprovalDate: string;   // 사업시행계획인가일
  replCompletionDate: string;         // 신축주택 준공일
  replResidenceMonths: string;        // 대체주택 거주개월수 (숫자 문자열)
  replWillResideNewHouse: boolean;    // 신축주택 1년 이상 거주 자기선언
  marriageDate: string;
  /** §155④⑤ 합가·혼인 세대 내 먼저 양도 주택 여부 (비과세 판정 — 먼저 양도 요건) */
  isFirstTransferredInMerge: boolean;
  /** §155② 양도(일반)주택이 상속개시 2년내 피상속인 증여분 여부 (상속주택 특례 배제 게이트) */
  generalHouseGiftedFromDecedentWithin2yr: boolean;
  parentalCareMergeDate: string;
  // §154① 단서 — 비과세 보유·거주 요건 면제 사유 (FLAT; API에서 oneHouseExemptionProviso로 조립)
  provisoReason:
    | ""
    | "rental_5yr_residence"
    | "expropriation"
    | "overseas_migration"
    | "overseas_residence"
    | "unavoidable"
    | "pre_designation_contract";
  provisoDepartureDate: string;
  provisoExpropriationDate: string;
  provisoBusinessApprovalDate: string;
  provisoPreContractNoHouse: boolean;
  houses: HouseEntry[];
  /** 세대 보유 분양권·입주권 (2021.1.1 이후 취득분 주택 수 산입 — 소령 §167의11) */
  presaleRights: PresaleRightEntry[];
  /**
   * 다주택 중과세 한시 유예 조건부 판정 (소령 §167의3 중과 한시 배제 2022.5.10~2026.5.9).
   * 폼-전역 단수 객체 — undefined면 유예 윈도우 blanket 판정, 객체면 정밀 조건 판정.
   * 3-state: undefined(미입력) / 객체(입력). 날짜는 폼 문자열(YYYY-MM-DD).
   */
  gracePeriod?: {
    contractDate: string;
    /** 토지거래허가 대상 여부 — true=나목(허가신청·허가·계약금), false=다목(계약·계약금) */
    isLandPermitTarget?: boolean;
    /** 나목1) 토지거래허가 신청일 */
    permitApplicationDate?: string;
    /** 나목2) 허가 수령 여부 */
    permitGranted?: boolean;
    /** 나목3)·다목1) 계약금 수령 증빙 확인 */
    depositReceiptConfirmed?: boolean;
    /** @deprecated G3(조건C 근거 없음) — 판정 미사용, 하위호환만 */
    isLandPermitArea?: boolean;
    /** @deprecated G3 — 판정 미사용 */
    hasTenantInResidence?: boolean;
    /** @deprecated G6(regionCode 명단 판정 대체) — 판정 미사용 */
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

  // ── 수정신고(경정) — 국세기본법 §45·§48 ──
  amendmentMode: boolean;
  /** 당초 결정세액(=당초 납부 본세) — 이력에서 자동 prefill, 수정 가능 */
  originalDeterminedTax: string;
  /** 불러온 당초 이력 id (추적용) */
  amendmentSourceId: string;
  /** 법정신고기한(YYYY-MM-DD) — 양도일 파생, 수정 가능 (소득세법 §110①) */
  statutoryFilingDeadline: string;
  /** 수정신고일(YYYY-MM-DD) — §48② 경과기간 종점 */
  amendedFilingDate: string;
  applyUnderReportingPenalty: boolean;
  underReportingReason: "normal" | "fraudulent" | "offshore_fraud";
  underReductionMode: "exempt" | "auto_48_2";
  priorAssessmentNotified: boolean;
  applyLatePaymentPenalty: boolean;
  /** 수정신고 납부(예정)일(YYYY-MM-DD) — 납부지연 경과일 종점 */
  amendedPaymentDate: string;
  // ── 경정청구(세액 감소·환급) — 국세기본법 §45의2 ──
  /** 정정 방향 (amend=수정신고 / refund_claim=경정청구) */
  correctionKind: "amend" | "refund_claim";
  /** 경정청구 사유 유형 (ordinary=일반 5년 / posterior=후발적 3개월) */
  claimReasonType: "ordinary" | "posterior";
  /** 후발적 사유 안 날(YYYY-MM-DD) — posterior 3개월 기산 (§45의2②) */
  posteriorEventDate: string;
  /** 당초 납부일(YYYY-MM-DD, 선택) — 환급가산금 기산일 안내(form-only, 엔진 미전송) */
  originalPaymentDate: string;
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
  isRegulatedAreaTouched: false,
  wasRegulatedAtAcquisitionTouched: false,
  isUnregistered: false,
  temporaryTwoHouseSpecial: false,
  newHouseAcquisitionDate: "",
  replacementHouseSpecial: false,
  replBusinessApprovalDate: "",
  replCompletionDate: "",
  replResidenceMonths: "",
  replWillResideNewHouse: false,
  marriageDate: "",
  isFirstTransferredInMerge: false,
  generalHouseGiftedFromDecedentWithin2yr: false,
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
      // currentStep은 persist하지 않음 — 홈 재진입·새로고침 시 항상 첫 스텝부터 시작.
      partialize: (state) => ({
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

        // ③ gracePeriod 구 필드(isLandPermitArea) → 신규 isLandPermitTarget 의미 승계 이전
        formData = { ...formData, gracePeriod: migrateGracePeriod(formData.gracePeriod) };

        // currentStep은 복원하지 않고 항상 0 — 구 sessionStorage에 남은 currentStep(잔존값)을 무시.
        return { ...current, ...ps, formData, currentStep: 0 };
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
