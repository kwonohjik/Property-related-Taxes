/**
 * Phase B-4 유닛 테스트 — period-criteria.ts
 *
 * PDF p.1695 "기간기준 3가지 중 하나 충족" + 현행법 §168-6 OR 판정.
 */
import { describe, it, expect } from "vitest";
import {
  meetsPeriodCriteria,
  checkIncorporationGrace,
  getThresholdRatio,
} from "@/lib/tax-engine/non-business-land/period-criteria";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

describe("meetsPeriodCriteria 3기준 OR 판정", () => {
  it("① 직전 3년 중 730일 이상 사업용 → PASS", () => {
    const r = meetsPeriodCriteria(
      [{ start: d("2019-01-01"), end: d("2022-01-01") }], // 직전 3년 전체
      d("2015-01-01"),
      d("2022-01-01"),
      "farmland",
    );
    expect(r.meets).toBe(true);
    expect(r.criteriaUsed).toBe("3y-2y");
    expect(r.bizInLast3).toBeGreaterThanOrEqual(730);
  });

  it("② 직전 5년 중 1095일 이상 사업용 → PASS (① 미충족)", () => {
    // 15년 보유, 2017~2020 사업용 3년 (직전 5년 = 2017~2022)
    const r = meetsPeriodCriteria(
      [{ start: d("2017-01-01"), end: d("2020-01-01") }],
      d("2007-01-01"),
      d("2022-01-01"),
      "farmland",
    );
    expect(r.meets).toBe(true);
    expect(r.criteriaUsed).toBe("5y-3y");
    expect(r.bizInLast3).toBeLessThan(730);
    expect(r.bizInLast5).toBeGreaterThanOrEqual(1095);
  });

  it("③ 전체 보유 60% 이상 사업용 → PASS (①② 미충족)", () => {
    // 보유 10년, 사업용 앞 7년 (≈70%). 직전 3년 0일, 직전 5년 ≈ 2년 → ②도 미충족.
    const r = meetsPeriodCriteria(
      [{ start: d("2010-01-01"), end: d("2017-01-01") }], // ≈7년
      d("2010-01-01"),
      d("2020-01-01"),
      "farmland",
    );
    expect(r.meets).toBe(true);
    expect(r.criteriaUsed).toBe("ratio");
    expect(r.ratio).toBeGreaterThanOrEqual(0.6);
  });

  it("3기준 모두 미충족 → FAIL", () => {
    // 보유 10년, 사업용 앞 3년만 (30%)
    const r = meetsPeriodCriteria(
      [{ start: d("2010-01-01"), end: d("2013-01-01") }],
      d("2010-01-01"),
      d("2020-01-01"),
      "farmland",
    );
    expect(r.meets).toBe(false);
    expect(r.criteriaUsed).toBe("none");
    expect(r.criteria.rule2of3Years).toBe(false);
    expect(r.criteria.rule5Years).toBe(false);
    expect(r.criteria.rule80Percent).toBe(false);
  });

  it("경계 — 직전 3년 중 정확히 730일 → PASS", () => {
    // 2020-01-01 ~ 2021-12-31 = 정확히 730일
    const r = meetsPeriodCriteria(
      [{ start: d("2020-01-01"), end: d("2021-12-31") }],
      d("2015-01-01"),
      d("2022-12-31"),
      "farmland",
    );
    expect(r.bizInLast3).toBe(730);
    expect(r.meets).toBe(true);
  });

  it("경계 — 직전 3년 중 729일 → FAIL (①)", () => {
    const r = meetsPeriodCriteria(
      [{ start: d("2020-01-02"), end: d("2021-12-31") }], // 729일
      d("2015-01-01"),
      d("2022-12-31"),
      "farmland",
    );
    expect(r.bizInLast3).toBe(729);
    expect(r.criteria.rule2of3Years).toBe(false);
  });

  it("농지·임야·목장 2015.2.2 이전 양도 → threshold 0.8", () => {
    const threshold = getThresholdRatio(d("2015-02-01"), "farmland", DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(threshold).toBe(0.8);
  });

  it("농지·임야·목장 2015.2.2 이후 양도 → threshold 0.6", () => {
    const threshold = getThresholdRatio(d("2015-02-02"), "farmland", DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(threshold).toBe(0.6);
  });

  it("기타 지목은 2015.2.2 이전이어도 0.6 (농·임·목만 레거시 적용)", () => {
    const threshold = getThresholdRatio(d("2014-01-01"), "other_land", DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(threshold).toBe(0.6);
  });

  it("사업용 비율 0% → 3기준 모두 FAIL", () => {
    const r = meetsPeriodCriteria([], d("2015-01-01"), d("2022-01-01"), "farmland");
    expect(r.meets).toBe(false);
    expect(r.ratio).toBe(0);
  });

  it("소유기간 1년 미만 + 사업용 60%+ → ratio 기준 PASS", () => {
    // 보유 180일, 사업용 120일 = 66.67%. 직전 3년 창 = 보유 전체 = 120일 (730 미달)
    const r = meetsPeriodCriteria(
      [{ start: d("2022-01-02"), end: d("2022-05-02") }], // 120일
      d("2022-01-01"),
      d("2022-06-30"), // 180일
      "farmland",
    );
    expect(r.meets).toBe(true);
    expect(r.criteriaUsed).toBe("ratio");
    expect(r.ratio).toBeGreaterThanOrEqual(0.6);
  });
});

describe("checkIncorporationGrace", () => {
  it("편입일 미제공 → 미적용", () => {
    const g = checkIncorporationGrace(undefined, d("2022-01-01"));
    expect(g.isApplied).toBe(false);
  });

  it("2015.2.2 이후 양도 → 3년 유예", () => {
    const g = checkIncorporationGrace(d("2020-01-01"), d("2022-01-01"));
    expect(g.graceYears).toBe(3);
    expect(g.isApplied).toBe(true);
  });

  it("2015.2.2 이전 양도 → 2년 유예", () => {
    const g = checkIncorporationGrace(d("2010-01-01"), d("2012-01-01"));
    expect(g.graceYears).toBe(2);
    expect(g.isApplied).toBe(true);
  });

  it("편입일로부터 3년 경과 → 미적용", () => {
    const g = checkIncorporationGrace(d("2015-01-01"), d("2020-01-01"));
    expect(g.isApplied).toBe(false);
  });
});
