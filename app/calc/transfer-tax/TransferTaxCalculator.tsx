"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useResetOnNewParam } from "@/lib/hooks/use-reset-on-new-param";
import { useCalcWizardStore, createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { useMultiTransferStore, generatePropertyId } from "@/lib/stores/multi-transfer-tax-store";
import { calcPropertyCompletion } from "@/lib/calc/multi-transfer-tax-validate";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { calculateEstimatedAcquisitionPrice, applyRate } from "@/lib/tax-engine/tax-utils";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { WizardSidebar, type WizardSidebarStep } from "@/components/calc/shared/WizardSidebar";
import { REDUCTION_SHORT_LABELS } from "@/components/calc/transfer/reduction-short-labels";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import type { TransferTaxPenaltyResult } from "@/lib/tax-engine/transfer-tax-penalty";
import { collectStepIssues, collectStepWarnings, type ValidationIssue } from "@/lib/calc/transfer-tax-validate";
import { StepWarningBanner } from "@/components/calc/transfer/StepWarningBanner";
import type { StepStatus } from "@/components/calc/StepIndicator";
import { derivePenaltyFields, isAllBurdenedGift } from "@/lib/calc/filing-deadline";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { computeTransferSummary } from "@/lib/stores/calc-wizard-store";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { runTransferManualSave, formatTransferSaveMessage } from "@/components/calc/transfer-tax-save-handler";
import { useRecordCount } from "@/components/calc/shared/save-handler-builders";
import { SaveButton } from "@/components/calc/shared/SaveButton";
import { SaveToast, type SaveToastMessage } from "@/components/calc/shared/SaveToast";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { ChevronLeft } from "lucide-react";
import { Step1 } from "./steps/Step1";
import { Step4 } from "./steps/Step4";
import { Step5 } from "./steps/Step5";
import { Step6 } from "./steps/Step6";

const STEPS_SINGLE = ["자산 목록", "보유 상황", "감면·공제", "가산세"] as const;
const STEP_TITLES = ["자산 목록·취득 정보 입력", "보유 상황 입력", "감면 확인", "가산세 입력"] as const;

// 메인 컴포넌트
// ============================================================
interface TransferTaxCalculatorProps {
  /** 다건 모드: 현재 자산 저장 후 새 자산 추가 (마법사 step 0으로 리셋) */
  onSaveAndAddNext?: () => void;
  /** 다건 모드: 현재 자산 저장 후 공통 설정 단계로 이동 */
  onSaveAndGoToSettings?: () => void;
}

export default function TransferTaxCalculator({
  onSaveAndAddNext,
  onSaveAndGoToSettings,
}: TransferTaxCalculatorProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  // 다건 양도 편집 모드 내 임베딩 여부
  const isEmbeddedInMulti = pathname?.includes("/multi") ?? false;
  // 단건/다건 모두 6단계 — 가산세는 자산별 입력
  const STEPS = STEPS_SINGLE;
  const { currentStep, formData, result, setStep, updateFormData, setResult, reset } =
    useCalcWizardStore();
  // 홈 카드(?new=1) 진입 = 새 계산 → 빈 폼으로 초기화 (작업 중 새로고침은 보존)
  useResetOnNewParam(reset);
  // API·계산 오류 (단건 메시지). 검증 오류는 issues 배열로 일괄 표시.
  const [error, setError] = useState<string | null>(null);
  // 검증 오류 일괄 목록 — 한 단계의 모든 차단 오류를 한 번에 표시 (두더지잡기 제거)
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  // 검증 실패 자산 인덱스 — Step1 자산 카드 인라인 에러 + 자동 스크롤 대상 (step 0 한정)
  const [errorAssetIndex, setErrorAssetIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [penaltyResult, setPenaltyResult] = useState<TransferTaxPenaltyResult | null>(null);
  const [isPenaltyLoading, setIsPenaltyLoading] = useState(false);
  /** 가산세 계산하기로 얻은 결정세액 — unpaidTax 자동 계산용 */
  const [calcDeterminedTax, setCalcDeterminedTax] = useState<number | null>(null);
  const transferSummary = useMemo(
    () => computeTransferSummary(formData, result),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formData.assets, formData.contractTotalPrice, result]
  );

  // 로그인 상태 확인 (클라이언트 사이드)
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        setIsLoggedIn(!!data.user);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
        setIsLoggedIn(!!session?.user);
      });
      return () => subscription.unsubscribe();
    });
  }, []);

  const totalSteps = STEPS.length;
  const isLastStep = currentStep === totalSteps - 1;
  const isResult = result !== null && currentStep === totalSteps;

  const { activeClientId } = useProfessionalStore();

  // 로컬 이력 자동 저장 — 결과 화면 진입 시 1회
  // v2: pendingEditId·saveAsUpdate·saveAsNew API 폐기 — saveOrUpdateByContent 자동 dedup
  const autoSave = useAutoSaveCalculation({
    taxType: "transfer",
    inputData: formData as unknown as Record<string, unknown>,
    resultData: isResult ? (result as unknown as Record<string, unknown>) : null,
    taxLawVersion: formData.transferDate || new Date().toISOString().split("T")[0],
    clientId: activeClientId,
  });

  // 수동 저장 — 자동저장과 별개로 사용자가 원할 때 즉시 이력 저장(갱신)
  const [saveMessage, setSaveMessage] = useState<SaveToastMessage | null>(null);
  const recordCount = useRecordCount(result);
  const handleManualSave = async () => {
    setSaveMessage(null);
    try {
      const outcome = await runTransferManualSave({
        form: formData as unknown as Record<string, unknown>,
        result,
        clientId: activeClientId ?? null,
      });
      setSaveMessage(formatTransferSaveMessage(outcome, recordCount));
    } catch (e) {
      setSaveMessage(
        formatTransferSaveMessage(e instanceof Error ? e : new Error(String(e)), recordCount),
      );
    }
  };

  // 잘못된 step 상태 복구: currentStep >= totalSteps인데 result가 없으면 step 0으로 리셋
  useEffect(() => {
    if (currentStep >= totalSteps && !result) {
      setStep(0);
    }
  }, [currentStep, totalSteps, result, setStep]);

  // 신고일·양도일 변경 시 가산세 필드 cross-field 파생.
  // memory `feedback_useeffect_store_mirror_forbidden` — useEffect→store 미러링 금지.
  // onChange 핸들러에서 직접 파생(아래 handleFormChange). 로드 시점 보정은 migrateLegacyForm에서 처리.
  // assets 패치도 트리거 — transferType(부담부증여) 변경 시 신고기한이 2↔3개월로 바뀜 (§105①3호).
  // derivePenaltyFields는 동일 상태면 빈 패치 반환이므로 빈번 호출 무해.
  const handleFormChange = useCallback(
    (patch: Partial<typeof formData>) => {
      if ("transferDate" in patch || "filingDate" in patch || "assets" in patch) {
        const nextTransferDate = patch.transferDate ?? formData.transferDate;
        const nextFilingDate = patch.filingDate ?? formData.filingDate;
        const nextAssets = patch.assets ?? formData.assets;
        const penaltyPatch = derivePenaltyFields(
          nextTransferDate,
          nextFilingDate,
          formData,
          isAllBurdenedGift(nextAssets),
        );
        updateFormData({ ...patch, ...penaltyPatch });
      } else {
        updateFormData(patch);
      }
    },
    [formData, updateFormData],
  );

  // 검증 실패 적용 — 오류 목록 일괄 표시 + 첫 자산 오류 인덱스 설정 + (step 0) 해당 카드로 자동 스크롤
  function failWithIssues(list: ValidationIssue[]) {
    setIssues(list);
    const firstAsset = list.find((it) => it.assetIndex != null);
    setErrorAssetIndex(firstAsset?.assetIndex ?? null);
    if (firstAsset?.assetIndex != null && firstAsset.step === 0) {
      scrollToAssetCard(firstAsset.assetIndex);
    }
  }

  // setStep/리렌더 후 자산 카드가 마운트되도록 한 틱 뒤 스크롤
  function scrollToAssetCard(targetIndex: number) {
    setTimeout(() => {
      document
        .querySelector(`[data-asset-card-index="${targetIndex}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  function clearError() {
    setError(null);
    setIssues([]);
    setErrorAssetIndex(null);
  }

  function handleNext() {
    const list = collectStepIssues(currentStep, formData);
    if (list.length > 0) { failWithIssues(list); return; }
    clearError();
    setStep(currentStep + 1);
  }

  function handleBack() {
    clearError();
    if (currentStep === 0) {
      if (!isEmbeddedInMulti) router.push("/");
    } else {
      setStep(currentStep - 1);
    }
  }

  async function handleSubmit() {
    clearError();
    // 최종 제출 가드 — 모든 step을 재검증 (사용자가 자유 이동·필드 비우기 후 마지막 step에서 "계산하기" 시 우회 차단).
    // step 0 (자산·취득 정보)이 가장 critical — redev settlementSaleDate, useEstimated PHD 등 entry 검증.
    for (let s = 0; s < totalSteps; s++) {
      const list = collectStepIssues(s, formData);
      if (list.length > 0) {
        setStep(s); // 검증 실패 step으로 자동 이동 (사용자가 어디서 누락됐는지 즉시 인지)
        failWithIssues(list); // 오류 목록 + 자산 인덱스 + 자동 스크롤
        return;
      }
    }
    setIsLoading(true);
    try {
      const res = await callTransferTaxAPI(formData);
      setResult(res);
      setStep(totalSteps); // 결과 화면

      // 단건 계산 완료 시 multi-store.properties[0]에 자동 백업.
      // 사용자가 이후 "동일연도 다른 양도건 계산하기"를 눌러도, 또는 직접 /multi로 이동해도 자산1 데이터가 보존된다.
      // 다건 임베드(isEmbeddedInMulti)일 때는 multi 흐름이 이미 properties를 관리하므로 백업하지 않는다.
      if (!isEmbeddedInMulti) {
        const multiStore = useMultiTransferStore.getState();
        const completion = calcPropertyCompletion(formData);
        const newItem = {
          propertyId: generatePropertyId(),
          propertyLabel: "양도 1번",
          form: formData,
          completionPercent: completion,
        };
        multiStore.reset();
        multiStore.addProperty(newItem);
        if (formData.transferDate) {
          const year = parseInt(formData.transferDate.slice(0, 4), 10);
          if (!Number.isNaN(year)) multiStore.setForm({ taxYear: year });
        }
      }

      // 이력 저장은 로컬 IndexedDB(useAutoSaveCalculation)에서 처리 — 서버 저장 제거(로컬 일원화)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePenaltyCalc() {
    clearError();
    setIsPenaltyLoading(true);
    try {
      // 1단계: enablePenalty 없이 결정세액만 확보 (단건 모드만 가산세 지원)
      const baseRes = await callTransferTaxAPI({ ...formData, enablePenalty: false });
      if (baseRes.mode !== "single") return;
      const detTax = baseRes.result.determinedTax;
      setCalcDeterminedTax(detTax);

      // 2단계: 미납세액 자동 계산
      const priorPaid = parseAmount(formData.priorPaidTax ?? "0");
      const autoUnpaid = Math.max(0, detTax - priorPaid);
      const updatedUnpaidTax = autoUnpaid > 0 ? String(autoUnpaid) : "0";
      updateFormData({ unpaidTax: updatedUnpaidTax });

      // 3단계: 계산된 unpaidTax로 가산세 포함 재계산
      const penaltyRes = await callTransferTaxAPI({ ...formData, unpaidTax: updatedUnpaidTax });
      const penaltyResult = penaltyRes.mode === "single" ? (penaltyRes.result.penaltyDetail ?? null) : null;
      setPenaltyResult(penaltyResult);
      if (!penaltyResult) {
        setError("가산세 항목을 입력해 주세요. (신고 유형 또는 미납세액+납부기한)");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "가산세 계산 중 오류가 발생했습니다.");
    } finally {
      setIsPenaltyLoading(false);
    }
  }

  function handleReset() {
    reset();
    clearError();
    setPenaltyResult(null);
  }

  // 단건 결과 화면의 "동일연도 다른 양도건 계산하기" 버튼 핸들러.
  // 단건 입력값을 다건 store의 자산1로 이전하고 빈 자산2를 추가한 뒤 다건 페이지로 이동.
  // 자산1은 보존되며 사용자는 곧장 자산2 입력으로 넘어간다.
  const handleContinueToMulti = useCallback(() => {
    const multiStore = useMultiTransferStore.getState();
    const wizardStore = useCalcWizardStore.getState();

    multiStore.reset();

    const asset1Form = formData;
    const asset1Completion = calcPropertyCompletion(asset1Form);
    multiStore.addProperty({
      propertyId: generatePropertyId(),
      propertyLabel: "양도 1번",
      form: asset1Form,
      completionPercent: asset1Completion,
    });

    const asset2Form = createDefaultTransferFormData();
    multiStore.addProperty({
      propertyId: generatePropertyId(),
      propertyLabel: "양도 2번",
      form: asset2Form,
      completionPercent: 0,
    });

    if (formData.transferDate) {
      const year = parseInt(formData.transferDate.slice(0, 4), 10);
      if (!Number.isNaN(year)) {
        multiStore.setForm({ taxYear: year });
      }
    }

    multiStore.setActiveProperty(1);
    multiStore.setStep("edit");

    wizardStore.reset();
    wizardStore.updateFormData(asset2Form);
    wizardStore.setStep(0);

    router.push("/calc/transfer-tax/multi");
  }, [formData, router]);

  const stepComponentsAll = [
    <Step1
      key={0}
      form={formData}
      onChange={handleFormChange}
      errorAssetIndex={currentStep === 0 ? errorAssetIndex : null}
      errorMessage={
        currentStep === 0
          ? (issues.find((it) => it.assetIndex === errorAssetIndex)?.message ?? error)
          : null
      }
    />,
    <Step4 key={1} form={formData} onChange={updateFormData} />,
    <Step5 key={2} form={formData} onChange={updateFormData} />,
    <Step6 key={3} form={formData} onChange={updateFormData} determinedTax={calcDeterminedTax} />,
  ];
  const stepComponents = stepComponentsAll;

  // 단계별 완료/주의 배지 — 오류 0건이면 complete(✓), 지나친 단계에 오류 있으면 attention(!),
  // 아직 도달 전이면 neutral(번호). collectStepIssues와 동일 규칙으로 handleNext 차단과 일관.
  // (상속세 PR#139 패턴 — InheritanceTaxForm stepStatuses)
  const stepStatuses = useMemo<StepStatus[]>(
    () =>
      STEPS_SINGLE.map((_, i) => {
        const hasError = collectStepIssues(i, formData).length > 0;
        if (hasError) return i < currentStep ? "attention" : "neutral";
        return i <= currentStep ? "complete" : "neutral";
      }),
    [formData, currentStep],
  );

  // 비차단 경고 (미래 양도일 등) — handleNext/handleSubmit를 막지 않는 amber 배너. 차단 흐름과 독립.
  const warnings = useMemo<ValidationIssue[]>(
    () => collectStepWarnings(currentStep, formData),
    [currentStep, formData],
  );

  const sidebarSteps: WizardSidebarStep[] = STEPS_SINGLE.map((label, i) => ({
    label,
    status:
      i === currentStep
        ? "active"
        : stepStatuses[i] === "attention"
          ? "attention"
          : stepStatuses[i] === "complete"
            ? "done"
            : "todo",
    onClick: () => { clearError(); setStep(i); },
  }));

  // 입력된 값을 기준으로 계산 가능한 항목만 사이드바에 표시.
  //   양도가액 합계:  actualSalePrice 입력 시
  //   취득가액 합계:  fixedAcquisitionPrice 입력 시 (실가/감정 모드만, 환산은 엔진 계산)
  //   필요경비 합계:  directExpenses 입력 시
  //   양도소득금액:  양도가액 + 취득가액 모두 입력된 경우 (환산 모드에선 API 결과 필요)
  //   납부할 세액:   API 계산 완료 시
  // 상속 취득가액 의제 — case B는 사용자 입력 즉시, case A는 API 응답 후 표시
  const inheritedAcqSidebarValue = (() => {
    const primaryAsset = formData.assets[0];
    if (!primaryAsset || primaryAsset.inheritanceMode === null || !primaryAsset.inheritanceStartDate) {
      return null;
    }
    // case B: 신고가액 즉시 표시
    if (primaryAsset.inheritanceMode === "post-deemed") {
      const v = parseAmount(primaryAsset.inheritanceReportedValue);
      return v > 0 ? v : null;
    }
    // case A: API 응답 후 inheritedAcquisitionDetail에서 표시
    if (result?.mode === "single" && result.result.inheritedAcquisitionDetail) {
      return result.result.inheritedAcquisitionDetail.acquisitionPrice || null;
    }
    return null;
  })();

  // 취득가액/필요경비 표시값 — 우선순위:
  //   직접입력 합계 → 상속 의제 → 계산 결과(환산취득가·적용경비) → 계산 전 "환산 프리뷰".
  const singleResult = result?.mode === "single" ? result.result : null;

  // 환산 프리뷰: 단건·단순(토지/주택, 분리·겸용·재개발·다필지 아님) 환산 모드에서
  //   기준시가·양도가액이 모두 입력되면 엔진 유틸로 환산취득가·개산공제를 계산 전에 미리 산출.
  //   (dual-truth 회피 — 공식 재구현 대신 calculateEstimatedAcquisitionPrice·applyRate 엔진 유틸 import)
  const primaryAsset = formData.assets[0];
  const canPreviewEstimated =
    formData.assets.length === 1 &&
    !!primaryAsset &&
    primaryAsset.useEstimatedAcquisition &&
    !primaryAsset.parcelMode &&
    !primaryAsset.isMixedUseHouse &&
    !primaryAsset.hasSeperateLandAcquisitionDate &&
    primaryAsset.transferType !== "burdened_gift" &&
    (primaryAsset.assetKind === "land" || primaryAsset.assetKind === "housing");
  const previewStdAcq = canPreviewEstimated ? parseAmount(primaryAsset.standardPriceAtAcq) : 0;
  const previewStdTransfer = canPreviewEstimated ? parseAmount(primaryAsset.standardPriceAtTransfer) : 0;
  const previewSalePrice = canPreviewEstimated ? parseAmount(primaryAsset.actualSalePrice) : 0;
  const estAcqPreview =
    previewStdAcq > 0 && previewStdTransfer > 0 && previewSalePrice > 0
      ? calculateEstimatedAcquisitionPrice(previewSalePrice, previewStdAcq, previewStdTransfer)
      : 0;
  const estDeductionPreview = estAcqPreview > 0 ? applyRate(previewStdAcq, 0.03) : 0;

  const acqPriceDisplay =
    transferSummary.totalAcqPrice > 0
      ? transferSummary.totalAcqPrice
      : inheritedAcqSidebarValue != null
        ? inheritedAcqSidebarValue
        : singleResult?.usedEstimatedAcquisition
          ? singleResult.estimatedBase ?? 0
          : estAcqPreview;
  const expenseDisplay =
    transferSummary.totalNecessaryExpense > 0
      ? transferSummary.totalNecessaryExpense
      : singleResult
        ? singleResult.expenses ?? 0
        : estDeductionPreview;

  // 환산·감정 모드지만 프리뷰 불가(기준시가 미입력 등) + 계산 전 → "계산 후 표시" placeholder.
  const acqPending =
    acqPriceDisplay === 0 && !result &&
    formData.assets.some((a) => a.useEstimatedAcquisition);
  const expensePending =
    expenseDisplay === 0 && !result &&
    formData.assets.some((a) => a.useEstimatedAcquisition || a.isAppraisalAcquisition);

  // 선택된 감면 조문 (자산별 reductions[] 합집합 — 중복 제거)
  const appliedReductionTypes = Array.from(
    new Set(formData.assets.flatMap((a) => a.reductions ?? []).map((r) => r.type)),
  );

  // 사이드바 요약 — 세로 스택 3금액 + 공제·감면 목록 (납부세액·양도소득금액 미표시).
  // 값 > 0 이면 금액, 환산·감정 모드 계산 전이면 placeholder, 그 외엔 미표시.
  const renderSidebarAmount = (label: string, value: number, pending = false) => {
    if (value <= 0 && !pending) return null;
    return (
      <div className="text-sm">
        <p className="text-muted-foreground">{label}</p>
        {value > 0 ? (
          <p className="text-right font-mono tabular-nums">{value.toLocaleString()}</p>
        ) : (
          <p className="text-right text-xs text-muted-foreground/50">계산 후 표시</p>
        )}
      </div>
    );
  };

  const sidebarSummaryContent = (
    <div className="space-y-2.5">
      {renderSidebarAmount("양도가액", transferSummary.totalSalePrice)}
      {renderSidebarAmount("취득가액", acqPriceDisplay, acqPending)}
      {renderSidebarAmount("필요경비", expenseDisplay, expensePending)}
      {appliedReductionTypes.length > 0 && (
        <div className="border-t pt-2">
          <p className="mb-1 text-sm text-muted-foreground">공제·감면 사항</p>
          <ul className="space-y-0.5">
            {appliedReductionTypes.map((t) => (
              <li key={t} className="text-sm">
                {REDUCTION_SHORT_LABELS[t]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {formData.amendmentMode && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 print:hidden dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-semibold">📝 수정신고 작성 중</p>
          <p className="mt-0.5 text-xs leading-relaxed">
            당초 신고 기준으로 불러왔습니다. 양도가액·취득가액·필요경비를 수정하세요.
            당초 결정세액은 마지막 단계에서 자동 차감됩니다.
          </p>
        </div>
      )}
      {/* 헤더 */}
      <div className="mb-6 print:hidden">
        <p className="text-xs text-muted-foreground mb-1">한국 부동산 세금 계산기</p>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">양도소득세 계산기</h1>
          <div className="flex items-center gap-2">
            {/* onBeforeNavigate: 결과서 홈 이동 시 setStep(0)→isResult=false로 stale 결과 숨김(결과 step은 indicator 너머·입력 보존) */}
            <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" onBeforeNavigate={() => { if (isResult) setStep(0); }} />
            <SaveButton onSave={handleManualSave} />
            <ResetButton onReset={handleReset} />
          </div>
        </div>
      </div>

      <SaveToast message={saveMessage} onClose={() => setSaveMessage(null)} />

      {isResult && result ? (
        result.mode === "single" ? (
          <>
            <TransferTaxResultView
              result={result.result}
              savedId={autoSave.savedId ?? undefined}
              onReset={handleReset}
              onBack={() => {
                setStep(totalSteps - 1);
                clearError();
              }}
              onGoToFirst={() => {
                setStep(0);
                clearError();
              }}
              onLoginPrompt={!isLoggedIn}
              showMultiTransferButton={!isEmbeddedInMulti}
              onContinueToMulti={handleContinueToMulti}
              formData={formData}
            />
          </>
        ) : result.mode === "mixed-use" ? (
          <div className="space-y-4">
            <MixedUseResultCard breakdown={result.result} formData={formData} />
            {/* 결과 화면 하단 네비게이션 */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 mt-4">
              <button
                type="button"
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted/60 transition-colors"
                onClick={() => { setStep(0); clearError(); }}
              >
                ← 처음으로 (자산 목록)
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted/60 transition-colors"
                  onClick={() => { setStep(totalSteps - 1); clearError(); }}
                >
                  이전 (가산세)
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-lg border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={handleReset}
                >
                  초기화
                </button>
              </div>
            </div>
          </div>
        ) : (
          <BundledAllocationCard
            apportionment={(result as import("@/lib/calc/transfer-tax-api").BundledTransferResult).apportionment}
            aggregated={(result as import("@/lib/calc/transfer-tax-api").BundledTransferResult).aggregated}
            transferBurdenedGiftBreakdown={
              (result as import("@/lib/calc/transfer-tax-api").BundledTransferResult).transferBurdenedGiftBreakdown
            }
            formData={formData}
            ownershipMap={
              // 지분 단계취득 자산의 결과 카드에 "지분 X%" 라벨 표시용 propertyId → ratio 매핑.
              // assets[0] propertyId는 route.ts에서 "primary"로 고정. assets[i>0]은 assetId 그대로.
              new Map(
                formData.assets.map((a, idx) => {
                  const propertyId = idx === 0 ? "primary" : a.assetId;
                  const numerator = parseFloat(a.ownershipNumerator || "100");
                  const denominator = parseFloat(a.ownershipDenominator || "100");
                  return [propertyId, { numerator, denominator }] as const;
                }),
              )
            }
            onBack={() => {
              setStep(STEPS.length - 1);
              clearError();
            }}
            onReset={handleReset}
          />
        )
      ) : (
        <>
          {/* 모바일: 상단 가로 진행 바 */}
          <div className="lg:hidden mb-6">
            <StepIndicator
              steps={Array.from(STEPS_SINGLE)}
              current={currentStep}
              stepStatus={stepStatuses}
              onStepClick={(i) => {
                if (i === currentStep) return;
                clearError();
                setStep(i);
              }}
            />
          </div>

          <div className="lg:grid lg:grid-cols-[11rem_1fr] lg:gap-8">
            {/* 사이드바 (데스크톱) — 폭 11rem(기존 16rem 대비 ≈30%↓) */}
            <WizardSidebar
              title="양도소득세"
              steps={sidebarSteps}
              summaryContent={sidebarSummaryContent}
              className="w-44"
            />

            {/* 본문 */}
            <main className="min-w-0">
              {/* 단계 제목 */}
              <h2 className="text-base font-semibold mb-4">
                {STEP_TITLES[currentStep]}
              </h2>

              {/* 비차단 경고 배너 (미래 양도일 등) — 진행은 허용 */}
              <StepWarningBanner warnings={warnings} />

              {/* 폼 내용 */}
              <div className="min-h-[280px]">
                {stepComponents[currentStep]}
              </div>

          {/* 가산세 계산 결과 인라인 카드 */}
          {isLastStep && penaltyResult && (
            <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-primary">가산세 계산 결과</p>
              {penaltyResult.filingPenalty && (
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-muted-foreground">신고불성실가산세</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">납부세액 기준</span>
                    <span>{penaltyResult.filingPenalty.penaltyBase.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">적용 세율</span>
                    <span>{(penaltyResult.filingPenalty.penaltyRate * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>신고불성실가산세</span>
                    <span className="text-destructive">{penaltyResult.filingPenalty.filingPenalty.toLocaleString()}</span>
                  </div>
                </div>
              )}
              {penaltyResult.delayedPaymentPenalty && (
                <div className="space-y-1 text-sm border-t border-border/40 pt-3">
                  <p className="font-medium text-muted-foreground">지연납부가산세</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">미납세액</span>
                    <span>{penaltyResult.delayedPaymentPenalty.unpaidTax.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">경과일수</span>
                    <span>{penaltyResult.delayedPaymentPenalty.elapsedDays}일</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">일 이자율</span>
                    <span>{(penaltyResult.delayedPaymentPenalty.dailyRate * 100).toFixed(3)}%</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>지연납부가산세</span>
                    <span className="text-destructive">{penaltyResult.delayedPaymentPenalty.delayedPaymentPenalty.toLocaleString()}</span>
                  </div>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>가산세 합계</span>
                <span className="text-destructive">{penaltyResult.totalPenalty.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* 에러 메시지 — 검증 오류 일괄 목록(issues) + API 오류(error) */}
          {(error || issues.length > 0) && (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {issues.length > 0 && (
                <>
                  <p className="font-semibold mb-1.5">
                    입력 확인이 필요합니다 ({issues.length}건)
                  </p>
                  <ul className="space-y-1 list-disc pl-4">
                    {issues.map((it, idx) => (
                      <li key={idx}>
                        {it.assetIndex != null && it.step === 0 && currentStep === 0 ? (
                          <button
                            type="button"
                            onClick={() => scrollToAssetCard(it.assetIndex!)}
                            className="text-left underline underline-offset-2 hover:opacity-70 transition-opacity"
                          >
                            {it.message}
                          </button>
                        ) : (
                          <span className="whitespace-pre-line">{it.message}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {error && <p className="whitespace-pre-line">{error}</p>}
              {isLastStep && (
                <button
                  type="button"
                  onClick={() => { clearError(); handleSubmit(); }}
                  className="mt-2 text-xs underline underline-offset-2 hover:opacity-70 transition-opacity"
                >
                  다시 계산하기
                </button>
              )}
            </div>
          )}

          {/* 네비게이션 — 뒤로가기(항상) + 다음/계산 */}
          <div className="mt-6 space-y-2">
            {isLastStep && formData.enablePenalty && (
              <button
                type="button"
                onClick={handlePenaltyCalc}
                disabled={isPenaltyLoading}
                className="w-full rounded-lg border border-primary py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-60 transition-colors"
              >
                {isPenaltyLoading ? "계산 중..." : "가산세 계산하기"}
              </button>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={
                  isEmbeddedInMulti && currentStep === 0
                    ? () => router.push("/")
                    : handleBack
                }
                className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                {currentStep === 0 ? "홈으로" : "이전"}
              </button>
              {isLastStep ? (
                isEmbeddedInMulti ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const list = collectStepIssues(currentStep, formData);
                        if (list.length > 0) { failWithIssues(list); return; }
                        clearError();
                        onSaveAndAddNext?.();
                      }}
                      className="flex-1 rounded-lg border border-primary py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                    >
                      + 양도 건 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const list = collectStepIssues(currentStep, formData);
                        if (list.length > 0) { failWithIssues(list); return; }
                        clearError();
                        onSaveAndGoToSettings?.();
                      }}
                      className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      공통 설정으로 →
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
                  >
                    {isLoading ? "계산 중..." : "세금 계산하기"}
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  다음
                </button>
              )}
            </div>
            </div>
          </main>
          </div>
        </>
      )}
    </div>
  );
}
