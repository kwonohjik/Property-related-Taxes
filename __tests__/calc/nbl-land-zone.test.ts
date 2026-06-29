import { describe, it, expect } from "vitest";
import { isUrbanZone } from "@/lib/calc/nbl-land-zone";

// vWorld 토지특성정보 prposArea1Nm(용도지역명) → 도시지역 여부.
// 도시지역 = 주거·상업·공업·녹지 / 비도시 = 관리·농림·자연환경보전.
describe("isUrbanZone", () => {
  it.each([
    ["일반상업지역", true],
    ["제2종일반주거지역", true],
    ["제1종전용주거지역", true],
    ["준주거지역", true],
    ["준공업지역", true],
    ["자연녹지지역", true],
    ["보전녹지지역", true], // 녹지 = 도시지역 (관리 키워드 미포함)
  ] as const)("도시지역: %s", (zone, expected) => {
    expect(isUrbanZone(zone)).toBe(expected);
  });

  it.each([
    ["보전관리지역", false],
    ["계획관리지역", false],
    ["생산관리지역", false],
    ["농림지역", false],
    ["자연환경보전지역", false],
    ["", false],
  ] as const)("비도시지역: %s", (zone, expected) => {
    expect(isUrbanZone(zone)).toBe(expected);
  });
});
