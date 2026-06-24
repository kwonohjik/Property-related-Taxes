/**
 * Pre-Do anchor — 재산세 도시지역분(§112) 용도지역 자동조회 매핑.
 *
 * 계획서: docs/00-pm/property-urban-area-auto-lookup.plan.md §4·§7
 * 실측 근거(2026-06-25, V-World LT_C_UQ111): 역삼동→제3종일반주거지역,
 *   해운대→일반상업지역, 가평→자연녹지지역(녹지=도시지역).
 *
 * 핵심 회귀 방지 anchor: "자연녹지지역"은 국토계획법 §36①1호 라목상
 *   도시지역(녹지지역)에 포함 → urban. (직관 반대 — 반드시 고정)
 */

import { describe, it, expect } from "vitest";
import { classifyUrbanArea, pickLatestZone } from "@/lib/geo/land-use-zone";

describe("classifyUrbanArea — 국토계획법 §36 용도지역 → 도시지역 판정", () => {
  it("주거지역(제3종일반) = urban", () => {
    expect(classifyUrbanArea("제3종일반주거지역")).toBe("urban");
  });
  it("상업지역(일반상업) = urban", () => {
    expect(classifyUrbanArea("일반상업지역")).toBe("urban");
  });
  it("공업지역(준공업) = urban", () => {
    expect(classifyUrbanArea("준공업지역")).toBe("urban");
  });
  // ★ 회귀 방지 핵심: 녹지지역도 도시지역
  it("녹지지역(자연녹지) = urban (녹지=도시지역, 직관 반대)", () => {
    expect(classifyUrbanArea("자연녹지지역")).toBe("urban");
  });
  it("관리지역(계획관리) = non_urban", () => {
    expect(classifyUrbanArea("계획관리지역")).toBe("non_urban");
  });
  it("농림지역 = non_urban", () => {
    expect(classifyUrbanArea("농림지역")).toBe("non_urban");
  });
  it("자연환경보전지역 = non_urban", () => {
    expect(classifyUrbanArea("자연환경보전지역")).toBe("non_urban");
  });
  it("빈 문자열 = unknown (제안 보류)", () => {
    expect(classifyUrbanArea("")).toBe("unknown");
  });
  it("공백만 = unknown", () => {
    expect(classifyUrbanArea("   ")).toBe("unknown");
  });
  it("미지정/알 수 없는 명칭 = unknown", () => {
    expect(classifyUrbanArea("지구단위계획구역")).toBe("unknown");
  });
});

describe("pickLatestZone — 다중 feature 중 대표 선별", () => {
  it("비어있지 않은 uname을 구버전 빈값보다 우선", () => {
    const picked = pickLatestZone([
      { uname: "", dyear: "2000" },
      { uname: "제3종일반주거지역", dyear: "2023" },
    ]);
    expect(picked?.uname).toBe("제3종일반주거지역");
  });
  it("둘 다 값 있으면 dyear 최신 우선", () => {
    const picked = pickLatestZone([
      { uname: "일반상업지역", dyear: "2018" },
      { uname: "중심상업지역", dyear: "2023" },
    ]);
    expect(picked?.uname).toBe("중심상업지역");
  });
  it("빈 배열 = null", () => {
    expect(pickLatestZone([])).toBeNull();
  });
});
