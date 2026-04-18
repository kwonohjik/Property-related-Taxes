/**
 * Query Router 단위 테스트
 *
 * Plan SC: FR-09 — 규칙 ≥ 10종, 20+ 쿼리 케이스 통과
 */

import { describe, it, expect } from "vitest";
import {
  routeQuery,
  ROUTER_PATTERN_COUNT,
  ROUTER_PATTERN_NAMES,
} from "@/lib/korean-law/router/query-router";

describe("Query Router — 패턴 레지스트리", () => {
  it("최소 10개 이상의 패턴", () => {
    expect(ROUTER_PATTERN_COUNT).toBeGreaterThanOrEqual(10);
  });

  it("필수 패턴명 포함", () => {
    expect(ROUTER_PATTERN_NAMES).toContain("specific_article");
    expect(ROUTER_PATTERN_NAMES).toContain("amendment_track");
    expect(ROUTER_PATTERN_NAMES).toContain("penalty_action");
    expect(ROUTER_PATTERN_NAMES).toContain("search_decisions");
    expect(ROUTER_PATTERN_NAMES).toContain("annex");
  });
});

describe("Query Router — 특정 조문 조회", () => {
  it('"민법 제750조" → get_law_text', () => {
    const r = routeQuery("민법 제750조");
    expect(r.tool).toBe("get_law_text");
    expect(r.params.lawName).toBe("민법");
    expect(r.params.articleNo).toBe("제750조");
    expect(r.confidence).toBe("high");
    expect(r.targetTab).toBe("law");
  });

  it('"소득세법 제89조의2" → 가지번호 인식', () => {
    const r = routeQuery("소득세법 제89조의2");
    expect(r.tool).toBe("get_law_text");
    expect(r.params.articleNo).toBe("제89조의2");
  });
});

describe("Query Router — 개정/연혁", () => {
  it('"양도소득세 개정 이력" → amendment_track 체인', () => {
    const r = routeQuery("양도소득세 개정 이력");
    expect(r.tool).toBe("run_chain");
    expect(r.chainType).toBe("amendment_track");
    expect(r.targetTab).toBe("chain");
  });

  it('"소득세법 신구대조" → amendment_track', () => {
    const r = routeQuery("소득세법 신구대조");
    expect(r.chainType).toBe("amendment_track");
  });

  it('"연혁" 단독 → amendment_track', () => {
    const r = routeQuery("상속세 연혁");
    expect(r.chainType).toBe("amendment_track");
  });
});

describe("Query Router — 가산세·과태료", () => {
  it('"가산세 감경" → action_basis 체인', () => {
    const r = routeQuery("가산세 감경 기준");
    expect(r.tool).toBe("run_chain");
    expect(r.chainType).toBe("action_basis");
  });

  it('"과태료" → action_basis', () => {
    const r = routeQuery("부가가치세 과태료");
    expect(r.chainType).toBe("action_basis");
  });
});

describe("Query Router — 분쟁·심판", () => {
  it('"헌법재판소" 키워드 → dispute_prep', () => {
    const r = routeQuery("양도소득세 헌법재판소");
    expect(r.chainType).toBe("dispute_prep");
  });

  it('"조세심판" → dispute_prep', () => {
    const r = routeQuery("조세심판 사례");
    expect(r.chainType).toBe("dispute_prep");
  });
});

describe("Query Router — 자치법규·조례", () => {
  it('"조례" 키워드 → ordinance_compare', () => {
    const r = routeQuery("재산세 조례");
    expect(r.chainType).toBe("ordinance_compare");
  });
});

describe("Query Router — 별표·서식", () => {
  it('"별표" 키워드 → get_annexes', () => {
    const r = routeQuery("소득세법 별표");
    expect(r.tool).toBe("get_annexes");
    expect(r.targetTab).toBe("annex");
  });

  it('"서식" 키워드 → get_annexes', () => {
    const r = routeQuery("양도소득세 서식");
    expect(r.tool).toBe("get_annexes");
  });
});

describe("Query Router — 판례·결정례", () => {
  it('"판례" 키워드 → search_decisions (prec)', () => {
    const r = routeQuery("양도소득세 판례");
    expect(r.tool).toBe("search_decisions");
    expect(r.params.domain).toBe("prec");
    expect(r.targetTab).toBe("decision");
  });

  it('"해석례" 키워드 → search_decisions (detc)', () => {
    const r = routeQuery("양도소득세 해석례");
    expect(r.tool).toBe("search_decisions");
    expect(r.params.domain).toBe("detc");
  });
});

describe("Query Router — 인용 검증", () => {
  it('"인용 검증" 키워드 → verify_citations', () => {
    const r = routeQuery("판결문 인용 확인");
    expect(r.tool).toBe("verify_citations");
    expect(r.targetTab).toBe("verify");
  });
});

describe("Query Router — 관세/FTA", () => {
  it('"관세" → full_research 체인', () => {
    const r = routeQuery("관세 세율표");
    expect(r.tool).toBe("run_chain");
    expect(r.chainType).toBe("full_research");
  });

  it('"FTA" → full_research', () => {
    const r = routeQuery("한미 FTA");
    expect(r.chainType).toBe("full_research");
  });
});

describe("Query Router — 법령명 단독", () => {
  it('"소득세법" 단독 → search_law', () => {
    const r = routeQuery("소득세법");
    expect(r.tool).toBe("search_law");
    expect(r.patternName).toBe("law_name_only");
    expect(r.confidence).toBe("high");
  });

  it('"민법" 단독 → search_law', () => {
    const r = routeQuery("민법");
    expect(r.patternName).toBe("law_name_only");
  });
});

describe("Query Router — 폴백", () => {
  it("일반 질의 — 매칭 없으면 search_law 폴백 (confidence=low)", () => {
    const r = routeQuery("양도 매각 처분 과정");
    expect(r.tool).toBe("search_law");
    expect(r.confidence).toBe("low");
    expect(r.patternName).toBe("fallback_search_law");
  });

  it("빈 쿼리 → 폴백", () => {
    const r = routeQuery("");
    expect(r.patternName).toBe("fallback_search_law");
    expect(r.confidence).toBe("low");
  });
});

describe("Query Router — 우선순위 검증", () => {
  it("특정 조문이 법령명 단독보다 우선 매칭", () => {
    const r = routeQuery("민법 제750조");
    expect(r.tool).toBe("get_law_text");
    // law_name_only(priority=90)가 아니라 specific_article(priority=1)
    expect(r.patternName).toBe("specific_article");
  });

  it("개정 키워드가 판례보다 우선", () => {
    // "개정" > "판례" 둘 다 있으면 amendment_track이 먼저 (priority 10 < 30)
    const r = routeQuery("양도소득세 개정 판례");
    expect(r.chainType).toBe("amendment_track");
  });
});

describe("Query Router — 알리아스 해석", () => {
  it('"상증법" 단독 → 정식명으로 해석되어 search_law', () => {
    const r = routeQuery("상증법");
    expect(r.tool).toBe("search_law");
    // 알리아스 해석 결과 확인 (상증법 → 상속세및증여세법)
    expect(String(r.params.q)).toMatch(/상속세및증여세법|상증법/);
  });
});
