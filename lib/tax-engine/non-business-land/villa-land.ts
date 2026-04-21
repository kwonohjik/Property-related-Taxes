/**
 * 별장부수토지 판정 (§168-13, PDF p.1705 흐름도 1:1)
 *
 * 판정 순서:
 *   Step 3-1   별장 비사용기간 기간기준 → PASS 시 "해당 지목으로 이동" (REDIRECT)
 *   Step 3-1-1 읍·면 농어촌주택 기간기준 (건 150㎡·토 660㎡·기준시가 2억 이하) → 사업용
 *   둘 다 미달 → 비사업용
 */

import { differenceInDays } from "date-fns";
import { NBL } from "../legal-codes";
import type {
  CategoryJudgeResult,
  DateInterval,
  JudgmentStep,
  NonBusinessLandInput,
  NonBusinessLandJudgmentRules,
} from "./types";
import { meetsPeriodCriteria, type PeriodCriteriaResult } from "./period-criteria";
import { getOwnershipStart, invertPeriods } from "./utils/period-math";

export function judgeVillaLand(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.VILLA];
  const warnings: string[] = [];

  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  const totalOwnershipDays = Math.max(0, differenceInDays(input.transferDate, ownershipStart));

  const v = input.villa;
  if (!v) {
    steps.push({
      id: "villa_missing",
      label: "별장 사용현황 입력",
      status: "FAIL",
      detail: "별장 사용현황 정보 미입력",
      legalBasis: NBL.VILLA,
    });
    return {
      isBusiness: false,
      reason: "별장 사용현황 미입력 — 비사업용 간주",
      steps,
      appliedLaws,
      totalOwnershipDays,
      effectiveBusinessDays: 0,
      gracePeriodDays: 0,
      businessUseRatio: 0,
      criteria: { rule2of3Years: false, rule5Years: false, rule80Percent: false },
      warnings,
    };
  }

  // ── Step 3-1: 별장 비사용기간 기간기준 → REDIRECT ───────────────
  const villaUse: DateInterval[] = v.villaUsePeriods.map((p) => ({
    start: p.startDate,
    end: p.endDate,
  }));
  const nonVilla = invertPeriods(villaUse, ownershipStart, input.transferDate);
  // categoryGroup "villa"는 §168-6 ③ 80% 레거시 대상이 아니므로
  // `getThresholdRatio()` 는 항상 현행 60%를 반환한다 (Bug-06 정리).
  const r1 = meetsPeriodCriteria(nonVilla, input.acquisitionDate, input.transferDate, "villa", rules);

  if (r1.meets) {
    steps.push({
      id: "villa_non_use_period",
      label: "Step 3-1 별장 비사용기간 기간기준",
      status: "PASS",
      detail: `별장 비사용기간이 기간기준 충족 — ${r1.detail}. 실제 용도(주택/기타) 재입력 필요.`,
      legalBasis: NBL.VILLA,
    });
    return {
      isBusiness: false, // REDIRECT 상태에서는 판정 미확정 — UI 재입력 요구
      reason: "별장 비사용기간 기간기준 충족 — 다른 지목으로 재판정 필요",
      steps,
      appliedLaws,
      action: "REDIRECT_TO_CATEGORY",
      redirectHint: "별장 비사용기간이 기간기준을 충족합니다. 실제 용도(주택 부수 토지 또는 기타토지)로 다시 입력해 주세요.",
      totalOwnershipDays,
      effectiveBusinessDays: r1.effectiveBusinessDays,
      gracePeriodDays: 0,
      businessUseRatio: r1.ratio,
      criteria: r1.criteria,
      warnings,
    };
  }

  steps.push({
    id: "villa_non_use_period",
    label: "Step 3-1 별장 비사용기간 기간기준",
    status: "FAIL",
    detail: `별장 비사용기간 기간기준 미충족 — ${r1.detail}`,
    legalBasis: NBL.VILLA,
  });

  // ── Step 3-1-1: 읍·면 농어촌주택 ────────────────────────────────
  if (v.isEupMyeon && v.isRuralHousing) {
    const fullPeriod: DateInterval[] = [{ start: ownershipStart, end: input.transferDate }];
    const r2 = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, input.transferDate, "villa", rules);
    if (r2.meets) {
      steps.push({
        id: "villa_rural",
        label: "Step 3-1-1 읍·면 농어촌주택",
        status: "PASS",
        detail: "농어촌주택 (건 150㎡·토 660㎡·기준시가 2억 이하) + 기간기준 충족",
        legalBasis: NBL.VILLA,
      });
      return buildPass("읍·면 농어촌주택 부수토지", steps, appliedLaws, warnings, {
        r: r2, totalOwnershipDays,
      });
    }
    steps.push({
      id: "villa_rural",
      label: "Step 3-1-1 읍·면 농어촌주택",
      status: "FAIL",
      detail: "농어촌주택이나 기간기준 미충족",
      legalBasis: NBL.VILLA,
    });
    return buildFail("농어촌주택이나 기간기준 미충족", steps, appliedLaws, warnings, {
      r: r2, totalOwnershipDays,
    });
  }

  steps.push({
    id: "villa_rural",
    label: "Step 3-1-1 읍·면 농어촌주택",
    status: v.isEupMyeon ? "FAIL" : "NOT_APPLICABLE",
    detail: v.isEupMyeon
      ? "읍·면 소재이나 농어촌주택 요건(건 150㎡·토 660㎡·2억 이하) 미충족"
      : "읍·면 소재 아님",
    legalBasis: NBL.VILLA,
  });
  return buildFail("별장부수토지 비사업용 (비사용기간·농어촌주택 모두 미해당)", steps, appliedLaws, warnings, {
    r: r1, totalOwnershipDays,
  });
}

interface Ctx {
  r: PeriodCriteriaResult;
  totalOwnershipDays: number;
}

function buildPass(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: Ctx,
): CategoryJudgeResult {
  return {
    isBusiness: true,
    reason,
    steps,
    appliedLaws,
    totalOwnershipDays: ctx.totalOwnershipDays,
    effectiveBusinessDays: ctx.r.effectiveBusinessDays,
    gracePeriodDays: 0,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    warnings,
  };
}

function buildFail(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: Ctx,
): CategoryJudgeResult {
  return {
    isBusiness: false,
    reason,
    steps,
    appliedLaws,
    totalOwnershipDays: ctx.totalOwnershipDays,
    effectiveBusinessDays: ctx.r.effectiveBusinessDays,
    gracePeriodDays: 0,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    warnings,
  };
}
