import { describe, it, expect } from "vitest";
import { round2, residualArea } from "@/lib/tax-engine/area-utils";

/**
 * anchor — 면적 안분 공통 유틸 (전 세목).
 * 규칙: ① 소수점 3째 자리에서 반올림 → 2자리 확정 ② 마지막 항목은 잔액 흡수.
 */
describe("round2 — 소수점 3째 자리 반올림", () => {
  it("A1: 327.610475 → 327.61 (사용자 제시 예시)", () => {
    expect(round2(327.610475)).toBe(327.61);
  });

  it("A2: 76.508 → 76.51 (표시/계산 드리프트 회귀)", () => {
    expect(round2(76.508)).toBe(76.51);
  });

  it("A3: 3째 자리 5 → 올림", () => {
    expect(round2(33.335)).toBe(33.34);
  });

  it("A4: 이미 2자리면 불변", () => {
    expect(round2(610.66)).toBe(610.66);
  });
});

describe("residualArea — 마지막 항목 잔액 흡수", () => {
  it("B1: 사용자 제시 예시 — 전체 610.66, 주택 327.61 → 상가 283.05", () => {
    const residential = round2(327.610475);
    const commercial = residualArea(610.66, residential);
    expect(residential).toBe(327.61);
    expect(commercial).toBe(283.05);
    // 합 단언은 round2 경유 — 327.61 + 283.05 는 float 덧셈으로 610.6600000000001.
    // 표시는 각 항목이 toFixed(2)이므로 무해하나, 합 비교 시에는 round2 필요.
    expect(round2(residential + commercial)).toBe(610.66);
  });

  it("B2: 3등분 드리프트 흡수 — 100㎡ / 3 → 마지막이 33.34", () => {
    const a = round2(100 / 3); // 33.33
    const b = round2(100 / 3); // 33.33
    const c = residualArea(100, a, b);
    expect([a, b, c]).toEqual([33.33, 33.33, 33.34]);
    expect(a + b + c).toBe(100);
  });

  it("B3: 부동소수 잔여 없이 정확히 떨어짐 (float 아티팩트 방지)", () => {
    // 100 − 66.66 은 순수 뺄셈 시 33.340000000000003
    expect(residualArea(100, 33.33, 33.33)).toBe(33.34);
  });

  it("B4: 양쪽 반올림이 올라가는 .5 경계 — 합이 전체를 초과하지 않음", () => {
    // 168.3 × 비율 = 90.285 → round2 = 90.29. 상가를 비율로 직접 계산하면 78.015 → 78.02 (합 168.31).
    const residential = round2(90.285);
    expect(residential).toBe(90.29);
    expect(residualArea(168.3, residential)).toBe(78.01);
    expect(residential + residualArea(168.3, residential)).toBe(168.3);
  });

  it("B5: 단일 항목 = 전체", () => {
    expect(residualArea(200, 0)).toBe(200);
  });
});
