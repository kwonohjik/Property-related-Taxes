/**
 * Q-19 (b) · PR-22c — 1주택 판정 메뉴는 ④ 특수 배제 카드를 「담긴 값이 있을 때만」 연다. 「인구감소지역 소재 주택」을 **끈** 답(false)도
 * 엔진이 자동판정을 덮어 §71의2를 막는 담긴 값이라, 그 카드를 열어 되돌릴 수 있어야 한다(종전에는 true만 열었다).
 */
import { describe, it, expect } from "vitest";
import { houseEntrySpecialExclusionVisible } from "@/lib/calc/house-entry-judgment-scope";

describe("④ 카드 노출 — 판정 메뉴(중과 입력 닫힘)", () => {
  it("끈 답(false)이 있으면 연다 · 답이 없으면 닫는다 · 중과 화면은 항상 연다", () => {
    expect(houseEntrySpecialExclusionVisible({ isPopulationDeclineArea: false }, true)).toBe(true);
    expect(houseEntrySpecialExclusionVisible({ isPopulationDeclineArea: true }, true)).toBe(true);
    expect(houseEntrySpecialExclusionVisible({}, true)).toBe(false);
    expect(houseEntrySpecialExclusionVisible({}, false)).toBe(true);
  });
});
