"use client";

/**
 * 비사업용 토지 **판정 메뉴** 오케스트레이터 (계획서 `docs/01-plan/features/nbl-judgment-menu.ui.plan.md` §2·§3·§9)
 *
 * 4단계: ① 토지 기본 → ② 사업용 의제·지목 → ③ 부득이한 사유·도시편입일·양도일 의제 → ④ 판정 결과. 파일명이 곧 화면 순서다
 * (`steps/Step{Land,Judge,Grace,Result}.tsx` — 1주택 판정의 「파일명 ≠ 화면 순서」 혼동을 피한다).
 * 패턴은 `OneHouseJudgmentCalculator`(판정 메뉴 정본). 다른 점: 세액을 계산하지 않고, store가 독립이며, 입력 위젯은 계산기 Step4 「판정 도움」을 그대로 쓴다.
 */
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { CtaButton, NavButton, WizardBackNav } from "@/components/calc/shared/WizardNav";
import { NblJudgmentSidebar } from "@/components/calc/nbl-judgment/NblJudgmentSidebar";
import { jumpToIssueField } from "@/components/calc/transfer/validation-jump";
import { StepLand } from "./steps/StepLand";
import { StepJudge } from "./steps/StepJudge";
import { StepGrace } from "./steps/StepGrace";
import { StepResult } from "./steps/StepResult";
import { useNblJudgmentStore } from "@/lib/stores/nbl-judgment-store";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { useResetOnNewParam } from "@/lib/hooks/use-reset-on-new-param";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { callNblJudgmentAPI } from "@/lib/calc/non-business-land-judgment-api";
import { openTransferWithNblFacts } from "@/lib/calc/nbl-judgment-handoff";
import { nblHandoffRemainingInputs } from "@/lib/calc/nbl-judgment-handoff-remaining";
import { NBL_JUDGMENT_RESULT_STEP, NBL_JUDGMENT_STEPS } from "@/lib/calc/nbl-judgment-steps";
import { validateAllSteps } from "@/lib/calc/non-business-land-judgment-validate";
import { validateStepByIndex } from "@/lib/calc/non-business-land-judgment-validate";

/** 마지막 입력 단계(③) — 결과의 「입력 수정」과 「판정 결과 보기」 CTA가 가리킨다. */
const LAST_INPUT_STEP = NBL_JUDGMENT_RESULT_STEP - 1;

export default function NblJudgmentCalculator() {
  // atomic selector (무한 루프 방지 — 새 객체를 돌려주는 selector 금지)
  const currentStep = useNblJudgmentStore((s) => s.currentStep);
  const formData = useNblJudgmentStore((s) => s.formData);
  const storeResult = useNblJudgmentStore((s) => s.result);
  const resultClientId = useNblJudgmentStore((s) => s.resultClientId);
  const error = useNblJudgmentStore((s) => s.error);
  const isLoading = useNblJudgmentStore((s) => s.isLoading);
  const setStep = useNblJudgmentStore((s) => s.setStep);
  const updateFormData = useNblJudgmentStore((s) => s.updateFormData);
  const updateAsset = useNblJudgmentStore((s) => s.updateAsset);
  const setResult = useNblJudgmentStore((s) => s.setResult);
  const setError = useNblJudgmentStore((s) => s.setError);
  const setLoading = useNblJudgmentStore((s) => s.setLoading);
  const reset = useNblJudgmentStore((s) => s.reset);

  const activeClientId = useProfessionalStore((s) => s.activeClientId);
  const router = useRouter();

  /**
   * 🔴 다른 의뢰인이 만든 판정 결과는 쓰지 않는다 — 결과는 판정을 요청한 시점의 의뢰인(`resultClientId`)과 묶여 있고, 지금 의뢰인과 다르면 표시·자동저장에 쓰지 않는다.
   *    정본 경로는 store의 의뢰인 구독(결과를 비우고 1단계로)이고, 여기는 그것이 놓친 경로를 막는 표시 단계 방어다 — `useEffect`로 store에 쓰지 않고 렌더에서 파생한다.
   */
  const result = storeResult !== null && resultClientId !== activeClientId ? null : storeResult;

  /** 🔴 이 화면을 열기 전부터 있던 결과는 자동저장하지 않는다 — 홈 카드 재진입(`?new=1`)이 reset과 저장을 같은 커밋에서 돌려 옛 결과로 저장하던 사고의 장치. */
  const [resultAtMount] = useState(() => useNblJudgmentStore.getState().result);

  useResetOnNewParam(reset);

  const blockOnFirstInvalidStep = useCallback(
    /**
     * 🔴 앞 단계의 차단 오류를 건너뛰지 못하게 한다(UD-6) — 「다음」·단계 클릭·`handleJudge` 세 곳이 같은 이 함수를 쓴다. 점프로 ⑧을 건너뛰는 경로를 구조적으로 막는다.
     * 막을 때는 그 단계로 데려간다. 반환값은 「막았는가」.
     */
    (upTo: number): boolean => {
      for (let i = 0; i < upTo && i < NBL_JUDGMENT_RESULT_STEP; i++) {
        const first = validateStepByIndex(formData, i)[0];
        if (!first) continue;
        setError(first.message);
        setStep(i);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return true;
      }
      return false;
    },
    [formData, setError, setStep],
  );

  const handleNext = useCallback(() => {
    const first = validateStepByIndex(formData, currentStep)[0];
    if (first) {
      setError(first.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError(null);
    setStep(currentStep + 1);
  }, [formData, currentStep, setError, setStep]);

  const handleBack = useCallback(() => {
    if (currentStep === 0) return;
    setError(null);
    setStep(currentStep - 1);
  }, [currentStep, setError, setStep]);

  const handleJudge = useCallback(async () => {
    // 🔴 마지막 관문 — ④에 어떤 경로로 도달했든 판정 불가 입력으로는 판정하지 않는다.
    if (blockOnFirstInvalidStep(NBL_JUDGMENT_RESULT_STEP)) return;
    /*
      🔴 응답은 그 응답을 만든 폼·그 요청을 낸 의뢰인에게만 귀속된다 — 응답을 기다리는 동안 입력을 바꾸면 `updateAsset`이 결과를 무효화하는데, 늦게 도착한 옛 판정이
      그것을 덮어 새 입력의 결과로 표시·저장되던 사고의 장치. `updateFormData`·`updateAsset`·`reset`은 항상 새 폼 객체를 만들므로 참조 비교로 충분하다.
    */
    const requestClientId = activeClientId;
    const isCurrent = () =>
      useNblJudgmentStore.getState().formData === formData && useProfessionalStore.getState().activeClientId === requestClientId;
    setLoading(true);
    setError(null);
    try {
      const res = await callNblJudgmentAPI(formData.assets[0], formData.transferDate);
      if (isCurrent()) setResult(res, requestClientId);
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : "판정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [formData, activeClientId, setLoading, setError, setResult, blockOnFirstInvalidStep]);

  /** 단계 점프 — StepIndicator와 사이드바가 같은 이것을 쓴다. 뒤로·제자리는 언제나 허용(고치러 가는 길을 막지 않는다), 앞으로만 건너뛰는 단계를 검사한다. */
  const onStepClick = useCallback(
    (target: number) => {
      // 결과 단계의 제자리 클릭은 아무것도 하지 않는다 — 오류와 「다시 판정하기」가 사라져 재판정이 걸리지 않는 고정 상태를 막는다.
      if (target === currentStep && currentStep === NBL_JUDGMENT_RESULT_STEP) return;
      if (target > currentStep && blockOnFirstInvalidStep(target)) return;
      setError(null);
      setStep(target);
    },
    [currentStep, blockOnFirstInvalidStep, setError, setStep],
  );

  const isResult = currentStep === NBL_JUDGMENT_RESULT_STEP && result !== null;

  /** 이력 자동저장 — `resultData`는 판정이 나온 뒤에만(훅은 null이면 건너뛴다). 이 화면에서 새로 만든 결과만 저장한다. */
  const resultData = isResult && result !== resultAtMount ? (result as unknown as Record<string, unknown>) : null;
  useAutoSaveCalculation({
    taxType: "non_business_land_judgment",
    inputData: formData as unknown as Record<string, unknown>,
    resultData,
    // 법령 기준일 = 양도(예정)일 — route가 그 날짜로 세율·법령을 로드한다.
    taxLawVersion: formData.transferDate || new Date().toISOString().split("T")[0],
    clientId: activeClientId,
  });

  // 오류 배너의 「입력칸으로 이동」 — 같은 문구의 오류가 가리키는 칸을 찾는다(결과가 아니라 입력 단계의 오류).
  const errorIssue = useMemo(
    () => (error ? validateAllSteps(formData).find((i) => i.message === error) : undefined),
    [error, formData],
  );

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  /**
   * 「양도세 계산하기」 — 넘기는 것은 **폼(사실)** 이지 `result`가 아니다(계산기가 같은 엔진으로 다시 판정한다). 진입은 단일 헬퍼를 거친다 —
   * 여기서 store를 직접 쓰고 `router.push`하면 이력 카드·드로어가 두 번 갈라졌던 전례를 되풀이한다.
   */
  const handleCalculateTax = useCallback(() => {
    void openTransferWithNblFacts(formData, router);
  }, [formData, router]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">비사업용 토지 판정</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              소득세법 §104의3 · 시행령 §168의6~§168의14 — 세액이 아니라 <b>사업용·비사업용 여부</b>를 판정합니다
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
            {currentStep > 0 && <NavButton direction="prev" label="이전" onClick={handleBack} aria-label="이전 단계로 이동" />}
            <ResetButton onReset={handleReset} confirmMessage="지금까지 입력한 값이 모두 삭제되고 빈 폼으로 돌아갑니다. 이 동작은 되돌릴 수 없습니다." />
          </div>
        </div>

        <div className="mb-6">
          <StepIndicator steps={Array.from(NBL_JUDGMENT_STEPS)} current={currentStep} onStepClick={onStepClick} />
        </div>

        {/* 결과 단계의 오류는 StepResult가 직접 띄운다(재시도 버튼과 함께). */}
        {error && currentStep < NBL_JUDGMENT_RESULT_STEP && (
          <div
            data-testid="nbl-judgment-error"
            className="mb-4 flex flex-wrap items-start justify-between gap-2 whitespace-pre-line rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
          >
            <span>{error}</span>
            {errorIssue?.field && (
              <button
                type="button"
                data-testid="nbl-judgment-error-jump"
                className="shrink-0 font-medium underline"
                onClick={() => jumpToIssueField({ message: errorIssue.message, step: currentStep, field: errorIssue.field })}
              >
                입력칸으로 이동
              </button>
            )}
          </div>
        )}

        <div className="flex gap-8">
          <div className="min-w-0 flex-1">
            {currentStep === 0 && <StepLand form={formData} onFormChange={updateFormData} onAssetChange={updateAsset} />}
            {currentStep === 1 && <StepJudge form={formData} onAssetChange={updateAsset} />}
            {currentStep === 2 && <StepGrace form={formData} onAssetChange={updateAsset} />}
            {currentStep === NBL_JUDGMENT_RESULT_STEP && (
              <StepResult
                result={result}
                form={formData}
                error={error}
                isLoading={isLoading}
                onJudge={handleJudge}
                onCalculateTax={handleCalculateTax}
                remainingInputs={nblHandoffRemainingInputs(formData)}
              />
            )}

            <div className="mt-8 flex items-center justify-between border-t pt-6">
              <WizardBackNav isFirstStep={currentStep === 0} onBack={handleBack} />
              {currentStep < LAST_INPUT_STEP && <NavButton direction="next" label="다음" onClick={handleNext} />}
              {currentStep === LAST_INPUT_STEP && (
                <CtaButton
                  data-testid="nbl-judgment-judge-cta"
                  onClick={() => {
                    const first = validateStepByIndex(formData, currentStep)[0];
                    if (first) {
                      setError(first.message);
                      // 오류 배너는 맨 위, 이 버튼은 맨 아래다 — 올리지 않으면 무반응으로 보인다.
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      return;
                    }
                    setError(null);
                    setStep(NBL_JUDGMENT_RESULT_STEP);
                    // 판정 호출은 StepResult가 마운트되며 1회 실행한다.
                  }}
                >
                  판정 결과 보기
                </CtaButton>
              )}
            </div>
          </div>

          <div className="hidden w-72 flex-shrink-0 lg:block">
            <div className="sticky top-8">
              <NblJudgmentSidebar form={formData} currentStep={currentStep} onStepClick={onStepClick} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
