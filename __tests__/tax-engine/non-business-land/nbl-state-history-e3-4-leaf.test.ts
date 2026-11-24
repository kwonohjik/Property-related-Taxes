/**
 * NBL-STATE-HISTORY-E3-④ — leaf 단위(`other-land-vacant-lot-history.ts`): R-1 술어 진리표 · 무주택 기간 · 13호 사업용 구간 · echo.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.engine.plan.md §4.2 · §4.6
 */
import { describe, it, expect } from "vitest";
import {
  VACANT_LOT_AREA_LIMIT,
  VACANT_LOT_HO,
  buildVacantLotEcho,
  houseOwnedDaysIn,
  householdFreePeriods,
  vacantLotBusinessIntervals,
  vacantLotHousePeriodsRead,
  vacantLotWithinAreaLimit,
  type VacantLotReadArgs,
} from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import type { LandStateInterval } from "@/lib/tax-engine/non-business-land/land-usage.types";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iv = (a: string, b: string, hasBuilding: boolean): LandStateInterval => ({ start: d(a), end: d(b), hasBuilding, propertyTaxType: "comprehensive" });
const days = (ps: { start: Date; end: Date }[]) => ps.map((p) => Math.round((p.end.getTime() - p.start.getTime()) / 86_400_000));

describe("R-1 술어 `vacantLotHousePeriodsRead` — 진리표", () => {
  const base: VacantLotReadArgs = { relatedBusinessType: VACANT_LOT_HO, tailHasBuilding: false, historyChanged: false, historyDeemedBlocked: false, landArea: 600 };
  it("상수: 660㎡ 한도 단일 소스", () => {
    expect(VACANT_LOT_AREA_LIMIT).toBe(660);
    expect([vacantLotWithinAreaLimit(660), vacantLotWithinAreaLimit(660.01), vacantLotWithinAreaLimit(0)]).toEqual([true, false, true]);
  });
  it.each([
    ["13호 아님", { relatedBusinessType: "none" }, false],
    ["호 미설정", { relatedBusinessType: undefined }, false],
    ["꼬리 나지 · 이력 OFF", {}, true],
    ["꼬리 나지 · 660 초과 · 이력 OFF — core가 읽는다(기간 판정이 면적 안분보다 앞)", { landArea: 900 }, true],
    ["꼬리 나지 · changed · 의제 — core로 돌아가 읽는다", { historyChanged: true, historyDeemedBlocked: true }, true],
    ["꼬리 건물 · 이력 OFF — 호 요건 실패", { tailHasBuilding: true }, false],
    ["꼬리 건물 · changed · 660 이내", { tailHasBuilding: true, historyChanged: true }, true],
    ["꼬리 건물 · changed · 660 정확히", { tailHasBuilding: true, historyChanged: true, landArea: 660 }, true],
    ["꼬리 건물 · changed · 660 초과 — 기여 0", { tailHasBuilding: true, historyChanged: true, landArea: 660.01 }, false],
    ["꼬리 건물 · changed · 양도일 의제 — 이력 미적용", { tailHasBuilding: true, historyChanged: true, historyDeemedBlocked: true }, false],
  ] as const)("%s → %s", (_n, over, expected) => {
    expect(vacantLotHousePeriodsRead({ ...base, ...over })).toBe(expected);
  });
});

describe("무주택 기간 · 13호 사업용 구간", () => {
  const own = { start: d("2014-01-02"), end: d("2024-01-01") };
  it("행 없음(undefined·빈 배열) = 소유기간 전체(Q-4 (가) 현행)", () => {
    expect(householdFreePeriods(own, undefined)).toEqual([own]);
    expect(householdFreePeriods(own, [])).toEqual([own]);
  });
  it("행은 소유기간 밖이 잘리고 겹침은 병합된다 · 소유기간 전체를 덮으면 빈 배열", () => {
    const free = householdFreePeriods(own, [{ start: d("2010-01-01"), end: d("2015-01-02") }, { start: d("2014-06-01"), end: d("2016-01-01") }, { start: d("2022-01-01"), end: d("2030-01-01") }]);
    expect(free.map((p) => [p.start.toISOString().slice(0, 10), p.end.toISOString().slice(0, 10)])).toEqual([["2016-01-01", "2022-01-01"]]);
    expect(householdFreePeriods(own, [{ start: d("2000-01-01"), end: d("2030-01-01") }])).toEqual([]);
    expect(householdFreePeriods({ start: d("2024-01-01"), end: d("2024-01-01") }, undefined)).toEqual([]);
  });
  it("세대 주택 소유 일수(소유기간 ∩ 병합 행)", () => {
    expect(houseOwnedDaysIn(own, undefined)).toBe(0);
    expect(houseOwnedDaysIn(own, [{ start: d("2023-01-01"), end: d("2024-01-01") }, { start: d("2023-06-01"), end: d("2025-01-01") }])).toBe(365);
  });

  const ivs = [iv("2014-01-02", "2020-01-01", false), iv("2020-01-01", "2023-06-01", true), iv("2023-06-01", "2024-01-01", false)];
  it("건축물 있는 구간은 13호 구간이 아니다(P-1) — 나지 2구간만", () => {
    expect(days(vacantLotBusinessIntervals(ivs, { landArea: 600 }))).toEqual([2190, 214]);
  });
  it("무주택 교집합(P-2) — 주택 소유 2023-01-01~ 이면 꼬리 나지 214일이 빠진다", () => {
    expect(days(vacantLotBusinessIntervals(ivs, { landArea: 600, houseOwned: [{ start: d("2023-01-01"), end: d("2024-01-01") }] }))).toEqual([2190]);
  });
  it("660㎡ 초과면 빈 배열(P-3 · D-2)", () => {
    expect(vacantLotBusinessIntervals(ivs, { landArea: 660.01 })).toEqual([]);
    expect(vacantLotBusinessIntervals([], { landArea: 600 })).toEqual([]);
  });
  it("모든 구간이 건축물이면 빈 배열", () => {
    expect(vacantLotBusinessIntervals([iv("2014-01-02", "2024-01-01", true)], { landArea: 600 })).toEqual([]);
  });
  it("echo: 병합된 구간 일수 · 세대 주택 소유 일수", () => {
    const biz = vacantLotBusinessIntervals(ivs, { landArea: 600 });
    const echo = buildVacantLotEcho("bare_intervals", biz, own, [{ start: d("2023-01-01"), end: d("2023-02-01") }]);
    expect(echo.scope).toBe("bare_intervals");
    expect(echo.intervals.map((i) => i.days)).toEqual([2190, 214]);
    expect(echo.houseOwnedDays).toBe(31);
  });
});
