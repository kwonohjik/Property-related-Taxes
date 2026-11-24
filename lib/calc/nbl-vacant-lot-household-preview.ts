/**
 * NBL-STATE-HISTORY-E3-④ — 13호 「세대 주택 소유 기간」 행 아래 «13호로 인정되는 기간(예상)» 미리보기 데이터 — **표시 전용**(저장·미러링 없음 · `useMemo`로 호출).
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.ui.plan.md §4.2
 *
 * 일수는 엔진 leaf가 낸다 — 재계산 없음: 이력 경로 = `vacantLotBusinessIntervals`(건축물 없는 구간 ∩ 무주택 기간 — `applyStateHistory`와 같은 함수) ·
 * 이력을 쓰지 않는 경로 = `householdFreePeriods`(소유기간 ∖ 세대 주택 소유 기간 — core 13호 판정과 같은 함수). 두 경로 중 어느 쪽인지는 ⑤ 안내와 같은 술어(`housePriorHistoryIgnoredOf` — 엔진 core 부분 면적·의제)가 정한다.
 * 행에 ⑧ 결함이 있거나(같은 leaf `householdHousePeriodIssue`) 입력을 읽을 수 없으면 `null`(그리지 않는다 — `buildStateHistoryPreview` 선례). 최종 판정은 결과에서 확정된다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { householdHousePeriodIssue } from "@/lib/tax-engine/non-business-land/household-house-period-issue";
import { householdFreePeriods } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import { houseOwnedDaysIn } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import { vacantLotBusinessIntervals } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import type { DateInterval } from "@/lib/tax-engine/non-business-land/types";
import { getOwnershipStart } from "@/lib/tax-engine/non-business-land/utils/period-math";
import { differenceInDays } from "@/lib/tax-engine/utc-date";
import { buildStateHistoryPreview } from "./nbl-other-state-history-preview";
import { housePriorHistoryIgnoredOf } from "./nbl-other-state-history-read";
import { nblOtherStateEventsInUse } from "./nbl-other-state-history-scope";
import { stateHistoryDeemedBlocksOf } from "./nbl-other-state-history-scope";
import { nblAcquisitionDateOf } from "./nbl-unconditional-exemption-status";
import { vacantLotHousePeriodsReadOf } from "./nbl-vacant-lot-household-read";

export interface VacantLotHouseholdPreview {
  /** `bare_intervals` = 이력 경로(건축물 없는 구간 ∩ 무주택 기간) · `whole_period` = 이력을 쓰지 않는 경로(소유기간 ∖ 주택 소유 기간) — 엔진 echo `vacantLot.scope`와 같은 값. */
  scope: "whole_period" | "bare_intervals";
  /** 13호로 인정되는 기간(예상) 일수. */
  businessDays: number;
  /** 소유기간 일수. */
  ownershipDays: number;
  /** 세대 주택 소유 기간 ∩ 소유기간 일수(엔진 echo `vacantLot.houseOwnedDays`와 같은 정의). */
  houseOwnedDays: number;
}

const sumDays = (periods: ReadonlyArray<DateInterval>): number => periods.reduce((s, p) => s + differenceInDays(p.end, p.start), 0);

export function buildVacantLotHouseholdPreview(asset: AssetForm, transferDate: string | undefined): VacantLotHouseholdPreview | null {
  if (asset.nblOtherHouseholdHouseStatus !== "owned" || !vacantLotHousePeriodsReadOf(asset, transferDate)) return null;
  const acq = toOptionalDate(nblAcquisitionDateOf(asset));
  const transfer = toOptionalDate(transferDate);
  const rows = asset.nblOtherHouseholdHousePeriods ?? [];
  if (!acq || !transfer || rows.length === 0 || householdHousePeriodIssue(rows, { transferDate })) return null;
  // ⑭와 같다 — 종료일 비움 = 양도일까지(엔진이 소유기간으로 자른다).
  const houseOwned: DateInterval[] = rows.map((r) => ({ start: toOptionalDate(r.startDate)!, end: (r.endDate ? toOptionalDate(r.endDate) : undefined) ?? transfer }));
  const landArea = parseFloat((asset.acquisitionArea ?? "").replace(/,/g, "")) || 0;

  // 이력을 엔진이 읽는 상태(`changed` ∧ 의제·부분 면적 아님)에서 사건이 아직 미완성·결함이면 구간을 못 만든다 — 다른 경로 값을 «예상»이라며 보이지 않는다.
  const historyRead = nblOtherStateEventsInUse(asset) && !housePriorHistoryIgnoredOf(asset, transferDate);
  const history = historyRead ? buildStateHistoryPreview(asset, transferDate) : null;
  if (historyRead && !history) return null;
  if (history) {
    const ownership: DateInterval = { start: history.intervals[0].start, end: history.intervals[history.intervals.length - 1].end };
    return {
      scope: "bare_intervals",
      businessDays: sumDays(vacantLotBusinessIntervals(history.intervals, { landArea, houseOwned })),
      ownershipDays: history.totalDays,
      houseOwnedDays: houseOwnedDaysIn(ownership, houseOwned),
    };
  }
  // 이력을 쓰지 않는 경로 — 소유기간의 끝은 양도일 의제 사유가 있으면 의제일(엔진 `getPeriodJudgmentDate`와 같은 값).
  const deemedEnd = stateHistoryDeemedBlocksOf(asset) ? toOptionalDate(asset.nblDeemedTransferDate) : undefined;
  const ownership: DateInterval = { start: getOwnershipStart(acq), end: deemedEnd ?? transfer };
  if (ownership.end.getTime() <= ownership.start.getTime()) return null;
  return {
    scope: "whole_period",
    businessDays: sumDays(householdFreePeriods(ownership, houseOwned)),
    ownershipDays: differenceInDays(ownership.end, ownership.start),
    houseOwnedDays: houseOwnedDaysIn(ownership, houseOwned),
  };
}
