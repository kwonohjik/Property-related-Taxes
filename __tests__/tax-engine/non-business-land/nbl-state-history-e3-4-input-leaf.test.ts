/**
 * NBL-STATE-HISTORY-E3-④ E3e-2 — 입력 leaf 단위: `householdHousePeriodIssue`(⑧ HH-3 · ⑫′ 공용) · ⑭ `buildHouseholdHousePeriods` · 행 수 상한 단일 소스.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.engine.plan.md §5 · D-7 · T-6 · R-7
 */
import { describe, it, expect } from "vitest";
import { householdHousePeriodIssue } from "@/lib/tax-engine/non-business-land/household-house-period-issue";
import { buildHouseholdHousePeriods } from "@/lib/tax-engine/non-business-land/form-mapper-helpers";
import { NBL_HOUSEHOLD_HOUSE_PERIODS_MAX, nblHouseholdHousePeriodsCapMessage } from "@/lib/calc/nbl-household-house-periods-cap";
import { toOptionalDate } from "@/lib/api/date-coerce";

const T = "2024-01-01";
const tDate = new Date("2024-01-01T00:00:00Z");

describe("householdHousePeriodIssue — 구조 규칙(⑧·⑫ 공용)", () => {
  it("빈 배열·정상 행·종료일 빈칸(양도일까지)은 결함 없음", () => {
    expect(householdHousePeriodIssue([], { transferDate: T })).toBeNull();
    expect(householdHousePeriodIssue([{ startDate: "2020-01-01" }, { startDate: "2021-01-01", endDate: "2022-01-01" }], { transferDate: T })).toBeNull();
  });
  it.each([
    ["시작일 빈칸", [{ startDate: "" }], 0, "startDate"],
    ["시작일 미정의", [{ endDate: "2020-01-01" }], 0, "startDate"],
    ["시작일 해석 불가", [{ startDate: "abc" }], 0, "startDate"],
    ["종료일 해석 불가", [{ startDate: "2020-01-01", endDate: "xx" }], 0, "endDate"],
    ["역순", [{ startDate: "2020-01-02", endDate: "2020-01-01" }], 0, "endDate"],
    ["같은 날", [{ startDate: "2020-01-01", endDate: "2020-01-01" }], 0, "endDate"],
    ["양도일 당일 시작(소유기간 0일)", [{ startDate: T }], 0, "startDate"],
    ["양도일 이후 시작", [{ startDate: "2025-01-01" }], 0, "startDate"],
    ["둘째 행 결함 — 첫 결함의 인덱스", [{ startDate: "2020-01-01" }, { startDate: "2021-01-01", endDate: "2020-06-01" }], 1, "endDate"],
  ] as const)("%s", (_n, rows, index, field) => {
    const issue = householdHousePeriodIssue(rows as never, { transferDate: T });
    expect(issue).toMatchObject({ index, field });
    expect(issue!.message).toContain(`${index + 1}번째 행`);
  });
  it("양도일을 모르면(빈·해석 불가) 양도일 규칙만 건너뛴다 — 다른 검증이 먼저 낸다", () => {
    expect(householdHousePeriodIssue([{ startDate: "2099-01-01" }], { transferDate: "" })).toBeNull();
    expect(householdHousePeriodIssue([{ startDate: "2099-01-01" }], {})).toBeNull();
  });
  it("종료일이 양도일 뒤이거나 시작일이 소유 시작 전이어도 결함이 아니다 — 엔진이 소유기간으로 자른다(축 B 늦은 지분이 400이 되지 않는다)", () => {
    expect(householdHousePeriodIssue([{ startDate: "1990-01-01", endDate: "2030-01-01" }], { transferDate: T })).toBeNull();
  });
  it("겹치는 행도 결함이 아니다 — 엔진이 병합한다", () => {
    expect(householdHousePeriodIssue([{ startDate: "2020-01-01", endDate: "2022-01-01" }, { startDate: "2021-01-01" }], { transferDate: T })).toBeNull();
  });
});

describe("⑭ buildHouseholdHousePeriods", () => {
  const parse = (s: string) => toOptionalDate(s);
  const a = (rows: unknown) => ({ nblOtherHouseholdHousePeriods: rows });
  it("13호가 아니면 undefined(숨은 stale 행은 싣지 않는다) · 행 없음·빈 배열 = undefined(현행)", () => {
    expect(buildHouseholdHousePeriods(a([{ startDate: "2020-01-01" }]), "fish_farm_licensed", tDate, parse)).toBeUndefined();
    expect(buildHouseholdHousePeriods(a([{ startDate: "2020-01-01" }]), undefined, tDate, parse)).toBeUndefined();
    expect(buildHouseholdHousePeriods({}, "vacant_lot_1household", tDate, parse)).toBeUndefined();
    expect(buildHouseholdHousePeriods(a([]), "vacant_lot_1household", tDate, parse)).toBeUndefined();
  });
  it("종료일 빈칸 = 양도일(D-7) · 명시 종료일은 그대로 · 시작일을 읽을 수 없는 행은 건너뛴다", () => {
    const out = buildHouseholdHousePeriods(a([{ startDate: "2020-01-01" }, { startDate: "2018-01-01", endDate: "2019-01-01" }, { startDate: "" }, { startDate: "zz" }]), "vacant_lot_1household", tDate, parse)!;
    expect(out.map((p) => [p.start.toISOString().slice(0, 10), p.end.toISOString().slice(0, 10)])).toEqual([["2020-01-01", "2024-01-01"], ["2018-01-01", "2019-01-01"]]);
  });
});

describe("행 수 상한 단일 소스(R-7)", () => {
  it("선례 상한(10)과 같고 문구가 상한 값을 담는다", () => {
    expect(NBL_HOUSEHOLD_HOUSE_PERIODS_MAX).toBe(10);
    expect(nblHouseholdHousePeriodsCapMessage()).toContain(`${NBL_HOUSEHOLD_HOUSE_PERIODS_MAX}건`);
  });
});
