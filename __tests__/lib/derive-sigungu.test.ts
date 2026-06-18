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

  it("일반구(시+구) → 시 단위 축약 (재산세 합산 과세권자)", () => {
    expect(deriveSigunguFromAddress("경기도 성남시 수정구 산성대로 451")).toBe("성남시");
    expect(deriveSigunguFromAddress("경기도 용인시 기흥구 공세동")).toBe("용인시");
  });

  it("군 단위", () => {
    expect(deriveSigunguFromAddress("강원도 평창군 대관령면")).toBe("평창군");
  });

  it("일반구(용인시 처인구) → 시 단위", () => {
    expect(deriveSigunguFromAddress("경기도 용인시 처인구 중부대로")).toBe("용인시");
  });

  it("도로명 주소(시도·시군구 포함) → 시군구", () => {
    expect(deriveSigunguFromAddress("서울특별시 송파구 가락로 100 (석촌동)")).toBe("송파구");
  });

  it("Vworld 짧은 지번('석촌동 276-1') → null (시군구 없음 — 오추출 방어)", () => {
    expect(deriveSigunguFromAddress("석촌동 276-1")).toBeNull();
  });

  it("도로명·번지 토큰 → null (구/군/시 접미사 아님)", () => {
    expect(deriveSigunguFromAddress("서울특별시 가락로 100")).toBeNull(); // 두번째 토큰 '가락로'
    expect(deriveSigunguFromAddress("세종특별자치시 한누리대로 2130")).toBeNull(); // 세종 단층제
  });

  it("빈/불완전 입력 → null", () => {
    expect(deriveSigunguFromAddress("")).toBeNull();
    expect(deriveSigunguFromAddress(undefined)).toBeNull();
    expect(deriveSigunguFromAddress("서울특별시")).toBeNull(); // 시군구 없음
  });
});
