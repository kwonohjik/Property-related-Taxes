/**
 * Phase B-5 유닛 테스트 — urban-area.ts (지목별 도시지역 판정)
 */
import { describe, it, expect } from "vitest";
import {
  isUrbanForFarmland,
  isUrbanForPasture,
  isUrbanForForest,
  isUrbanForHousing,
  getHousingMultiplier,
} from "@/lib/tax-engine/non-business-land/urban-area";

describe("isUrbanForFarmland — 주·상·공만 (녹지·개발제한 제외)", () => {
  it("일반주거 → 도시지역", () => {
    expect(isUrbanForFarmland("general_residential")).toBe(true);
  });
  it("상업 → 도시지역", () => {
    expect(isUrbanForFarmland("commercial")).toBe(true);
  });
  it("녹지 → 비도시 (농지 도시지역 아님)", () => {
    expect(isUrbanForFarmland("green")).toBe(false);
  });
  it("농림 → 비도시", () => {
    expect(isUrbanForFarmland("agriculture_forest")).toBe(false);
  });
});

describe("isUrbanForPasture — 2008.2.21 경계", () => {
  it("2008.2.21 이후 + 녹지 → 비도시", () => {
    expect(isUrbanForPasture("green", new Date("2010-01-01"))).toBe(false);
  });
  it("2008.2.21 이전 + 녹지 → 도시지역 (레거시)", () => {
    expect(isUrbanForPasture("green", new Date("2007-01-01"))).toBe(true);
  });
  it("2008.2.21 이후 + 상업 → 도시지역", () => {
    expect(isUrbanForPasture("commercial", new Date("2020-01-01"))).toBe(true);
  });
});

describe("isUrbanForForest — 주·상·공 + 녹지", () => {
  it("녹지 → 도시지역 (임야만)", () => {
    expect(isUrbanForForest("green")).toBe(true);
  });
  it("관리지역 → 비도시", () => {
    expect(isUrbanForForest("management")).toBe(false);
  });
});

describe("getHousingMultiplier §168-12", () => {
  it("수도권 주·상·공 → 3배", () => {
    const r = getHousingMultiplier("general_residential", true);
    expect(r.multiplier).toBe(3);
  });
  it("수도권 녹지 → 5배", () => {
    const r = getHousingMultiplier("green", true);
    expect(r.multiplier).toBe(5);
  });
  it("수도권 밖 상업 → 5배", () => {
    const r = getHousingMultiplier("commercial", false);
    expect(r.multiplier).toBe(5);
  });
  it("관리지역 (도시 외) → 10배", () => {
    const r = getHousingMultiplier("management", false);
    expect(r.multiplier).toBe(10);
  });
});

describe("isUrbanForHousing", () => {
  it("미계획지역 → 도시지역 (주택 판정)", () => {
    expect(isUrbanForHousing("unplanned")).toBe(true);
  });
  it("자연환경보전 → 비도시", () => {
    expect(isUrbanForHousing("natural_env")).toBe(false);
  });
});
