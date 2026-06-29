/**
 * 소재지 검색 결과 관련도 정렬 — anchor 테스트
 *
 * 계획서: docs/00-pm/address-search-relevance-ranking.plan.md §6
 * 핵심 버그(이미지 4·5): "내동 6-20" 검색 시 정확 지번이 맨 아래로 밀림.
 */

import { describe, it, expect } from "vitest";
import { rankAddressResults, type RankableAddress } from "@/lib/address/rank-address-results";

/** 이미지 4·5 재현 데이터 — 라우트가 만드는 road-first 순서 그대로 */
const NAEDONG_ITEMS: RankableAddress[] = [
  { road: "경상남도 김해시 금관대로1341번길 6-20", jibun: "내동 646" },
  { road: "인천광역시 중구 자유공원로27번길 6-20", jibun: "내동 2-15" },
  { road: "경기도 남양주시 식송2로 6-20", jibun: "별내동 1129-2" },
  { road: "경기도 성남시 분당구 발이봉북로35번길 6-20", jibun: "수내동 116-11" },
  { road: "경기도 시흥시 금오로212번길 6-20", jibun: "무지내동 149-31" },
  { road: "경상북도 영천시 조밭골길 6-20", jibun: "성내동 88" },
  { road: "대구광역시 북구 칠곡중앙대로110길 6-20", jibun: "읍내동 789-9" },
  { road: "자유공원로23번길 4", jibun: "인천광역시 중구 내동 6-20" },
];

describe("rankAddressResults", () => {
  it("A1: '내동 6-20' → 정확 지번(인천 중구 내동 6-20)이 맨 위", () => {
    const ranked = rankAddressResults("내동 6-20", NAEDONG_ITEMS);
    expect(ranked[0].jibun).toBe("인천광역시 중구 내동 6-20");
  });

  it("A2: '내동 646' → 번지 646인 동명 항목이 맨 위", () => {
    const ranked = rankAddressResults("내동 646", NAEDONG_ITEMS);
    expect(ranked[0].jibun).toBe("내동 646");
  });

  it("A3: 도로명 질의 '자유공원로 23-4'(전 항목 점수 0) → 입력 순서 보존", () => {
    const ranked = rankAddressResults("자유공원로 23-4", NAEDONG_ITEMS);
    expect(ranked.map((r) => r.jibun)).toEqual(NAEDONG_ITEMS.map((r) => r.jibun));
  });

  it("A4: '별내동 1129-2' → 별내동 항목이 맨 위, '내동' 항목은 하위(별내동⊃내동 오매칭 방지)", () => {
    const ranked = rankAddressResults("별내동 1129-2", NAEDONG_ITEMS);
    expect(ranked[0].jibun).toBe("별내동 1129-2");
    const naedong646Idx = ranked.findIndex((r) => r.jibun === "내동 646");
    expect(naedong646Idx).toBeGreaterThan(0);
  });

  it("A5: 빈/공백/1글자 질의 → 입력 순서 그대로(불변)", () => {
    for (const q of ["", "   ", "내"]) {
      const ranked = rankAddressResults(q, NAEDONG_ITEMS);
      expect(ranked.map((r) => r.jibun)).toEqual(NAEDONG_ITEMS.map((r) => r.jibun));
    }
  });

  it("A6: 동점 구간 → 원래(road-first) 순서 보존(stable)", () => {
    // '내동'만 입력 → 동명 일치 항목들이 모두 +100 동점. 입력 순서 유지되어야.
    const onlyNaedong: RankableAddress[] = [
      { road: "A로 1", jibun: "내동 10" },
      { road: "B로 2", jibun: "내동 20" },
      { road: "C로 3", jibun: "내동 30" },
    ];
    const ranked = rankAddressResults("내동", onlyNaedong);
    expect(ranked.map((r) => r.jibun)).toEqual(["내동 10", "내동 20", "내동 30"]);
  });

  it("입력 배열을 변형하지 않는다(불변)", () => {
    const copy = [...NAEDONG_ITEMS];
    rankAddressResults("내동 6-20", NAEDONG_ITEMS);
    expect(NAEDONG_ITEMS).toEqual(copy);
  });

  it("을지로N가 등 숫자 섞인 도로명 — 오작동 없이 안전 처리(점수 0 폴백)", () => {
    const items: RankableAddress[] = [
      { road: "서울 중구 을지로 100", jibun: "을지로3가 100" },
      { road: "서울 중구 을지로 200", jibun: "을지로3가 200" },
    ];
    // 크래시 없이 배열 반환, 길이 보존
    const ranked = rankAddressResults("을지로3가 100", items);
    expect(ranked).toHaveLength(2);
  });
});
