/**
 * anchor — 신고서 표의 보유 개월 수(`holdingMonthsFromDates`)도 §95④ **초일 산입**이다 (A1a 후속)
 *
 * 「소득세법」 §95④ 「자산의 보유기간은 그 자산의 취득일부터 양도일까지로 한다」 — 엔진
 * `calculateHoldingPeriod`는 A1a(#1784)에서 초일 산입으로 바뀌었는데 신고서 표 헬퍼는 종전
 * (초일 불산입) 계산을 그대로 두어, 같은 자산의 보유연수가 표와 엔진에서 하루 차이로 갈렸다
 * (예: 2017-06-01 취득·2020-05-31 양도 — 엔진 3년, 표 2년 11개월 → 장특 보유분 안분이 어긋난다).
 */
import { describe, it, expect } from "vitest";
import { holdingMonthsFromDates } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";

const months = (a: string, t: string) => {
  const h = calculateHoldingPeriod(new Date(a), new Date(t));
  return h.years * 12 + h.months;
};

describe("holdingMonthsFromDates — §95④ 초일 산입", () => {
  it("★ 응당일 전날 양도 = 만 N년 (2017-06-01 → 2020-05-31 = 36개월)", () => {
    expect(holdingMonthsFromDates("2017-06-01", "2020-05-31")).toBe(36);
  });
  it("그 하루 전(2020-05-30)은 35개월 (부정 짝)", () => {
    expect(holdingMonthsFromDates("2017-06-01", "2020-05-30")).toBe(35);
  });
  it("엔진 `calculateHoldingPeriod`와 같은 값", () => {
    for (const [a, t] of [
      ["2020-01-01", "2020-12-31"],
      ["2020-01-02", "2021-01-01"],
      ["2019-02-28", "2020-02-28"],
      ["2020-02-29", "2021-02-27"],
      ["2020-02-29", "2021-02-28"],
      ["2015-03-31", "2024-02-29"],
    ] as const) {
      expect(holdingMonthsFromDates(a, t)).toBe(months(a, t));
    }
  });
  it("입력이 없거나 역전되면 0", () => {
    expect(holdingMonthsFromDates(undefined, "2020-01-01")).toBe(0);
    expect(holdingMonthsFromDates("2021-01-01", "2020-01-01")).toBe(0);
  });
});
