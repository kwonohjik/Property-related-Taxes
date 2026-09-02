/**
 * Phase B-4 유닛 테스트 — period-criteria.ts
 *
 * 소득세법 시행령 §168조의6 — 소유기간 버킷별 "비사업용 기간 = 가·나·다 AND" 판정.
 * isBusiness = NOT(가 AND 나 AND 다). (갭 3d에서 구 OR-semantics → 법령정합 재구현)
 */
import { describe, it, expect } from "vitest";
import {
  meetsPeriodCriteria,
  checkIncorporationGrace,
  getThresholdRatio,
} from "@/lib/tax-engine/non-business-land/period-criteria";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

describe("meetsPeriodCriteria §168조의6 버킷별 가·나·다 판정", () => {
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

  it("② 15년 보유·사업용 3년(20%) → 비사업용 (§168조의6 1호 가·나·다 법령정합 재정렬)", () => {
    // 구 OR-semantics는 '직전5년 1095일 사업 → 사업용'으로 PASS 판정했으나, §168조의6 1호는
    // 가(직전5년 비사업 731일>730)·나(직전3년 비사업 731일>365)·다(전체 비사업 4383일>40% 2191)
    // 모두 충족 → 비사업용. 15년 보유에 20%만 사업이므로 명백히 비사업용.
    const r = meetsPeriodCriteria(
      [{ start: d("2017-01-01"), end: d("2020-01-01") }],
      d("2007-01-01"),
      d("2022-01-01"),
      "farmland",
    );
    expect(r.meets).toBe(false);
    expect(r.criteriaUsed).toBe("none");
    expect(r.ownershipBucket).toBe(1);
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

  it("경계 — 약 8년 보유·직전3년 730일 사업(전체 25%) → 비사업용 (§168조의6 1호 법령정합 재정렬)", () => {
    // 2020-01-01 ~ 2021-12-31 = 정확히 730일 사업. 약 8년(2920일) 보유.
    // 구 OR-semantics는 '직전3년 730일(2년) 사업 → 사업용'으로 PASS했으나, §168조의6 1호는
    // 직전3년 창(1096일) 중 비사업 366일>365(나목), 직전5년 비사업 1096일>730(가목),
    // 전체 비사업 2190일>40%(1168, 다목) 모두 충족 → 비사업용. 전체 25%만 사업.
    const r = meetsPeriodCriteria(
      [{ start: d("2020-01-01"), end: d("2021-12-31") }],
      d("2015-01-01"),
      d("2022-12-31"),
      "farmland",
    );
    expect(r.bizInLast3).toBe(730);
    expect(r.ownershipBucket).toBe(1);
    expect(r.meets).toBe(false);
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

  // 경계는 개정 시행일 **2015.02.03**이다 (대통령령 제26067호 — §168의6 각 호 다목이
  // 「소유기간의 100분의 20」에서 「100분의 40」으로. 2014.03.11. 시행본 본문 실측 확인).
  // 종전 테스트는 2015-02-02를 신법 쪽으로 고정해 **구법이 적용될 하루를 놓쳤다**.
  it("농지·임야·목장 2015.2.3. 전 양도 → threshold 0.8 (구법 「100분의 20」)", () => {
    const threshold = getThresholdRatio(d("2015-02-01"), "farmland", DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(threshold).toBe(0.8);
  });

  it("경계 — 시행일 직전일(2015-02-02) 양도까지 구법 0.8", () => {
    const threshold = getThresholdRatio(d("2015-02-02"), "farmland", DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(threshold).toBe(0.8);
  });

  it("경계 — 시행일(2015-02-03) 양도부터 현행 0.6", () => {
    const threshold = getThresholdRatio(d("2015-02-03"), "farmland", DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(threshold).toBe(0.6);
  });

  // ⚠️ 지목 한정(농·임·목만 레거시)은 두 시행본 본문에 근거가 없다 — 제26067호 부칙 경과조치
  //    확인 전까지 현행 동작을 그대로 고정한다(기타토지 0.6 = 납세자에게 유리한 쪽).
  it("기타 지목은 2015.2.3. 전이어도 0.6 (현행 구현 — 지목 한정 근거는 미확인)", () => {
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
