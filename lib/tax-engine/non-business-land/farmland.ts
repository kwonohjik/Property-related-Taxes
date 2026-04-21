/**
 * 농지 판정 (§168-8, PDF p.1698~1699 흐름도 1:1)
 *
 * 판정 순서:
 *   Step 3-1   재촌·자경 기간기준
 *   Step 3-1-1 재촌·자경 간주 (사용의제, §168-8 ③)
 *   Step 3-2   도시지역 밖 농지? → 사업용
 *   Step 3-2-1 도시지역 內 편입유예 (1년 이상 재촌자경 or 사용의제 → 3년)
 */

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
import { isUrbanForFarmland } from "./urban-area";
import {
  getOwnershipStart,
  getOverlappingPeriods,
  mergeOverlappingPeriods,
  sumDaysInWindow,
} from "./utils/period-math";
import { differenceInDays } from "date-fns";

type FarmlandMode = "real" | "deemed";

/**
 * 농지 사용의제 확대 (§168-8 ③) — "재촌·자경 간주 농지" 해당 여부.
 * 주말농장·한계농지·전용허가·매립농지 등.
 */
export function checkFarmlandDeeming(input: NonBusinessLandInput): {
  applies: boolean;
  reasons: string[];
  legalBasis: string;
} {
  const d = input.farmlandDeeming;
  const reasons: string[] = [];
  if (!d) return { applies: false, reasons, legalBasis: NBL.FARMLAND_DEEM };

  const WEEKEND_MAX = 1000;
  const FARM_DEV_MAX = 1500;
  const WEEKEND_START = new Date("2003-01-01");
  const WEEKEND_END = new Date("2021-12-31");

  if (
    d.isWeekendFarm &&
    input.landArea <= WEEKEND_MAX &&
    input.acquisitionDate >= WEEKEND_START &&
    input.transferDate <= WEEKEND_END
  ) {
    reasons.push("주말·체험영농 (1,000㎡ 이하, 2003~2021 취득)");
  }
  if (d.isFarmConversionApproved) reasons.push("농지전용허가·협의 완료");
  if (d.isFarmDevZone && input.landArea < FARM_DEV_MAX) reasons.push("농지개발사업지구 1,500㎡ 미만");
  if (d.isMarginalFarmProject && input.landArea < FARM_DEV_MAX) reasons.push("한계농지정비사업지구 1,500㎡ 미만");
  if (d.isReclaimed) reasons.push("매립농지");
  if (d.isPublicProjectUse) reasons.push("공익·개발사업 관련 농지");
  if (d.isSickElderlyRental) reasons.push("5년 자경 후 질병·고령 임대 농지");

  return { applies: reasons.length > 0, reasons, legalBasis: NBL.FARMLAND_DEEM };
}

/**
 * 보유기간 중 "1년 이상 재촌·자경" 충족 여부 (§168-8 ⑤1호 농지 편입유예 요건).
 *
 * 법문 "편입된 날부터 소급하여 1년 이상 재촌하면서 자경하던 농지" 의 해석상
 * **연속 1년(365일)** 구간이 존재해야 한다. 여러 구간의 합산으로 1년을 채우는
 * 것은 법문 문언 "1년 이상 재촌하면서 자경하던"과 양립하지 않으므로 인정하지 않는다.
 * (Bug-04 수정)
 */
function hasAtLeastOneYearSelfFarming(combined: DateInterval[]): boolean {
  const merged = mergeOverlappingPeriods(combined);
  for (const p of merged) {
    if (differenceInDays(p.end, p.start) >= 365) return true;
  }
  return false;
}

/**
 * 농지 판정 메인.
 */
export function judgeFarmland(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.FARMLAND];
  const warnings: string[] = [];

  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  const totalOwnershipDays = Math.max(0, differenceInDays(input.transferDate, ownershipStart));

  // ── Step 3-1: 재촌·자경 기간기준 ──────────────────────────────
  const residenceFromHistory = computeResidencePeriods(
    input.ownerProfile?.residenceHistories,
    input.landLocation,
    {
      adjacentSigunguCodes: input.adjacentSigunguCodes,
      distanceLimitKm: rules.farmlandDistanceKm,
    },
  );

  const fallbackResidence = residenceFromHistory.length === 0
    ? fallbackResidenceFromDistance(
        ownershipStart,
        input.transferDate,
        input.farmerResidenceDistance,
        rules.farmlandDistanceKm,
      )
    : [];

  if (fallbackResidence.length > 0) {
    warnings.push("주거 이력 미입력 — legacy 거리 스냅샷 fallback 사용");
  }

  const residencePeriods =
    residenceFromHistory.length > 0 ? residenceFromHistory : fallbackResidence;

  const selfFarmingPeriods: DateInterval[] = input.farmingSelf === false
    ? []
    : input.businessUsePeriods.map((p) => ({ start: p.startDate, end: p.endDate }));

  const realFarming = getOverlappingPeriods(residencePeriods, selfFarmingPeriods);
  const r1 = meetsPeriodCriteria(realFarming, input.acquisitionDate, input.transferDate, "farmland", rules);

  let usageOk = r1.meets;
  let mode: FarmlandMode | null = usageOk ? "real" : null;
  let effectivePeriodsForLastStep: DateInterval[] = realFarming;
  let r: PeriodCriteriaResult = r1;

  steps.push({
    id: "usage_residence_self_farming",
    label: "Step 3-1 재촌·자경 기간기준",
    status: r1.meets ? "PASS" : "FAIL",
    detail: r1.meets
      ? `재촌자경 기간기준 충족 — ${r1.detail}`
      : `재촌자경 기간기준 미충족 — ${r1.detail}`,
    legalBasis: NBL.FARMLAND,
  });

  // ── Step 3-1-1: 사용의제 (재촌·자경 간주) ─────────────────────────
  if (!usageOk) {
    const deeming = checkFarmlandDeeming(input);
    if (deeming.applies) {
      // 사용의제는 "사용 종류"만 의제 — 기간기준은 재확인 (보유 전체를 사업용으로 간주)
      const fullPeriod: DateInterval[] = [{ start: ownershipStart, end: input.transferDate }];
      const r2 = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, input.transferDate, "farmland", rules);
      if (r2.meets) {
        usageOk = true;
        mode = "deemed";
        effectivePeriodsForLastStep = fullPeriod;
        r = r2;
        appliedLaws.push(NBL.FARMLAND_DEEM);
        steps.push({
          id: "farmland_deeming",
          label: "Step 3-1-1 재촌·자경 간주 농지 (사용의제)",
          status: "PASS",
          detail: `사용의제 해당 (${deeming.reasons.join(", ")}) + 기간기준 충족`,
          legalBasis: NBL.FARMLAND_DEEM,
        });
      } else {
        steps.push({
          id: "farmland_deeming",
          label: "Step 3-1-1 재촌·자경 간주 농지 (사용의제)",
          status: "FAIL",
          detail: `사용의제 해당(${deeming.reasons.join(", ")})이나 기간기준 미충족`,
          legalBasis: NBL.FARMLAND_DEEM,
        });
      }
    } else {
      steps.push({
        id: "farmland_deeming",
        label: "Step 3-1-1 재촌·자경 간주 농지 (사용의제)",
        status: "NOT_APPLICABLE",
        detail: "사용의제 해당사유 없음",
        legalBasis: NBL.FARMLAND_DEEM,
      });
    }
  }

  if (!usageOk) {
    return buildFail(
      "사용기준 미충족 (재촌·자경 + 사용의제 모두 미해당)",
      steps,
      appliedLaws,
      warnings,
      { r, totalOwnershipDays, residencePeriodsUsed: residencePeriods },
    );
  }

  // ── Step 3-2: 도시지역 밖 농지? ─────────────────────────────────
  const urban = isUrbanForFarmland(input.zoneType);
  if (!urban) {
    appliedLaws.push(NBL.CRITERIA);
    steps.push({
      id: "region_urban_outside",
      label: "Step 3-2 지역기준 (도시지역 밖 농지)",
      status: "PASS",
      detail: "도시지역 외 농지 → 사업용",
      legalBasis: NBL.MAIN,
    });
    return buildPass("도시지역 밖 농지 + 사용기준 충족", steps, appliedLaws, warnings, {
      r, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }

  // ── Step 3-2-1: 도시지역 內 농지 — 편입유예 검토 ──────────────────
  appliedLaws.push(NBL.FARMLAND_URBAN_GRACE);

  // 편입유예 요건: real 모드는 "1년 이상 재촌자경" 필수, deemed 모드는 바로 3년 유예
  if (mode === "real" && !hasAtLeastOneYearSelfFarming(effectivePeriodsForLastStep)) {
    steps.push({
      id: "region_grace_requirement",
      label: "Step 3-2-1 편입유예 요건 (1년 이상 재촌자경)",
      status: "FAIL",
      detail: "재촌자경 기간이 1년 미만 — 편입유예 요건 미충족",
      legalBasis: NBL.FARMLAND_URBAN_GRACE,
    });
    return buildFail(
      "도시지역 內 농지 + 편입유예 요건(1년 재촌자경) 미충족",
      steps,
      appliedLaws,
      warnings,
      { r, totalOwnershipDays, residencePeriodsUsed: residencePeriods },
    );
  }

  const grace = checkIncorporationGrace(input.urbanIncorporationDate, input.transferDate, rules);
  if (grace.isApplied) {
    steps.push({
      id: "region_urban_grace",
      label: "Step 3-2-1 도시지역 內 편입유예",
      status: "PASS",
      detail: grace.detail,
      legalBasis: NBL.FARMLAND_URBAN_GRACE,
    });
    return buildPass("도시지역 內 농지 + 편입유예 내", steps, appliedLaws, warnings, {
      r, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }

  steps.push({
    id: "region_urban_grace",
    label: "Step 3-2-1 도시지역 內 편입유예",
    status: "FAIL",
    detail: grace.detail || "편입유예 미적용 (편입 후 3년 경과 또는 편입일 미제공)",
    legalBasis: NBL.FARMLAND_URBAN_GRACE,
  });
  return buildFail(
    "도시지역 內 농지 + 편입유예 외 — 비사업용",
    steps,
    appliedLaws,
    warnings,
    { r, totalOwnershipDays, residencePeriodsUsed: residencePeriods },
  );
}

// ============================================================
// 헬퍼
// ============================================================

interface BuildCtx {
  r: PeriodCriteriaResult;
  totalOwnershipDays: number;
  residencePeriodsUsed: DateInterval[];
}

function buildPass(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: BuildCtx,
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
  ctx: BuildCtx,
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

// 미사용 import 경고 회피
export { sumDaysInWindow as _sumDaysInWindow };
