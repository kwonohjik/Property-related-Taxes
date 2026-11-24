/**
 * NBL-STATE-HISTORY-E3-③ A — 주택부수토지 소유기간 중 신축·철거 이력 **판정 후처리** `applyHousingStateHistory` (순수 · DB·`new Date(x)` 없음).
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.engine.plan.md §3.2 · §4.1 · §4.2 · §4.5
 * 결정(2026-11-23·24 사용자): Q-2 (가) 일 단위 합산 + «직접 해석례 없음» 고지 · Q-3 (가) 신축 앞 나대지 구간 E3-1b 선언 재사용 · Q-5 (나) 배율 초과·모름 = 그 구간 비사업용 접기 ·
 *   Q-8 (가) 초과 구간 뒤 9호 유예 유지 + 고지 · Q-11 (나) 철거 행 정착면적(`houseFootprintBefore`) · D-11 배율은 양도일 시행 법령 · V-1 일 단위(과세기준일 접기는 재제안 금지).
 *
 * 흐름(`judgeHousingLand`): **배율 이내 분기**(core = 전량 사업용)가 끝난 직후 이 후처리가 한 번 돈다. **배율 초과(부분 면적) 분기는 한 줄도 바꾸지 않는다**(Q-3a (나) — 이력 미반영, `changed`일 때 고지만 더한다).
 *   · `mode`가 없거나 `""`·`unchanged` → core 그대로(판정·세액·고지 바이트 동일).
 *   · `unknown` → core + `NBL_STATE_HISTORY_UNKNOWN_NOTICE` 한 줄(세액·판정·steps·echo 불변).
 *   · `changed` → ① 사건 → 일 단위 구간(`deriveOtherLandStateIntervals` — 기타토지와 **같은 leaf**, `tail.buildingKind = "house"`) ② 사업용 구간(`stateHistoryBusinessIntervals` — 꼬리 = core 사업용)
 *     ③ 유예와 합집합으로 `meetsPeriodCriteria`(영 §168의6) 한 번 → 충족하면 사업용 유지(echo만 `state_history`), 아니면 **전량 비사업용**(T-1: `areaProportioning = undefined`).
 */
import { NBL } from "../legal-codes";
import { NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_UNKNOWN_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_AT_TRANSFER_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { TaxCalculationError } from "../tax-errors";
import { TaxErrorCode } from "../tax-errors";
import { stateEventsRequiredMessage } from "./nbl-validation-messages";
import { deriveOtherLandStateIntervals } from "./other-land-state-history";
import { stateHistoryBusinessIntervals } from "./other-land-state-history";
import { meetsPeriodCriteria } from "./period-criteria";
import { bareDeclarationNotices } from "./state-history-echo";
import { criteriaEcho } from "./state-history-echo";
import { intervalEcho } from "./state-history-echo";
import { getOwnershipStart } from "./utils/period-math";
import { housingStateHistoryIsRead } from "./housing-limit";
import { judgeHousingLimit } from "./housing-limit";
import type { CategoryJudgeResult } from "./types";
import type { JudgmentStep } from "./types";
import type { NonBusinessLandInput } from "./types";
import type { NonBusinessLandJudgmentRules } from "./types";

/**
 * E3-⑤ E3f-2 (계획서 §6.2 D-2 · V-26) — **엔진이 주택부수토지 카드의 소유기간 중 주택 이력을 읽는가**: 모드 `changed` ∧ 사건 ≥ 1 ∧ 정착면적이 양수이고 양도일 현재 배율 **이내**
 * (`housingStateHistoryIsRead` — 배율 초과 분기는 이력을 한 줄도 읽지 않는다 · Q-3a (나)). `judgeHousingLand`의 진입 조건 그대로 — 주택 카드의 ⑧·⑫′가 사실 칸 4개의 «읽을 때만 필수» 게이트를 같은 판정으로 건다.
 * 주택부수토지는 양도일 의제 비적용 지목이라 의제 사유 조건이 없다.
 */
export function housingLandStateHistoryIsRead(input: NonBusinessLandInput): boolean {
  const history = input.landStateHistory;
  if (!history || history.mode !== "changed" || history.events.length === 0) return false;
  const footprint = input.housingFootprint ?? 0;
  if (!(footprint > 0)) return false;
  return housingStateHistoryIsRead(
    judgeHousingLimit({ zoneType: input.zoneType, isMetropolitanArea: input.isMetropolitanArea, transferDate: input.transferDate, footprint, landArea: input.landArea }).limit,
  );
}

/**
 * `judgeHousingLand`의 **배율 이내 분기 반환 직전**에 부른다. `core`는 전량 사업용(`isBusiness: true`)이고 `input.landStateHistory`가 없으면 그대로 돌려준다.
 */
export function applyHousingStateHistory(core: CategoryJudgeResult, input: NonBusinessLandInput, rules: NonBusinessLandJudgmentRules): CategoryJudgeResult {
  const history = input.landStateHistory;
  if (!history || history.mode === "" || history.mode === "unchanged") return core;
  if (history.mode === "unknown") return { ...core, warnings: [...(core.warnings ?? []), NBL_STATE_HISTORY_UNKNOWN_NOTICE] };

  // ⑧·⑫가 먼저 막는다 — 직접 호출의 마지막 안전망. 사건 없는 `changed`를 «이력 없음»으로 조용히 읽지 않는다.
  if (history.events.length === 0) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, stateEventsRequiredMessage("house"));

  const intervals = deriveOtherLandStateIntervals(history.events, getOwnershipStart(input.acquisitionDate), input.transferDate, {
    hasBuilding: true, // 양도일 현재 «주택 있음» — 주택부수토지 카드의 전제(T-4: 토글이 없어 항상 true)
    propertyTaxType: "unknown", // 주택 구간은 재산세 구분을 읽지 않는다(조심 2018서0295)
    buildingKind: "house",
    houseCtx: { zoneType: input.zoneType, isMetropolitanArea: input.isMetropolitanArea, landArea: input.landArea, transferDate: input.transferDate },
  });
  // core(양도일 현재 상태 = 배율 이내 주택)는 전량 사업용이라 꼬리 전체가 사업용 구간이다.
  const businessIntervals = stateHistoryBusinessIntervals(intervals, { isBusiness: core.isBusiness });
  const r = meetsPeriodCriteria(businessIntervals, input.acquisitionDate, input.transferDate, "housing", rules, input.gracePeriods);

  const past = intervals.slice(0, -1);
  const houseOutcomes = past.filter((iv) => iv.buildingKind === "house");
  const step: JudgmentStep = {
    id: "housing_state_history",
    label: `Step 4-1 소유기간 중 주택 이력(일 단위 구간) 기간기준 (${NBL.CRITERIA})`,
    status: r.meets ? "PASS" : "FAIL",
    detail:
      `주택 사건 ${history.events.length}건으로 소유기간 ${r.totalOwnershipDays}일을 ${intervals.length}개 구간으로 나눠 판정 — ` +
      `사업용 ${r.effectiveBusinessDays}일(유예 가산 ${r.gracePeriodDays}일 포함) — ${r.detail}`,
    legalBasis: NBL.CRITERIA,
  };

  // 고지 — 이력 없음 고지(양도일 현재 상태 일괄 적용)를 한정 고지로 **대체**하고, 일 단위 합산(Q-2)·주택 구간 근거·접힘 사유를 더한다.
  const warnings = (core.warnings ?? []).map((w) => (w === NBL_STATE_AT_TRANSFER_APPLIED_NOTICE ? NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE : w));
  warnings.push(NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE, NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE);
  if (houseOutcomes.length > 0) warnings.push(NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE);
  const exceeded = houseOutcomes.some((iv) => iv.houseOutcome === "exceeded");
  if (exceeded) warnings.push(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE);
  if (houseOutcomes.some((iv) => iv.houseOutcome === "unconfirmed")) warnings.push(NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE);
  // Q-8 (가) — 초과 구간 뒤 철거 후 9호 유예 행은 그대로 합집합하되(면적별로 나누지 않는다) 고지한다.
  if (exceeded && input.gracePeriods.some((g) => g.reasonCode === "demolition")) warnings.push(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE);
  warnings.push(...bareDeclarationNotices(intervals));

  return {
    ...core,
    isBusiness: r.meets,
    reason: r.meets ? core.reason : "소유기간 중 주택 신축·철거 이력(일 단위 구간)을 반영하면 기간기준 미충족 — 비사업용",
    steps: [...core.steps, step],
    appliedLaws: [...core.appliedLaws, ...[NBL.CRITERIA, ...(input.gracePeriods.length > 0 ? [NBL.UNAVOIDABLE_PERIOD] : [])].filter((l) => !core.appliedLaws.includes(l))],
    // T-1 — 이내 core의 안분 echo(`nonBusinessRatio: 0`)를 두면 엔진이 `nonBusinessAreaRatio = 0`으로 읽어 «판정은 비사업용인데 세액은 사업용»이 된다. 뒤집히면 전량 비사업용(= 안분 echo 없음 → 비율 1).
    areaProportioning: r.meets ? core.areaProportioning : undefined,
    effectiveBusinessDays: r.effectiveBusinessDays,
    gracePeriodDays: r.gracePeriodDays,
    businessUseRatio: r.ratio,
    criteria: r.criteria,
    businessPeriodsUsed: businessIntervals,
    periodEvaluation: { basis: "state_history", stateHistory: { intervals: intervalEcho(intervals, businessIntervals), criteria: criteriaEcho(r) } },
    warnings,
  };
}
