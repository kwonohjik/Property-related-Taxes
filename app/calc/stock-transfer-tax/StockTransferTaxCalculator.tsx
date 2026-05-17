"use client";

/**
 * StockTransferTaxCalculator — 주식 양도소득세 마법사 오케스트레이터
 *
 * 4단계: Step1(자산·시장) → Step2(양도·취득가) → Step3(필요경비·신고) → Step4(결과)
 *
 * 부동산 양도세 마법사와 완전히 분리된 독립 도메인.
 */

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { Step1 } from "./steps/Step1";
import { Step2 } from "./steps/Step2";
import { Step3 } from "./steps/Step3";
import { Step4 } from "./steps/Step4";
import { useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import { callStockTransferTaxAPI } from "@/lib/calc/stock-transfer-tax-api";
import { validateStep1, validateStep2, validateStep3 } from "@/lib/calc/stock-transfer-tax-validate";
import { ChevronLeft } from "lucide-react";

const STEPS = ["자산·시장·대주주", "양도·취득가액", "필요경비·신고", "결과"] as const;

export default function StockTransferTaxCalculator() {
  const router = useRouter();

  // atomic selector (무한 루프 방지)
  const currentStep = useStockTransferStore((s) => s.currentStep);
  const formData = useStockTransferStore((s) => s.formData);
  const result = useStockTransferStore((s) => s.result);
  const error = useStockTransferStore((s) => s.error);
  const isLoading = useStockTransferStore((s) => s.isLoading);

  const { setStep, updateFormData, setResult, setError, setLoading, reset } =
    useStockTransferStore();

  // 현재 step validation 오류 수 (StepIndicator 배지)
  const step1Errors = useMemo(
    () => validateStep1(formData).filter((e) => e.severity === "error").length,
    [formData]
  );
  const step2Errors = useMemo(
    () => validateStep2(formData).filter((e) => e.severity === "error").length,
    [formData]
  );
  const step3Errors = useMemo(
    () => validateStep3(formData).filter((e) => e.severity === "error").length,
    [formData]
  );

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
      return;
    }
    setError(null);
    setStep(currentStep + 1);
  }, [currentStep, formData, setError, setStep]);

  const handleBack = useCallback(() => {
    if (currentStep === 0) {
      router.push("/");
      return;
    }
    setStep(currentStep - 1);
  }, [currentStep, router, setStep]);

  // 계산 실행
  const handleCalculate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callStockTransferTaxAPI(formData);
      setResult(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "계산 오류가 발생했습니다.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [formData, setLoading, setError, setResult]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">주식 양도소득세</h1>
            <p className="text-sm text-muted-foreground mt-1">
              소득세법 §94①3·4 · 2026.4.21. 시행
            </p>
          </div>
          <ResetButton onReset={handleReset} />
        </div>

        {/* 단계 인디케이터 */}
        <div className="mb-6">
          <StepIndicator
            steps={Array.from(STEPS)}
            current={currentStep}
            onStepClick={(i) => {
              // 이전 단계만 클릭 가능
              if (i < currentStep) setStep(i);
            }}
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
              <Step1 form={formData} onChange={updateFormData} />
            )}
            {currentStep === 1 && (
              <Step2 form={formData} onChange={updateFormData} />
            )}
            {currentStep === 2 && (
              <Step3 form={formData} onChange={updateFormData} />
            )}
            {currentStep === 3 && (
              <Step4
                result={result}
                form={formData}
                error={error}
                isLoading={isLoading}
                onCalculate={handleCalculate}
              />
            )}

            {/* 하단 네비게이션 */}
            <div className="mt-8 flex items-center justify-between border-t pt-6">
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors text-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                {currentStep === 0 ? "홈으로" : "이전"}
              </button>

              {currentStep < 3 && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-2 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 transition-colors text-sm"
                >
                  다음
                </button>
              )}

              {currentStep === 2 && (
                <button
                  type="button"
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
                  className="ml-2 px-6 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors text-sm"
                >
                  결과 보기
                </button>
              )}
            </div>
          </div>

          {/* 사이드바 (lg 이상) */}
          <div className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-8">
              <StockSidebar
                currentStep={currentStep}
                onStepClick={(i) => {
                  if (i < currentStep) setStep(i);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
