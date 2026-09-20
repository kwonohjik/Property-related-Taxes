"use client";

/**
 * ⑥ 판정 메뉴 사이드바 (P4-2b-2)
 *
 * 세목 래퍼 — `WizardSidebar`를 직접 쓰지 않고 여기서 요약을 조립한다(주식 `StockSidebar` 선례).
 *
 * 🔑 요약은 **순수 함수**(`computeOneHouseJudgmentSummary`)가 만들고 여기서 `useMemo`로 감싼다.
 *    store 값을 다시 세거나 미러링하지 않는다.
 * 🔑 세액이 없는 화면이라 **금액 합계가 없다** — 「지금까지 입력으로 무엇이 정해졌나」를 보여준다.
 */
import { useMemo } from "react";
import { WizardSidebar, type WizardSidebarStep } from "@/components/calc/shared/WizardSidebar";
import {
  computeOneHouseJudgmentSummary,
  getStepErrorCount,
} from "@/lib/calc/one-house-exemption-validate";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

const STEP_LABELS = ["세대", "보유 주택·권리", "양도 예정", "판정 결과"] as const;

export function OneHouseJudgmentSidebar({
  form,
  currentStep,
  onStepClick,
}: {
  form: OneHouseJudgmentFormData;
  currentStep: number;
  onStepClick: (index: number) => void;
}) {
  const summary = useMemo(
    () => computeOneHouseJudgmentSummary(form).map((i) => ({ label: i.label, value: i.value })),
    [form],
  );

  const steps: WizardSidebarStep[] = useMemo(
    () =>
      STEP_LABELS.map((label, i) => ({
        label,
        status:
          i === currentStep
            ? "active"
            : // 마지막 단계는 검증 대상이 아니다(결과 화면).
              i < 3 && getStepErrorCount(form, i) > 0
              ? "attention"
              : i < currentStep
                ? "done"
                : "todo",
        onClick: () => onStepClick(i),
      })),
    [form, currentStep, onStepClick],
  );

  return (
    <WizardSidebar
      title="1세대1주택 비과세 판정"
      steps={steps}
      summary={summary.length > 0 ? summary : undefined}
    />
  );
}
