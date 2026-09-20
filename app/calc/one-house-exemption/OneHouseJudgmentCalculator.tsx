"use client";

/**
 * 1세대1주택 비과세 **판정 메뉴** 오케스트레이터 (P4-2b-2)
 *
 * 4단계: ① 세대 → ② 보유 주택·권리 → ③ 양도 예정 → ④ 판정 결과
 *
 * 패턴은 `StockTransferTaxCalculator`(4단계 마법사 정본). 다른 점은 셋이다:
 *   1. **세액을 계산하지 않는다** — 판정까지다.
 *   2. 주택 수 위젯이 없다 — 명부에서 파생한다(G-1).
 *   3. 이력 자동저장은 **P4-2b-3**에서 붙인다(`LocalTaxType` 등록이 선행돼야 한다).
 */
import { useCallback, useMemo } from "react";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { NavButton, CtaButton, WizardBackNav } from "@/components/calc/shared/WizardNav";
import { OneHouseJudgmentSidebar } from "@/components/calc/one-house/OneHouseJudgmentSidebar";
import { Step1 } from "./steps/Step1";
import { Step2 } from "./steps/Step2";
import { Step3 } from "./steps/Step3";
import { Step4 } from "./steps/Step4";
import { useOneHouseJudgmentStore } from "@/lib/stores/one-house-judgment-store";
import { useResetOnNewParam } from "@/lib/hooks/use-reset-on-new-param";
import { callOneHouseExemptionAPI } from "@/lib/calc/one-house-exemption-api";
import {
  validateStep1,
  validateStep2,
  validateStep3,
} from "@/lib/calc/one-house-exemption-validate";

const STEPS = ["세대", "보유 주택·권리", "양도 예정", "판정 결과"] as const;
const RESULT_STEP = 3;

export default function OneHouseJudgmentCalculator() {
  // atomic selector (무한 루프 방지 — 계산기 store와 같은 규약)
  const currentStep = useOneHouseJudgmentStore((s) => s.currentStep);
  const formData = useOneHouseJudgmentStore((s) => s.formData);
  const result = useOneHouseJudgmentStore((s) => s.result);
  const error = useOneHouseJudgmentStore((s) => s.error);
  const isLoading = useOneHouseJudgmentStore((s) => s.isLoading);

  const { setStep, updateFormData, setResult, setError, setLoading, reset } =
    useOneHouseJudgmentStore();

  useResetOnNewParam(reset);

  const validateCurrent = useCallback(() => {
    const errors =
      currentStep === 0
        ? validateStep1(formData)
        : currentStep === 1
          ? validateStep2(formData)
          : validateStep3(formData);
    return errors.find((e) => e.severity === "error") ?? null;
  }, [currentStep, formData]);

  const handleNext = useCallback(() => {
    const first = validateCurrent();
    if (first) {
      setError(first.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError(null);
    setStep(currentStep + 1);
  }, [validateCurrent, setError, setStep, currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep === 0) return;
    setError(null);
    setStep(currentStep - 1);
  }, [currentStep, setError, setStep]);

  const handleJudge = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await callOneHouseExemptionAPI(formData));
    } catch (e) {
      setError(e instanceof Error ? e.message : "판정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [formData, setLoading, setError, setResult]);

  /**
   * 🔑 확인 다이얼로그를 여기서 만들지 않는다 — `ResetButton`이 `ConfirmDialog`를 **내장**한다.
   *    `window.confirm`은 데이터 손실 액션에 금지돼 있고(`no-native-confirm.guard.test.ts` ·
   *    `feedback_dialog_data_discard_confirm`), 실제로 그 가드가 이 코드를 잡았다.
   */
  const handleReset = useCallback(() => reset(), [reset]);

  const isResult = currentStep === RESULT_STEP && result !== null;
  const onStepClick = useMemo(() => (i: number) => setStep(i), [setStep]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">1세대1주택 비과세 판정</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              소득세법 §89①3호 · 시행령 §154·§155 — 세액이 아니라 <b>비과세 여부</b>를 판정합니다
            </p>
          </div>
          <div className="flex items-center gap-2">
            <HomeButton
              confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?"
              onBeforeNavigate={() => {
                if (isResult) {
                  setResult(null);
                  setStep(0);
                }
              }}
            />
            {currentStep > 0 && (
              <NavButton
                direction="prev"
                label="이전"
                onClick={handleBack}
                aria-label="이전 단계로 이동"
              />
            )}
            <ResetButton onReset={handleReset} />
          </div>
        </div>

        <div className="mb-6">
          <StepIndicator steps={Array.from(STEPS)} current={currentStep} onStepClick={onStepClick} />
        </div>

        {/* 결과 단계의 오류는 Step4가 직접 띄운다(재시도 버튼과 함께). */}
        {error && currentStep < RESULT_STEP && (
          <div className="mb-4 whitespace-pre-line rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex gap-8">
          <div className="min-w-0 flex-1">
            {currentStep === 0 && <Step1 form={formData} onChange={updateFormData} />}
            {currentStep === 1 && <Step2 form={formData} onChange={updateFormData} />}
            {currentStep === 2 && <Step3 form={formData} onChange={updateFormData} />}
            {currentStep === RESULT_STEP && (
              <Step4
                result={result}
                error={error}
                isLoading={isLoading}
                onJudge={handleJudge}
              />
            )}

            <div className="mt-8 flex items-center justify-between border-t pt-6">
              <WizardBackNav isFirstStep={currentStep === 0} onBack={handleBack} />
              {currentStep < 2 && (
                <NavButton direction="next" label="다음" onClick={handleNext} />
              )}
              {currentStep === 2 && (
                <CtaButton
                  data-testid="one-house-judge-cta"
                  onClick={() => {
                    const first = validateCurrent();
                    if (first) {
                      setError(first.message);
                      return;
                    }
                    setError(null);
                    setStep(RESULT_STEP);
                    // 판정 호출은 Step4가 마운트되며 1회 실행한다.
                  }}
                >
                  판정 결과 보기
                </CtaButton>
              )}
            </div>
          </div>

          <div className="hidden w-72 flex-shrink-0 lg:block">
            <div className="sticky top-8">
              <OneHouseJudgmentSidebar
                form={formData}
                currentStep={currentStep}
                onStepClick={onStepClick}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
