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
 * core가 자체 사업기간으로 판정한 경로(DM-01 · 3호 · 다목 호 인정 · 수입금액비율)는 `trace`로 받고, core가 **첫 PASS에서 끝나 평가하지 못한 다목·나목**은 `daMokAndNaMok`가 core를
 * 입력만 바꿔 다시 돌려 보충한다 — 법 §104의3①4호 가·나·다목은 병렬 제외 사유라 어느 경로에서 먼저 끝났는지로 날짜 집합이 달라지면 안 된다(법에 없는 불리 적용).
 */
import { differenceInDays } from "../utc-date";
import { NBL } from "../legal-codes";
import { NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_REVENUE_START_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE } from "../nbl-confirm-notices";
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
import type { DateInterval } from "./types";
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

/** core(`judgeOtherLandCore`)를 입력만 바꿔 한 번 더 돌리는 함수 — 자체 구간 기록(`trace`)과 전량 사업용 여부를 돌려준다. `other-land.ts`가 넘긴다(순환 import 방지). */
export type CoreProbe = (input: NonBusinessLandInput) => { trace: OtherLandOwnTrace; isBusiness: boolean };

/**
 * 경로 순서와 무관한 **다목 자체 구간 · 나목 꼬리 인정**(Q-15 (가′) 보강). core는 수입금액비율 → 나목(Step 3-1) → 호 인정 순으로 첫 PASS에서 끝나 뒤 경로를 평가하지 않는다.
 * 법 §104의3①4호 가·나·다목은 병렬 제외 사유라 어느 경로에서 먼저 끝났는지로 다목 날짜를 셀지가 달라지면 안 된다 → 이력이 적용될 때만 core를 다시 돌려 보충한다(이력 없는 경로는 손대지 않는다).
 *   · 다목 호 인정 구간: 나목·수입금액비율을 끈 입력(재산세 종합합산 선언 · 근거·공장·수입금액 제거)으로 돌려 호 인정·복합용도·연접·레거시 PASS의 구간(3호는 `[완료일, +2년)`)을 얻는다.
 *     13호(나지)는 제외한다 — «나지»는 건축물이 있던 구간과 충돌하고 날짜별 적용 범위를 확인하지 못했다(확인 필요). 호 요건 실패(5호 용도지역 등)·부분 면적은 기록되지 않는다.
 *   · 나목 꼬리 인정: 다목을 끈 입력(호 none · 복합용도·연접 제거 · 수입금액 제거)이 전량 사업용이면 양도일 현재 상태(꼬리)는 나목으로도 사업용이다.
 */
function daMokAndNaMok(input: NonBusinessLandInput, core: CategoryJudgeResult, trace: OtherLandOwnTrace, probe: CoreProbe): { own?: DateInterval[]; naMokTail: boolean } {
  const o = input.otherLand!;
  const ho = o.relatedBusinessType;
  const hasDaMokHo = ho ? ho !== "none" && ho !== "vacant_lot_1household" : o.isRelatedToResidenceOrBusiness || !!o.mixedUseBuildingMode;
  const noNaMok = { ...o, propertyTaxType: "comprehensive" as const, propertyTaxBasis: undefined, demolishedFloorArea: undefined, factory: undefined };
  const haOwn = hasDaMokHo ? probe({ ...input, revenueTest: undefined, otherLand: noNaMok }).trace.own : undefined;
  const own = trace.own || haOwn ? [...(trace.own ?? []), ...(haOwn ?? [])] : undefined;
  if (!own) return { naMokTail: core.isBusiness };
  const noDaMok = { ...o, relatedBusinessType: "none" as const, isRelatedToResidenceOrBusiness: false, mixedUseBuildingMode: undefined, parcels: undefined };
  return { own, naMokTail: probe({ ...input, revenueTest: undefined, otherLand: noDaMok }).isBusiness };
}

export function applyStateHistory(
  core: CategoryJudgeResult,
  input: NonBusinessLandInput,
  rules: NonBusinessLandJudgmentRules,
  trace: OtherLandOwnTrace,
  probe: CoreProbe,
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

  // 다목 자체 구간(경로 순서 무관) + 나목 꼬리 인정 — `daMokAndNaMok`. 자체 구간이 있으면 나목이 인정하는 꼬리도 사업용 구간에 더한다(법에 없는 «자체 사업기간이 있으면 양도일 현재 상태를 버린다» 제한 금지).
  const tail = intervals[intervals.length - 1];
  const da = daMokAndNaMok(input, core, trace, probe);
  const ownBusinessPeriods = da.own && da.naMokTail && tail ? [...da.own, { start: tail.start, end: tail.end }] : da.own;
  const businessIntervals = stateHistoryBusinessIntervals(intervals, { isBusiness: core.isBusiness, ownBusinessPeriods });
  const r = meetsPeriodCriteria(businessIntervals, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);

  const merged = mergeOverlappingPeriods(businessIntervals);
  const intervalEcho: StateHistoryIntervalEcho[] = intervals.map((iv) => {
    const days = differenceInDays(iv.end, iv.start);
    const businessDays = sumDaysInWindow(merged, iv.start, iv.end);
    // E3-1b — 나대지 구간 선언의 근거 해석(echo). 선언이 없는 구간은 키가 없어 종전 echo와 바이트 동일하다.
    const bare = iv.basisOutcome
      ? { basisOutcome: iv.basisOutcome, ...(iv.basis ? { basis: iv.basis } : {}), declaredPropertyTaxType: iv.declaredPropertyTaxType, ...(iv.foldReason ? { foldReason: iv.foldReason } : {}) }
      : {};
    return { start: iv.start, end: iv.end, days, hasBuilding: iv.hasBuilding, propertyTaxType: iv.propertyTaxType, business: days > 0 && businessDays === days, businessDays, ...bare };
  });

  const hasTaxChange = history.events.some((e) => e.kind === "tax_type_changed");
  const step: JudgmentStep = {
    id: "other_state_history",
    label: "Step 4-1 소유기간 중 건축물 이력(일 단위 구간) 기간기준 (영 §168의6)",
    status: r.meets ? "PASS" : "FAIL",
    detail:
      `${hasTaxChange ? "건축물·재산세 구분 사건" : "건축물 사건"} ${history.events.length}건으로 소유기간 ${r.totalOwnershipDays}일을 ${intervals.length}개 구간으로 나눠 판정 — ` +
      `사업용 ${r.effectiveBusinessDays}일(유예 가산 ${r.gracePeriodDays}일 포함) — ${r.detail}`,
    legalBasis: NBL.CRITERIA,
  };
  const flipped = r.meets !== core.isBusiness;
  const warnings = (core.warnings ?? []).map((w) => (w === NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE ? NBL_STATE_HISTORY_REVENUE_START_NOTICE : w));
  // 재산세 과세 구분 변경 사건이 있을 때만 한정 고지를 변형 고지로 **대체**한다(E3-① — 기존 고지 문구는 바이트 동일, 건축물 사건만 있는 이력은 종전과 같다).
  warnings.push(hasTaxChange ? NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE : NBL_STATE_HISTORY_APPLIED_NOTICE);
  // 「모름」 구간(종합합산으로 접힘)은 그 구간을 닫은 사건 종류별로 고지한다 — 구간의 끝 날짜 = 닫은 사건일(날짜는 엄격 증가라 유일).
  const unknownClosers = intervals.filter((iv) => iv.propertyTaxType === "unknown").map((iv) => history.events.find((e) => e.date.getTime() === iv.end.getTime())?.kind);
  if (unknownClosers.some((k) => k !== "tax_type_changed")) warnings.push(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);
  if (unknownClosers.some((k) => k === "tax_type_changed")) warnings.push(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
  // E3-1b — 나대지 구간 선언의 해석 결과 고지(소유기간에 남은 구간만 — 클립으로 사라진 구간은 고지하지 않는다). 새 상수만 추가하고 위 고지는 바이트 동일.
  const bareFolds = intervals.filter((iv) => iv.basisOutcome === "unconfirmed");
  if (bareFolds.some((iv) => iv.foldReason !== "area_exceeded" && iv.foldReason !== "area_unknown")) warnings.push(NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE);
  if (bareFolds.some((iv) => iv.foldReason === "area_exceeded" || iv.foldReason === "area_unknown")) warnings.push(NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE);
  if (intervals.some((iv) => iv.basisOutcome === "accepted")) warnings.push(NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE);

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
