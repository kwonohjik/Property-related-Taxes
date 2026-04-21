/**
 * 목장용지 판정 (§168-10, PDF p.1702~1703 흐름도 1:1)
 *
 * 판정 순서:
 *   Step 3-1   축산업 영위기간 기간기준
 *   Step 3-1-1 거주·사업관련 목장 기간기준 (§168-10 ②) — 해당 시 지역·면적 면제
 *   Step 3-2   축산업용 기준면적 적합 → 초과분 비사업용
 *   Step 3-3   도시지역 밖? → Yes 사업용
 *   Step 3-3-1 도시지역 內 편입유예 → 사업용/비사업용
 */

import { differenceInDays } from "date-fns";
import { NBL } from "../legal-codes";
import type {
  AreaProportioning,
  CategoryJudgeResult,
  DateInterval,
  JudgmentStep,
  NonBusinessLandInput,
  NonBusinessLandJudgmentRules,
} from "./types";
import {
  checkIncorporationGrace,
  meetsPeriodCriteria,
  type PeriodCriteriaResult,
} from "./period-criteria";
import { isUrbanForPasture } from "./urban-area";
import { getOwnershipStart } from "./utils/period-math";

function getLivestockPeriods(input: NonBusinessLandInput): DateInterval[] {
  const p = input.pasture;
  if (!p) return [];
  if (p.livestockPeriods && p.livestockPeriods.length > 0) {
    return p.livestockPeriods.map((x) => ({ start: x.startDate, end: x.endDate }));
  }
  // 영위 기간 배열이 없으면 isLivestockOperator=true인 경우 전체 보유로 간주
  if (p.isLivestockOperator) {
    const ownershipStart = getOwnershipStart(input.acquisitionDate);
    return [{ start: ownershipStart, end: input.transferDate }];
  }
  return [];
}

function isRelatedPasture(input: NonBusinessLandInput): { applies: boolean; reason: string } {
  const p = input.pasture;
  if (!p) return { applies: false, reason: "" };

  if (p.inheritanceDate) {
    const years = differenceInDays(input.transferDate, p.inheritanceDate) / 365;
    if (years < 3) return { applies: true, reason: `상속 3년 이내 목장 (${years.toFixed(1)}년 경과)` };
  }
  if (p.isSpecialOrgUse) {
    return { applies: true, reason: "사회복지/학교/종교/정당 직접 사용" };
  }

  const u = input.unconditionalExemption;
  if (u?.isJongjoongOwned && u.jongjoongAcquisitionDate) {
    const cutoff = new Date("2005-12-31");
    if (u.jongjoongAcquisitionDate <= cutoff) {
      return { applies: true, reason: "종중 소유 (2005.12.31 이전 취득)" };
    }
  }
  return { applies: false, reason: "" };
}

function computeAreaProportioning(totalArea: number, standardArea: number): AreaProportioning {
  const businessArea = Math.min(totalArea, standardArea);
  const nonBusinessArea = Math.max(0, totalArea - standardArea);
  const nonBusinessRatio = totalArea > 0 ? Math.round((nonBusinessArea / totalArea) * 10000) / 10000 : 0;
  return {
    totalArea,
    businessArea,
    nonBusinessArea,
    nonBusinessRatio,
    buildingMultiplier: 1,
  };
}

export function judgePasture(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.PASTURE];
  const warnings: string[] = [];
  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  const totalOwnershipDays = Math.max(0, differenceInDays(input.transferDate, ownershipStart));

  // ── Step 3-1: 축산업 영위기간 기간기준 ──────────────────────────
  const livestockPeriods = getLivestockPeriods(input);
  const r1 = meetsPeriodCriteria(livestockPeriods, input.acquisitionDate, input.transferDate, "pasture", rules);

  steps.push({
    id: "pasture_livestock",
    label: "Step 3-1 축산업 영위기간 기간기준",
    status: r1.meets ? "PASS" : "FAIL",
    detail: r1.meets ? r1.detail : `축산업 영위 기간기준 미충족 — ${r1.detail}`,
    legalBasis: NBL.PASTURE,
  });

  if (!r1.meets) {
    // ── Step 3-1-1: 거주·사업관련 목장 (지역·면적 면제) ──────
    const related = isRelatedPasture(input);
    if (related.applies) {
      const fullPeriod: DateInterval[] = [{ start: ownershipStart, end: input.transferDate }];
      const r2 = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, input.transferDate, "pasture", rules);
      if (r2.meets) {
        appliedLaws.push(NBL.PASTURE_RELATED);
        steps.push({
          id: "pasture_related",
          label: "Step 3-1-1 거주·사업관련 목장용지",
          status: "PASS",
          detail: `${related.reason} + 기간기준 충족 (지역·면적 면제)`,
          legalBasis: NBL.PASTURE_RELATED,
        });
        return buildPass("거주·사업관련 목장용지 (지역·면적 면제)", steps, appliedLaws, warnings, {
          r: r2, totalOwnershipDays,
        });
      }
      steps.push({
        id: "pasture_related",
        label: "Step 3-1-1 거주·사업관련 목장용지",
        status: "FAIL",
        detail: `${related.reason}이나 기간기준 미충족`,
        legalBasis: NBL.PASTURE_RELATED,
      });
      return buildFail("거주·사업관련 목장이나 기간기준 미충족", steps, appliedLaws, warnings, {
        r: r2, totalOwnershipDays,
      });
    }

    steps.push({
      id: "pasture_related",
      label: "Step 3-1-1 거주·사업관련 목장용지",
      status: "FAIL",
      detail: "거주·사업관련 사유 없음",
      legalBasis: NBL.PASTURE_RELATED,
    });
    return buildFail("축산업 미영위 + 사용의제 미해당 → 비사업용", steps, appliedLaws, warnings, {
      r: r1, totalOwnershipDays,
    });
  }

  // ── Step 3-2: 축산업용 기준면적 ────────────────────────────────
  const p = input.pasture;
  let areaProportioning: AreaProportioning | undefined;
  if (p?.standardArea !== undefined && input.landArea > p.standardArea) {
    appliedLaws.push(NBL.PASTURE_AREA);
    areaProportioning = computeAreaProportioning(input.landArea, p.standardArea);
    steps.push({
      id: "pasture_area",
      label: "Step 3-2 축산업용 기준면적",
      status: "FAIL",
      detail: `기준면적 ${p.standardArea}㎡ 초과 → 초과분 ${areaProportioning.nonBusinessArea}㎡ 비사업용`,
      legalBasis: NBL.PASTURE_AREA,
    });
    return {
      isBusiness: false,
      reason: `기준면적 초과 — 초과분 ${areaProportioning.nonBusinessArea}㎡ 비사업용`,
      steps,
      appliedLaws,
      areaProportioning,
      totalOwnershipDays,
      effectiveBusinessDays: r1.effectiveBusinessDays,
      gracePeriodDays: 0,
      businessUseRatio: areaProportioning.nonBusinessRatio,
      criteria: r1.criteria,
      warnings,
    };
  }
  steps.push({
    id: "pasture_area",
    label: "Step 3-2 축산업용 기준면적",
    status: "PASS",
    detail: p?.standardArea !== undefined ? `${input.landArea}㎡ ≤ ${p.standardArea}㎡` : "기준면적 미제공 (검증 생략)",
    legalBasis: NBL.PASTURE_AREA,
  });

  // ── Step 3-3: 도시지역 밖 목장? ─────────────────────────────────
  const urban = isUrbanForPasture(input.zoneType, input.transferDate);
  if (!urban) {
    appliedLaws.push(NBL.PASTURE_URBAN);
    steps.push({
      id: "pasture_urban",
      label: "Step 3-3 도시지역 밖 목장용지",
      status: "PASS",
      detail: "도시지역 외 목장용지 → 사업용",
      legalBasis: NBL.PASTURE_URBAN,
    });
    return buildPass("도시지역 밖 + 축산업 영위 + 기준면적 이내", steps, appliedLaws, warnings, {
      r: r1, totalOwnershipDays,
    });
  }

  // ── Step 3-3-1: 도시지역 內 편입유예 ─────────────────────────────
  appliedLaws.push(NBL.PASTURE_URBAN_GRACE);
  const grace = checkIncorporationGrace(input.urbanIncorporationDate, input.transferDate, rules);
  if (grace.isApplied) {
    steps.push({
      id: "pasture_urban_grace",
      label: "Step 3-3-1 도시지역 內 편입유예",
      status: "PASS",
      detail: grace.detail,
      legalBasis: NBL.PASTURE_URBAN_GRACE,
    });
    return buildPass("도시지역 內 목장 + 편입유예 내", steps, appliedLaws, warnings, {
      r: r1, totalOwnershipDays,
    });
  }

  steps.push({
    id: "pasture_urban_grace",
    label: "Step 3-3-1 도시지역 內 편입유예",
    status: "FAIL",
    detail: grace.detail || "편입유예 미적용",
    legalBasis: NBL.PASTURE_URBAN_GRACE,
  });
  return buildFail("도시지역 內 목장 + 편입유예 외 → 비사업용", steps, appliedLaws, warnings, {
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
