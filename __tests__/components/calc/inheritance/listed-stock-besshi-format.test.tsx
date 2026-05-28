/**
 * 평가조서(을) 표시 포맷 anchor — 이미지 12 정합.
 *
 * 1. 월일: "07월 06일" → "07-06"
 * 2. 비영업일 라벨: "일요일 · 거래일 제외" → "일요일"
 */

import { describe, it, expect } from "vitest";
import { stripTradingExclusionSuffix } from "@/components/calc/inheritance/listed-stock/besshi/listed-besshi-constants";
import { splitTwoMonthSurroundingByMonthGroup } from "@/lib/kiwoom/two-month-grouping";
import { buildTwoMonthSurroundingSlots } from "@/lib/kiwoom/calendar";

describe("stripTradingExclusionSuffix — 비영업일 라벨 단순화", () => {
  it.each([
    ["일요일 · 거래일 제외", "일요일"],
    ["토요일 · 거래일 제외", "토요일"],
    ["휴장일 · 거래일 제외", "휴장일"],
    ["일요일", "일요일"],
    ["기간외", "기간외"],
    ["", ""],
  ])("'%s' → '%s'", (input, expected) => {
    expect(stripTradingExclusionSuffix(input)).toBe(expected);
  });

  it("undefined/null 안전 처리", () => {
    expect(stripTradingExclusionSuffix(undefined)).toBe("");
    expect(stripTradingExclusionSuffix(null)).toBe("");
  });
});

describe("formatMonthDay — 월일 MM-DD 형식 (이미지 12 정합)", () => {
  it("월일은 'MM-DD' 형식으로 출력", () => {
    const slots = buildTwoMonthSurroundingSlots("2022-07-06");
    const g = splitTwoMonthSurroundingByMonthGroup(
      slots,
      slots.map(() => null),
      slots.map(() => ""),
      "2022-07-06",
    );
    expect(g.beforeM1[0].monthDay).toBe("07-06"); // D 자체
    expect(g.beforeM1[30].monthDay).toBe("06-06"); // D-30
    expect(g.afterM1[30].monthDay).toBe("08-05"); // D+30
    expect(g.afterM2[0].monthDay).toBe("08-06"); // D+31
  });
});
