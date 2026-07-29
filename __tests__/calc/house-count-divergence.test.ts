import { describe, it, expect } from "vitest";
import {
  computeHouseCountDivergence,
  type HouseCountDivergenceInput,
} from "@/lib/calc/house-count-divergence";

/**
 * Anchor A — computeHouseCountDivergence 케이스 매트릭스(계획서 §4·§7).
 * 다주택 중과 ① 세대 보유 주택 수 ↔ ④ 목록 정합성 표시 로직.
 */

function house(acquisitionDate?: string): { acquisitionDate?: string } {
  return { acquisitionDate };
}

/** 기본: 주택 양도. 필요한 필드만 오버라이드. */
function input(over: Partial<HouseCountDivergenceInput>): HouseCountDivergenceInput {
  return {
    primaryKind: "housing",
    householdHousingCount: "1",
    houses: [],
    presaleRights: [],
    ...over,
  };
}

describe("computeHouseCountDivergence — anchor A", () => {
  it("A1: ④ 미입력·declared 1 → 미노출", () => {
    const r = computeHouseCountDivergence(input({ householdHousingCount: "1" }));
    expect(r.showPrecedence).toBe(false);
    expect(r.showMismatch).toBe(false);
  });

  it("A2: C4 사각 폐쇄 — declared 5, 다른주택 3 → 불일치 노출(structural 4)", () => {
    const r = computeHouseCountDivergence(
      input({
        householdHousingCount: "5",
        houses: [house("2020-01-01"), house("2021-01-01"), house("2022-01-01")],
      }),
    );
    expect(r.showPrecedence).toBe(true);
    expect(r.showMismatch).toBe(true);
    expect(r.structuralCount).toBe(4);
    expect(r.declared).toBe(5);
  });

  it("A3: declared 5, 다른주택 4 → 정확 일치·불일치 미노출", () => {
    const r = computeHouseCountDivergence(
      input({
        householdHousingCount: "5",
        houses: [house("2020-01-01"), house("2021-01-01"), house("2022-01-01"), house("2023-01-01")],
      }),
    );
    expect(r.showPrecedence).toBe(true);
    expect(r.showMismatch).toBe(false);
    expect(r.structuralCount).toBe(5);
  });

  it("A4: 취득일 미입력 행은 structural에서 제외 → 불일치 노출", () => {
    const r = computeHouseCountDivergence(
      input({
        householdHousingCount: "2",
        houses: [house(/* 미입력 */)],
      }),
    );
    // structural = 1(selling) + 0(미완성 행 제외) = 1, declared 2
    expect(r.structuralCount).toBe(1);
    expect(r.showMismatch).toBe(true);
  });

  it("A5: F1 게이트 — 입주권 양도(primaryKind≠housing)면 ④ 채워도 미노출", () => {
    const r = computeHouseCountDivergence(
      input({
        primaryKind: "right_to_move_in",
        householdHousingCount: "0",
        houses: [house("2020-01-01")],
      }),
    );
    expect(r.showPrecedence).toBe(false);
    expect(r.showMismatch).toBe(false);
  });

  it("A6: F7 분양권 제외 — declared 1, 주택 0 + 분양권 2 → structural 1, C-1만 노출", () => {
    const r = computeHouseCountDivergence(
      input({
        householdHousingCount: "1",
        houses: [],
        presaleRights: [{}, {}],
      }),
    );
    expect(r.showPrecedence).toBe(true); // 분양권만 입력해도 ④ 경로 진입
    expect(r.showMismatch).toBe(false); // 분양권은 structural 미포함 → 1===1
    expect(r.structuralCount).toBe(1);
  });
});
