/**
 * 상태 이력 판정 echo 조립 helper — 기타토지 `applyStateHistory`와 주택부수토지 `applyHousingStateHistory`가 **같은 함수**로 구간표·기준 수치를 만든다(E3-③ D-4).
 * 입력 화면 미리보기(⑤)·결과 구간표(⑦)가 보는 표 = 판정한 표(UI R1). 기타토지 쪽은 `other-land-state-history-apply.ts`에서 **이동만** 했다(출력 바이트 동일).
 */
import { differenceInDays } from "../utc-date";
import { NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_AREA_EXCEEDED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_AREA_MISSING_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_NEVER_PERIOD_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_OTHER_USE_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PERMIT_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_HOUSE_AREA_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE } from "../nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE } from "../nbl-confirm-notices";
import { mergeOverlappingPeriods } from "./utils/period-math";
import { sumDaysInWindow } from "./utils/period-math";
import type { DateInterval } from "./types";
import type { LandStateInterval } from "./land-usage.types";
import type { DemolishedFoldReason } from "./demolished-temp-status";
import type { PeriodCriteriaResult } from "./period-criteria";
import type { StateHistoryCriteriaEcho } from "./land-usage.types";
import type { StateHistoryIntervalEcho } from "./land-usage.types";

export function criteriaEcho(r: PeriodCriteriaResult): StateHistoryCriteriaEcho {
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

/** 구간표 echo — `businessDays` = 그 구간 안에서 사업용으로 센 일수(유예 제외 · 이력·자체 사업기간 기준). 선언·주택 칸이 없는 구간은 해당 키가 없어 종전 echo와 바이트 동일하다. */
export function intervalEcho(intervals: ReadonlyArray<LandStateInterval>, businessIntervals: ReadonlyArray<DateInterval>): StateHistoryIntervalEcho[] {
  const merged = mergeOverlappingPeriods([...businessIntervals]);
  return intervals.map((iv) => {
    const days = differenceInDays(iv.end, iv.start);
    const businessDays = sumDaysInWindow(merged, iv.start, iv.end);
    // E3-1b — 나대지 구간 선언의 근거 해석(echo). 선언이 없는 구간은 키가 없어 종전 echo와 바이트 동일하다.
    const bare = iv.basisOutcome
      ? {
          basisOutcome: iv.basisOutcome,
          ...(iv.basis ? { basis: iv.basis } : {}),
          declaredPropertyTaxType: iv.declaredPropertyTaxType,
          ...(iv.foldReason ? { foldReason: iv.foldReason } : {}),
          // E3f-2 — 근거 «철거ㆍ멸실» 한시 창(받아들인 구간만). 없으면 키가 없어 종전 echo와 바이트 동일.
          ...(iv.temporaryStatusWindow ? { temporaryStatusWindow: iv.temporaryStatusWindow } : {}),
          ...(iv.temporaryStatusMonths ? { temporaryStatusMonths: iv.temporaryStatusMonths } : {}),
          ...(iv.temporaryStatusRemovedKind ? { temporaryStatusRemovedKind: iv.temporaryStatusRemovedKind } : {}),
          ...(iv.temporaryStatusPublicUse ? { temporaryStatusPublicUse: iv.temporaryStatusPublicUse } : {}),
          ...(iv.temporaryStatusPublicUseWindow ? { temporaryStatusPublicUseWindow: iv.temporaryStatusPublicUseWindow } : {}),
          ...(iv.temporaryStatusPublicUseUnused ? { temporaryStatusPublicUseUnused: iv.temporaryStatusPublicUseUnused } : {}),
          ...(iv.vacantHouseExtensionUnconfirmed ? { vacantHouseExtensionUnconfirmed: iv.vacantHouseExtensionUnconfirmed } : {}),
        }
      : {};
    // E3-③ — 주택 구간 echo(종류 · 배율 이내 판정 · 근거 수치).
    const house = iv.buildingKind ? { buildingKind: iv.buildingKind, ...(iv.houseOutcome ? { houseOutcome: iv.houseOutcome } : {}), ...(iv.houseCheck ? { houseCheck: iv.houseCheck } : {}) } : {};
    return { start: iv.start, end: iv.end, days, hasBuilding: iv.hasBuilding, propertyTaxType: iv.propertyTaxType, business: days > 0 && businessDays === days, businessDays, ...bare, ...house };
  });
}

/** E3f-2 — 근거 «철거ㆍ멸실» 한시 창 접힘 사유 → 고지(`Record`라 새 사유가 생기면 컴파일 오류). */
export const BARE_DEMOLISHED_FOLD_NOTICE = {
  demolished_never_period: NBL_STATE_HISTORY_BARE_DEMOLISHED_NEVER_PERIOD_NOTICE,
  demolished_permit: NBL_STATE_HISTORY_BARE_DEMOLISHED_PERMIT_NOTICE,
  demolished_other_use: NBL_STATE_HISTORY_BARE_DEMOLISHED_OTHER_USE_NOTICE,
  demolished_public_use_no_base_date: NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_NO_BASE_DATE_NOTICE,
  demolished_area_missing: NBL_STATE_HISTORY_BARE_DEMOLISHED_AREA_MISSING_NOTICE,
  demolished_area_exceeded: NBL_STATE_HISTORY_BARE_DEMOLISHED_AREA_EXCEEDED_NOTICE,
} as const satisfies Record<DemolishedFoldReason, string>;

/**
 * E3-1b — 나대지 구간 선언의 해석 결과 고지(소유기간에 남은 구간만 — 클립으로 사라진 구간은 고지하지 않는다). 새 상수만 추가하고 기존 고지는 바이트 동일.
 * 순서: 근거 미확인 → 면적한도 → 받아들임(기타토지 `applyStateHistory`가 이 순서로 push했다).
 */
export function bareDeclarationNotices(intervals: ReadonlyArray<LandStateInterval>): string[] {
  const notices: string[] = [];
  const bareFolds = intervals.filter((iv) => iv.basisOutcome === "unconfirmed");
  // E3f-2 — 근거 «철거ㆍ멸실»의 한시 창 접힘 사유는 «근거 확인 못함» 고지(철거 후 한시는 근거로 받지 않는다는 문구)가 아니라 사유별 고지를 따로 싣는다. 그 밖의 접힘은 종전과 같다.
  const windowFold = (iv: LandStateInterval): iv is LandStateInterval & { foldReason: DemolishedFoldReason } => !!iv.foldReason && Object.hasOwn(BARE_DEMOLISHED_FOLD_NOTICE, iv.foldReason);
  if (bareFolds.some((iv) => iv.foldReason !== "area_exceeded" && iv.foldReason !== "area_unknown" && !windowFold(iv))) notices.push(NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE);
  if (bareFolds.some((iv) => iv.foldReason === "area_exceeded" || iv.foldReason === "area_unknown")) notices.push(NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE);
  const windowReasons = [...new Set(bareFolds.filter(windowFold).map((iv) => iv.foldReason))];
  for (const reason of windowReasons) notices.push(BARE_DEMOLISHED_FOLD_NOTICE[reason]);
  if (intervals.some((iv) => iv.basisOutcome === "accepted" && !iv.temporaryStatusWindow)) notices.push(NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE);
  if (intervals.some((iv) => iv.temporaryStatusWindow)) notices.push(NBL_STATE_HISTORY_BARE_DEMOLISHED_ACCEPTED_NOTICE);
  if (intervals.some((iv) => iv.temporaryStatusPublicUse)) notices.push(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_ACCEPTED_NOTICE);
  if (intervals.some((iv) => iv.temporaryStatusPublicUseUnused)) notices.push(NBL_STATE_HISTORY_BARE_DEMOLISHED_PUBLIC_USE_UNUSED_NOTICE);
  if (intervals.some((iv) => iv.vacantHouseExtensionUnconfirmed)) notices.push(NBL_STATE_HISTORY_BARE_DEMOLISHED_VACANT_HOUSE_UNCONFIRMED_NOTICE);
  if (intervals.some((iv) => iv.temporaryStatusWindow && iv.temporaryStatusRemovedKind === "house")) notices.push(NBL_STATE_HISTORY_BARE_DEMOLISHED_HOUSE_AREA_NOTICE);
  return notices;
}
