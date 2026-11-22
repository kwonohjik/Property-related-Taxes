/**
 * NBL-STATE-HISTORY-E2 — 기타토지 소유기간 중 상태 이력 **판정 후처리** `applyStateHistory` (순수 · DB·`new Date(x)` 없음).
 *
 * 계획서(정본): docs/01-plan/features/nbl-other-land-state-history.plan.md §2 · engine.plan.md §3.6 · §4.1~4.4
 * 결정(2026-11-22 사용자): V-1 **일 단위**(영 §168의6 «기간의 계산은 일수로 한다» — 과세기준일(6.1.) 접기는 재제안·재구현 금지) ·
 *   Q-15 **(가′)** — 사업용 구간 = 이력상 사업 구간 ∪ ((이전 구간 ∪ 꼬리) ∩ core 자체 사업기간) · 이력 우선 · 양도일 의제 동시 시 이력 미적용 · 「모름」 = 현행 + 확인 필요.
 *
 * 흐름(`judgeOtherLand`): core가 양도일 현재 상태(= 꼬리 구간)를 판정한 뒤 이 후처리가 한 번 돈다.
 *   · `mode`가 없거나 `""`·`unchanged` → 아무것도 바꾸지 않는다(판정·세액·고지 바이트 동일 — E0 골든 스냅샷).
 *   · `unknown` → 구간을 만들지 않고 현행 판정 + `NBL_STATE_HISTORY_UNKNOWN_NOTICE`만 더한다.
 *   · `changed`이지만 양도일 의제가 선택돼 있거나 면적 일부만 비사업용(배율 초과·공장 초과·2% 바닥면적·호별·연접·복합용도)이면 이력을 쓰지 않고 이유를 고지한다.
 *   · `changed` + 전량 사업용/전량 비사업용 → ① 사건 → 일 단위 구간(`deriveOtherLandStateIntervals` — ⑤·⑦·⑧·⑫와 같은 leaf)
 *       ② 사업용 구간(`stateHistoryBusinessIntervals`) ③ 유예와 합집합으로 `meetsPeriodCriteria`(영 §168의6) 한 번.
 *
 * core가 자체 사업기간으로 판정한 경로(DM-01 · 3호)는 `trace`로 받는다. 그 경로가 적용됐지만 core의 사업용 결론이 `fullPeriod`(양도일 현재 상태)에서 나온 경우
 * (예: DM-01 구간은 기간기준을 못 채웠으나 재산세 별도합산 건축물로 사업용) 꼬리 구간도 사업용으로 센다 — 법 §104의3①4호 가·나·다목은 병렬 제외 사유이고
 * 법에 없는 «자체 사업기간이 있으면 양도일 현재 상태를 버린다»는 제한을 더하면 법 근거 없는 불리 적용이 되기 때문이다.
 */
import { differenceInDays } from "../utc-date";
import { NBL } from "../legal-codes";
import { NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_REVENUE_START_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_UNKNOWN_NOTICE } from "../nbl-confirm-notices";
import { TaxCalculationError } from "../tax-errors";
import { TaxErrorCode } from "../tax-errors";
import { STATE_EVENTS_REQUIRED_MESSAGE } from "./nbl-validation-messages";
import { deriveOtherLandStateIntervals } from "./other-land-state-history";
import { stateHistoryBusinessIntervals } from "./other-land-state-history";
import { getPeriodJudgmentDate } from "./period-criteria";
import { meetsPeriodCriteria } from "./period-criteria";
import { getOwnershipStart } from "./utils/period-math";
import { mergeOverlappingPeriods } from "./utils/period-math";
import { sumDaysInWindow } from "./utils/period-math";
import type { PeriodCriteriaResult } from "./period-criteria";
import type { OtherLandOwnTrace } from "./other-land-helpers";
import type { StateHistoryCriteriaEcho } from "./land-usage.types";
import type { StateHistoryIntervalEcho } from "./land-usage.types";
import type { CategoryJudgeResult } from "./types";
import type { JudgmentStep } from "./types";
import type { NonBusinessLandInput } from "./types";
import type { NonBusinessLandJudgmentRules } from "./types";

export type StateHistoryOutcome =
  /** 이력으로 판정했다 — `result`가 `periodEvaluation`·`warnings`(양도일 현재 상태 고지 → 한정 고지로 교체)까지 담은 최종 결과다. */
  | { applied: true; result: CategoryJudgeResult }
  /** 이력을 쓰지 않았다 — core 결과를 그대로 쓰고 `notices`(없을 수 있다)만 기존 고지 뒤에 더한다. */
  | { applied: false; notices: string[] };

/** core가 면적 일부만 비사업용으로 판정했는가(0 < 비사업용 비율 < 1). 0 또는 1이면 «전량»이다. */
function isPartialArea(core: CategoryJudgeResult): boolean {
  const ratio = core.areaProportioning?.nonBusinessRatio;
  return ratio !== undefined && ratio > 0 && ratio < 1;
}

function criteriaEcho(r: PeriodCriteriaResult): StateHistoryCriteriaEcho {
  return {
    ownershipBucket: r.ownershipBucket ?? 3,
    window5Days: r.window5Days ?? 0,
    nonBizInWindow5: r.nonBizInWindow5 ?? 0,
    window3Days: r.window3Days ?? 0,
    nonBizInWindow3: r.nonBizInWindow3 ?? 0,
    nonBizTotal: r.nonBizTotal ?? 0,
    limitGa: r.limitGa ?? null,
    limitNa: r.limitNa ?? null,
    limitDa: r.limitDa ?? 0,
  };
}

export function applyStateHistory(
  core: CategoryJudgeResult,
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
  trace: OtherLandOwnTrace,
): StateHistoryOutcome {
  const history = input.landStateHistory;
  if (!history || history.mode === "" || history.mode === "unchanged") return { applied: false, notices: [] };
  if (history.mode === "unknown") return { applied: false, notices: [NBL_STATE_HISTORY_UNKNOWN_NOTICE] };

  // changed — 이력을 쓸 수 없는 경우는 이유를 알린다(통합 Q-8·Q-9). 둘 다 해당하면 둘 다 알린다.
  const notices: string[] = [];
  if (input.deemedTransferReason && input.deemedTransferReason !== "none") notices.push(NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE);
  if (isPartialArea(core)) notices.push(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
  if (notices.length > 0) return { applied: false, notices };

  // ⑧·⑫가 먼저 막는다 — 직접 호출의 마지막 안전망. 사건 없는 `changed`를 «이력 없음»으로 조용히 읽지 않는다.
  if (history.events.length === 0) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, STATE_EVENTS_REQUIRED_MESSAGE);

  const o = input.otherLand!; // 호출자(`judgeOtherLand`)가 otherLand 없음을 먼저 걸렀다
  const pjDate = getPeriodJudgmentDate(input); // 의제 없음이 확정이라 양도일과 같다
  const intervals = deriveOtherLandStateIntervals(history.events, getOwnershipStart(input.acquisitionDate), pjDate, {
    hasBuilding: o.hasBuilding,
    propertyTaxType: o.propertyTaxType,
  });

  // 자체 사업기간 경로가 적용됐지만 core의 사업용 결론이 양도일 현재 상태(fullPeriod)에서 나왔다면 꼬리 구간도 사업용이다(위 헤더).
  const tail = intervals[intervals.length - 1];
  const ownBusinessPeriods =
    trace.own && core.isBusiness && !trace.decisiveOwn && tail ? [...trace.own, { start: tail.start, end: tail.end }] : trace.own;
  const businessIntervals = stateHistoryBusinessIntervals(intervals, { isBusiness: core.isBusiness, ownBusinessPeriods });
  const r = meetsPeriodCriteria(businessIntervals, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);

  const merged = mergeOverlappingPeriods(businessIntervals);
  const intervalEcho: StateHistoryIntervalEcho[] = intervals.map((iv) => {
    const days = differenceInDays(iv.end, iv.start);
    const businessDays = sumDaysInWindow(merged, iv.start, iv.end);
    return { start: iv.start, end: iv.end, days, hasBuilding: iv.hasBuilding, propertyTaxType: iv.propertyTaxType, business: days > 0 && businessDays === days, businessDays };
  });

  const step: JudgmentStep = {
    id: "other_state_history",
    label: "Step 4-1 소유기간 중 건축물 이력(일 단위 구간) 기간기준 (영 §168의6)",
    status: r.meets ? "PASS" : "FAIL",
    detail:
      `건축물 사건 ${history.events.length}건으로 소유기간 ${r.totalOwnershipDays}일을 ${intervals.length}개 구간으로 나눠 판정 — ` +
      `사업용 ${r.effectiveBusinessDays}일(유예 가산 ${r.gracePeriodDays}일 포함) — ${r.detail}`,
    legalBasis: NBL.CRITERIA,
  };
  const flipped = r.meets !== core.isBusiness;
  const warnings = (core.warnings ?? []).map((w) => (w === NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE ? NBL_STATE_HISTORY_REVENUE_START_NOTICE : w));
  warnings.push(NBL_STATE_HISTORY_APPLIED_NOTICE);
  if (intervals.some((iv) => iv.propertyTaxType === "unknown")) warnings.push(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);

  return {
    applied: true,
    result: {
      ...core,
      isBusiness: r.meets,
      reason: !flipped
        ? core.reason
        : r.meets
          ? "소유기간 중 건축물 이력(일 단위 구간)을 반영하면 기간기준 충족 — 비사업용 아님"
          : "소유기간 중 건축물 이력(일 단위 구간)을 반영하면 기간기준 미충족 — 비사업용",
      steps: [...core.steps, step],
      appliedLaws: input.gracePeriods.length > 0 && !core.appliedLaws.includes(NBL.UNAVOIDABLE_PERIOD) ? [...core.appliedLaws, NBL.UNAVOIDABLE_PERIOD] : core.appliedLaws,
      // 전량 사업용으로 뒤집히면 비사업용 면적(비율 1 — 전량 비사업용의 안분 echo)을 버린다. 전량 비사업용 유지·사업용 → 비사업용은 core 값 그대로다(후자는 안분 echo 없음 = 전량).
      areaProportioning: r.meets ? undefined : core.areaProportioning,
      effectiveBusinessDays: r.effectiveBusinessDays,
      gracePeriodDays: r.gracePeriodDays,
      businessUseRatio: r.ratio,
      criteria: r.criteria,
      businessPeriodsUsed: businessIntervals,
      periodEvaluation: { basis: "state_history", stateHistory: { intervals: intervalEcho, criteria: criteriaEcho(r) } },
      warnings,
    },
  };
}
