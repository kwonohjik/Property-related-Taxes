/**
 * anchor — §154① 본문 연혁: **보유 3년**(2012-06-29 전 양도) · **서울·과천·5개 신도시 거주 2년**(2003-11-20 ~
 * 2011-06-02 양도) (M2). route 결론은 평가셋 N-F461(보유 2년 6개월) · R030 · R031 · R037(서울)이 고정한다.
 *
 * | # | 주장 |
 * |---|---|
 * | H-1 | 보유 연수 — 2012-06-28 양도 3년 · 2012-06-29 양도 2년 |
 * | R-1 | 거주요건 구간 — 2003-11-20 ~ 2011-06-02 양도만 |
 * | R-2 | 소재지 — 서울·과천 in · 신도시 시·구 maybe · 그 밖 out · 주소 없음 unknown |
 * | R-3 | 판정 — out이면 요건 없음, in·maybe·unknown이면 거주 24개월 경계 |
 * | N-1 | 판정 보류 고지 — maybe·unknown이고 거주요건 때문에 과세될 때만 |
 */
import { describe, it, expect } from "vitest";
import {
  capitalNewTownLocation,
  isCapitalNewTownResidenceEra,
  resolveOneHouseMinHoldingYears,
} from "@/lib/tax-engine/data/one-house-holding-residence-era";
import {
  describeOneHouseHoldingRequirement,
  describeOneHouseResidenceRequirement,
} from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { collectEraUndetermined } from "@/lib/tax-engine/one-house/era-undetermined";

const D = (s: string) => new Date(s);
const RULE = { minHoldingYears: 2, regulatedAreaMinResidenceYears: 2, prePolicyDate: "2017-08-03", prePolicyExemptResidence: true };

describe("H-1 보유 연수", () => {
  it("2012-06-28 양도 3년 · 2012-06-29 양도 2년", () => {
    expect(resolveOneHouseMinHoldingYears(D("2012-06-28"), 2)).toBe(3);
    expect(resolveOneHouseMinHoldingYears(D("2012-06-29"), 2)).toBe(2);
  });
  it("보유 2년 6개월 — 2009 양도 미충족 · 2013 양도 충족", () => {
    const h = (acq: string, t: string) =>
      describeOneHouseHoldingRequirement({ acquisitionDate: D(acq), transferDate: D(t) } as never, RULE);
    expect(h("2006-07-15", "2009-01-15")).toMatchObject({ requiredYears: 3, met: false });
    expect(h("2010-07-15", "2013-01-15")).toMatchObject({ requiredYears: 2, met: true });
  });
});

describe("R-1 · R-2 구간과 소재지", () => {
  it("구간 경계", () => {
    expect(isCapitalNewTownResidenceEra(D("2003-11-19"))).toBe(false);
    expect(isCapitalNewTownResidenceEra(D("2003-11-20"))).toBe(true);
    expect(isCapitalNewTownResidenceEra(D("2011-06-02"))).toBe(true);
    expect(isCapitalNewTownResidenceEra(D("2011-06-03"))).toBe(false);
  });
  it("소재지 분류", () => {
    expect(capitalNewTownLocation("1168010100")).toBe("in");
    expect(capitalNewTownLocation("4129010100")).toBe("in");
    expect(capitalNewTownLocation("4113510100")).toBe("maybe");
    expect(capitalNewTownLocation("4119210100")).toBe("maybe");
    expect(capitalNewTownLocation("2711010100")).toBe("out");
    expect(capitalNewTownLocation(undefined)).toBe("unknown");
  });
});

describe("R-3 거주요건 판정", () => {
  const r = (regionCode: string | undefined, months: number, t = "2008-01-16") =>
    describeOneHouseResidenceRequirement(
      {
        acquisitionDate: D("2000-07-22"),
        transferDate: D(t),
        residencePeriodMonths: months,
        regionCode,
      } as never,
      RULE,
    ).basis;
  it("서울 23개월 미충족 · 24개월 충족 / 지역 밖 요건 없음 / 주소 없음 미충족", () => {
    expect(r("1168010100", 23)).toBe("unmet");
    expect(r("1168010100", 24)).toBe("met");
    expect(r("2711010100", 0)).toBe("not_capital_newtown");
    expect(r(undefined, 0)).toBe("unmet");
    expect(r("4113510100", 0)).toBe("unmet");
  });
  it("2011-06-03 이후 양도는 이 요건이 없다(조정대상지역 연혁으로)", () => {
    expect(r("1168010100", 0, "2011-06-03")).toBe("not_regulated");
  });
});

describe("N-1 판정 보류 고지 — 거주요건 때문에 과세될 때 · 소재지를 확정하지 못했을 때만", () => {
  const RULES = { one_house_exemption: RULE, temporary_two_house: { disposalDeadlineYears: 3 } } as never;
  const ids = (regionCode: string | undefined, months: number) =>
    collectEraUndetermined(
      {
        propertyType: "housing",
        isOneHousehold: true,
        acquisitionDate: D("2000-07-22"),
        transferDate: D("2008-01-16"),
        residencePeriodMonths: months,
        householdHousingCount: 1,
        regionCode,
      } as never,
      RULES,
      false,
    ).map((u) => u.id);
  const N = "154-1-capital-newtown-location-unverified";
  it("주소 없음 · 신도시 시·구 → 고지 / 서울(확정) · 지역 밖 · 거주 충족 → 없음", () => {
    expect(ids(undefined, 0)).toContain(N);
    expect(ids("4113510100", 0)).toContain(N);
    expect(ids("1168010100", 0)).not.toContain(N);
    expect(ids("2711010100", 0)).not.toContain(N);
    expect(ids(undefined, 24)).not.toContain(N);
  });
});
