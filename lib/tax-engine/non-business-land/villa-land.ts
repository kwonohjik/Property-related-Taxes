/**
 * 별장부수토지 판정 (영 §168의13 + 기간기준 영 §168의6, PDF p.1705 흐름도 1:1)
 *
 * 판정 순서:
 *   Step 3-1   별장 비사용기간 기간기준 → PASS 시 "해당 지목으로 이동" (REDIRECT)
 *   Step 3-1-1 읍·면 농어촌주택 기간기준 (건 150㎡·토 660㎡·기준시가 2억 이하) → 사업용
 *   둘 다 미달 → 비사업용
 */

import { differenceInDays } from "../utc-date";
import { NBL } from "../legal-codes";
import type {
  CategoryJudgeResult,
  DateInterval,
  JudgmentStep,
  NonBusinessLandInput,
  NonBusinessLandJudgmentRules,
} from "./types";
import { getPeriodJudgmentDate, meetsPeriodCriteria, type PeriodCriteriaResult } from "./period-criteria";
import { getOwnershipStart, invertPeriods } from "./utils/period-math";
import { VILLA_REGION_LIST_EVOLVED_NOTICE, villaRuralValueLimit } from "../data/nbl-historical-values-era";

export function judgeVillaLand(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.VILLA];
  const warnings: string[] = [];

  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  // §168조의14② 양도일 의제 — §168조의6 기간기준 전용
  const pjDate = getPeriodJudgmentDate(input);
  const totalOwnershipDays = Math.max(0, differenceInDays(pjDate, ownershipStart));

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
  const nonVilla = invertPeriods(villaUse, ownershipStart, pjDate);
  // ⚠️ 별장도 2015.2.3. **전** 양도분이면 레거시 임계 0.8이 적용된다 — §168의6에 지목
  //    분기가 없기 때문이다(2026-09-14 정정. 종전 주석은 「항상 60%」라 적었고 틀렸다).
  const r1 = meetsPeriodCriteria(nonVilla, input.acquisitionDate, pjDate, "villa", rules, input.gracePeriods);

  if (r1.meets) {
    steps.push({
      id: "villa_non_use_period",
      label: "Step 3-1 별장 비사용기간 기간기준",
      status: "PASS",
      // NBL2611-V8-VL05 — 엔진이 주택부수토지로 자동 재분류해 판정한다(engine.ts). 재입력을 요구하지 않는다.
      detail: `별장 비사용기간이 기간기준 충족 — ${r1.detail}. 별장이 아니므로 주택부수토지로 재분류해 판정합니다.`,
      // NBL2611-V8-VL07 — 기간기준 단계의 근거는 영 §168의6이다(§168의13은 별장 범위).
      legalBasis: NBL.CRITERIA,
    });
    return {
      isBusiness: false, // REDIRECT 상태에서는 판정 미확정 — 엔진이 주택부수토지로 재분류해 다시 판정한다
      reason: "별장 비사용기간 기간기준 충족 — 다른 지목으로 재판정 필요",
      steps,
      appliedLaws,
      action: "REDIRECT_TO_CATEGORY",
      redirectHint: "별장 비사용기간이 기간기준을 충족해 별장이 아닙니다. 주택 부수 토지로 재분류해 판정합니다(주택 정착면적 사용).",
      totalOwnershipDays,
      effectiveBusinessDays: r1.effectiveBusinessDays,
      gracePeriodDays: r1.gracePeriodDays,
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
    legalBasis: NBL.CRITERIA,
  });

  // ── Step 3-1-1: 읍·면 농어촌주택 (영 §168의13 1~3호 3요건 AND — 항 없음, NBL2611-V8-VL07) ───────────
  if (v.isEupMyeon && v.isRuralHousing) {
    warnings.push(VILLA_REGION_LIST_EVOLVED_NOTICE); // 제외지역 열거 연혁 고지(세액 불변) — NBL2611-V8-VL01
    const RURAL_FLOOR_MAX = 150; // 영 §168의13 1호 건물 연면적(㎡)
    const RURAL_LAND_MAX = 660; // 영 §168의13 1호 건물 부속토지면적(㎡)
    const RURAL_VALUE_MAX = villaRuralValueLimit(input.transferDate); // 영 §168의13 2호 건물+부속토지 합산 기준시가(원) — 양도일 2015.2.3. 전 1억·이후 2억(NBL2611-V8-VL01)
    const floorOk = v.buildingFloorArea !== undefined && v.buildingFloorArea <= RURAL_FLOOR_MAX;
    const landOk = v.attachedLandArea !== undefined && v.attachedLandArea <= RURAL_LAND_MAX;
    const valueOk = v.combinedStdValue !== undefined && v.combinedStdValue <= RURAL_VALUE_MAX;
    const areaOk = v.isInRestrictedArea !== true; // 영 §168의13 3호 — 「조세특례제한법」 §99의4①1호가목1)~4) 제외지역 아님
    const reqMet = floorOk && landOk && valueOk && areaOk; // 미입력(undefined)=요건 미충족(미입증=불인정)
    const reqDetail =
      `연면적 ${v.buildingFloorArea ?? "미입력"}㎡(≤150 ${floorOk ? "✓" : "✗"})·` +
      `부속토지 ${v.attachedLandArea ?? "미입력"}㎡(≤660 ${landOk ? "✓" : "✗"})·` +
      `건물+부속토지 기준시가 ${v.combinedStdValue ?? "미입력"}원(≤${RURAL_VALUE_MAX / 100_000_000}억 ${valueOk ? "✓" : "✗"})·` +
      `「조세특례제한법」 §99의4①1호가목 제외지역 ${v.isInRestrictedArea ? "해당(✗)" : "아님(✓)"}`;

    if (reqMet) {
      const fullPeriod: DateInterval[] = [{ start: ownershipStart, end: pjDate }];
      const r2 = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "villa", rules, input.gracePeriods);
      if (r2.meets) {
        steps.push({
          id: "villa_rural",
          label: "Step 3-1-1 읍·면 농어촌주택",
          status: "PASS",
          detail: `농어촌주택 §168의13 3요건 충족 (${reqDetail}) + 기간기준 충족`,
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
        detail: `농어촌주택 3요건 충족이나 기간기준 미충족 (${reqDetail})`,
        legalBasis: NBL.VILLA,
      });
      return buildFail("농어촌주택이나 기간기준 미충족", steps, appliedLaws, warnings, {
        r: r2, totalOwnershipDays,
      });
    }

    // 3요건 미충족 → 비사업용 (사업용 의제는 납세자 유리 → 미입증=불인정, 불리 적용 아님)
    steps.push({
      id: "villa_rural",
      label: "Step 3-1-1 읍·면 농어촌주택",
      status: "FAIL",
      detail: `농어촌주택 §168의13 요건 미충족 (${reqDetail})`,
      legalBasis: NBL.VILLA,
    });
    return buildFail("농어촌주택 §168의13 요건 미충족 — 비사업용", steps, appliedLaws, warnings, {
      r: r1, totalOwnershipDays,
    });
  }

  steps.push({
    id: "villa_rural",
    label: "Step 3-1-1 읍·면 농어촌주택",
    status: v.isEupMyeon ? "FAIL" : "NOT_APPLICABLE",
    detail: v.isEupMyeon
      ? `읍·면 소재이나 농어촌주택 요건(건 150㎡·토 660㎡·${villaRuralValueLimit(input.transferDate) / 100_000_000}억 이하) 미충족`
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
    gracePeriodDays: ctx.r.gracePeriodDays,
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
    gracePeriodDays: ctx.r.gracePeriodDays,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    warnings,
  };
}
