/**
 * 임야 판정 (§168-9, PDF p.1700~1701 흐름도 1:1)
 *
 * 판정 순서:
 *   Step 3-1   재촌기간 기간기준 (주민등록 필수)
 *   Step 3-1-1 공익·산림보호·사업관련 임야 기간기준 (§168-9 ①·③)
 *   Step 3-2   산림법 시업중·특수산림사업지구? → No면 사업용 (지역기준 미적용)
 *   Step 3-2-1 시업중/특수지구: 도시지역 밖? → Yes 사업용
 *   Step 3-2-2 도시지역 內 시업중: 편입유예 → 사업용/비사업용
 */

import { addYears, differenceInDays } from "date-fns";
import { NBL } from "../legal-codes";
import type {
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
import { computeResidencePeriods, fallbackResidenceFromDistance } from "./residence";
import { isUrbanForForest } from "./urban-area";
import { getOwnershipStart } from "./utils/period-math";

/**
 * 공익·산림보호 임야 (§168-9 ①) 여부.
 */
function isPublicOrProtected(input: NonBusinessLandInput): boolean {
  return input.forestDetail?.isPublicInterest === true;
}

/**
 * 거주·사업관련 임야 (§168-9 ③) 여부.
 */
function isBusinessRelatedForest(input: NonBusinessLandInput): {
  applies: boolean;
  reason: string;
} {
  const f = input.forestDetail;
  if (f?.isForestSuccessor) return { applies: true, reason: "임업후계자 임산물 생산" };

  // §168-9 ③7호: 상속개시일부터 3년 경과하지 아니한 임야
  // (신 플래그 `inheritedForestWithin3Years` 우선, 레거시 오기 플래그 `inheritedForestWithin5Years`도 수용)
  const inheritedFlag = f?.inheritedForestWithin3Years ?? f?.inheritedForestWithin5Years;
  if (inheritedFlag && f?.forestInheritanceDate) {
    const years = differenceInDays(input.transferDate, f.forestInheritanceDate) / 365;
    if (years < 3) return { applies: true, reason: `상속 3년 이내 임야 (${years.toFixed(1)}년 경과)` };
  }

  const u = input.unconditionalExemption;
  if (u?.isJongjoongOwned && u.jongjoongAcquisitionDate) {
    const cutoff = new Date("2005-12-31");
    if (u.jongjoongAcquisitionDate <= cutoff) {
      return { applies: true, reason: "종중 소유 (2005.12.31 이전 취득)" };
    }
  }

  return { applies: false, reason: "거주·사업관련 임야 사유 없음" };
}

export function judgeForest(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.FOREST];
  const warnings: string[] = [];
  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  const totalOwnershipDays = Math.max(0, differenceInDays(input.transferDate, ownershipStart));

  // ── Step 3-1: 재촌기간 기간기준 (주민등록 필수) ─────────────────────
  const residenceFromHistory = computeResidencePeriods(
    input.ownerProfile?.residenceHistories,
    input.landLocation,
    {
      requireResidentRegistration: true,
      adjacentSigunguCodes: input.adjacentSigunguCodes,
      distanceLimitKm: rules.farmlandDistanceKm,
    },
  );

  // 임야는 주민등록 필수 — legacy fallback은 주민등록 여부가 명시된 경우만
  const fallbackResidence: DateInterval[] =
    residenceFromHistory.length === 0 && input.ownerLocation?.hasResidentRegistration === true
      ? fallbackResidenceFromDistance(
          ownershipStart,
          input.transferDate,
          input.farmerResidenceDistance,
          rules.farmlandDistanceKm,
        )
      : [];
  if (fallbackResidence.length > 0) {
    warnings.push("임야 주거 이력 미입력 — legacy 거리 + 주민등록 스냅샷 fallback");
  }

  const residencePeriods = residenceFromHistory.length > 0 ? residenceFromHistory : fallbackResidence;
  const r1 = meetsPeriodCriteria(residencePeriods, input.acquisitionDate, input.transferDate, "forest", rules);

  steps.push({
    id: "forest_residence",
    label: "Step 3-1 임야 재촌 기간기준 (주민등록 필수)",
    status: r1.meets ? "PASS" : "FAIL",
    detail: r1.meets ? `재촌 기간기준 충족 — ${r1.detail}` : `재촌 미충족 — ${r1.detail}`,
    legalBasis: NBL.FOREST_RESIDENCE,
  });

  if (r1.meets) {
    appliedLaws.push(NBL.FOREST_RESIDENCE);
    return buildPass("임야 재촌 기간기준 충족 → 사업용", steps, appliedLaws, warnings, {
      r: r1, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }

  // ── Step 3-1-1: 공익·산림보호·사업관련 임야 기간기준 ─────────────────
  const publicProtected = isPublicOrProtected(input);
  const related = isBusinessRelatedForest(input);
  const applies = publicProtected || related.applies;

  let r2: PeriodCriteriaResult | null = null;
  if (applies) {
    const fullPeriod: DateInterval[] = [{ start: ownershipStart, end: input.transferDate }];
    r2 = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, input.transferDate, "forest", rules);
    if (!r2.meets) {
      steps.push({
        id: "forest_public_business",
        label: "Step 3-1-1 공익·사업관련 임야 기간기준",
        status: "FAIL",
        detail: `해당(${publicProtected ? "공익·산림보호" : related.reason})이나 기간기준 미충족`,
        legalBasis: publicProtected ? NBL.FOREST_PUBLIC : NBL.FOREST_BUSINESS,
      });
      return buildFail("공익/사업관련 임야이나 기간기준 미충족", steps, appliedLaws, warnings, {
        r: r2, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
      });
    }
    appliedLaws.push(publicProtected ? NBL.FOREST_PUBLIC : NBL.FOREST_BUSINESS);
    steps.push({
      id: "forest_public_business",
      label: "Step 3-1-1 공익·사업관련 임야 기간기준",
      status: "PASS",
      detail: publicProtected ? "공익·산림보호 임야" : `거주·사업관련: ${related.reason}`,
      legalBasis: publicProtected ? NBL.FOREST_PUBLIC : NBL.FOREST_BUSINESS,
    });
  } else {
    steps.push({
      id: "forest_public_business",
      label: "Step 3-1-1 공익·사업관련 임야 기간기준",
      status: "FAIL",
      detail: "공익·산림보호 및 거주·사업관련 사유 모두 미해당",
      legalBasis: NBL.FOREST_BUSINESS,
    });
    return buildFail("재촌 미충족 + 공익/사업관련 미해당 → 비사업용", steps, appliedLaws, warnings, {
      r: r1, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }

  // ── Step 3-2: 산림법 시업중 · 특수산림사업지구? ────────────────────
  const inSiupOrSpecialZone =
    input.forestDetail?.hasForestPlan === true ||
    input.forestDetail?.isSpecialForestZone === true;

  if (!inSiupOrSpecialZone) {
    steps.push({
      id: "forest_siup_zone",
      label: "Step 3-2 산림법 시업중·특수산림사업지구",
      status: "NOT_APPLICABLE",
      detail: "시업중/특수지구 아님 — 임야 지역기준 미적용 → 사업용",
      legalBasis: NBL.FOREST,
    });
    return buildPass("공익/사업관련 임야 + 기간기준 충족 (지역기준 미적용)", steps, appliedLaws, warnings, {
      r: r2, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }

  // ── Step 3-2-1/2: 시업중/특수지구 — 도시지역 밖 + 편입유예 ────────
  const urban = isUrbanForForest(input.zoneType);
  steps.push({
    id: "forest_siup_zone",
    label: "Step 3-2 산림법 시업중·특수산림사업지구",
    status: "PASS",
    detail: "시업중 임야 또는 특수산림사업지구 — 지역기준 적용",
    legalBasis: NBL.FOREST,
  });
  if (!urban) {
    return buildPass("시업중 임야 + 도시지역 밖", steps, appliedLaws, warnings, {
      r: r2, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }

  // 도시지역 內 시업중 임야 — 편입 3년 경과시 §168-9 ①2호 단서로 제외
  const grace = checkIncorporationGrace(input.urbanIncorporationDate, input.transferDate, rules);
  if (grace.isApplied) {
    steps.push({
      id: "forest_urban_grace",
      label: "Step 3-2-1 도시지역 內 편입유예",
      status: "PASS",
      detail: grace.detail,
      legalBasis: NBL.URBAN_GRACE,
    });
    return buildPass("시업중 임야 + 도시지역 內 편입유예 내", steps, appliedLaws, warnings, {
      r: r2, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }

  // 임야 편입유예 산정 — addYears(urbanIncorporationDate, 3) 경과 시 ①2호 단서 제외
  const addOneY = input.urbanIncorporationDate ? addYears(input.urbanIncorporationDate, 3) : null;
  steps.push({
    id: "forest_urban_grace",
    label: "Step 3-2-1 도시지역 內 편입유예",
    status: "FAIL",
    detail: addOneY
      ? `편입일 ${input.urbanIncorporationDate?.toISOString().slice(0, 10)}부터 3년 경과`
      : "편입일 미제공 또는 유예 경과",
    legalBasis: NBL.URBAN_GRACE,
  });
  return buildFail("시업중 임야 + 도시지역 內 유예 외 → 비사업용", steps, appliedLaws, warnings, {
    r: r2, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
  });
}

// ============================================================
// 공통 빌더
// ============================================================

interface Ctx {
  r: PeriodCriteriaResult;
  totalOwnershipDays: number;
  residencePeriodsUsed: DateInterval[];
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
    residencePeriodsUsed: ctx.residencePeriodsUsed,
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
    residencePeriodsUsed: ctx.residencePeriodsUsed,
    warnings,
  };
}
