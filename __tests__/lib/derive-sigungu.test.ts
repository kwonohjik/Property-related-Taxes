/**
 * deriveSigunguFromAddress — 토지 필지 시군구 자동 채움 anchor.
 * Plan: docs/00-pm/comprehensive-land-parcel-address-search.plan.md §A·6
 */
import { describe, it, expect } from "vitest";
import { deriveSigunguFromAddress } from "../../lib/utils/derive-sigungu";

describe("deriveSigunguFromAddress", () => {
  it("서울 자치구 → 구 단위", () => {
    expect(deriveSigunguFromAddress("서울특별시 송파구 올림픽로 300")).toBe("송파구");
    expect(deriveSigunguFromAddress("서울특별시 서초구 반포대로 58")).toBe("서초구");
  });

  it("일반구(시+구) → 2단어 결합", () => {
    expect(deriveSigunguFromAddress("경기도 성남시 수정구 산성대로 451")).toBe("성남시 수정구");
  });

  it("군 단위", () => {
    expect(deriveSigunguFromAddress("강원도 평창군 대관령면")).toBe("평창군");
  });

  it("시 단위(구 없음)", () => {
    expect(deriveSigunguFromAddress("경기도 용인시 처인구 중부대로")).toBe("용인시 처인구");
  });

  it("빈/불완전 입력 → null", () => {
    expect(deriveSigunguFromAddress("")).toBeNull();
    expect(deriveSigunguFromAddress(undefined)).toBeNull();
    expect(deriveSigunguFromAddress("서울특별시")).toBeNull(); // 시군구 없음
  });
});
