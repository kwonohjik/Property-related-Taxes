/**
 * 농지 판정 (§168-8, PDF p.1698~1699 흐름도 1:1)
 *
 * 판정 순서:
 *   Step 3-1   재촌·자경 기간기준
 *   Step 3-1-1 재촌·자경 간주 (사용의제, §168-8 ③)
 *   Step 3-2   도시지역 밖 농지? → 사업용
 *   Step 3-2-1 도시지역 內 편입유예 (편입일 소급 1년 재촌자경 or 사용의제 → 3년)
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
  getPeriodJudgmentDate,
  meetsPeriodCriteria,
  type PeriodCriteriaResult,
} from "./period-criteria";
import { computeResidencePeriods, fallbackResidenceFromDistance } from "./residence";
import { isUrbanForFarmland } from "./urban-area";
import { isUrbanCriteriaRegion } from "./urban-region-scope";
import {
  getOwnershipStart,
  getOverlappingPeriods,
  mergeOverlappingPeriods,
  sumDaysInWindow,
} from "./utils/period-math";
import { addDays, differenceInDays } from "date-fns";

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
 * "편입일부터 소급하여 1년 이상 재촌·자경" 충족 여부 (§168-8 ⑤1호 농지 편입유예 요건).
 *
 * 법문은 "**편입된 날부터 소급하여** 1년 이상 재촌하면서 자경하던 농지"다 — 기산점이
 * **도시지역 편입일**이고, 그로부터 거슬러 1년 구간에 재촌·자경이 있어야 한다.
 * "1년 이상 재촌하면서 자경하던"이므로 **연속**이어야 한다(여러 구간 합산 불가, Bug-04).
 * ⇒ merge 후 **단일 구간**이 [편입일−365일, 편입일]을 통째로 덮는지만 본다.
 *
 * ⚠️ 종전에는 인자가 구간 배열뿐이라 **보유기간 아무 곳의** 연속 365일이면 통과했다.
 *    "편입 직전 1년엔 자경 공백이었으나 과거에 1년 이상 자경했던" 농지가 요건을 충족한
 *    것으로 처리됐다(2026-08 F28~F30 리뷰).
 *
 * 편입일이 없으면 기산점을 세울 수 없으므로 **미충족**으로 본다 — 자동 통과 fallback은
 * 이 저장소 정책상 금지다. 실질 영향은 없다: 편입일이 없으면 `checkIncorporationGrace`가
 * 어차피 유예를 적용하지 않는다(판정 결과는 같고 FAIL 사유 문구만 앞당겨진다).
 *
 * 편입일이 취득일보다 앞서면(취득 전 이미 도시지역) 소급 1년 구간이 소유 개시 전이라
 * 재촌∩자경일 수 없어 자동으로 미충족이 된다 — **법문대로의 귀결이며 버그가 아니다.**
 */
function hasOneYearSelfFarmingBeforeIncorporation(
  combined: DateInterval[],
  urbanIncorporationDate: Date | undefined,
): boolean {
  if (!urbanIncorporationDate) return false;
  const windowStart = addDays(urbanIncorporationDate, -365);
  const merged = mergeOverlappingPeriods(combined);
  return merged.some((p) => p.start <= windowStart && p.end >= urbanIncorporationDate);
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
  // §168조의14② 양도일 의제 — §168조의6 기간기준 전용 (도시지역·편입유예는 실제 양도일)
  const pjDate = getPeriodJudgmentDate(input);
  const totalOwnershipDays = Math.max(0, differenceInDays(pjDate, ownershipStart));

  // ── Step 3-1: 재촌·자경 기간기준 ──────────────────────────────
  const residenceFromHistory = computeResidencePeriods(
    input.ownerProfile?.residenceHistories,
    input.landLocation,
    {
      adjacentSigunguCodes: input.adjacentSigunguCodes,
      distanceLimitKm: rules.farmlandDistanceKm,
    },
  );

  /**
   * 거리 스냅샷 fallback은 **거주 이력이 아예 없을 때만** 쓴다 (U1-02, 2026-09-02 코드리뷰).
   *
   * 종전 게이트는 `residenceFromHistory.length === 0`, 즉 **매칭된 재촌 기간**이 없을 때였다.
   * 그런데 UI는 이력이 1건이라도 생기면 「직선거리(km)」 입력을 화면에서 감추면서
   * store 값(`nblFarmerResidenceDistance`)은 그대로 전송한다. 그 결과 **이력이 있으나 하나도
   * 매칭되지 않는 경우**(다른 시·군·구 + 좌표 결측)에 화면에 없는 stale 거리로 전 보유기간이
   * 재촌으로 인정돼, 비사업용이어야 할 농지가 사업용으로 뒤집혔다(과소과세).
   *
   * 「소득세법 시행령」 §168의8②은 재촌을 「§153③에 따른 농지소재지에 **사실상 거주**」로 정하고
   * §153③은 동일·연접 시·군·구 또는 직선거리 30km를 요건으로 한다 — 재촌은 실제 거주지↔토지
   * 관계로 판정되어야 하며, 입력되지 않은 과거 스냅샷으로 대체할 근거가 없다
   * (「자동 안분 fallback 금지」 정책과도 충돌).
   *
   * ⇒ 「이력 자체가 없을 때」로 좁힌다. 아래 경고 문구(「주거 이력 미입력」)와도 이제 일치한다.
   */
  const hasResidenceHistory = (input.ownerProfile?.residenceHistories?.length ?? 0) > 0;
  const fallbackResidence = !hasResidenceHistory
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
  const r1 = meetsPeriodCriteria(realFarming, input.acquisitionDate, pjDate, "farmland", rules, input.gracePeriods);

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
      const fullPeriod: DateInterval[] = [{ start: ownershipStart, end: pjDate }];
      const r2 = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "farmland", rules, input.gracePeriods);
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

  // ── Step 3-2: 지역 열거 안인가? (법 §104의3①1호나목) ────────────
  // 나목의 「도시지역」은 특별시·광역시(군 제외)·특별자치시(읍면 제외)·특별자치도(제주 행정시
  // 읍면 제외)·시지역(도농복합시 읍면 제외) **안에서만** 따진다. 도의 군은 열거 자체에 없다.
  // 열거 밖이면 용도지역과 무관하게 지역기준을 적용하지 않는다. E2-01.
  const regionScope = isUrbanCriteriaRegion(input.landLocation?.sigunguCode, input.landDivision);
  if (regionScope === false) {
    appliedLaws.push(NBL.CRITERIA);
    steps.push({
      id: "region_scope_outside",
      label: "Step 3-2 지역기준 (법 §104의3①1호나목 지역 열거 밖)",
      status: "PASS",
      detail: "광역시의 군·도의 군 또는 읍·면지역 — 지역기준 미적용 → 사업용",
      legalBasis: NBL.MAIN,
    });
    return buildPass("지역 열거 밖 농지 + 사용기준 충족", steps, appliedLaws, warnings, {
      r, totalOwnershipDays, residencePeriodsUsed: residencePeriods,
    });
  }
  if (regionScope === undefined) {
    warnings.push(
      "토지 소재지의 시·군·구 또는 읍·면 구분이 없어 「소득세법」 §104조의3①1호나목의 지역 열거" +
        "(광역시의 군·읍·면지역 제외)를 판정하지 못했습니다 — 도시지역 판정을 그대로 적용했습니다.",
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

  // 편입유예 요건: real 모드는 "편입일부터 소급 1년 이상 재촌자경" 필수(§168-8 ⑤1호),
  // deemed 모드는 ⑤2호(제3항 각 호) 경로라 바로 3년 유예.
  if (
    mode === "real" &&
    !hasOneYearSelfFarmingBeforeIncorporation(effectivePeriodsForLastStep, input.urbanIncorporationDate)
  ) {
    steps.push({
      id: "region_grace_requirement",
      label: "Step 3-2-1 편입유예 요건 (편입일 소급 1년 재촌자경)",
      status: "FAIL",
      detail: input.urbanIncorporationDate
        ? `편입일 ${input.urbanIncorporationDate.toISOString().slice(0, 10)}부터 소급 1년 구간에 연속 재촌·자경 없음 — 편입유예 요건 미충족`
        : "도시지역 편입일 미제공 — 소급 1년 기산점을 세울 수 없어 편입유예 요건 미충족",
      legalBasis: NBL.FARMLAND_URBAN_GRACE,
    });
    return buildFail(
      "도시지역 內 농지 + 편입유예 요건(편입일 소급 1년 재촌자경) 미충족",
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
    gracePeriodDays: ctx.r.gracePeriodDays,
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
    gracePeriodDays: ctx.r.gracePeriodDays,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    residencePeriodsUsed: ctx.residencePeriodsUsed,
    warnings,
  };
}

// 미사용 import 경고 회피
export { sumDaysInWindow as _sumDaysInWindow };
