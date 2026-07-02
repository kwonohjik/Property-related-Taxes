/**
 * 종부세 1세대1주택 고령자·장기보유 세액공제 연령/보유 경계 anchor (G5 회귀).
 *
 * 버그: new Date("YYYY-MM-DD")(UTC 자정) + date-fns differenceInYears(로컬 컴포넌트)가
 * 서버 TZ=Asia/Seoul(1961.8.10 이전 KST=UTC+8:30)에서 1954~1961년생·6/1 경계 만 나이를
 * 1세 저평가 → 고령자 공제율 10%p 과소(납세자 불리). fullYearsUTC(UTC 컴포넌트)로 TZ 독립화.
 *
 * @see comprehensive-tax-helpers.ts getSeniorRate/getLongTermRate/fullYearsUTC
 */
import { describe, it, expect } from "vitest";
import { getSeniorRate, getLongTermRate } from "@/lib/tax-engine/comprehensive-tax-helpers";

const A = new Date("2025-06-01"); // 과세기준일

describe("고령자 공제율 연령 경계 — TZ 독립 (G5 회귀)", () => {
  it("1960-06-01생(정확히 만65세) → 30% (기존 TZ=KST 버그면 20%)", () => {
    expect(getSeniorRate(new Date("1960-06-01"), A)).toBe(0.3);
  });
  it("1955-06-01생(정확히 만70세) → 40%", () => {
    expect(getSeniorRate(new Date("1955-06-01"), A)).toBe(0.4);
  });
  it("1965-06-01생(정확히 만60세) → 20%", () => {
    expect(getSeniorRate(new Date("1965-06-01"), A)).toBe(0.2);
  });
  it("1960-06-02생(만65세 하루 미달=64세) → 20%", () => {
    expect(getSeniorRate(new Date("1960-06-02"), A)).toBe(0.2);
  });
  it("1960-05-31생(만65세 하루 초과) → 30%", () => {
    expect(getSeniorRate(new Date("1960-05-31"), A)).toBe(0.3);
  });
  it("1966-06-01생(만59세) → 0%", () => {
    expect(getSeniorRate(new Date("1966-06-01"), A)).toBe(0);
  });
});

describe("장기보유 공제율 보유 경계 — TZ 독립 (G5 회귀)", () => {
  it("2010-06-01 취득(정확히 15년) → 50%", () => {
    expect(getLongTermRate(new Date("2010-06-01"), A)).toBe(0.5);
  });
  it("2015-06-01 취득(정확히 10년) → 40% / 2015-06-02(10년 미달) → 20%", () => {
    expect(getLongTermRate(new Date("2015-06-01"), A)).toBe(0.4);
    expect(getLongTermRate(new Date("2015-06-02"), A)).toBe(0.2);
  });
  it("2020-06-01 취득(정확히 5년) → 20% / 2020-06-02(5년 미달) → 0%", () => {
    expect(getLongTermRate(new Date("2020-06-01"), A)).toBe(0.2);
    expect(getLongTermRate(new Date("2020-06-02"), A)).toBe(0);
  });
});
