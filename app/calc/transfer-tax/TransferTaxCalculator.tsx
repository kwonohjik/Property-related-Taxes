"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCalcWizardStore, createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { useMultiTransferStore, generatePropertyId } from "@/lib/stores/multi-transfer-tax-store";
import { calcPropertyCompletion } from "@/lib/calc/multi-transfer-tax-validate";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { WizardSidebar, type WizardSidebarStep, type WizardSidebarSummaryItem } from "@/components/calc/shared/WizardSidebar";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import type { TransferTaxPenaltyResult } from "@/lib/tax-engine/transfer-tax-penalty";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { getFilingDeadline, isFilingOverdue } from "@/lib/calc/filing-deadline";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { computeTransferSummary } from "@/lib/stores/calc-wizard-store";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
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
  const { currentStep, formData, result, setStep, updateFormData, setResult, reset, clearPendingMigration } =
    useCalcWizardStore();
  const [error, setError] = useState<string | null>(null);
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
  useAutoSaveCalculation({
    taxType: "transfer",
    inputData: formData as unknown as Record<string, unknown>,
    resultData: isResult ? (result as unknown as Record<string, unknown>) : null,
    taxLawVersion: formData.transferDate || new Date().toISOString().split("T")[0],
    clientId: activeClientId,
  });

  // 잘못된 step 상태 복구: currentStep >= totalSteps인데 result가 없으면 step 0으로 리셋
  useEffect(() => {
    if (currentStep >= totalSteps && !result) {
      setStep(0);
    }
  }, [currentStep, totalSteps, result, setStep]);

  // 신고일·양도일 변경 시 가산세 필드 자동 설정
  //   - 신고기한 초과 시: 무신고(filingType="none") + 지연납부 자동 ON, paymentDeadline=신고기한, actualPaymentDate=신고일
  //   - 신고기한 이내 또는 신고일 미입력: 가산세 자동 OFF
  useEffect(() => {
    const { transferDate, filingDate } = formData;
    if (!transferDate || !filingDate) {
      if (formData.enablePenalty) {
        updateFormData({
          enablePenalty: false,
          filingType: "correct",
          paymentDeadline: "",
          actualPaymentDate: "",
        });
      }
      return;
    }
    const overdue = isFilingOverdue(transferDate, filingDate);
    if (overdue) {
      const deadline = getFilingDeadline(transferDate);
      if (
        !formData.enablePenalty ||
        formData.filingType !== "none" ||
        formData.paymentDeadline !== deadline ||
        formData.actualPaymentDate !== filingDate
      ) {
        updateFormData({
          enablePenalty: true,
          filingType: "none",
          penaltyReason: formData.penaltyReason || "normal",
          paymentDeadline: deadline,
          actualPaymentDate: filingDate,
        });
      }
    } else {
      if (formData.enablePenalty) {
        updateFormData({
          enablePenalty: false,
          filingType: "correct",
          paymentDeadline: "",
          actualPaymentDate: "",
        });
      }
    }
    // 의도적으로 일부 필드만 의존성에 포함
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.transferDate, formData.filingDate]);

  function handleNext() {
    const err = validateStep(currentStep, formData);
    if (err) { setError(err); return; }
    setError(null);
    setStep(currentStep + 1);
  }

  function handleBack() {
    setError(null);
    if (currentStep === 0) {
      if (!isEmbeddedInMulti) router.push("/");
    } else {
      setStep(currentStep - 1);
    }
  }

  async function handleSubmit() {
    setError(null);
    // 최종 제출 가드 — 모든 step을 재검증 (사용자가 자유 이동·필드 비우기 후 마지막 step에서 "계산하기" 시 우회 차단).
    // step 0 (자산·취득 정보)이 가장 critical — redev settlementSaleDate, useEstimated PHD 등 entry 검증.
    for (let s = 0; s < totalSteps; s++) {
      const err = validateStep(s, formData);
      if (err) {
        setError(err);
        setStep(s); // 검증 실패 step으로 자동 이동 (사용자가 어디서 누락됐는지 즉시 인지)
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

      // 로그인된 사용자면 이력 자동 저장
      if (isLoggedIn) {
        const { saveCalculation } = await import("@/actions/calculations");
        await saveCalculation({
          taxType: "transfer",
          inputData: formData as unknown as Record<string, unknown>,
          resultData: res as unknown as Record<string, unknown>,
          // [I8] 양도일 기준 세법 버전 — 세법 적용 시점을 오늘이 아닌 양도일로 기록
          taxLawVersion: formData.transferDate || new Date().toISOString().split("T")[0],
        });
        // [I6] 이력 저장 성공 후 pendingMigration 플래그 해제
        clearPendingMigration();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePenaltyCalc() {
    setError(null);
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
    setError(null);
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
    <Step1 key={0} form={formData} onChange={updateFormData} />,
    <Step4 key={1} form={formData} onChange={updateFormData} />,
    <Step5 key={2} form={formData} onChange={updateFormData} />,
    <Step6 key={3} form={formData} onChange={updateFormData} determinedTax={calcDeterminedTax} />,
  ];
  const stepComponents = stepComponentsAll;

  const sidebarSteps: WizardSidebarStep[] = STEPS_SINGLE.map((label, i) => ({
    label,
    status: i < currentStep ? "done" : i === currentStep ? "active" : "todo",
    onClick: () => { setError(null); setStep(i); },
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

  // ⑥ 장기임대주택 거주주택 비과세 특례 배지 (소령 §155⑳)
  const rentalExceptionApplied = formData.assets.some(
    (a) => a.rentalHousingException?.applyException === true,
  );
  const rentalExceptionScenario = rentalExceptionApplied
    ? formData.assets.find((a) => a.rentalHousingException?.applyException)?.rentalHousingException?.scenario
    : undefined;

  // 사례 46 — receiveOnly 모드 라벨 분기 (단건만 — 다중 자산 receive 모드는 후속 PR)
  const isReceiveOnlySingle =
    formData.assets.length === 1 &&
    formData.assets[0]?.assetKind === "redevelopment_apt" &&
    formData.assets[0]?.redevReceiveOnlyMode === "yes";

  const sidebarSummary: WizardSidebarSummaryItem[] = [
    ...(rentalExceptionApplied
      ? [{
          label: "[특례] §155⑳ 장기임대주택 거주주택 비과세",
          value: rentalExceptionScenario === "B" ? "PHRP §161① 안분" : "거주주택 양도 (A)",
        }]
      : []),
    ...(transferSummary.totalSalePrice > 0
      ? [{
          label: isReceiveOnlySingle ? "청산금 수령액 (§166①2호 가목)" : "양도가액 합계",
          value: transferSummary.totalSalePrice,
        }]
      : []),
    // Phase 2 (2026-05-12): 부담부증여 사이드바 메타 — silent fallback 금지 원칙 ⑥
    ...(transferSummary.burdenedGift
      ? [
          {
            label: transferSummary.burdenedGift.hasOvershoot
              ? "⚠️ 부담부증여 양도가액 (인수 채무)"
              : "부담부증여 양도가액 (인수 채무, §159)",
            value: transferSummary.burdenedGift.assumedDebt,
            highlight: transferSummary.burdenedGift.hasOvershoot,
          },
          {
            label: "채무비율 (B/C)",
            value: `${(transferSummary.burdenedGift.debtRatio * 100).toFixed(2)}%${
              transferSummary.burdenedGift.hasOvershoot ? " — 1 초과! 상증법 §47③ 검토" : ""
            }`,
          },
          // Phase 3: 증여세 결정세액 (result 도착 후만 노출)
          ...(transferSummary.burdenedGift.giftFinalTax
            ? [
                {
                  label: "증여세 결정세액 (수증자 부담, 상증법 §53·§56·§69)",
                  value: transferSummary.burdenedGift.giftFinalTax,
                },
              ]
            : []),
        ]
      : []),
    // 겸용주택 미리보기: 주택비율·부수토지·안분 양도가액 (입력만으로 산출 가능)
    ...(transferSummary.mixedUse && transferSummary.mixedUse.housingRatio > 0
      ? [
          {
            label: "주택연면적 비율",
            value: `${(transferSummary.mixedUse.housingRatio * 100).toFixed(2)}%`,
          },
          {
            label: "주택부수토지",
            value: `${transferSummary.mixedUse.residentialLandArea.toFixed(2)} ㎡`,
          },
          {
            label: "상가부수토지",
            value: `${transferSummary.mixedUse.commercialLandArea.toFixed(2)} ㎡`,
          },
        ]
      : []),
    ...(transferSummary.mixedUse?.housingTransferPrice
      ? [{ label: "주택 양도가액(안분)", value: transferSummary.mixedUse.housingTransferPrice }]
      : []),
    ...(transferSummary.mixedUse?.commercialTransferPrice
      ? [{ label: "상가 양도가액(안분)", value: transferSummary.mixedUse.commercialTransferPrice }]
      : []),
    ...(inheritedAcqSidebarValue !== null
      ? [{ label: "상속 취득가액", value: inheritedAcqSidebarValue }]
      : []),
    ...(transferSummary.totalAcqPrice > 0
      ? [{ label: "취득가액 합계", value: transferSummary.totalAcqPrice }]
      : []),
    ...(transferSummary.totalNecessaryExpense > 0
      ? [{ label: "필요경비 합계", value: transferSummary.totalNecessaryExpense }]
      : []),
    ...(transferSummary.totalSalePrice > 0 && transferSummary.totalAcqPrice > 0
      ? [{ label: "양도소득금액", value: transferSummary.netTransferIncome }]
      : []),
    ...(transferSummary.estimatedTax !== null
      ? [{ label: "납부할 세액", value: transferSummary.estimatedTax, highlight: true }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6 print:hidden">
        <p className="text-xs text-muted-foreground mb-1">한국 부동산 세금 계산기</p>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">양도소득세 계산기</h1>
          <div className="flex items-center gap-2">
            <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" />
            <ResetButton onReset={handleReset} />
          </div>
        </div>
      </div>

      {isResult && result ? (
        result.mode === "single" ? (
          <>
            <TransferTaxResultView
              result={result.result}
              onReset={handleReset}
              onBack={() => {
                setStep(totalSteps - 1);
                setError(null);
              }}
              onGoToFirst={() => {
                setStep(0);
                setError(null);
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
                onClick={() => { setStep(0); setError(null); }}
              >
                ← 처음으로 (자산 목록)
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted/60 transition-colors"
                  onClick={() => { setStep(totalSteps - 1); setError(null); }}
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
              setError(null);
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
              onStepClick={(i) => {
                if (i === currentStep) return;
                setError(null);
                setStep(i);
              }}
            />
          </div>

          <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-8">
            {/* 사이드바 (데스크톱) */}
            <WizardSidebar
              title="양도소득세"
              steps={sidebarSteps}
              summary={sidebarSummary}
            />

            {/* 본문 */}
            <main className="min-w-0">
              {/* 단계 제목 */}
              <h2 className="text-base font-semibold mb-4">
                {STEP_TITLES[currentStep]}
              </h2>

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

          {/* 에러 메시지 */}
          {error && (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <p className="whitespace-pre-line">{error}</p>
              {isLastStep && (
                <button
                  type="button"
                  onClick={() => { setError(null); handleSubmit(); }}
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
                        const err = validateStep(currentStep, formData);
                        if (err) { setError(err); return; }
                        setError(null);
                        onSaveAndAddNext?.();
                      }}
                      className="flex-1 rounded-lg border border-primary py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                    >
                      + 양도 건 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const err = validateStep(currentStep, formData);
                        if (err) { setError(err); return; }
                        setError(null);
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
