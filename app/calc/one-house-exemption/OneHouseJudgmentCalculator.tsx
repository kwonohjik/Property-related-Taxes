"use client";

/**
 * 1세대1주택 비과세 **판정 메뉴** 오케스트레이터 (P4-2b-2)
 *
 * 4단계: ① 세대 → ② 보유 주택·권리 → ③ 양도 예정 → ④ 판정 결과
 *
 * 패턴은 `StockTransferTaxCalculator`(4단계 마법사 정본). 다른 점은 셋이다:
 *   1. **세액을 계산하지 않는다** — 판정까지다.
 *   2. 주택 수 위젯이 없다 — 명부에서 파생한다(G-1).
 *   3. 이력에 남는 것은 **세액이 아니라 판정**이다(P4-2b-3).
 */
import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
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
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { callOneHouseExemptionAPI } from "@/lib/calc/one-house-exemption-api";
import { openTransferWithOneHouseFacts } from "@/lib/calc/one-house-judgment-handoff";
import {
  validateAllSteps,
  validateStepByIndex,
} from "@/lib/calc/one-house-exemption-validate";
import { ValidationWarnings } from "@/components/calc/shared/ValidationWarnings";

/**
 * 🔑 **파일명 ≠ 화면 순서다** — `Step3`(양도 대상)이 2번째, `Step2`(보유 주택)가 3번째 화면이다.
 *
 * 순서를 뒤집은 이유는 미관이 아니라 **데이터 의존 방향**이다. `assets[0].acquisitionDate`·
 * `transferDate`의 유일한 입력 경로가 `Step3`인데 `Step2`가 그 둘을 6곳에서 소비한다
 * (§155① 도출·요건 자동판정·§154① 단서 게이트·§155⑳). 종전 순서에서는 순방향으로 처음
 * 도달한 사용자에게 §155① 블록이 **아예 뜨지 않았다**(`household-house-count.ts:263`
 * `if (!prev) return fallback()` → `TemporaryTwoHouseSection.tsx:123`이 `null`).
 *
 * 파일명을 그대로 둔 것은 이 저장소의 관례다(양도세 계산기도 Step1·Step4·Step5·Step6 ↔ 인덱스
 * 0~3). 유닛 9파일이 `Step2`·`Step3`를 **경로로 import**하고 소스 문자열 anchor 2건이 그 경로를
 * 고정하므로, 이름을 바꾸면 얻는 것 없이 그 전부를 건드리게 된다.
 */
const STEPS = ["세대", "양도 대상 주택", "보유 주택·권리", "판정 결과"] as const;
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

  const activeClientId = useProfessionalStore((s) => s.activeClientId);
  const router = useRouter();

  useResetOnNewParam(reset);

  const validateCurrent = useCallback(
    // 인덱스 → validateStepN 매핑은 validate 모듈이 갖는다(사이드바 배지와 **같은 한 벌**).
    () => validateStepByIndex(formData, currentStep).find((e) => e.severity === "error") ?? null,
    [currentStep, formData],
  );

  /**
   * 경고(`severity: "warning"`) — **파생값이다. store에 넣지 않는다.**
   *
   * 🔑 `error` store 필드에 태우면 안 된다: 그 필드는 「다음」을 눌렀을 때만 채워지는데
   *    경고는 진행을 막지 않으므로 곧바로 `setStep(+1)` → `setError(null)`이 이어져
   *    **띄우자마자 사라진다**. 조건이 성립하는 동안 계속 보여야 하므로 `formData`에서 파생한다.
   *
   * 🔑 결과 단계에서는 **전 단계를 모은다** — 사이드바로 단계를 건너뛴 사용자가 그 단계의
   *    경고를 한 번도 못 보는 경로가 있기 때문이다. 다만 이것이 그 우회 자체를 막지는 않는다
   *    (계획서 §7 F-2는 여전히 열려 있다).
   */
  const stepWarnings = useMemo(
    () =>
      currentStep === RESULT_STEP
        ? validateAllSteps(formData)
        : validateStepByIndex(formData, currentStep),
    [formData, currentStep],
  );

  /**
   * 🔴 **앞 단계의 차단 오류를 건너뛰지 못하게 한다** (F-2).
   *
   * 이것이 미관 문제가 아닌 이유: 명부에 **취득일 없는 주택**을 넣으면 ⑧은 막지만 엔진은
   * 그 주택을 **주택 수에서 조용히 뺀다**. ③을 건너뛰고 ④로 점프하면 2주택 과세가
   * **1주택 비과세로 뒤집힌다**(`judgment-step-jump-bypass.predo.anchor.test.tsx` FB-1이
   * 실측으로 고정). 서버는 그 본문을 200으로 받으므로 **클라이언트 관문이 유일한 방어선**이다.
   *
   * 막을 때 **그 단계로 데려간다** — 메시지만 띄우고 제자리에 두면 어디를 고쳐야 할지 모른다.
   * 반환값은 「막았는가」다.
   */
  const blockOnFirstInvalidStep = useCallback(
    (upTo: number): boolean => {
      for (let i = 0; i < upTo && i < RESULT_STEP; i++) {
        const first = validateStepByIndex(formData, i).find((e) => e.severity === "error");
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
    /*
      🔴 **마지막 관문.** ④에 어떤 경로로 도달했든 판정 불가 입력으로는 판정하지 않는다.
         점프 관문(`onStepClick`)만 두면 경로를 하나 놓칠 때마다 구멍이 다시 생긴다 —
         여기서 막으면 「④에 도달했다」와 무관하게 **구조적으로** 보장된다.
         F-2가 지목한 「`validateAllSteps`에 차단 소비처가 없다」가 바로 이 자리다.
    */
    if (blockOnFirstInvalidStep(RESULT_STEP)) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await callOneHouseExemptionAPI(formData));
    } catch (e) {
      setError(e instanceof Error ? e.message : "판정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [formData, setLoading, setError, setResult, blockOnFirstInvalidStep]);

  /**
   * 🔑 확인 다이얼로그를 여기서 만들지 않는다 — `ResetButton`이 `ConfirmDialog`를 **내장**한다.
   *    `window.confirm`은 데이터 손실 액션에 금지돼 있고(`no-native-confirm.guard.test.ts` ·
   *    `feedback_dialog_data_discard_confirm`), 실제로 그 가드가 이 코드를 잡았다.
   */
  const handleReset = useCallback(() => reset(), [reset]);


  const isResult = currentStep === RESULT_STEP && result !== null;
  /**
   * 단계 점프 — StepIndicator와 사이드바가 **같은 이것**을 쓴다.
   *
   * 🔑 **뒤로·제자리는 언제나 허용한다.** 고치러 가는 길을 막으면 사용자가 갇힌다.
   * 🔑 앞으로 갈 때만 **건너뛰는 입력 단계**를 검사한다 — 「다음」 버튼과 같은 기준이다.
   *
   * ⚠️ `target > currentStep` 조건은 **오늘은 뮤테이션으로 재지지 않는다**(실측 생존).
   *    `blockOnFirstInvalidStep`이 `i < target`만 보므로 뒤로 갈 때는 검사 대상이 거의 없고,
   *    유일하게 갈리는 ④→③(②가 불완전)은 백스톱 때문에 **도달 불가능한 상태**라서다.
   *    그래도 남긴다 — 이 조건이 없으면 「뒤로가기 자유」가 `upTo` 산식의 **우연**에 기대게 되고,
   *    나중에 그 산식을 넓히는 순간 사용자가 조용히 갇힌다.
   */
  const onStepClick = useCallback(
    (target: number) => {
      if (target > currentStep && blockOnFirstInvalidStep(target)) return;
      setError(null);
      setStep(target);
    },
    [currentStep, blockOnFirstInvalidStep, setError, setStep],
  );

  /**
   * 이력 자동저장 (P4-2b-3).
   *
   * 🔑 `resultData`는 **판정이 나온 뒤에만** 싣는다 — 훅은 빈 객체·null이면 저장을 건너뛰므로
   *    입력 중에는 아무것도 남지 않는다(세액 계산기들과 같은 규약).
   * 🔑 `taxLawVersion`은 **양도 예정일**이다 — route가 그 날짜로 세율·법령을 로드하므로
   *    「이 판정이 어느 시점 기준인가」를 되짚는 값이 그것이다(주식 평가가 평가기준일을 쓰는 것과 같다).
   */
  /**
   * 🔑 `savedId`는 **출처 판정 record의 id**다(P5-a). 계산기로 넘길 때 함께 실어 두면 나중에
   *    「이 세액은 어느 판정에서 왔는가」를 되짚을 수 있다. 저장 전(입력 중)에는 `null`이고,
   *    그때는 출처 없이 사실만 넘어간다 — 사실이 넘어가는 것 자체는 막지 않는다.
   */
  const { savedId } = useAutoSaveCalculation({
    taxType: "one_house_exemption",
    inputData: formData as unknown as Record<string, unknown>,
    resultData: isResult ? (result as unknown as Record<string, unknown>) : null,
    taxLawVersion: formData.transferDate || new Date().toISOString().split("T")[0],
    clientId: activeClientId,
  });

  /**
   * 「이 결과로 세액 계산」 (P5-a).
   *
   * 🔑 넘기는 것은 **폼(사실)** 이지 `result`가 아니다 — 계산기는 같은 엔진으로 다시 판정한다(D-3).
   * 🔑 진입은 단일 헬퍼를 거친다. 여기서 store를 직접 쓰고 `router.push`하면 이력 카드·드로어가
   *    두 번 갈라졌던 전례를 그대로 되풀이한다(`transfer-resume-entry.ts` 머리 주석).
   */
  const handleCalculateTax = useCallback(() => {
    void openTransferWithOneHouseFacts(formData, router, savedId ?? undefined);
  }, [formData, router, savedId]);

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

        {/*
          경고는 오류 배너 **아래**다 — 차단 사유를 먼저 읽고 주의사항을 읽는 순서.
          결과 화면에서는 번호를 붙이지 않는다: 결과뷰의 섹션 번호는 `nextNo()`가 판정 내용에
          매기는 연번이고, 이것은 **입력에 대한 주의**라 그 연번에 끼우면 판정의 일부로 읽힌다.
        */}
        <ValidationWarnings
          items={stepWarnings}
          title={currentStep === RESULT_STEP ? "판정 시 전제된 주의사항" : "확인이 필요합니다"}
          testId="one-house-validation-warnings"
        />

        <div className="flex gap-8">
          <div className="min-w-0 flex-1">
            {currentStep === 0 && <Step1 form={formData} onChange={updateFormData} />}
            {currentStep === 1 && <Step3 form={formData} onChange={updateFormData} />}
            {currentStep === 2 && <Step2 form={formData} onChange={updateFormData} />}
            {currentStep === RESULT_STEP && (
              <Step4
                result={result}
                error={error}
                isLoading={isLoading}
                onJudge={handleJudge}
                onCalculateTax={handleCalculateTax}
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
