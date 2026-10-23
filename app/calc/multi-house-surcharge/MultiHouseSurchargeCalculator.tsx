"use client";

/**
 * 다주택 중과 **판정 메뉴** 오케스트레이터 (계획서 `docs/00-pm/multi-house-surcharge-judgment-menu.plan.md` §5.1 · §5.6 · P6b)
 *
 * 4단계: ① 세대 → ② 양도 대상 주택 → ③ 보유 주택·권리 → ④ 판정 결과(+ 선택 ⑤ 세부담 시뮬레이션 — P8) — 1주택 판정 메뉴와 **같은 단계 화면**을 `menu="surcharge"`로
 * 쓰고 **입력(store `formData`)도 함께 쓴다**(D2). 결과·단계·오류·로딩은 store의 `surcharge` 슬롯이다(T7).
 *
 * 1주택 오케스트레이터(`OneHouseJudgmentCalculator.tsx`)를 일반화하지 않고 새로 둔다(T8) — 그쪽은 AI·자동저장·`resultAtMount` 등
 * 전용 분기와 anchor가 많다. 안전장치는 그대로 이어받는다(§5.6): 의뢰인 격리 표시 방어 · 응답 귀속 가드 · 점프 관문 ·
 * 결과 단계 제자리 클릭 무시 · 경고 파생 · `?new=1` 초기화. **이력 자동저장은 하지 않는다**(D4).
 */
import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { NavButton, CtaButton, WizardBackNav } from "@/components/calc/shared/WizardNav";
import { ValidationWarnings } from "@/components/calc/shared/ValidationWarnings";
import { MultiHouseSurchargeSidebar } from "@/components/calc/multi-house-surcharge/MultiHouseSurchargeSidebar";
import { Step1 } from "@/app/calc/one-house-exemption/steps/Step1";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { StepResult } from "./steps/StepResult";
import { StepSimulation } from "./steps/StepSimulation";
import { useOneHouseJudgmentStore } from "@/lib/stores/one-house-judgment-store";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { useResetOnNewParam } from "@/lib/hooks/use-reset-on-new-param";
import { callMultiHouseSurchargeJudgmentAPI } from "@/lib/calc/multi-house-surcharge-api";
import { openTransferWithOneHouseFacts } from "@/lib/calc/one-house-judgment-handoff";
import {
  validateAllSurchargeSteps,
  validateSurchargeStepByIndex,
} from "@/lib/calc/multi-house-surcharge-validate";
import { surchargeSimulationInputError } from "@/lib/calc/surcharge-simulation-input";

/** ⚠️ 사이드바 `STEP_LABELS`와 같은 문자열 — 파일명 Step3(양도 대상)이 2번째, Step2(보유 주택)가 3번째다(1주택 메뉴와 같은 이유). */
const SURCHARGE_STEPS = ["세대", "양도 대상 주택", "보유 주택·권리", "판정 결과", "세부담 시뮬레이션"] as const;
const RESULT_STEP = 3;
/** 선택 단계(T9) — 결과 화면 안 입력은 판정 결과를 지우므로 결과 뒤 단계로 둔다 */
const SIMULATION_STEP = 4;

/** 두 판정 메뉴가 입력을 함께 쓴다는 사실을 초기화·홈 이동 확인에 알린다(§5.8 · R2). */
const SHARED_INPUT_NOTE = "1세대1주택 비과세 판정과 다주택 중과 판정은 입력을 함께 씁니다.";

export default function MultiHouseSurchargeCalculator() {
  // atomic selector — 계산기 store와 같은 규약
  const formData = useOneHouseJudgmentStore((s) => s.formData);
  const currentStep = useOneHouseJudgmentStore((s) => s.surcharge.currentStep);
  const storeResult = useOneHouseJudgmentStore((s) => s.surcharge.result);
  const resultClientId = useOneHouseJudgmentStore((s) => s.surcharge.resultClientId);
  const error = useOneHouseJudgmentStore((s) => s.surcharge.error);
  const isLoading = useOneHouseJudgmentStore((s) => s.surcharge.isLoading);
  const simulationInput = useOneHouseJudgmentStore((s) => s.surcharge.simulationInput);
  const setSimulationInput = useOneHouseJudgmentStore((s) => s.setSurchargeSimulationInput);
  const updateFormData = useOneHouseJudgmentStore((s) => s.updateFormData);
  const setStep = useOneHouseJudgmentStore((s) => s.setSurchargeStep);
  const setResult = useOneHouseJudgmentStore((s) => s.setSurchargeResult);
  const setError = useOneHouseJudgmentStore((s) => s.setSurchargeError);
  const setLoading = useOneHouseJudgmentStore((s) => s.setSurchargeLoading);
  const reset = useOneHouseJudgmentStore((s) => s.reset);

  const activeClientId = useProfessionalStore((s) => s.activeClientId);
  const router = useRouter();

  /** 다른 의뢰인이 만든 결과는 쓰지 않는다 — store 구독이 놓친 경로를 막는 표시 단계 방어(1주택 메뉴 S13-3과 같다). */
  const result = storeResult !== null && resultClientId !== activeClientId ? null : storeResult;

  useResetOnNewParam(reset);

  const validateCurrent = useCallback(
    () => validateSurchargeStepByIndex(formData, currentStep).find((e) => e.severity === "error") ?? null,
    [currentStep, formData],
  );

  /** 경고는 파생값 — store에 넣지 않는다. 결과 단계에서는 전 단계를 모은다(건너뛴 단계의 경고를 놓치지 않게). */
  const stepWarnings = useMemo(
    () =>
      currentStep >= RESULT_STEP ? validateAllSurchargeSteps(formData) : validateSurchargeStepByIndex(formData, currentStep),
    [formData, currentStep],
  );

  /** 앞 단계의 차단 오류를 건너뛰지 못하게 그 단계로 데려간다(1주택 메뉴 F-2와 같은 관문). 반환값은 「막았는가」. */
  const blockOnFirstInvalidStep = useCallback(
    (upTo: number): boolean => {
      for (let i = 0; i < upTo && i < RESULT_STEP; i++) {
        const first = validateSurchargeStepByIndex(formData, i).find((e) => e.severity === "error");
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
    // 마지막 관문 — 어떤 경로로 결과 단계에 왔든 판정 불가 입력으로는 판정하지 않는다.
    if (blockOnFirstInvalidStep(RESULT_STEP)) return;
    /*
      응답은 그 요청을 만든 폼·의뢰인에게만 귀속된다(1주택 메뉴 S13-2·S13-3) — 기다리는 동안 입력이나 의뢰인이 바뀌면
      늦게 도착한 옛 판정을 버린다. `updateFormData`·`reset`은 늘 새 폼 객체를 만들므로 참조 비교로 충분하다.
    */
    const requestClientId = activeClientId;
    const isCurrent = () =>
      useOneHouseJudgmentStore.getState().formData === formData &&
      useProfessionalStore.getState().activeClientId === requestClientId;
    setLoading(true);
    setError(null);
    try {
      const res = await callMultiHouseSurchargeJudgmentAPI(formData);
      if (isCurrent()) setResult(res, requestClientId);
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : "판정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [formData, activeClientId, setLoading, setError, setResult, blockOnFirstInvalidStep]);

  /**
   * ⑤ 「세액 비교하기」 — 판정과 시뮬레이션을 한 요청으로 받는다(입력 사실이 바뀌어 판정이 비었어도 함께 채운다).
   * 귀속 가드는 판정과 같고, 시뮬레이션 입력이 그사이 바뀌어도 늦은 응답을 버린다.
   */
  const handleSimulate = useCallback(async () => {
    if (blockOnFirstInvalidStep(RESULT_STEP)) return;
    const inputError = surchargeSimulationInputError(simulationInput);
    if (inputError) {
      setError(inputError);
      return;
    }
    const requestClientId = activeClientId;
    const isCurrent = () => {
      const s = useOneHouseJudgmentStore.getState();
      return (
        s.formData === formData &&
        s.surcharge.simulationInput === simulationInput &&
        useProfessionalStore.getState().activeClientId === requestClientId
      );
    };
    setLoading(true);
    setError(null);
    try {
      const res = await callMultiHouseSurchargeJudgmentAPI(formData, simulationInput);
      if (isCurrent()) setResult(res, requestClientId);
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : "계산에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [formData, simulationInput, activeClientId, setLoading, setError, setResult, blockOnFirstInvalidStep]);

  const isResult = currentStep >= RESULT_STEP && result !== null;

  /**
   * D3d 「이 사실로 양도세 계산」 — 넘기는 것은 **폼(사실)** 이다. 계산기는 같은 엔진으로 다시 판정한다. 판정 이력을 남기지 않으므로(D4)
   * 출처 id 없이 넘긴다. 양도 주택 자체 배제 사실·한시 유예도 판정 폼의 값이 실린다(§5.7 · P5).
   */
  const handleCalculateTax = useCallback(() => {
    void openTransferWithOneHouseFacts(formData, router, undefined);
  }, [formData, router]);

  /** 단계 점프 — StepIndicator·사이드바 공용. 뒤로·제자리는 허용, 앞으로 갈 때만 건너뛰는 단계를 검사한다. */
  const onStepClick = useCallback(
    (target: number) => {
      // 결과 단계 제자리 클릭은 무시 — 오류와 「다시 판정하기」를 지우면 1회 가드 때문에 재판정도 없이 멈춘다(S13-12).
      if (target === currentStep && currentStep === RESULT_STEP) return;
      if (target > currentStep && blockOnFirstInvalidStep(target)) return;
      setError(null);
      setStep(target);
    },
    [currentStep, blockOnFirstInvalidStep, setError, setStep],
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* 375px — 부제목이 길어 한 줄에 두면 버튼 묶음이 세로로 눌린다. 좁은 화면에서는 버튼을 제목 아래 줄로 내린다 */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">다주택 중과 판정</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              소득세법 §104⑦ · 시행령 §167의3·§167의10 — 세액이 아니라 <b>중과 여부와 사유</b>를 판정합니다
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 print:hidden">
            <HomeButton
              confirmMessage={`홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다. ${SHARED_INPUT_NOTE}\n계속하시겠습니까?`}
              onBeforeNavigate={() => {
                if (isResult) {
                  setResult(null);
                  setStep(0);
                }
              }}
            />
            {currentStep > 0 && (
              <NavButton direction="prev" label="이전" onClick={handleBack} aria-label="이전 단계로 이동" />
            )}
            <ResetButton
              onReset={reset}
              confirmMessage={`지금까지 입력한 값이 모두 삭제되고 빈 폼으로 돌아갑니다. ${SHARED_INPUT_NOTE} 이 동작은 되돌릴 수 없습니다.`}
            />
          </div>
        </div>

        {/* 교차 링크(§5.8 D5) — 입력을 그대로 둔 채 같은 사실로 비과세를 판정한다(`?new=1` 없음). */}
        <div className="mb-4 flex justify-end print:hidden">
          <Link
            href="/calc/one-house-exemption"
            data-testid="surcharge-to-one-house-link"
            className="text-sm font-medium text-primary hover:underline"
          >
            이 입력으로 1세대1주택 비과세 판정 보기 →
          </Link>
        </div>

        <div className="mb-6 print:hidden">
          <StepIndicator steps={Array.from(SURCHARGE_STEPS)} current={currentStep} onStepClick={onStepClick} />
        </div>

        {/* 결과 단계의 오류는 StepResult가 재시도 버튼과 함께 띄운다. */}
        {error && currentStep < RESULT_STEP && (
          <div className="mb-4 whitespace-pre-line rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <ValidationWarnings
          items={stepWarnings}
          title={currentStep === RESULT_STEP ? "판정 시 전제된 주의사항" : "확인이 필요합니다"}
          testId="surcharge-validation-warnings"
        />

        <div className="flex gap-8">
          <div className="min-w-0 flex-1">
            {currentStep === 0 && <Step1 form={formData} onChange={updateFormData} />}
            {currentStep === 1 && <Step3 form={formData} onChange={updateFormData} menu="surcharge" />}
            {currentStep === 2 && <Step2 form={formData} onChange={updateFormData} menu="surcharge" />}
            {currentStep === RESULT_STEP && (
              <StepResult
                result={result}
                error={error}
                isLoading={isLoading}
                onJudge={handleJudge}
                formHouses={formData.houses ?? []}
                formRights={formData.presaleRights ?? []}
                sellingStdPrice={formData.assets?.[0]?.standardPriceAtTransfer}
                onCalculateTax={handleCalculateTax}
              />
            )}
            {currentStep === SIMULATION_STEP && (
              <StepSimulation
                form={formData}
                result={result}
                input={simulationInput}
                onInputChange={setSimulationInput}
                onSimulate={handleSimulate}
                isLoading={isLoading}
                error={error}
              />
            )}

            <div className="mt-8 flex items-center justify-between border-t pt-6 print:hidden">
              <WizardBackNav isFirstStep={currentStep === 0} onBack={handleBack} />
              {currentStep < 2 && <NavButton direction="next" label="다음" onClick={handleNext} />}
              {currentStep === 2 && (
                <CtaButton
                  data-testid="surcharge-judge-cta"
                  onClick={() => {
                    const first = validateCurrent();
                    if (first) {
                      setError(first.message);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      return;
                    }
                    setError(null);
                    setStep(RESULT_STEP);
                    // 판정 호출은 StepResult가 마운트되며 1회 실행한다.
                  }}
                >
                  판정 결과 보기
                </CtaButton>
              )}
              {currentStep === RESULT_STEP && result !== null && (
                <NavButton
                  direction="next"
                  label="세부담 시뮬레이션"
                  data-testid="surcharge-to-simulation"
                  onClick={() => {
                    setError(null);
                    setStep(SIMULATION_STEP);
                  }}
                />
              )}
            </div>
          </div>

          <div className="hidden w-72 flex-shrink-0 lg:block print:hidden">
            <div className="sticky top-8">
              <MultiHouseSurchargeSidebar form={formData} currentStep={currentStep} onStepClick={onStepClick} result={result} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
