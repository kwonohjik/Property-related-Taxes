/**
 * 기타토지 판정의 수입금액비율(영 §168의11②) 단계 — `other-land.ts`에서 떼어 낸 순수 조각(NBL-STATE-HISTORY-E3-② · 800줄 정책 분리).
 *
 * 이 파일이 맡는 것:
 *   1. `judgeRevenueStep` — core의 수입금액비율 블록. **OFF(영위 기간 입력 없음)는 종전 블록 그대로 이동**했다(판정·단계·고지 바이트 동일 · DM-01 포함).
 *      ON(`revenueHistory`)이면 `judgeByHistory` — 과세기간별 판정 → 통과 과세기간 ∩ 영위일 = 사업용 구간 → 영 §168의6 기간기준. DM-01은 건너뛴다(사건이 개시일을 대신한다 · 결정 ⑤).
 *   2. `prepareRevenueHistory` — 판정 진입 전 입력 정리(양도일 의제 시 이력 미적용 고지 · 폐업 후 10호 유예 자동 미생성 고지).
 *   3. `finishRevenueHistory` — 판정 끝에서 echo(`periodEvaluation.revenueHistory`)·고지를 붙인다. ON 경로를 타지 않았고 고지도 없으면 **결과 객체를 그대로** 돌려준다(R-3).
 *
 * 법 §104의3①4호 가·나·다목은 병렬 제외 사유(합집합) — 이 경로의 사업용 구간은 `markOwn(trace, …)`로 core 자체 사업기간에 기록돼 건축물 이력과 합집합이 된다(Q-15 (가′)).
 */
import { NBL } from "../legal-codes";
import { getNblRevenueThreshold } from "../legal-codes";
import { NBL_REVENUE_HISTORY_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE } from "../nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_DEEMED_TRANSFER_NOTICE } from "../nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_GRACE10_PREMISE_NOTICE } from "../nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_PAST_YEARS_NOTICE } from "../nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE } from "../nbl-confirm-notices";
import { TaxCalculationError } from "../tax-errors";
import { TaxErrorCode } from "../tax-errors";
import { differenceInDays } from "../utc-date";
import { buildPass } from "./other-land-helpers";
import { markOwn } from "./other-land-helpers";
import { judgeRevenueBusinessStart } from "./other-land-merge";
import { meetsPeriodCriteria } from "./period-criteria";
import { computeRevenueTest } from "./revenue-test";
import { REVENUE_BUSINESS_TYPE_LABEL } from "./revenue-test";
import { closurePremise } from "./revenue-history";
import { deriveOperatingRange } from "./revenue-history";
import { evaluateRevenueHistory } from "./revenue-history";
import { getOwnershipStart } from "./utils/period-math";
import { wholesaleItemIssue } from "./revenue-wholesale-item";
import type { OtherLandOwnTrace } from "./other-land-helpers";
import type { PeriodCriteriaResult } from "./period-criteria";
import type { CategoryJudgeResult } from "./types";
import type { DateInterval } from "./types";
import type { JudgmentStep } from "./types";
import type { NonBusinessLandInput } from "./types";
import type { NonBusinessLandJudgmentRules } from "./types";
import type { PeriodEvaluation } from "./types";
import type { RevenueHistoryEcho } from "./revenue-test.types";
import type { RevenueHistoryExcludedGrace } from "./revenue-test.types";
import type { RevenueHistoryYearEcho } from "./revenue-test.types";
import type { RevenueTestInput } from "./revenue-test.types";
import type { RevenueTestResult } from "./revenue-test.types";

// ── 적용 범위 ────────────────────────────────────────────────

/**
 * 영위 기간 입력의 적용 범위 — `off`: 입력 없음(또는 업종 없음) = 현행 · `deemed`: 양도일 의제 사유가 선택돼 이력을 쓰지 않는다(의제일과 영위 구간이 어긋날 수 있다 — 고지) · `on`: 과세기간별 판정.
 * 판정(`judgeRevenueStep`)·준비(`prepareRevenueHistory`)가 같은 술어를 쓴다.
 */
export type RevenueHistoryScope = "off" | "deemed" | "on";

export function revenueHistoryScope(input: Pick<NonBusinessLandInput, "revenueHistory" | "revenueTest" | "deemedTransferReason">): RevenueHistoryScope {
  if (!input.revenueHistory) return "off";
  if (!input.revenueTest || input.revenueTest.businessType === "none") return "off";
  if (input.deemedTransferReason && input.deemedTransferReason !== "none") return "deemed";
  return "on";
}

// ── 수입금액비율 단계 ────────────────────────────────────────

export interface RevenueStepCtx {
  input: NonBusinessLandInput;
  rules: NonBusinessLandJudgmentRules;
  steps: JudgmentStep[];
  appliedLaws: string[];
  warnings: string[];
  trace: OtherLandOwnTrace;
  fullPeriod: DateInterval[];
  pjDate: Date;
  totalOwnershipDays: number;
}

export interface RevenueStepResult {
  revenueTestDetail?: RevenueTestResult;
  /** NBL2611-D1 — 수입금액비율은 충족했으나 당해 사업개시일 이후(또는 영위 구간) 기간기준 미충족. 끝 단계의 비사업용 사유에 쓴다. */
  revenueStartFailedReason?: string;
  /** 수입금액비율 경로가 판정을 끝냈다(사업용). */
  result?: CategoryJudgeResult;
  /** 영위 기간 ON 경로가 사업용 구간으로 기간기준을 판정했으나 미충족 — 다른 목도 끝내지 못했을 때 끝 단계의 기간 수치가 이 값이다. */
  failedR?: PeriodCriteriaResult;
}

/** 끝 단계가 `failedR`을 기간 수치로 쓰기로 했다 — 이 경로의 판정이 결과의 근거다(basis `usage_periods` · 유예 잔여분 재판정 생략). */
export function markRevenueDecided(trace: OtherLandOwnTrace): void {
  if (trace.revenueHistory) trace.revenueHistory.decided = true;
}

export function judgeRevenueStep(c: RevenueStepCtx): RevenueStepResult {
  const { input, rules, steps, appliedLaws, warnings, trace, fullPeriod, pjDate, totalOwnershipDays } = c;
  const rt = input.revenueTest;
  if (!rt || rt.businessType === "none") return {};
  if (revenueHistoryScope(input) === "on") return judgeByHistory(c, rt);

  let revenueTestDetail: RevenueTestResult = computeRevenueTest(rt);
  let revenueStartFailedReason: string | undefined;
  // NBL2611-V7-S · Q-6 (다) — 12호 도소매업은 규칙 §83조의4⑭ 열거 품목만(농·수·축산물은 시장·유사 장소 한정). 품목 미선택은 차단, 시장 요건 불충족은 불인정.
  const wholesale = wholesaleItemIssue(rt);
  if (wholesale?.kind === "missing") throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, wholesale.message);
  steps.push({
    id: "other_revenue_test",
    label: "§168의11② 수입금액비율",
    status: revenueTestDetail.pass ? "PASS" : "FAIL",
    detail: revenueTestDetail.detail,
    legalBasis: NBL.REVENUE_TEST,
  });
  if (wholesale?.kind === "not_in_market") {
    steps.push({
      id: "other_revenue_wholesale_item",
      label: "§168의11①12호 도소매업 품목 (규칙 §83조의4⑭)",
      status: "FAIL",
      detail: wholesale.message,
      legalBasis: NBL.OTHER_LAND_WHOLESALE_ITEMS,
    });
  }
  if (revenueTestDetail.pass && wholesale === undefined) {
    appliedLaws.push(NBL.REVENUE_TEST);
    // NBL2611-D1 (DM-01 · Q-4 (나)) — 당해 사업개시일이 있고 직전 비율②가 미통과면 사업 구간을 [개시일, 양도일]로 본다. 기간기준을 못 채우면 다른 목(나목 등)을 이어서 본다.
    const startJudged = judgeRevenueBusinessStart(input, revenueTestDetail, rules);
    if (startJudged) steps.push(startJudged.step);
    if (!startJudged?.applied) {
      markOwn(trace, fullPeriod); // 수입금액비율 = 다목(영 §168의11②) — 이력과 독립한 축이라 전 기간을 사업용으로 센다(Q-15 (가′))
      const r = meetsPeriodCriteria(fullPeriod, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
      return {
        revenueTestDetail,
        result: buildPass(`수입금액비율 충족 (${REVENUE_BUSINESS_TYPE_LABEL[revenueTestDetail.businessType]})`, steps, appliedLaws, warnings, { r, totalOwnershipDays, revenueTestDetail }),
      };
    }
    revenueTestDetail = startJudged.applied.revenue;
    warnings.push(startJudged.applied.notice);
    // NBL-STATE-HISTORY-E2 · Q-15 (가′) — 자체 사업기간 [개시일, 양도일)을 이력 판정에 넘긴다(충족해 여기서 끝나면 이 구간이 결론의 근거다).
    markOwn(trace, startJudged.applied.periods);
    if (startJudged.applied.r.meets) {
      return {
        revenueTestDetail,
        result: buildPass(`수입금액비율 충족 (${REVENUE_BUSINESS_TYPE_LABEL[revenueTestDetail.businessType]}) + 당해 사업개시일 이후 기간기준 충족`, steps, appliedLaws, warnings, {
          r: startJudged.applied.r, totalOwnershipDays, revenueTestDetail,
        }),
      };
    }
    revenueStartFailedReason = `수입금액비율은 충족하나 당해 사업개시일 이후 기간으로는 기간기준 미충족 — ${startJudged.applied.r.detail}`;
  }
  return { revenueTestDetail, revenueStartFailedReason };
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

function yearEcho(j: ReturnType<typeof evaluateRevenueHistory>["years"][number], threshold: number, blocked: boolean): RevenueHistoryYearEcho {
  const known = j.result
    ? { ratioCurrent: j.result.ratioCurrent, ...(j.result.ratioCombined !== undefined ? { ratioCombined: j.result.ratioCombined } : {}), annualizedRevenue: j.result.annualizedCurrentRevenue }
    : {};
  const businessDays = !blocked && j.businessInterval ? differenceInDays(j.businessInterval.end, j.businessInterval.start) : 0;
  return { taxYear: j.taxYear, operatingDays: j.operatingDays, yearDays: j.yearDays, source: j.source, known: j.known, ...known, threshold, pass: j.pass, businessDays };
}

/** 영위 기간 ON — 과세기간별 수입금액비율 → 통과 과세기간 ∩ 영위일 = 사업용 구간 → 영 §168의6. 유예는 합집합(`meetsPeriodCriteria`). */
function judgeByHistory(c: RevenueStepCtx, rt: RevenueTestInput): RevenueStepResult {
  const { input, rules, steps, appliedLaws, warnings, trace, pjDate, totalOwnershipDays } = c;
  const ev = evaluateRevenueHistory(input.revenueHistory!, rt, input.acquisitionDate, input.transferDate);
  // 도소매업 — 품목 미선택은 차단, 시장 요건 불충족이면 경로 전체가 막힌다(이력이 우회하지 않는다 — 현행과 같음).
  const wholesale = wholesaleItemIssue(rt);
  if (wholesale?.kind === "missing") throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, wholesale.message);
  const blocked = wholesale !== undefined;
  const business = blocked ? [] : ev.businessIntervals;
  const threshold = getNblRevenueThreshold(rt.businessType);
  const label = REVENUE_BUSINESS_TYPE_LABEL[rt.businessType];
  // 표시용 — 마지막으로 비율을 계산한 해(결과 카드 수입금액비율 블록).
  const revenueTestDetail = [...ev.years].reverse().find((j) => j.result)?.result;

  const yearsText = ev.years
    .map((j) => `${j.taxYear}년 ${j.known ? `${pct(j.result!.actualRatio)} ${j.pass ? "통과" : "미달"}` : "입력 없음(모름)"}`)
    .join(" · ");
  steps.push({
    id: "other_revenue_test",
    label: "§168의11② 수입금액비율 (과세기간별)",
    status: business.length > 0 ? "PASS" : "FAIL",
    detail: ev.years.length === 0
      ? "소유기간 중 영위한 날이 없어 수입금액비율을 판정할 과세기간이 없다"
      : `소유기간 중 영위 ${ev.operatingDays}일 · 과세기간 ${ev.years.length}개 중 통과 ${ev.years.filter((j) => j.pass).length}개(기준 ${pct(threshold)}) — ${yearsText}`,
    legalBasis: NBL.REVENUE_TEST,
  });
  if (wholesale?.kind === "not_in_market") {
    steps.push({
      id: "other_revenue_wholesale_item",
      label: "§168의11①12호 도소매업 품목 (규칙 §83조의4⑭)",
      status: "FAIL",
      detail: wholesale.message,
      legalBasis: NBL.OTHER_LAND_WHOLESALE_ITEMS,
    });
  }

  const r = meetsPeriodCriteria(business, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);
  const businessDays = business.reduce((n, iv) => n + differenceInDays(iv.end, iv.start), 0);
  const meets = business.length > 0 && r.meets;
  const echo: RevenueHistoryEcho = {
    operatingInterval: ev.operatingInterval,
    operatingDays: ev.operatingDays,
    years: ev.years.map((j) => yearEcho(j, threshold, blocked)),
    businessIntervals: business,
    businessDays,
    unknownYears: ev.unknownYears,
    meets,
  };
  trace.revenueHistory = { echo, decided: false };
  if (business.length === 0) {
    // 사업용 구간이 없다 — 유예 단독으로 기간기준을 채우면(`r.meets`) 종전처럼 잔여분 재판정이 비사업용을 뒤집는다(`failedR` 없음). 못 채우면 끝 단계의 기간 수치는 이 경로의 실제 값이다.
    return { revenueTestDetail, ...(r.meets ? {} : { failedR: r }), revenueStartFailedReason: "수입금액비율을 충족한 영위 과세기간이 없어 이 업종으로는 사업용 불인정" };
  }

  appliedLaws.push(NBL.REVENUE_TEST);
  if (input.gracePeriods.length > 0 && !appliedLaws.includes(NBL.UNAVOIDABLE_PERIOD)) appliedLaws.push(NBL.UNAVOIDABLE_PERIOD);
  markOwn(trace, business); // 수입금액비율 = 다목 — 통과 과세기간 ∩ 영위일이 자체 사업기간이다(Q-15 (가′): 건축물 이력과 합집합)
  steps.push({
    id: "other_revenue_history",
    label: "§168의11② 영위 기간 사업용 구간 기간기준",
    status: r.meets ? "PASS" : "FAIL",
    detail: `통과 과세기간 ∩ 영위일 = 사업용 ${businessDays}일(유예 가산 ${r.gracePeriodDays}일 포함 ${r.effectiveBusinessDays}일, 소유 ${r.totalOwnershipDays}일) — ${r.detail}`,
    legalBasis: NBL.CRITERIA,
  });
  if (!r.meets) {
    return {
      revenueTestDetail,
      failedR: r,
      revenueStartFailedReason: `수입금액비율은 과세기간별로 충족하나 통과한 영위 구간 ${businessDays}일로는 기간기준 미충족 — ${r.detail}`,
    };
  }
  trace.revenueHistory.decided = true;
  return {
    revenueTestDetail,
    result: buildPass(`수입금액비율 충족 (${label}) — 과세기간별 영위 기간 반영`, steps, appliedLaws, warnings, { r, totalOwnershipDays, revenueTestDetail }),
  };
}

// ── 판정 전·후 ───────────────────────────────────────────────

export interface RevenueHistoryPre {
  input: NonBusinessLandInput;
  /** 판정 끝에서 `warnings`에 더할 고지(ON 경로 고지는 `finishRevenueHistory`가 앞에 붙인다). */
  notices: string[];
  /** V-7 — 영위 통산 2년 미만이라 판정에서 뺀 10호 유예 행(echo `excludedGrace10`). */
  excluded: RevenueHistoryExcludedGrace[];
}

/**
 * 판정 진입 전 정리. OFF는 입력을 그대로 돌려준다(같은 객체 — 바이트 동일).
 * ON이면 V-7 — 규칙 §83의5①10호 «거주자가 **2년 이상 사업에 사용한 토지**»의 전제를 영위 통산 일수로 검사해(비율 통과와 무관), 미충족인 **10호 유예 행만** 뺀다.
 * 다른 사유의 유예는 건드리지 않는다. 뺀 입력을 core·이력·유예 잔여분 재판정이 모두 쓴다(어느 경로에서도 같은 유예 집합).
 */
export function prepareRevenueHistory(input: NonBusinessLandInput): RevenueHistoryPre {
  const scope = revenueHistoryScope(input);
  if (scope === "off") return { input, notices: [], excluded: [] };
  if (scope === "deemed") return { input, notices: [NBL_REVENUE_HISTORY_DEEMED_TRANSFER_NOTICE], excluded: [] };
  const history = input.revenueHistory!;
  const is10 = (g: { reasonCode: string }) => g.reasonCode === "business_closure_relocation";
  const notices: string[] = [];
  // 폐업(휴업·이전)일이 있는데 10호 유예 행이 없다 — 자동으로 만들지 않는다(결정 ⑥ · UQ-9).
  if (history.businessEndDate && !input.gracePeriods.some(is10)) notices.push(NBL_REVENUE_HISTORY_CLOSURE_GRACE_NOTICE);
  const range = deriveOperatingRange(history, input.acquisitionDate, input.transferDate);
  const ownershipStart = getOwnershipStart(input.acquisitionDate);
  const excluded: RevenueHistoryExcludedGrace[] = [];
  const kept = input.gracePeriods.filter((g) => {
    if (!is10(g)) return true;
    const p = closurePremise(range, ownershipStart, g.startDate);
    if (p.met) return true;
    excluded.push({ anchorDate: g.startDate, operatingDaysBefore: p.operatingDaysBefore, requiredDays: p.requiredDays });
    return false;
  });
  if (excluded.length > 0) notices.push(NBL_REVENUE_HISTORY_GRACE10_PREMISE_NOTICE);
  return { input: excluded.length > 0 ? { ...input, gracePeriods: kept } : input, notices, excluded };
}

/** 판정 끝에서 echo·고지를 붙인다. ON 경로를 타지 않았고 고지도 없으면 `result`를 **그대로** 돌려준다(R-3 — OFF 바이트 동일). */
export function finishRevenueHistory(result: CategoryJudgeResult, trace: OtherLandOwnTrace, pre: RevenueHistoryPre): CategoryJudgeResult {
  const rh = trace.revenueHistory;
  if (!rh && pre.notices.length === 0) return result;
  const notices: string[] = [];
  if (rh) {
    notices.push(NBL_REVENUE_HISTORY_APPLIED_NOTICE);
    if (rh.echo.unknownYears.length > 0) notices.push(NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE);
    if (rh.echo.years.some((y) => y.source === "row" && y.known)) notices.push(NBL_REVENUE_HISTORY_PAST_YEARS_NOTICE);
  }
  notices.push(...pre.notices);
  const base: PeriodEvaluation = result.periodEvaluation ?? { basis: "state_at_transfer" };
  const periodEvaluation: PeriodEvaluation = rh
    ? { ...base, basis: rh.decided && base.basis === "state_at_transfer" ? "usage_periods" : base.basis, revenueHistory: { ...rh.echo, ...(pre.excluded.length > 0 ? { excludedGrace10: pre.excluded } : {}) } }
    : base;
  return { ...result, periodEvaluation, warnings: [...(result.warnings ?? []), ...notices] };
}
