/**
 * 공통 기간기준 엔진 (소득세법 시행령 §168조의6)
 *
 * §168조의6은 토지 소유기간을 3개 버킷으로 나누고, 각 버킷별로 "비사업용 기간 =
 * 가·나·다(또는 가·나) 모두에 해당하는 기간"의 AND 구조로 비사업용을 판정한다.
 * 하나라도 미충족이면 사업용. 즉 `isBusiness = NOT(가 AND 나 AND 다)`.
 * 기간의 계산은 일수로 한다(법문 명시). "초과" = strict `>`.
 *
 * 1호 (소유기간 5년 이상): 가·나·다 모두
 *   가. 양도일 직전 5년 중 2년(730일)을 초과하는 비사업용
 *   나. 양도일 직전 3년 중 1년(365일)을 초과하는 비사업용
 *   다. 소유기간 100분의 40에 상당하는 기간을 초과하는 비사업용
 * 2호 (소유기간 3년 이상 5년 미만): 가·나·다 모두
 *   가. 소유기간에서 3년을 차감한 기간을 초과하는 비사업용
 *   나. (1호 나목과 동일) 직전 3년 중 1년 초과
 *   다. (1호 다목과 동일) 소유기간 40% 초과
 * 3호 (소유기간 3년 미만): 가·나 모두. 단, 소유 2년 미만이면 가목 미적용.
 *   가. 소유기간에서 2년을 차감한 기간을 초과하는 비사업용
 *   나. 소유기간 100분의 40에 상당하는 기간을 초과하는 비사업용
 *
 * 비사업용 비율 임계(다목/3호 나목)는 100분의 40. 단, 2015.2.2 이전 양도분의
 * 농·임·목은 비사업용 100분의 20(=사업용 80%) 레거시 — getThresholdRatio의
 * 사업용 비율 임계(0.6/0.8)를 `1 − ratio`로 환산해 적용한다.
 *
 * 레거시 호환: 결과 타입 `criteria`의 3 boolean은 "사업용으로 인정하는 lens"
 * (De Morgan: 사업용 = 각 목 미충족의 OR)로 재정의하되 필드명·개수는 불변.
 */

import { addYears, differenceInDays } from "date-fns";
import type {
  DateInterval,
  GracePeriod,
  LandCategoryGroup,
  NonBusinessLandInput,
  NonBusinessLandJudgmentRules,
} from "./types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "./types";
import {
  getOwnershipStart,
  mergeOverlappingPeriods,
  sumDaysInWindow,
} from "./utils/period-math";
import { calculateGraceDaysInWindow } from "./grace-period";

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
  /** 유효 사업용 일수 (전체 보유기간 클립, 유예기간 가산 포함) */
  effectiveBusinessDays: number;
  /** 유예기간 가산 일수 (전체 보유기간 window 내, §168조의14①) */
  gracePeriodDays: number;
  /** §168조의6 소유기간 버킷 (1=5년이상·2=3~5년·3=3년미만). 디버깅·테스트용 echo */
  ownershipBucket?: 1 | 2 | 3;
  /** 사람이 읽을 수 있는 설명 */
  detail: string;
}

// §168조의6 일수 환산 상수 (법문 "기간의 계산은 일수로 한다").
const ONE_YEAR_DAYS = 365; // 1년
const TWO_YEARS_DAYS = 2 * 365; // 730 — 직전5년 중 2년·소유기간 차감 2년
const THREE_YEARS_DAYS = 3 * 365; // 1095 — 소유기간 차감 3년·버킷2 경계
const FIVE_YEARS_DAYS = 5 * 365; // 1825 — 버킷1 경계
// 주의: 버킷 경계(5.0년/3.0년)·"소유기간 차감 N년"의 윤년 ±1일 환산은 달력연(addYears)
// 대안과 갈릴 수 있다 → 확인 필요(집행기준 1건). 현행 실증 divergence는 모두 버킷 내부라 무영향.

/**
 * §168조의14② 양도일 의제 — 경매·공매·신문공고로 양도가 지연된 경우 의제일을
 * 양도일로 보아 §168조의6(기간기준)만 재판정한다. 지목·도시지역·편입유예·무조건의제는
 * 실제 양도일 유지(호출자가 이 헬퍼를 §168조의6 판정 경로에만 적용).
 */
export function getPeriodJudgmentDate(
  input: Pick<NonBusinessLandInput, "deemedTransferReason" | "deemedTransferDate" | "transferDate">,
): Date {
  if (
    input.deemedTransferReason &&
    input.deemedTransferReason !== "none" &&
    input.deemedTransferDate
  ) {
    return input.deemedTransferDate;
  }
  return input.transferDate;
}

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
 *
 * @param gracePeriods - 유예기간 목록 (§168조의14 ①). 제공 시 각 window에 가산됨.
 */
export function meetsPeriodCriteria(
  effectivePeriods: DateInterval[],
  acquisitionDate: Date,
  transferDate: Date,
  categoryGroup: LandCategoryGroup,
  rules: NonBusinessLandJudgmentRules = DEFAULT_NON_BUSINESS_LAND_RULES,
  gracePeriods?: GracePeriod[],
): PeriodCriteriaResult {
  const ownershipStart = getOwnershipStart(acquisitionDate);
  const totalOwnershipDays = Math.max(0, differenceInDays(transferDate, ownershipStart));
  const merged = mergeOverlappingPeriods(effectivePeriods);

  // 직전 3년 창
  const threeYearsAgo = addYears(transferDate, -3);
  const windowStart3 = threeYearsAgo > ownershipStart ? threeYearsAgo : ownershipStart;
  const window3Years: DateInterval = { start: windowStart3, end: transferDate };

  // 직전 5년 창
  const fiveYearsAgo = addYears(transferDate, -5);
  const windowStart5 = fiveYearsAgo > ownershipStart ? fiveYearsAgo : ownershipStart;
  const window5Years: DateInterval = { start: windowStart5, end: transferDate };

  // 전체 보유기간 창
  const windowFull: DateInterval = { start: ownershipStart, end: transferDate };

  // 사업용 사용 일수 (각 창)
  let effectiveBusinessDays3y = sumDaysInWindow(merged, window3Years.start, window3Years.end);
  let effectiveBusinessDays5y = sumDaysInWindow(merged, window5Years.start, window5Years.end);
  let totalEffectiveBusinessDays = sumDaysInWindow(merged, windowFull.start, windowFull.end);

  // 유예기간 가산 (§168조의14 ①) — 제공된 경우에만
  let gracePeriodDaysApplied = 0;
  if (gracePeriods && gracePeriods.length > 0) {
    gracePeriodDaysApplied = calculateGraceDaysInWindow(gracePeriods, windowFull);
    effectiveBusinessDays3y += calculateGraceDaysInWindow(gracePeriods, window3Years);
    effectiveBusinessDays5y += calculateGraceDaysInWindow(gracePeriods, window5Years);
    totalEffectiveBusinessDays += gracePeriodDaysApplied;
  }

  // 전체 보유기간 초과 클리핑
  const effectiveBusinessDays = Math.min(totalEffectiveBusinessDays, totalOwnershipDays);
  const bizInLast3 = Math.min(effectiveBusinessDays3y, differenceInDays(window3Years.end, window3Years.start));
  const bizInLast5 = Math.min(effectiveBusinessDays5y, differenceInDays(window5Years.end, window5Years.start));

  const ratio = totalOwnershipDays > 0 ? effectiveBusinessDays / totalOwnershipDays : 0;

  const thresholdRatio = getThresholdRatio(transferDate, categoryGroup, rules);

  // ── §168조의6 비사업용 기간 판정 (버킷별 가·나·다 AND) ──────────────
  // 각 창의 비사업용 일수 = 창 길이 − 사업용 일수. 창 길이는 clip 반영(짧은 보유 시
  // 직전 N년 창이 소유기간으로 축소). bizInLast3/5 는 이미 win 길이로 min-clip됨.
  const win5len = differenceInDays(window5Years.end, window5Years.start);
  const win3len = differenceInDays(window3Years.end, window3Years.start);
  const nonBizInWindow5 = Math.max(0, win5len - bizInLast5);
  const nonBizInWindow3 = Math.max(0, win3len - bizInLast3);
  const nonBizTotal = Math.max(0, totalOwnershipDays - effectiveBusinessDays);

  // 다목/3호 나목: "100분의 40(레거시 농임목 20)에 상당하는 기간을 초과" — 비사업용 임계.
  const nonBizRatioThreshold = 1 - thresholdRatio; // 0.4 (레거시 0.2)
  const overRatio = nonBizTotal > Math.floor(totalOwnershipDays * nonBizRatioThreshold);

  // 소유기간 버킷 ("이상"=`>=`, "미만"=`<`).
  const ownershipBucket: 1 | 2 | 3 =
    totalOwnershipDays >= FIVE_YEARS_DAYS ? 1 : totalOwnershipDays >= THREE_YEARS_DAYS ? 2 : 3;

  // 0일 보유(취득일=양도일) — 사업용 사용 기간 자체가 없음 → 비사업용(보수적 안전 처리).
  // floor(0×0.4)=0 의 0>0=false 인공물로 사업용 오판되는 것을 차단.
  if (totalOwnershipDays === 0) {
    return buildResult(
      false,
      "none",
      { rule2of3Years: false, rule5Years: false, rule80Percent: false },
      {
        ratio, bizInLast3, bizInLast5, thresholdRatio,
        totalOwnershipDays, effectiveBusinessDays, gracePeriodDays: gracePeriodDaysApplied,
        ownershipBucket,
      },
      "0일 보유(취득일=양도일) — 사업용 기간 없음 → 비사업용",
    );
  }

  // 각 목 비사업용 충족 여부 (법문 "초과" = strict `>`).
  // 가목(장기/직전5년 lens) — 버킷별 정의 상이.
  let nbA: boolean;
  // 나목(직전 3년 중 1년 초과) — 버킷1·2만. 버킷3은 직전3년 목 없음.
  let nbB3y: boolean;
  let isNonBusiness: boolean;
  let bucketDetail: string;
  let applyBucket3A = false;

  if (ownershipBucket === 1) {
    nbA = nonBizInWindow5 > TWO_YEARS_DAYS; // 가. 직전 5년 중 2년(730일) 초과
    nbB3y = nonBizInWindow3 > ONE_YEAR_DAYS; // 나. 직전 3년 중 1년(365일) 초과
    isNonBusiness = nbA && nbB3y && overRatio; // 다. 40% 초과
    bucketDetail =
      `1호(소유 5년 이상): 직전5년 비사업 ${nonBizInWindow5}일(가 ${nbA ? "충족" : "미충족"}), ` +
      `직전3년 비사업 ${nonBizInWindow3}일(나 ${nbB3y ? "충족" : "미충족"}), ` +
      `전체 비사업 ${nonBizTotal}일(다 ${overRatio ? "충족" : "미충족"})`;
  } else if (ownershipBucket === 2) {
    nbA = nonBizTotal > totalOwnershipDays - THREE_YEARS_DAYS; // 가. 소유기간−3년 초과
    nbB3y = nonBizInWindow3 > ONE_YEAR_DAYS; // 나. 직전 3년 중 1년 초과
    isNonBusiness = nbA && nbB3y && overRatio; // 다. 40% 초과
    bucketDetail =
      `2호(소유 3~5년): 전체 비사업 ${nonBizTotal}일 > 소유−3년 ${totalOwnershipDays - THREE_YEARS_DAYS}일(가 ${nbA ? "충족" : "미충족"}), ` +
      `직전3년 비사업 ${nonBizInWindow3}일(나 ${nbB3y ? "충족" : "미충족"}), ` +
      `전체 비사업 ${nonBizTotal}일(다 ${overRatio ? "충족" : "미충족"})`;
  } else {
    // 3호(소유 3년 미만): 가(소유−2년) · 나(40%). 단서: 소유 2년 미만이면 가목 미적용.
    applyBucket3A = totalOwnershipDays >= TWO_YEARS_DAYS;
    nbA = applyBucket3A && nonBizTotal > totalOwnershipDays - TWO_YEARS_DAYS;
    nbB3y = false; // 버킷3엔 직전3년 1년초과 목 없음
    isNonBusiness = applyBucket3A ? nbA && overRatio : overRatio;
    bucketDetail = applyBucket3A
      ? `3호(소유 2~3년): 전체 비사업 ${nonBizTotal}일 > 소유−2년 ${totalOwnershipDays - TWO_YEARS_DAYS}일(가 ${nbA ? "충족" : "미충족"}), ` +
        `전체 비사업 ${nonBizTotal}일(나 ${overRatio ? "충족" : "미충족"})`
      : `3호 단서(소유 2년 미만, 가목 미적용): 전체 비사업 ${nonBizTotal}일(나 ${overRatio ? "충족" : "미충족"})`;
  }

  const isBusiness = !isNonBusiness;

  // 레거시 호환 boolean — "사업용으로 인정하는 lens" (각 활성 목 미충족 = 사업용).
  // De Morgan: isBusiness = rule5Years || rule2of3Years || rule80Percent.
  const rule5Years = ownershipBucket === 3 ? applyBucket3A && !nbA : !nbA; // 가목 lens
  const rule2of3Years = ownershipBucket === 3 ? false : !nbB3y; // 직전3년 나목 lens
  const rule80Percent = !overRatio; // 비율 다목/나목 lens

  const flags = { rule2of3Years, rule5Years, rule80Percent };
  const metrics = {
    ratio, bizInLast3, bizInLast5, thresholdRatio,
    totalOwnershipDays, effectiveBusinessDays, gracePeriodDays: gracePeriodDaysApplied,
    ownershipBucket,
  };

  // criteriaUsed: 사업용 결정 lens. 우선순위 직전3년 > 가목(장기) > 비율 (기존 순서 유지).
  let criteriaUsed: PeriodCriteriaUsed = "none";
  if (isBusiness) {
    criteriaUsed = rule2of3Years ? "3y-2y" : rule5Years ? "5y-3y" : "ratio";
  }
  const detail = isBusiness
    ? `사업용 — ${bucketDetail} → 가·나·다 중 일부 미충족(사업용)`
    : `비사업용 — ${bucketDetail} → 모두 충족(비사업용)`;

  return buildResult(isBusiness, criteriaUsed, flags, metrics, detail);
}

function buildResult(
  meets: boolean,
  criteriaUsed: PeriodCriteriaUsed,
  criteria: PeriodCriteriaResult["criteria"],
  metrics: Pick<PeriodCriteriaResult, "ratio" | "bizInLast3" | "bizInLast5" | "thresholdRatio" | "totalOwnershipDays" | "effectiveBusinessDays" | "gracePeriodDays" | "ownershipBucket">,
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
