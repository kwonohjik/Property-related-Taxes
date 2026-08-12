"use client";

/**
 * StockTransferTaxCalculator — 주식 양도소득세 마법사 오케스트레이터
 *
 * 4단계: Step1(자산·시장) → Step2(양도·취득가) → Step3(필요경비·신고) → Step4(결과)
 *
 * 부동산 양도세 마법사와 완전히 분리된 독립 도메인.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { Step1 } from "./steps/Step1";
import { Step2 } from "./steps/Step2";
import { Step3 } from "./steps/Step3";
import { Step4 } from "./steps/Step4";
import { useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import { useResetOnNewParam } from "@/lib/hooks/use-reset-on-new-param";
import { callStockTransferTaxAPI } from "@/lib/calc/stock-transfer-tax-api";
import { callStockTransferTaxAggregateAPI } from "@/lib/calc/stock-transfer-tax-api";
import { StockItemListCard } from "@/components/calc/stock-transfer/StockItemListCard";
import { StockAggregateSummaryCard } from "@/components/calc/results/StockAggregateSummaryCard";
import { validateStep1, validateStep2, validateStep3 } from "@/lib/calc/stock-transfer-tax-validate";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { runStockManualSave, formatStockSaveMessage } from "@/components/calc/stock-transfer-save-handler";
import { useRecordCount } from "@/components/calc/shared/save-handler-builders";
import { SaveButton } from "@/components/calc/shared/SaveButton";
import { SaveToast, type SaveToastMessage } from "@/components/calc/shared/SaveToast";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { extractStockTransferDate } from "@/lib/storage/title-generator";
import { NavButton, CtaButton, WizardBackNav } from "@/components/calc/shared/WizardNav";

const STEPS = ["자산·시장·대주주", "양도·취득가액", "필요경비·신고", "결과"] as const;

export default function StockTransferTaxCalculator() {
  const router = useRouter();

  // atomic selector (무한 루프 방지)
  const currentStep = useStockTransferStore((s) => s.currentStep);
  const formData = useStockTransferStore((s) => s.formData);
  const result = useStockTransferStore((s) => s.result);
  const error = useStockTransferStore((s) => s.error);
  const isLoading = useStockTransferStore((s) => s.isLoading);

  const savedItems = useStockTransferStore((s) => s.savedItems);
  const aggregateResult = useStockTransferStore((s) => s.aggregateResult);

  const {
    setStep, updateFormData, setResult, setAggregateResult, setError, setLoading, reset,
    commitCurrentItem, editSavedItem, removeSavedItem,
  } = useStockTransferStore();

  /**
   * 종목 확정 게이트 — 종목명과 시장 분류가 없으면 목록에서 구분할 수 없다.
   * ⚠️ 전체 validate를 걸지 않는다: 사용자가 종목을 오가며 채우는 흐름을 막게 된다.
   *   최종 계산 시점에 route의 Zod가 종목별로 검증한다(⑫).
   */
  const canCommitCurrentItem =
    formData.securityName.trim() !== "" && formData.marketType !== "";
  const commitDisabledReason = canCommitCurrentItem
    ? undefined
    : "종목명과 시장 분류를 입력해야 종목을 확정할 수 있습니다.";
  // 홈 카드(?new=1) 진입 = 새 계산 → 빈 폼으로 초기화 (작업 중 새로고침은 보존)
  useResetOnNewParam(reset);

  const { activeClientId } = useProfessionalStore();

  // 로컬 이력 자동 저장 — 결과 화면(step 3) 진입 + result 있을 때 1회
  const isResult = currentStep === 3 && result !== null;
  // v2: pendingEditId·saveAsUpdate·saveAsNew API 폐기 — saveOrUpdateByContent 자동 dedup
  useAutoSaveCalculation({
    taxType: "stock_transfer",
    inputData: formData as unknown as Record<string, unknown>,
    resultData: isResult ? (result as unknown as Record<string, unknown>) : null,
    taxLawVersion: extractStockTransferDate(formData as unknown as Record<string, unknown>) ?? new Date().toISOString().split("T")[0],
    clientId: activeClientId,
  });

  // 수동 저장 — 자동저장과 별개로 사용자가 원할 때 즉시 이력 저장(갱신)
  const [saveMessage, setSaveMessage] = useState<SaveToastMessage | null>(null);
  const recordCount = useRecordCount(result);
  const handleManualSave = async () => {
    setSaveMessage(null);
    try {
      const outcome = await runStockManualSave({
        form: formData as unknown as Record<string, unknown>,
        result,
        clientId: activeClientId ?? null,
      });
      setSaveMessage(formatStockSaveMessage(outcome, recordCount));
    } catch (e) {
      setSaveMessage(
        formatStockSaveMessage(e instanceof Error ? e : new Error(String(e)), recordCount),
      );
    }
  };

  // 다음 단계 진행 (validation 체크)
  const handleNext = useCallback(() => {
    const errors =
      currentStep === 0
        ? validateStep1(formData)
        : currentStep === 1
          ? validateStep2(formData)
          : validateStep3(formData);

    const hasError = errors.some((e) => e.severity === "error");
    if (hasError) {
      const firstError = errors.find((e) => e.severity === "error");
      setError(firstError?.message ?? "입력 오류가 있습니다. 확인해주세요.");
      // 에러 배너가 페이지 상단에 있어 스크롤 하단의 다음 버튼 클릭 시 보이지 않는 문제 — 상단으로 스크롤
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    setError(null);
    setStep(currentStep + 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentStep, formData, setError, setStep]);

  const handleBack = useCallback(() => {
    if (currentStep === 0) {
      router.push("/");
      return;
    }
    setStep(currentStep - 1);
  }, [currentStep, router, setStep]);

  // 계산 실행
  //
  // 🔑 확정한 종목이 있으면 **합산 경로**로 간다. 종목별로 단건 호출을 반복하면
  //    §103①2호 기본공제가 종목마다 250만원씩 적용되고(과소과세), §102② 통산과
  //    §118의6①1호 B/C 안분이 아예 계산되지 않는다.
  const handleCalculate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (savedItems.length > 0) {
        const agg = await callStockTransferTaxAggregateAPI([...savedItems, formData]);
        setAggregateResult(agg);
        // 결과 화면·이력이 단건 `result`를 전제하므로 **마지막(편집 중이던) 종목**을 대표로 둔다.
        setResult(agg.items[agg.items.length - 1] ?? null);
      } else {
        const res = await callStockTransferTaxAPI(formData);
        setAggregateResult(null);
        setResult(res);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "계산 오류가 발생했습니다.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [formData, savedItems, setLoading, setError, setResult, setAggregateResult]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">주식 양도소득세</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              소득세법 §94①3·4 · 2026.4.21. 시행
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* onBeforeNavigate: 결과 화면에서 홈 이동 시 stale 결과 방지(스토어 메모리 정리, 입력 보존) */}
            <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" onBeforeNavigate={() => { if (isResult) { setResult(null); setStep(0); } }} />
            {currentStep > 0 && (
              <NavButton direction="prev" label="이전" onClick={handleBack} aria-label="이전 단계로 이동" />
            )}
            <SaveButton onSave={handleManualSave} />
            <ResetButton onReset={handleReset} />
          </div>
        </div>

        <SaveToast message={saveMessage} onClose={() => setSaveMessage(null)} />

        {/* 단계 인디케이터 */}
        <div className="mb-6">
          <StepIndicator
            steps={Array.from(STEPS)}
            current={currentStep}
            onStepClick={(i) => setStep(i)}
          />
        </div>

        {/* 에러 배너 */}
        {error && currentStep < 3 && (
          <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* 메인 레이아웃: 폼 + 사이드바 */}
        <div className="flex gap-8">
          {/* 폼 영역 */}
          <div className="flex-1 min-w-0">
            {currentStep === 0 && (
              <>
                {/*
                  다종목 합산신고 — §103①2호 기본공제는 국내·국외주식 통산액에서 연 1회이므로
                  여러 종목을 **한 계산**에 담아야 한다. 국외전출세는 별도 트랙이라 제외한다.
                */}
                {formData.marketType !== "exit_tax" && (
                  <div className="mb-8">
                    <StockItemListCard
                      savedItems={savedItems}
                      onAddCurrent={commitCurrentItem}
                      onEdit={editSavedItem}
                      onRemove={removeSavedItem}
                      canAddCurrent={canCommitCurrentItem}
                      addDisabledReason={commitDisabledReason}
                    />
                  </div>
                )}
                <Step1 form={formData} onChange={updateFormData} />
              </>
            )}
            {currentStep === 1 && (
              <Step2 form={formData} onChange={updateFormData} />
            )}
            {currentStep === 2 && (
              <Step3 form={formData} onChange={updateFormData} />
            )}
            {currentStep === 3 && (
              <>
                {/* 다종목 합산 시 — 종목별 요약·통산·외국납부세액 한도를 먼저 보인다. */}
                {aggregateResult && (
                  <div className="mb-8">
                    <StockAggregateSummaryCard
                      aggregate={aggregateResult}
                      names={[...savedItems, formData].map((f) => f.securityName)}
                    />
                  </div>
                )}
                <Step4
                  result={result}
                  form={formData}
                  error={error}
                  isLoading={isLoading}
                  onCalculate={handleCalculate}
                />
              </>
            )}

            {/* 하단 네비게이션 */}
            <div className="mt-8 flex items-center justify-between border-t pt-6">
              <WizardBackNav isFirstStep={currentStep === 0} onBack={handleBack} />

              {currentStep < 2 && (
                <NavButton direction="next" label="다음" onClick={handleNext} />
              )}

              {currentStep === 2 && (
                <CtaButton
                  onClick={() => {
                    const errs = validateStep3(formData).filter((e) => e.severity === "error");
                    if (errs.length > 0) {
                      setError(errs[0].message);
                      return;
                    }
                    setError(null);
                    setStep(3);
                    // 계산은 Step4에서 사용자가 실행
                  }}
                >
                  결과 보기
                </CtaButton>
              )}
            </div>
          </div>

          {/* 사이드바 (lg 이상) */}
          <div className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-8">
              <StockSidebar
                currentStep={currentStep}
                onStepClick={(i) => setStep(i)}
                stockName={formData.securityName || undefined}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
