/**
 * NH-13 — 상속 풀(`resolveInheritedHouseExclusion`)의 조특법 겹침 처리 (사용자 결정 Q-1 A · Q-10 a).
 *
 * 조특법으로 이미 주택 수에서 빠진 행(`specialActHouseIds`)은 ② 적격 판정 집합에서 뺀다. 그 행을 뺀 나머지 상속주택이 정확히 1채이면 그 행을 뺀다.
 * 불성립 사유 후보(게이트별 부적격 수)는 바꾸지 않는다.
 */
import { describe, it, expect } from "vitest";
import { resolveInheritedHouseExclusion, buildInheritedExclusionSteps } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { makeHouseInfo } from "../_helpers/mock-rates";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const D = (s: string) => new Date(s);
const inh = (id: string, date: string, over: Partial<HouseInfo> = {}) =>
  makeHouseInfo(id, { acquisitionDate: D(date), isInherited: true, inheritedDate: D(date), decedentSameHouseholdAtInheritance: false, ...over } as Partial<HouseInfo>);
const SELLING = makeHouseInfo("selling", { acquisitionDate: D("2012-11-21") });
const resolve = (others: HouseInfo[], special?: string[]) =>
  resolveInheritedHouseExclusion([SELLING, ...others], "selling", false, undefined, special ? new Set(special) : undefined);

describe("resolveInheritedHouseExclusion — specialActHouseIds", () => {
  it("R1(조특법+상속) 단독: 상속 실효 제외 0 · 겹친 행으로 표시", () => {
    const r = resolve([inh("r1", "2015-03-01")], ["r1"]);
    expect(r.excludedCount).toBe(0);
    expect(r.excludedHouses).toEqual([]);
    expect(r.coveredBySpecialActHouseIds).toEqual(["r1"]);
  });
  it("생략하면 종전과 같다 — R1 단독 제외 1", () => {
    const r = resolve([inh("r1", "2015-03-01")]);
    expect(r.excludedCount).toBe(1);
    expect(r.coveredBySpecialActHouseIds).toEqual([]);
  });
  it("Q-10 (a): R1(조특법)·R2 → R1을 뺀 나머지 R2가 단독 적격으로 제외된다", () => {
    const r = resolve([inh("r1", "2015-03-01"), inh("r2", "2016-07-01")], ["r1"]);
    expect(r.excludedHouses.map((e) => e.houseId)).toEqual(["r2"]);
    expect(r.eligibleSoleCount).toBe(1);
    expect(r.coveredBySpecialActHouseIds).toEqual(["r1"]);
  });
  it("조특법 행이 없으면 R1·R2 둘 다 적격 2채라 제외 0(종전)", () => {
    const r = resolve([inh("r1", "2015-03-01"), inh("r2", "2016-07-01")]);
    expect(r.excludedCount).toBe(0);
    expect(r.eligibleSoleCount).toBe(2);
  });
  it("R1(조특법)·R2·R3 → 남은 적격 2채라 선순위 특정 불가(제외 0) · 적격 수는 2", () => {
    const r = resolve([inh("r1", "2015-03-01"), inh("r2", "2016-07-01"), inh("r3", "2017-07-01")], ["r1"]);
    expect(r.excludedCount).toBe(0);
    expect(r.eligibleSoleCount).toBe(2);
  });
  it("게이트 부적격(동일세대) 후보 수는 조특법 겹침과 무관하게 그대로 센다", () => {
    const r = resolve([inh("r1", "2015-03-01", { decedentSameHouseholdAtInheritance: true }), inh("r2", "2016-07-01")], ["r2"]);
    expect(r.sameHouseholdDisqualifiedCount).toBe(1);
    expect(r.excludedCount).toBe(0);
  });
  it("③ 소수지분 풀도 같다 — 조특법 행은 후보에서 빠지고 '주택 수에 남은 소수지분'으로 세지 않는다", () => {
    const co = (id: string, date: string) => inh(id, date, { isCoInherited: true, isLargestCoInheritedShareholder: false });
    const r = resolve([co("c1", "2015-03-01")], ["c1"]);
    expect(r.coExcludedCount).toBe(0);
    expect(r.unexcludedCoMinorityHouseIds).toEqual([]);
    expect(r.coveredBySpecialActHouseIds).toEqual(["c1"]);
  });
});

describe("buildInheritedExclusionSteps — 겹친 행 고지", () => {
  it("겹친 행이 있으면 「추가 차감하지 않음」 step 을 낸다 · 없으면 내지 않는다", () => {
    const covered = buildInheritedExclusionSteps(resolve([inh("r1", "2015-03-01")], ["r1"]), 2);
    expect(covered.some((s) => s.label.includes("추가 차감하지 않음"))).toBe(true);
    const plain = buildInheritedExclusionSteps(resolve([inh("r1", "2015-03-01")]), 2);
    expect(plain.some((s) => s.label.includes("추가 차감하지 않음"))).toBe(false);
  });
});
