/**
 * NBL2611-V6-PU07 Pre-Do anchor — 수입금액비율 토지가액 자동조회 연도.
 *
 * 법령(KoreanLaw MCP 확인 2026-11-19):
 *  · 「소득세법 시행령」 §168의11④ — 「당해 과세기간의 토지가액」 = 당해 과세기간 종료일(과세기간 중 양도 시 양도일)의 기준시가.
 *    직전 과세기간의 토지가액은 같은 정의를 직전 과세기간에 적용한다 → 직전 과세기간 종료일(전년 12.31.)의 기준시가.
 *  · 「부동산 가격공시에 관한 법률 시행령」 §21① — 개별공시지가는 매년 5월 31일까지 결정·공시한다.
 *  ⇒ 직전 값의 공시연도 = 양도연도 − 1 (12.31.은 그 해 5.31. 공시 이후). 양도일이 1~5월이면 당해(양도일 시점 = 전년 공시)와
 *    직전이 **같은 해** 공시지가다. 종전에는 직전을 당해 − 1(전전년)로 해 1~5월 양도분에 전전년 공시지가를 채웠다.
 */
import { describe, it, expect } from "vitest";
import { resolveNblLandValueYears } from "@/lib/calc/nbl-land-zone";

describe("resolveNblLandValueYears — 1~5월 양도분 직전 연도", () => {
  it("2026-02-18 양도: 당해 2025(양도일 시점 공시), 직전 2025 (12.31. 2025 기준시가) — 전전년 2024가 아니다", () => {
    expect(resolveNblLandValueYears("2026-02-18")).toEqual({ currentYear: 2025, priorYear: 2025 });
  });
  it("2026-05-31 양도(공시일 당일 = 미공시 취급): 당해 2025, 직전 2025", () => {
    expect(resolveNblLandValueYears("2026-05-31")).toEqual({ currentYear: 2025, priorYear: 2025 });
  });
  it("2026-01-01 양도: 당해 2025, 직전 2025", () => {
    expect(resolveNblLandValueYears("2026-01-01")).toEqual({ currentYear: 2025, priorYear: 2025 });
  });
});

describe("resolveNblLandValueYears — 6~12월 양도분은 종전과 같다(회귀 방어)", () => {
  it("2026-06-01 양도: 당해 2026, 직전 2025", () => {
    expect(resolveNblLandValueYears("2026-06-01")).toEqual({ currentYear: 2026, priorYear: 2025 });
  });
  it("2026-12-31 양도: 당해 2026, 직전 2025", () => {
    expect(resolveNblLandValueYears("2026-12-31")).toEqual({ currentYear: 2026, priorYear: 2025 });
  });
});
