"use client";

/**
 * ⑥ 다주택 중과 판정 메뉴 사이드바 (계획서 `multi-house-surcharge-judgment-menu.plan.md` §6 ⑥ · P6b)
 *
 * 입력 요약은 1주택 판정 메뉴와 같은 순수 함수(`computeOneHouseJudgmentSummary` — 입력을 함께 쓴다)에 양도일 현재 조정대상지역
 * 입력값을 더한다. 🔴 **중과 주택 수는 판정 결과의 echo만** 보인다 — 화면이 산입 여부를 다시 세면 엔진과 갈린다(F-8).
 * 결과 전에는 그 줄이 없다. 단계 배지는 이 메뉴의 ⑧(`multi-house-surcharge-validate.ts`)로 센다.
 */
import { useMemo } from "react";
import { WizardSidebar, type WizardSidebarStep } from "@/components/calc/shared/WizardSidebar";
import { computeOneHouseJudgmentSummary } from "@/lib/calc/one-house-exemption-validate";
import { getSurchargeStepErrorCount, getSurchargeStepWarningCount } from "@/lib/calc/multi-house-surcharge-validate";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { MultiHouseSurchargeJudgmentResponse } from "@/app/api/calc/multi-house-surcharge-judgment/route";

/** ⚠️ `MultiHouseSurchargeCalculator.tsx`의 `SURCHARGE_STEPS`와 같은 문자열이다 — 한쪽만 고치면 갈린다. */
const STEP_LABELS = ["세대", "양도 대상 주택", "보유 주택·권리", "판정 결과", "세부담 시뮬레이션"] as const;

/** 양도일 현재 조정대상지역 — 소재지 코드가 있으면 그 판정(엔진과 같은 함수), 없으면 ②의 직접 선택 */
function transferRegulatedLabel(form: OneHouseJudgmentFormData): string | null {
  const primary = form.assets?.[0];
  if (!primary || !form.transferDate) return null;
  if (primary.regionCode) {
    const v = isRegulatedByBjdCode(primary.regionCode, form.transferDate, primary.regionInDesignatedDistrict);
    return v.isRegulated ? "예 (소재지 판정)" : "아니오 (소재지 판정)";
  }
  return form.isRegulatedArea ? "예 (직접 선택)" : "아니오 (직접 선택)";
}

export function MultiHouseSurchargeSidebar({
  form,
  currentStep,
  onStepClick,
  result,
}: {
  form: OneHouseJudgmentFormData;
  currentStep: number;
  onStepClick: (index: number) => void;
  result: MultiHouseSurchargeJudgmentResponse | null;
}) {
  const summary = useMemo(() => {
    const items = computeOneHouseJudgmentSummary(form).map((i) => ({ label: i.label, value: i.value }));
    const regulated = transferRegulatedLabel(form);
    if (regulated) items.push({ label: "양도일 현재 조정대상지역", value: regulated });
    if (result?.headline) items.push({ label: "중과 판정 주택 수", value: `${result.headline.result.effectiveHouseCount}채` });
    return items;
  }, [form, result]);

  const steps: WizardSidebarStep[] = useMemo(
    () =>
      STEP_LABELS.map((label, i) => ({
        label,
        status:
          i === currentStep
            ? "active"
            : i < 3 && getSurchargeStepErrorCount(form, i) > 0
              ? "attention"
              : // 경고는 «완료»를 이긴다(1주택 메뉴 사이드바와 같은 규약)
                i < 3 && getSurchargeStepWarningCount(form, i) > 0
                ? "warning"
                : i < currentStep
                  ? "done"
                  : "todo",
        onClick: () => onStepClick(i),
      })),
    [form, currentStep, onStepClick],
  );

  return <WizardSidebar title="다주택 중과 판정" steps={steps} summary={summary.length > 0 ? summary : undefined} />;
}
