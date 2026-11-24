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
import { NBL } from "../legal-codes";
import { NBL_REVENUE_BUSINESS_START_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_VACANT_LOT_AREA_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_VACANT_LOT_TAX_CHANGE_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { NBL_VACANT_LOT_HOUSE_PERIODS_NOTICE } from "../nbl-confirm-notices";
import { NBL_VACANT_LOT_SELF_DECLARED_NOTICE } from "../nbl-confirm-notices";
import { NBL_VACANT_LOT_SELF_DECLARED_WITH_HOUSE_PERIODS_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_REVENUE_START_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_UNKNOWN_NOTICE } from "../nbl-confirm-notices";
import { expropriationZoneBaseDateNotice } from "../appurtenant-land-rate";
import { TaxCalculationError } from "../tax-errors";
import { TaxErrorCode } from "../tax-errors";
import { HOUSING_METRO_DEFAULTED_WARNING } from "./housing-limit";
import { metropolitanChangesHousingMultiplier } from "./house-prior-scope";
import { stateHistoryDeemedBlocks } from "./house-prior-scope";
import { STATE_EVENTS_REQUIRED_MESSAGE } from "./nbl-validation-messages";
import { bareDeclarationNotices } from "./state-history-echo";
import { criteriaEcho } from "./state-history-echo";
import { intervalEcho } from "./state-history-echo";
import { buildVacantLotEcho } from "./other-land-vacant-lot-history";
import { VACANT_LOT_HO } from "./other-land-vacant-lot-history";
import { vacantLotBusinessIntervals } from "./other-land-vacant-lot-history";
import { vacantLotWithinAreaLimit } from "./other-land-vacant-lot-history";
import { deriveOtherLandStateIntervals } from "./other-land-state-history";
import { eventCarriesBuildingKind } from "./other-land-state-history";
import { stateHistoryBusinessIntervals } from "./other-land-state-history";
import { getPeriodJudgmentDate } from "./period-criteria";
import { meetsPeriodCriteria } from "./period-criteria";
import { differenceInDays } from "../utc-date";
import { getOverlappingPeriods } from "./utils/period-math";
import { getOwnershipStart } from "./utils/period-math";
import type { DateInterval } from "./types";
import type { LandStateInterval } from "./land-usage.types";
import type { OtherLandOwnTrace } from "./other-land-helpers";
import type { CategoryJudgeResult } from "./types";
import type { JudgmentStep } from "./types";
import type { NonBusinessLandInput } from "./types";
import type { NonBusinessLandJudgmentRules } from "./types";

export type StateHistoryOutcome =
  /** 이력으로 판정했다 — `result`가 `periodEvaluation`·`warnings`(양도일 현재 상태 고지 → 한정 고지로 교체)까지 담은 최종 결과다. */
  | { applied: true; result: CategoryJudgeResult }
  /** 이력을 쓰지 않았다 — core 결과를 그대로 쓰고 `notices`(없을 수 있다)만 기존 고지 뒤에 더한다. */
  | { applied: false; notices: string[] };

/**
 * core가 면적 일부만 비사업용으로 판정했는가(0 < 비사업용 비율 < 1). 0 또는 1이면 «전량»이다.
 * 이 술어가 참이면 `applyStateHistory`는 이력을 읽지 않는다 — ⑧ H9·H10(철거 행 정착면적·수도권)·⑤ 필수 표시는 같은 판정(`otherLandAreaIsPartial` — core를 그대로 돌린다)으로 게이트한다(E3-③ 후속 #1).
 */
export function isPartialArea(core: CategoryJudgeResult): boolean {
  const ratio = core.areaProportioning?.nonBusinessRatio;
  return ratio !== undefined && ratio > 0 && ratio < 1;
}

/** core(`judgeOtherLandCore`)를 입력만 바꿔 한 번 더 돌리는 함수 — 자체 구간 기록(`trace`)과 전량 사업용 여부를 돌려준다. `other-land.ts`가 넘긴다(순환 import 방지). */
export type CoreProbe = (input: NonBusinessLandInput) => { trace: OtherLandOwnTrace; isBusiness: boolean };

/**
 * 경로 순서와 무관한 **다목 자체 구간 · 나목 꼬리 인정**(Q-15 (가′) 보강). core는 수입금액비율 → 나목(Step 3-1) → 호 인정 순으로 첫 PASS에서 끝나 뒤 경로를 평가하지 않는다.
 * 법 §104의3①4호 가·나·다목은 병렬 제외 사유라 어느 경로에서 먼저 끝났는지로 다목 날짜를 셀지가 달라지면 안 된다 → 이력이 적용될 때만 core를 다시 돌려 보충한다(이력 없는 경로는 손대지 않는다).
 *   · 다목 호 인정 구간: 나목·수입금액비율을 끈 입력(재산세 종합합산 선언 · 근거·공장·수입금액 제거)으로 돌려 호 인정·복합용도·연접·레거시 PASS의 구간(3호는 `[완료일, +2년)`)을 얻는다.
 *     13호(나지)는 제외한다 — «나지»는 건축물이 있던 구간과 충돌한다. 13호는 `other-land-vacant-lot-history.ts` leaf가 **건축물 없는 구간**에 따로 더한다(E3-④ — 호출부가 13호를 끈 core로 이 함수를 부른다). 호 요건 실패(5호 용도지역 등)·부분 면적은 기록되지 않는다.
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

/**
 * B 주택 구간 고지(소유기간에 남은 구간만 — 클립으로 사라진 구간은 고지하지 않는다). 순서: 일 단위 합산(Q-2) → 근거·한계 → 수도권 기본값 → 수용 용도지역 → 초과(Q-5 (나)) → 모름 → 초과 뒤 9호 유예(Q-8 (가)).
 * 수도권 기본값 경고·수용 용도지역 고지는 `judgeHousingLand`가 싣는 문구 그대로다(helper 단일 소스) — 주택 구간을 실제로 계산한(`within`·`exceeded`) 경우에만.
 */
function houseIntervalNotices(intervals: ReadonlyArray<LandStateInterval>, input: NonBusinessLandInput): string[] {
  const houses = intervals.filter((iv) => iv.buildingKind === "house");
  if (houses.length === 0) return [];
  const notices: string[] = [NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE, NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE];
  const calculated = houses.some((iv) => iv.houseOutcome === "within" || iv.houseOutcome === "exceeded");
  // 수도권 미제공 보수 기본값 경고 — 수도권 여부가 그 양도일의 배율을 가를 때만(아니면 값이 없어도 판정이 같다 — 사용자에게 묻지 않은 칸을 경고하지 않는다).
  if (calculated && input.isMetropolitanArea === undefined && metropolitanChangesHousingMultiplier(input.zoneType, input.transferDate)) notices.push(HOUSING_METRO_DEFAULTED_WARNING);
  // 영 §168의12 후단 — 수용 양도의 배율 용도지역은 사업인정 고시일 전날 현재 용도지역(주택부수토지 카드와 같은 조건·같은 고지). 카드의 `nblZoneType`은 현재 값이라 고지만 한다.
  const expr = input.unconditionalExemption;
  const acquiredAfterNotice = expr?.publicNoticeDate !== undefined && input.acquisitionDate >= expr.publicNoticeDate;
  if (calculated && expr?.isPublicExpropriation && !acquiredAfterNotice) {
    const zoneNotice = expropriationZoneBaseDateNotice({ transferCause: "public_expropriation", transferDate: input.transferDate });
    if (zoneNotice) notices.push(zoneNotice);
  }
  const exceeded = houses.some((iv) => iv.houseOutcome === "exceeded");
  if (exceeded) notices.push(NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE);
  if (houses.some((iv) => iv.houseOutcome === "unconfirmed")) notices.push(NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE);
  if (exceeded && input.gracePeriods.some((g) => g.reasonCode === "demolition")) notices.push(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE);
  return notices;
}

/**
 * E3-⑤ E3f-1a — 상태 이력(`changed`)의 **주택** 철거 행 날짜(빈집 셀 고지의 후보 — 빈집은 주택). 모드가 `changed`가 아니면 사건을 읽지 않는다(stale 사건 무시).
 * `landStateHistory`의 판정 쪽 reader는 이 파일뿐이라(WIRE-7) 고지 leaf(`demolished-temp-status.ts`)는 이 함수의 결과만 받는다. 철거 행 판별은 술어(`eventCarriesBuildingKind`) — 종류 리터럴 분기 금지(E3-① 게이트).
 */
export function stateHistoryHouseRemovalDates(input: Pick<NonBusinessLandInput, "landStateHistory">): Date[] {
  const history = input.landStateHistory;
  if (history?.mode !== "changed") return [];
  return history.events.filter((e) => eventCarriesBuildingKind(e.kind) && e.buildingKindBefore === "house").map((e) => e.date);
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
  if (stateHistoryDeemedBlocks({ landType: input.landType, deemedReason: input.deemedTransferReason })) notices.push(NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE);
  if (isPartialArea(core)) notices.push(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
  if (notices.length > 0) return { applied: false, notices };

  // ⑧·⑫가 먼저 막는다 — 직접 호출의 마지막 안전망. 사건 없는 `changed`를 «이력 없음»으로 조용히 읽지 않는다.
  if (history.events.length === 0) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, STATE_EVENTS_REQUIRED_MESSAGE);

  const o = input.otherLand!; // 호출자(`judgeOtherLand`)가 otherLand 없음을 먼저 걸렀다
  const pjDate = getPeriodJudgmentDate(input); // 의제 없음이 확정이라 양도일과 같다
  const intervals = deriveOtherLandStateIntervals(history.events, getOwnershipStart(input.acquisitionDate), pjDate, {
    hasBuilding: o.hasBuilding,
    propertyTaxType: o.propertyTaxType,
    // E3-③ B — «철거된 건축물 = 주택» 행의 배율 이내 판정 근거(카드의 토지 면적 · 용도지역 · 수도권 + 양도일). 주택 행이 없으면 leaf가 읽지 않는다(종전과 바이트 동일).
    houseCtx: { zoneType: input.zoneType, isMetropolitanArea: input.isMetropolitanArea, landArea: input.landArea, transferDate: pjDate },
  });

  // 다목 자체 구간(경로 순서 무관) + 나목 꼬리 인정 — `daMokAndNaMok`. 자체 구간이 있으면 나목이 인정하는 꼬리도 사업용 구간에 더한다(법에 없는 «자체 사업기간이 있으면 양도일 현재 상태를 버린다» 제한 금지).
  const tail = intervals[intervals.length - 1];
  // E3-④ D-4 — 13호(나지): core의 13호 PASS는 «소유기간 전체가 나지·무주택» 가정이라 이력 경로에서는 믿지 않는다. 꼬리·다목·나목 보충은 **13호를 끈 core**로 보고, 13호 기여는 leaf가 구간별로 더한다(합집합 항 — D-3).
  const ho13 = o.relatedBusinessType === VACANT_LOT_HO;
  const off = ho13 ? probe({ ...input, otherLand: { ...o, relatedBusinessType: "none" } }) : undefined;
  const coreIsBusiness = off ? off.isBusiness : core.isBusiness;
  const da = off
    ? daMokAndNaMok({ ...input, otherLand: { ...o, relatedBusinessType: "none" } }, { ...core, isBusiness: off.isBusiness }, off.trace, probe)
    : daMokAndNaMok(input, core, trace, probe);
  const ownBusinessPeriods = da.own && da.naMokTail && tail ? [...da.own, { start: tail.start, end: tail.end }] : da.own;
  const vacantEligible = ho13 && vacantLotWithinAreaLimit(input.landArea);
  const vacant = vacantEligible ? vacantLotBusinessIntervals(intervals, { landArea: input.landArea, houseOwned: o.householdHousePeriods }) : [];
  const businessIntervals = [...stateHistoryBusinessIntervals(intervals, { isBusiness: coreIsBusiness, ownBusinessPeriods }), ...vacant];
  const r = meetsPeriodCriteria(businessIntervals, input.acquisitionDate, pjDate, "other_land", rules, input.gracePeriods);

  // E3-④ R-2 — 구간별 13호 일수(`vacantLotDays` — 없으면 키 부재 = 종전 echo와 바이트 동일). 13호 구간이 없는 구간에는 키를 만들지 않는다.
  const echo = intervalEcho(intervals, businessIntervals).map((row) => {
    const days = vacantEligible ? getOverlappingPeriods([{ start: row.start, end: row.end }], vacant).reduce((sum, p) => sum + differenceInDays(p.end, p.start), 0) : 0;
    return days > 0 ? { ...row, vacantLotDays: days } : row;
  });
  const vacantEcho = vacantEligible ? buildVacantLotEcho("bare_intervals", vacant, { start: intervals[0].start, end: tail.end }, o.householdHousePeriods) : undefined;

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
  // E3-④ Q-5 (가) — 13호가 구간별로 적용된 결과(≤660㎡)는 «호별 용도는 소유기간 전체에 적용» 문구가 모순이라 13호 변형으로 대체한다(기존 상수는 13호가 아니면 바이트 동일).
  if (vacantEligible) warnings.push(hasTaxChange ? NBL_STATE_HISTORY_VACANT_LOT_TAX_CHANGE_APPLIED_NOTICE : NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE);
  else warnings.push(hasTaxChange ? NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE : NBL_STATE_HISTORY_APPLIED_NOTICE);
  // T-4 — 꼬리가 건축물이면 core가 13호를 인정하지 않아 자기 선언 고지가 안 실린다 → 구간별로 13호를 적용했으면 함께 싣는다(없을 때만).
  // L-2 — 행을 읽었으면 자기 선언 고지는 «입력한 기간만 반영» 변형이다(core 13호 PASS가 이미 변형을 실었으면 그대로 · 아니면 여기서 변형을 싣는다). 행이 없으면 기존 고지(바이트 불변).
  const rowsRead = vacantEligible && (o.householdHousePeriods?.length ?? 0) > 0;
  const selfDeclared = rowsRead ? NBL_VACANT_LOT_SELF_DECLARED_WITH_HOUSE_PERIODS_NOTICE : NBL_VACANT_LOT_SELF_DECLARED_NOTICE;
  if (rowsRead) {
    const at = warnings.indexOf(NBL_VACANT_LOT_SELF_DECLARED_NOTICE);
    if (at >= 0) warnings.splice(at, 1);
  }
  if (vacantEligible && !warnings.includes(selfDeclared)) warnings.push(selfDeclared);
  if (rowsRead && !warnings.includes(NBL_VACANT_LOT_HOUSE_PERIODS_NOTICE)) warnings.push(NBL_VACANT_LOT_HOUSE_PERIODS_NOTICE);
  // D-2 — 660㎡ 초과 × 이력은 판정하지 않는다(13호 기여 0 + 고지 · 자동 안분 없음).
  if (ho13 && !vacantEligible) warnings.push(NBL_STATE_HISTORY_VACANT_LOT_AREA_NOTICE);
  // 「모름」 구간(종합합산으로 접힘)은 그 구간을 닫은 사건 종류별로 고지한다 — 구간의 끝 날짜 = 닫은 사건일(날짜는 엄격 증가라 유일).
  // E3-③ T-6 — 주택 구간은 `propertyTaxType = "unknown"` 고정이지만 «재산세 구분 모름»이 아니다(구분을 읽지 않는다) — 제외한다.
  const unknownClosers = intervals.filter((iv) => iv.propertyTaxType === "unknown" && iv.buildingKind !== "house").map((iv) => history.events.find((e) => e.date.getTime() === iv.end.getTime())?.kind);
  if (unknownClosers.some((k) => k !== "tax_type_changed")) warnings.push(NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE);
  if (unknownClosers.some((k) => k === "tax_type_changed")) warnings.push(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
  // E3-1b — 나대지 구간 선언의 해석 결과 고지(소유기간에 남은 구간만). 새 상수만 추가하고 위 고지는 바이트 동일.
  warnings.push(...bareDeclarationNotices(intervals));
  // E3-③ B — «철거된 건축물 = 주택» 구간이 소유기간에 남아 있을 때만(없으면 위 고지와 바이트 동일). A(`applyHousingStateHistory`)와 같은 문구·같은 순서.
  warnings.push(...houseIntervalNotices(intervals, input));

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
      periodEvaluation: { basis: "state_history", stateHistory: { intervals: echo, criteria: criteriaEcho(r) }, ...(vacantEcho ? { vacantLot: vacantEcho } : {}) },
      warnings,
    },
  };
}
