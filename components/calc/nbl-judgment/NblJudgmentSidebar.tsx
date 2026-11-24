"use client";

/**
 * ⑥ 비사업용 토지 판정 메뉴 사이드바 (계획서 `nbl-judgment-menu.ui.plan.md` §9.3)
 *
 * 세목 래퍼 — `WizardSidebar`를 직접 쓰고 요약은 순수 함수(`computeNblJudgmentSummary`)를 `useMemo`로 감싼다. store를 다시 세거나 미러링하지 않는다.
 * 세액이 없는 화면이라 금액 합계가 없다 — 「지금까지 입력으로 무엇이 정해졌나」만 보인다. 경고 계층은 두지 않는다(UD-5).
 */
import { useMemo } from "react";
import { WizardSidebar, type WizardSidebarStep } from "@/components/calc/shared/WizardSidebar";
import { computeNblJudgmentSummary } from "@/lib/calc/nbl-judgment-summary";
import { NBL_JUDGMENT_RESULT_STEP, NBL_JUDGMENT_STEPS } from "@/lib/calc/nbl-judgment-steps";
import { getStepErrorCount } from "@/lib/calc/non-business-land-judgment-validate";
import type { NblJudgmentFormData } from "@/lib/stores/nbl-judgment-form.types";

export function NblJudgmentSidebar({
  form,
  currentStep,
  onStepClick,
}: {
  form: NblJudgmentFormData;
  currentStep: number;
  onStepClick: (index: number) => void;
}) {
  const summary = useMemo(() => computeNblJudgmentSummary(form), [form]);

  const steps: WizardSidebarStep[] = useMemo(
    () =>
      NBL_JUDGMENT_STEPS.map((label, i) => ({
        label,
        status:
          i === currentStep
            ? "active"
            : // 결과 단계는 검증 대상이 아니다. 판정은 전진 점프를 막으므로(UD-6) 오류 있는 모든 입력 단계에 표식을 붙여 그 차단을 예고한다.
              i < NBL_JUDGMENT_RESULT_STEP && getStepErrorCount(form, i) > 0
              ? "attention"
              : i < currentStep
                ? "done"
                : "todo",
        onClick: () => onStepClick(i),
      })),
    [form, currentStep, onStepClick],
  );

  return <WizardSidebar title="비사업용 토지 판정" steps={steps} summary={summary.length > 0 ? summary : undefined} />;
}
