/**
 * 공통 기간기준 엔진 (§168-6 + PDF p.1695 "기간기준 3가지 중 하나 충족")
 *
 * 현행법 §168-6 해석:
 * - 비사업용 기간 = 가·나·다 모두에 해당하는 기간
 *   가. 직전 5년 중 2년 초과 비사업용
 *   나. 직전 3년 중 1년 초과 비사업용
 *   다. 보유기간 100분의 40 초과 비사업용
 * - 사업용 판정 = 가·나·다 중 하나라도 미충족 (OR 판정)
 *
 * PDF "3가지 중 하나 충족" 형태로 단순화해 구현:
 * ① 직전 3년 중 2년(730일) 이상 사업용
 * ② 직전 5년 중 3년(1,095일) 이상 사업용
 * ③ 전체 보유기간 60% 이상 사업용 (2015.2.2 이전 양도분의 농·임·목만 80%)
 */

import { addYears, differenceInDays } from "date-fns";
import type {
  DateInterval,
  LandCategoryGroup,
  NonBusinessLandJudgmentRules,
} from "./types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "./types";
import {
  getOwnershipStart,
  mergeOverlappingPeriods,
  sumDaysInWindow,
} from "./utils/period-math";

export type PeriodCriteriaUsed = "3y-2y" | "5y-3y" | "ratio" | "none";

export interface PeriodCriteriaResult {
  /** 사업용 판정 통과 여부 */
  meets: boolean;
  /** 통과된 기준 ID (none = 3기준 모두 미충족) */
  criteriaUsed: PeriodCriteriaUsed;
  /** 3기준 플래그 — 결과 구조 호환용 */
  criteria: {
    rule2of3Years: boolean;
    rule5Years: boolean;
    rule80Percent: boolean;
  };
  /** 전체 보유기간 중 사업용 비율 */
  ratio: number;
  /** 직전 3년 창 내 사업용 일수 */
  bizInLast3: number;
  /** 직전 5년 창 내 사업용 일수 */
  bizInLast5: number;
  /** 기준 ③ 적용된 임계비율 (0.6 또는 0.8) */
  thresholdRatio: number;
  /** 전체 소유일수 */
  totalOwnershipDays: number;
  /** 유효 사업용 일수 (전체 보유기간 클립) */
  effectiveBusinessDays: number;
  /** 사람이 읽을 수 있는 설명 */
  detail: string;
}

const DAYS_2Y = 2 * 365; // 730
const DAYS_3Y = 3 * 365; // 1095

/**
 * 기준 ③ 임계비율 결정.
 * 현행법은 0.6. 단, 2015.2.2 이전 양도분의 농·임·목은 0.8 레거시.
 */
export function getThresholdRatio(
  transferDate: Date,
  categoryGroup: LandCategoryGroup,
  rules: NonBusinessLandJudgmentRules,
): number {
  const t = rules.periodCriteriaThresholds;
  if (!t) return 0.6;

  const oldDate = new Date(t.oldThresholdDate);
  const isFarmForestPasture =
    categoryGroup === "farmland" ||
    categoryGroup === "forest" ||
    categoryGroup === "pasture";

  if (transferDate < oldDate && isFarmForestPasture) {
    return t.oldThresholdRatio;
  }
  return t.currentThresholdRatio;
}

/**
 * 3가지 기간기준 중 하나라도 충족하면 사업용 인정 (OR 판정).
 * PASS 즉시 반환하여 최소 비용으로 판정.
 */
export function meetsPeriodCriteria(
  effectivePeriods: DateInterval[],
  acquisitionDate: Date,
  transferDate: Date,
  categoryGroup: LandCategoryGroup,
  rules: NonBusinessLandJudgmentRules = DEFAULT_NON_BUSINESS_LAND_RULES,
): PeriodCriteriaResult {
  const ownershipStart = getOwnershipStart(acquisitionDate);
  const totalOwnershipDays = Math.max(0, differenceInDays(transferDate, ownershipStart));
  const merged = mergeOverlappingPeriods(effectivePeriods);

  // 전체 보유기간 내 사업용 일수
  const effectiveBusinessDays = sumDaysInWindow(merged, ownershipStart, transferDate);
  const ratio = totalOwnershipDays > 0 ? effectiveBusinessDays / totalOwnershipDays : 0;

  // 직전 3년 창
  const threeYearsAgo = addYears(transferDate, -3);
  const windowStart3 = threeYearsAgo > ownershipStart ? threeYearsAgo : ownershipStart;
  const bizInLast3 = sumDaysInWindow(merged, windowStart3, transferDate);

  // 직전 5년 창
  const fiveYearsAgo = addYears(transferDate, -5);
  const windowStart5 = fiveYearsAgo > ownershipStart ? fiveYearsAgo : ownershipStart;
  const bizInLast5 = sumDaysInWindow(merged, windowStart5, transferDate);

  const thresholdRatio = getThresholdRatio(transferDate, categoryGroup, rules);

  const rule2of3Years = bizInLast3 >= DAYS_2Y;
  const rule5Years = bizInLast5 >= DAYS_3Y;
  const rule80Percent = ratio >= thresholdRatio;

  // PDF 우선순위: ① 직전 3년 중 2년 → ② 직전 5년 중 3년 → ③ 보유 비율
  if (rule2of3Years) {
    return buildResult(true, "3y-2y", { rule2of3Years, rule5Years, rule80Percent }, {
      ratio, bizInLast3, bizInLast5, thresholdRatio, totalOwnershipDays, effectiveBusinessDays,
    }, `직전 3년 중 ${bizInLast3}일 사업용 (기준 ≥ ${DAYS_2Y}일)`);
  }
  if (rule5Years) {
    return buildResult(true, "5y-3y", { rule2of3Years, rule5Years, rule80Percent }, {
      ratio, bizInLast3, bizInLast5, thresholdRatio, totalOwnershipDays, effectiveBusinessDays,
    }, `직전 5년 중 ${bizInLast5}일 사업용 (기준 ≥ ${DAYS_3Y}일)`);
  }
  if (rule80Percent) {
    return buildResult(true, "ratio", { rule2of3Years, rule5Years, rule80Percent }, {
      ratio, bizInLast3, bizInLast5, thresholdRatio, totalOwnershipDays, effectiveBusinessDays,
    }, `보유기간 ${totalOwnershipDays}일 중 ${effectiveBusinessDays}일 사업용 (${(ratio * 100).toFixed(1)}% ≥ ${(thresholdRatio * 100).toFixed(0)}%)`);
  }

  return buildResult(false, "none", { rule2of3Years, rule5Years, rule80Percent }, {
    ratio, bizInLast3, bizInLast5, thresholdRatio, totalOwnershipDays, effectiveBusinessDays,
  }, `3기준 모두 미충족 — 직전 3년 ${bizInLast3}/${DAYS_2Y}, 직전 5년 ${bizInLast5}/${DAYS_3Y}, 보유 ${(ratio * 100).toFixed(1)}%/${(thresholdRatio * 100).toFixed(0)}%`);
}

function buildResult(
  meets: boolean,
  criteriaUsed: PeriodCriteriaUsed,
  criteria: PeriodCriteriaResult["criteria"],
  metrics: Pick<PeriodCriteriaResult, "ratio" | "bizInLast3" | "bizInLast5" | "thresholdRatio" | "totalOwnershipDays" | "effectiveBusinessDays">,
  detail: string,
): PeriodCriteriaResult {
  return { meets, criteriaUsed, criteria, ...metrics, detail };
}

// ============================================================
// 도시지역 편입유예 판정
// ============================================================

export interface IncorporationGraceResult {
  isApplied: boolean;
  graceYears: 2 | 3;
  graceEndDate: Date;
  detail: string;
}

/**
 * §168-8 ⑥ 농지 / §168-10 ⑤ 목장 편입유예.
 * 기본 3년. 2015.2.2 이전 양도분은 2년 레거시.
 */
export function checkIncorporationGrace(
  urbanIncorporationDate: Date | undefined,
  transferDate: Date,
  rules: NonBusinessLandJudgmentRules = DEFAULT_NON_BUSINESS_LAND_RULES,
): IncorporationGraceResult {
  if (!urbanIncorporationDate) {
    return {
      isApplied: false,
      graceYears: 3,
      graceEndDate: transferDate,
      detail: "도시지역 편입일 미제공",
    };
  }
  const graceConf = rules.urbanIncorporationGrace;
  const changeDate = graceConf ? new Date(graceConf.changeDate) : new Date("2015-02-02");
  const graceYears: 2 | 3 =
    transferDate < changeDate
      ? ((graceConf?.graceYearsOld ?? 2) as 2)
      : ((graceConf?.graceYearsNew ?? 3) as 3);
  const graceEndDate = addYears(urbanIncorporationDate, graceYears);
  const isApplied = transferDate <= graceEndDate;
  return {
    isApplied,
    graceYears,
    graceEndDate,
    detail: isApplied
      ? `편입일 ${urbanIncorporationDate.toISOString().slice(0, 10)}부터 ${graceYears}년 유예 적용`
      : `편입일 ${urbanIncorporationDate.toISOString().slice(0, 10)}부터 ${graceYears}년 유예 경과`,
  };
}
