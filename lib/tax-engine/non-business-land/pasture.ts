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

import { addYears, differenceInDays } from "date-fns";
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
  getPeriodJudgmentDate,
  meetsPeriodCriteria,
  type PeriodCriteriaResult,
} from "./period-criteria";
import { isUrbanForPasture } from "./urban-area";
import { isUrbanCriteriaRegion } from "./urban-region-scope";
import { getOwnershipStart } from "./utils/period-math";
import { computeAreaProportioning } from "./utils/area-proportioning";
import { getLivestockStandardArea } from "./data/livestock-standards";
import { includedFacilityLabels } from "../livestock-standard-area";

function getLivestockPeriods(input: NonBusinessLandInput): DateInterval[] {
  const p = input.pasture;
  if (!p) return [];
  if (p.livestockPeriods && p.livestockPeriods.length > 0) {
    return p.livestockPeriods.map((x) => ({ start: x.startDate, end: x.endDate }));
  }
  // 영위 기간 배열이 없으면 isLivestockOperator=true인 경우 전체 보유로 간주
  // (§168조의14② 양도일 의제 시 의제일까지 축산영위 간주 — §168조의6 기간기준 일관)
  if (p.isLivestockOperator) {
    const ownershipStart = getOwnershipStart(input.acquisitionDate);
    return [{ start: ownershipStart, end: getPeriodJudgmentDate(input) }];
  }
  return [];
}

function isRelatedPasture(input: NonBusinessLandInput): { applies: boolean; reason: string } {
  const p = input.pasture;
  if (!p) return { applies: false, reason: "" };

  if (p.inheritanceDate) {
    // 「소득세법 시행령」 §168의10②1호 「상속개시일부터 3년이 **지나지 아니한**」 — 달력 기준으로 판정한다.
    // `differenceInDays / 365`는 윤일이 낀 창에서 하루 일찍 3년으로 올라가 요건이 끊긴다
    // (E2-04. forest.ts:57이 같은 이유로 이미 addYears를 쓴다 — 그 sibling과 맞춘다).
    const threeYearMark = addYears(p.inheritanceDate, 3);
    if (input.transferDate < threeYearMark) {
      const years = differenceInDays(input.transferDate, p.inheritanceDate) / 365;
      return { applies: true, reason: `상속 3년 이내 목장 (${years.toFixed(1)}년 경과)` };
    }
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

export function judgePasture(
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
): CategoryJudgeResult {
  const steps: JudgmentStep[] = [];
  const appliedLaws: string[] = [NBL.PASTURE];
  const warnings: string[] = [];
  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  // §168조의14② 양도일 의제 — §168조의6 기간기준 전용 (도시지역·편입유예는 실제 양도일)
  const pjDate = getPeriodJudgmentDate(input);
  const totalOwnershipDays = Math.max(0, differenceInDays(pjDate, ownershipStart));

  // ── Step 3-1: 축산업 영위기간 기간기준 ──────────────────────────
  const livestockPeriods = getLivestockPeriods(input);
  const r1 = meetsPeriodCriteria(livestockPeriods, input.acquisitionDate, pjDate, "pasture", rules, input.gracePeriods);

  steps.push({
    id: "pasture_livestock",
    label: "Step 3-1 축산업 영위기간 기간기준",
    status: r1.meets ? "PASS" : "FAIL",
    detail: r1.meets ? r1.detail : `축산업 영위 기간기준 미충족 — ${r1.detail}`,
    legalBasis: NBL.PASTURE,
  });

  /**
   * ── Step 3-1-1: 거주·사업관련 목장 (지역·면적 면제) ──────
   *
   * 🔴 **축산업 영위 기간기준 충족 여부와 무관하게** 판정한다 (V7-b, 2026-09-02 코드리뷰).
   *
   * 「소득세법」 §104의3①3호 각 목 외 부분 **단서**는 「다만, … 거주 또는 사업과 직접 관련이
   * 있다고 인정할 만한 상당한 이유가 있는 목장용지로서 대통령령으로 정하는 것은 제외한다」로
   * **가목(기준면적 초과·도시지역)을 포함한 3호 전체**에서 제외한다. 그런데 종전에는 이 판정이
   * `if (!r1.meets)` 블록 **안에만** 있어서, 축산업을 영위하는 목장은 단서를 통째로 건너뛰고
   * 기준면적·도시지역 판정으로 직행했다 — 「축산업을 영위하면 오히려 비사업용, 영위하지 않으면
   * 사업용」이라는 역전이다(실측 총부담세액 +76,548,532원 / +53,507,025원, 납세자 불리).
   *
   * 종중(시행령 §168의10②2호)은 Step 2 무조건 의제가 선점해 가려져 있었으나
   * 1호(상속 3년 이내)·3호(사회복지법인등)는 대응 분기가 없어 그대로 노출됐다.
   *
   * 🔴 **E5-04** — 이 이동으로 「종중 분기가 도달 불가」 상태는 해소됐다. 다만 같은 요건이
   *    §168의10②2호(여기)와 §168의14③ 레거시 분기 **두 곳에 중복 정의**돼 있다는 사실은 남는다.
   *    한쪽만 개정하면 다른 쪽의 옛 판정이 조용히 나온다. 원 리뷰의 처방(「무조건 의제의 레거시
   *    분기를 농지로 한정하고 임야·목장은 지목별 judge로 되돌린다」)은 **채택하지 않는다** —
   *    도시지역 시업중·특수산림사업지구 임야에서 결론이 갈리고, 그 corner에서는 선점하는
   *    무조건 의제 쪽이 법령상 옳다(§168의9③8호는 다목 사유라 ①2호 단서의 적용을 받지 않는다).
   */
  const related = isRelatedPasture(input);
  if (related.applies) {
    const fullPeriod: DateInterval[] = [{ start: ownershipStart, end: pjDate }];
    const r2 = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "pasture", rules, input.gracePeriods);
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
    // 단서 사유는 있으나 전 보유기간 기간기준조차 미충족 — 축산 영위도 미충족이면 여기서 종료.
    // (r1을 충족했다면 아래 기준면적·지역 판정으로 계속 진행한다 — 종전 동작 보존)
    if (!r1.meets) {
      return buildFail("거주·사업관련 목장이나 기간기준 미충족", steps, appliedLaws, warnings, {
        r: r2, totalOwnershipDays,
      });
    }
  } else if (!r1.meets) {
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

  // 기준면적 결정: 직접 입력 > getLivestockStandardArea 자동 계산 > 미확정
  let resolvedStandardArea: number | undefined = p?.standardArea;
  if (resolvedStandardArea === undefined && p?.livestockType && p.livestockCount !== undefined) {
    // 별표1의3의 4개 열은 **항목별 인정 한도**다 — 보유하지 않은 시설의 몫은 얹지 않는다
    // (축사는 축산업의 전제이므로 항상 포함). 무엇이 반영됐는지 warning에 드러낸다.
    const facilities = {
      hasFacility: p.hasFacility ?? false,
      hasGrassland: p.hasGrassland ?? false,
      hasFodder: p.hasFodder ?? false,
    };
    resolvedStandardArea = getLivestockStandardArea(p.livestockType, p.livestockCount, facilities);
    if (resolvedStandardArea > 0) {
      // E2-08 — 두수는 기준면적에 **선형으로** 곱해지므로 산정방법이 곧 한도를 가른다.
      // 별표 1의3 제2호는 3가지 중 납세자가 선택하도록 정하는데 엔진은 입력값을 그대로 쓴다.
      // 어떤 전제로 산출됐는지 warning에 드러내 사용자가 대조할 수 있게 한다.
      warnings.push(
        `기준면적 미입력 — 축종(${p.livestockType}) × 사육두수(${p.livestockCount}두) × ` +
        `보유시설(${includedFacilityLabels(facilities).join("·")}) = ${resolvedStandardArea}㎡ ` +
        "자동 산출 (소득세법 시행령 별표 1의3 §168조의10③). " +
        "사육두수는 입력값을 그대로 사용했습니다 — 별표 1의3 제2호의 3가지 산정방법(6과세기간 중 3 · " +
        "4과세기간 중 2 · 영위기간 2년 이하) 중 납세자가 선택한 방법으로 산정한 값인지 확인하세요.",
      );
    } else {
      // 별표 1의3에 없는 축종·두수 0 등으로 자동산출이 0을 낸 경우 — 그 0을 기준면적으로 채택하면
      // 토지 전량이 초과분이 되어 조용히 비사업용으로 붕괴한다. 채택하지 않고 사유를 드러낸다 (E2-03).
      resolvedStandardArea = undefined;
      warnings.push(
        `축산용 토지 기준면적을 산출하지 못했습니다(축종 ${p.livestockType} · 사육두수 ${p.livestockCount}두) — ` +
          "면적기준을 적용하지 않았습니다. 기준면적을 직접 입력하거나 축종·두수를 확인하세요 (소득세법 시행령 별표 1의3).",
      );
    }
  }

  if (resolvedStandardArea !== undefined && input.landArea > resolvedStandardArea) {
    appliedLaws.push(NBL.PASTURE_AREA);
    areaProportioning = computeAreaProportioning(input.landArea, resolvedStandardArea);
    steps.push({
      id: "pasture_area",
      label: "Step 3-2 축산업용 기준면적",
      status: "FAIL",
      detail: `기준면적 ${resolvedStandardArea}㎡ 초과 → 초과분 ${areaProportioning.nonBusinessArea}㎡ 비사업용`,
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
      gracePeriodDays: r1.gracePeriodDays,
      businessUseRatio: 1 - areaProportioning.nonBusinessRatio,
      criteria: r1.criteria,
      warnings,
    };
  }
  steps.push({
    id: "pasture_area",
    label: "Step 3-2 축산업용 기준면적",
    status: "PASS",
    detail: resolvedStandardArea !== undefined
      ? `${input.landArea}㎡ ≤ ${resolvedStandardArea}㎡`
      : "기준면적 미제공 (검증 생략)",
    legalBasis: NBL.PASTURE_AREA,
  });

  // ── Step 3-3: 지역 열거 안인가? (법 §104의3①3호가목) ────────────
  // 3호가목의 「특별시ㆍ광역시ㆍ특별자치시ㆍ특별자치도 및 시지역의 도시지역」에는 1호나목 괄호의
  // 제외(광역시의 군·읍·면지역)가 「이하 이 항에서 같다」로 그대로 미친다. E2-01.
  const regionScope = isUrbanCriteriaRegion(input.landLocation?.sigunguCode, input.landDivision);
  if (regionScope === false) {
    appliedLaws.push(NBL.PASTURE_URBAN);
    steps.push({
      id: "pasture_region_scope",
      label: "Step 3-3 지역기준 (법 §104의3①3호가목 지역 열거 밖)",
      status: "PASS",
      detail: "광역시의 군·도의 군 또는 읍·면지역 — 지역기준 미적용 → 사업용",
      legalBasis: NBL.PASTURE_URBAN,
    });
    return buildPass("지역 열거 밖 + 축산업 영위 + 기준면적 이내", steps, appliedLaws, warnings, {
      r: r1, totalOwnershipDays,
    });
  }
  if (regionScope === undefined) {
    warnings.push(
      "토지 소재지의 시·군·구 또는 읍·면 구분이 없어 「소득세법」 §104조의3①3호가목의 지역 열거" +
        "(광역시의 군·읍·면지역 제외)를 판정하지 못했습니다 — 도시지역 판정을 그대로 적용했습니다.",
    );
  }

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
