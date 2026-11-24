/**
 * NBL-STATE-HISTORY-E3-④ — 13호(영 §168의11①13호 «주택을 소유하지 아니하는 1세대가 소유하는 1필지의 나지») × 소유기간 중 이력 · 세대 주택 소유 기간. 순수 leaf(DB·`new Date(x)` 없음).
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.engine.plan.md §3.2 · §4.1 · §4.2 · §4.6
 * 결정(2026-11-24 사용자): Q-1 (가) 13호는 **나지 구간**(건축물 없는 구간 — 꼬리 + 과거 나지)에만 · Q-2 (다) 세대 주택 소유 기간 행 · Q-3 (가) 이력과 무관 · Q-4 (가) 행 없음 = 현행(전 기간 무주택 자기선언).
 *
 * 13호 사업용 구간 = (이력 구간 중 건축물 없는 구간) ∩ (소유기간 ∖ 세대 주택 소유 기간), 660㎡ 이내일 때만(영 문언 «660제곱미터 이내에 한한다»).
 * 법 §104의3①4호 가·나·다목은 병렬 제외 사유라 이 구간은 `applyStateHistory`에서 **합집합 항**으로 더해진다(Q-15 (가′) 식 불변 — D-3).
 * `markOwn`·`trace.own`을 거치지 않는다(T-1·T-2) — 13호는 건축물 의존이라 «이력과 독립한 다목 축»이 아니다.
 */
import { isAreaOver } from "../area-limit";
import { differenceInDays } from "../utc-date";
import { NBL_AREA_MULTIPLIER } from "./data/area-standards";
import { getOverlappingPeriods, mergeOverlappingPeriods, subtractPeriods, sumDaysInWindow } from "./utils/period-math";
import type { DateInterval } from "./types";
import type { LandStateInterval, VacantLotEcho } from "./land-usage.types";

/** 13호 호 id — 호 메타 표의 키와 같다. */
export const VACANT_LOT_HO = "vacant_lot_1household";

/** 13호 면적 한도(㎡) — 호 메타 표·`resolveAreaLimit`과 같은 단일 소스(`NBL_AREA_MULTIPLIER`). */
export const VACANT_LOT_AREA_LIMIT = NBL_AREA_MULTIPLIER.VACANT_LOT_1HOUSEHOLD;

/** 13호 면적 한도 이내인가(영 «660제곱미터 이내에 한한다») — 술어·leaf·`applyStateHistory`가 같은 판정(`isAreaOver` 단일 소스)을 쓴다. */
export function vacantLotWithinAreaLimit(landArea: number): boolean {
  return !isAreaOver(landArea, VACANT_LOT_AREA_LIMIT);
}

export interface VacantLotReadArgs {
  /** 호(`nblOtherRelatedBusinessType`) — 13호가 아니면 항상 거짓. */
  relatedBusinessType: string | undefined;
  /** 양도일 현재 건축물 있음 — `effectiveOtherHasBuilding`(⑫′·⑭가 쓰는 같은 함수) 파생값. */
  tailHasBuilding: boolean;
  /** 이력 질문이 적용되고 답이 `changed`(기타토지 전용 — 13호는 기타토지 카드뿐이다). */
  historyChanged: boolean;
  /** 양도일 의제 사유가 선택돼 엔진이 이력을 읽지 않는가 — `stateHistoryDeemedBlocks`. */
  historyDeemedBlocked: boolean;
  /** 토지 면적(㎡). */
  landArea: number;
}

/**
 * R-1 — 엔진이 **세대 주택 소유 기간 행을 읽는 조건**(④ 전송 · ⑤ 노출 · ⑧ 요구가 이 함수만 호출한다 — 자체 조건 금지).
 *
 *   13호 ∧ ( ¬꼬리 건축물  ∨  ( 이력 `changed` ∧ ¬의제 ∧ ¬660㎡ 초과 ) )
 *
 * 코드 대조(엔진 계획서 §4.6): 꼬리 나지 → core 13호 PASS가 행을 읽는다(660 초과도 기간 판정이 면적 안분보다 앞) · 꼬리 건물 → 호 요건 실패(건축물 있음)라 core는 안 읽고 이력 leaf만 읽는다(`changed` ∧ ¬의제 ∧ 660 이내).
 * 읽지만 판정에 영향이 없는 입력(나지 구간이 아예 없는 이력 등)도 참이다 — «읽는다»이지 «영향이 있다»가 아니다.
 */
export function vacantLotHousePeriodsRead(a: VacantLotReadArgs): boolean {
  if (a.relatedBusinessType !== VACANT_LOT_HO) return false;
  if (!a.tailHasBuilding) return true;
  return a.historyChanged && !a.historyDeemedBlocked && vacantLotWithinAreaLimit(a.landArea);
}

/**
 * 무주택 기간 = 소유기간 ∖ 세대 주택 소유 기간. 행이 없으면(미입력·빈 배열) 소유기간 전체 = 현행 «전 기간 무주택 자기선언»(Q-4 (가))이다.
 * 소유기간 밖으로 넘친 행은 잘리고(축 B 늦은 지분 · 종료일이 양도일 뒤) 겹친 행은 병합된다.
 */
export function householdFreePeriods(ownership: DateInterval, houseOwned: ReadonlyArray<DateInterval> | undefined): DateInterval[] {
  if (ownership.end.getTime() <= ownership.start.getTime()) return [];
  if (!houseOwned || houseOwned.length === 0) return [{ start: ownership.start, end: ownership.end }];
  return subtractPeriods([ownership], [...houseOwned]);
}

/** 세대 주택 소유 기간 ∩ 소유기간 일수(행이 없으면 0). */
export function houseOwnedDaysIn(ownership: DateInterval, houseOwned: ReadonlyArray<DateInterval> | undefined): number {
  if (!houseOwned || houseOwned.length === 0) return 0;
  return sumDaysInWindow(mergeOverlappingPeriods([...houseOwned]), ownership.start, ownership.end);
}

export interface VacantLotIntervalOpts {
  landArea: number;
  houseOwned?: ReadonlyArray<DateInterval>;
}

/**
 * 이력 경로의 13호 사업용 구간 — 건축물 없는 구간(`hasBuilding = false`) ∩ 무주택 기간. 660㎡ 초과면 빈 배열(D-2 — 면적 × 이력은 판정하지 않고 고지한다).
 * «나지»는 `hasBuilding`만 본다 — 지방세법 시행령 §101①2호나목 2% 나대지 **간주**(`isBareLand`)는 쓰지 않는다(D-1 — 영 13호 문언 «어느 용도로도 사용되고 있지 아니한 토지»).
 * `intervals`는 `deriveOtherLandStateIntervals` 결과(소유기간을 덮고 마지막 = 꼬리)여야 한다.
 */
export function vacantLotBusinessIntervals(intervals: ReadonlyArray<LandStateInterval>, opts: VacantLotIntervalOpts): DateInterval[] {
  if (intervals.length === 0) return [];
  if (!vacantLotWithinAreaLimit(opts.landArea)) return [];
  const bare = intervals.filter((iv) => !iv.hasBuilding).map(({ start, end }) => ({ start, end }));
  if (bare.length === 0) return [];
  const ownership: DateInterval = { start: intervals[0].start, end: intervals[intervals.length - 1].end };
  return getOverlappingPeriods(bare, householdFreePeriods(ownership, opts.houseOwned));
}

/** [echo] 13호가 사업용에 센 구간(병합 후)과 세대 주택 소유 일수. */
export function buildVacantLotEcho(scope: VacantLotEcho["scope"], business: ReadonlyArray<DateInterval>, ownership: DateInterval, houseOwned: ReadonlyArray<DateInterval> | undefined): VacantLotEcho {
  return {
    scope,
    intervals: mergeOverlappingPeriods([...business]).map(({ start, end }) => ({ start, end, days: differenceInDays(end, start) })),
    houseOwnedDays: houseOwnedDaysIn(ownership, houseOwned),
  };
}
