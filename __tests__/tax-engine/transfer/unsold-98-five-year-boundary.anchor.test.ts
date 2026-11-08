/**
 * D1 anchor — §98 「5년 이상 보유」 경계(US-14 초일 산입) · 시간대 무관(US-37) · 상수 단일 소스(US-49) · 라벨(US-50).
 *
 * 시간대 확인: `TZ=America/Los_Angeles npx vitest run <이 파일>` 도 같은 값이어야 한다
 * (수정 전에는 LA에서 윤일 경계 1996-02-29 → 2001-02-28이 부적격으로 어긋났다).
 */
import { describe, expect, it } from "vitest";
import { evaluateUnsold98 } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { isWithin5YearsCheck } from "@/lib/tax-engine/transfer-reductions/new-99-3";
import { addYearsUtc } from "@/lib/tax-engine/civil-period";
import {
  UNSOLD_98_FLAT_RATE,
  UNSOLD_98_FLAT_RATE_LABEL,
  UNSOLD_98_HOLDING_YEARS,
} from "@/lib/tax-engine/transfer-reductions/unsold-98-constants";
import { REDUCTION_METADATA } from "@/lib/tax-engine/transfer-reductions/metadata";

const D = (s: string) => new Date(s);
const ok = {
  isResident: true,
  isNationalScale: true,
  isOutsideSeoul: true,
  isUnsoldConfirmed: true,
  isNotRentalHousing: true,
  isFirstBuyerNoOccupancy: true,
};
const eligible = (a: string, t: string) =>
  evaluateUnsold98({ ...ok, acquisitionDate: D(a), transferDate: D(t) }).isEligible;

describe("US-14 §98 5년 이상 보유 — 초일 산입(만 5년 당일 적격)", () => {
  it.each([
    ["1996-06-15", "2001-06-13", false],
    ["1996-06-15", "2001-06-14", true],
    ["1996-06-15", "2001-06-15", true],
    ["1997-03-01", "2002-02-27", false],
    ["1997-03-01", "2002-02-28", true],
    ["1998-06-15", "2003-06-14", true],
    ["1995-11-01", "2000-10-31", true],
    ["1997-12-31", "2002-12-30", true],
    ["1997-12-31", "2002-12-29", false],
    ["1996-02-29", "2001-02-27", false],
    ["1996-02-29", "2001-02-28", true],
    ["1996-02-29", "2001-03-01", true],
  ])("취득 %s · 양도 %s → 적격 %s", (a, t, expected) => {
    expect(eligible(a, t)).toBe(expected);
  });
});

describe("US-37 UTC 고정 연 가감", () => {
  it("addYearsUtc — 2/29 + 5년 = 2/28, 평일은 같은 월일", () => {
    expect(addYearsUtc(D("1996-02-29"), 5).toISOString()).toBe("2001-02-28T00:00:00.000Z");
    expect(addYearsUtc(D("2011-03-01"), 5).toISOString()).toBe("2016-03-01T00:00:00.000Z");
  });
  it("isWithin5YearsCheck 경계", () => {
    expect(isWithin5YearsCheck(D("2012-02-29"), D("2017-02-28"))).toBe(true);
    expect(isWithin5YearsCheck(D("2012-02-29"), D("2017-03-01"))).toBe(false);
    expect(isWithin5YearsCheck(D("2011-03-01"), D("2016-03-01"))).toBe(true);
    expect(isWithin5YearsCheck(D("2011-03-01"), D("2016-03-02"))).toBe(false);
  });
});

describe("US-49 상수 단일 소스", () => {
  it("상수 값", () => {
    expect(UNSOLD_98_FLAT_RATE).toBe(0.2);
    expect(UNSOLD_98_HOLDING_YEARS).toBe(5);
    expect(UNSOLD_98_FLAT_RATE_LABEL).toBe("20%");
  });
  it("적격 평가 라벨이 상수에서 만들어진다", () => {
    const r = evaluateUnsold98({ ...ok, acquisitionDate: D("1996-06-15"), transferDate: D("2001-06-14") });
    expect(r.taxReductionRate).toBe(UNSOLD_98_FLAT_RATE);
    expect(r.formulaSteps[0].label).toContain(UNSOLD_98_FLAT_RATE_LABEL);
  });
});

describe("US-50 §98 effectLabel — ①2호는 범위 외", () => {
  it("「OR 종합소득」 없음 + 범위 외 표기", () => {
    const label = REDUCTION_METADATA.unsold_98.effectLabel;
    expect(label).not.toContain("OR 종합소득");
    expect(label).toContain("범위 외");
  });
});
