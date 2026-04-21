/**
 * 기타토지 판정 (§168-11, PDF p.1706~1707 흐름도 1:1)
 *
 * 판정 순서:
 *   Step 0     나대지 간주 검증 (§168-11 ⑥, 건축물시가표준액 < 토지 × 2%)
 *   Step 3-1   재산세 종합합산이 아닌 토지 + 기간기준 → 사업용
 *   Step 3-1-1 거주·사업관련 토지 + 기간기준 → 사업용
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
  PropertyTaxType,
} from "./types";
import { meetsPeriodCriteria, type PeriodCriteriaResult } from "./period-criteria";
import { getOwnershipStart } from "./utils/period-math";

/**
 * 나대지 간주 (§168-11 ⑥ 및 지방세법 시행령 준용):
 * - 건축물시가표준액 < 부속토지 시가표준액 × 2% → 건축물 없는 토지로 봄
 * - 무허가·사용승인 없는 건축물 부속토지 → 건축물 없는 토지로 봄
 * 결과적으로 propertyTaxType을 "종합합산"으로 조정.
 */
export function isBareLand(input: NonBusinessLandInput): boolean {
  const o = input.otherLand;
  if (!o) return false;
  if (!o.hasBuilding) return true;
  if (o.buildingStandardValue !== undefined && o.landStandardValue !== undefined) {
    if (o.buildingStandardValue < o.landStandardValue * 0.02) return true;
  }
  return false;
}

export function judgeOtherLand(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.OTHER_LAND];
  const warnings: string[] = [];

  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  const totalOwnershipDays = Math.max(0, differenceInDays(input.transferDate, ownershipStart));

  const o = input.otherLand;
  if (!o) {
    steps.push({
      id: "other_missing",
      label: "기타토지 사용현황 입력",
      status: "FAIL",
      detail: "사용현황 미입력",
      legalBasis: NBL.OTHER_LAND,
    });
    return {
      isBusiness: false,
      reason: "기타토지 사용현황 미입력",
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

  // Step 0: 나대지 간주
  const bareLand = isBareLand(input);
  const effectiveTaxType: PropertyTaxType = bareLand ? "comprehensive" : o.propertyTaxType;
  steps.push({
    id: "other_bare_land",
    label: "Step 0 나대지 간주 검증 (2% 기준)",
    status: bareLand ? "FAIL" : "PASS",
    detail: bareLand
      ? `나대지 간주 (건물시가표준액 < 토지시가표준액 × 2%) → 종합합산 취급`
      : `일반 건축물 부속토지 (원 재산세 유형 유지: ${o.propertyTaxType})`,
    legalBasis: NBL.OTHER_LAND,
  });

  // ── Step 3-1: 재산세 종합합산이 아닌 토지 + 기간기준 ───────────────
  const isNonComprehensive = effectiveTaxType !== "comprehensive";
  const fullPeriod: DateInterval[] = [{ start: ownershipStart, end: input.transferDate }];
  if (isNonComprehensive) {
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, input.transferDate, "other_land", rules);
    if (r.meets) {
      steps.push({
        id: "other_tax_type_criteria",
        label: "Step 3-1 비종합합산(비과세·분리·별도) + 기간기준",
        status: "PASS",
        detail: `재산세 ${effectiveTaxType} + 기간기준 충족`,
        legalBasis: NBL.OTHER_LAND,
      });
      return buildPass(`재산세 ${effectiveTaxType} + 기간기준 충족`, steps, appliedLaws, warnings, {
        r, totalOwnershipDays,
      });
    }
    steps.push({
      id: "other_tax_type_criteria",
      label: "Step 3-1 비종합합산(비과세·분리·별도) + 기간기준",
      status: "FAIL",
      detail: `재산세 ${effectiveTaxType}이나 기간기준 미충족 — ${r.detail}`,
      legalBasis: NBL.OTHER_LAND,
    });
  } else {
    steps.push({
      id: "other_tax_type_criteria",
      label: "Step 3-1 비종합합산 여부",
      status: "FAIL",
      detail: "재산세 종합합산과세대상 (원칙 비사업용)",
      legalBasis: NBL.OTHER_LAND,
    });
  }

  // ── Step 3-1-1: 거주·사업관련 토지 + 기간기준 ──────────────────────
  if (o.isRelatedToResidenceOrBusiness) {
    const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, input.transferDate, "other_land", rules);
    if (r.meets) {
      appliedLaws.push(NBL.OTHER_LAND_BUSINESS);
      steps.push({
        id: "other_residence_business",
        label: "Step 3-1-1 거주·사업관련 토지 + 기간기준",
        status: "PASS",
        detail: "거주·사업과 직접 관련 + 기간기준 충족",
        legalBasis: NBL.OTHER_LAND_BUSINESS,
      });
      return buildPass("거주·사업관련 토지 + 기간기준 충족", steps, appliedLaws, warnings, {
        r, totalOwnershipDays,
      });
    }
    steps.push({
      id: "other_residence_business",
      label: "Step 3-1-1 거주·사업관련 토지 + 기간기준",
      status: "FAIL",
      detail: `거주·사업관련이나 기간기준 미충족 — ${r.detail}`,
      legalBasis: NBL.OTHER_LAND_BUSINESS,
    });
    return buildFail("거주·사업관련 토지이나 기간기준 미충족", steps, appliedLaws, warnings, {
      r, totalOwnershipDays,
    });
  }

  steps.push({
    id: "other_residence_business",
    label: "Step 3-1-1 거주·사업관련 토지",
    status: "NOT_APPLICABLE",
    detail: "거주·사업과 직접 관련 플래그 미설정",
    legalBasis: NBL.OTHER_LAND_BUSINESS,
  });
  const dummyR = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, input.transferDate, "other_land", rules);
  return buildFail("종합합산 + 거주·사업관련 미해당 → 비사업용", steps, appliedLaws, warnings, {
    r: dummyR, totalOwnershipDays,
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
