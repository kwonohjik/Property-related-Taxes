/**
 * impact-map 단위 테스트 — 도메인별 역방향 인용 수집.
 * searchDecisions mock. 실 API 검증은 anchor(소득세법 §89 39건 3도메인).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/korean-law/client", () => ({
  searchDecisions: vi.fn(),
}));
// 캐시 우회
vi.mock("@/lib/korean-law/client-core", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/client-core")>();
  return { ...actual, readCache: vi.fn(async () => null), writeCache: vi.fn(async () => undefined) };
});

import { searchDecisions } from "@/lib/korean-law/client";
import { buildImpactMap, IMPACT_DOMAINS } from "@/lib/korean-law/impact-map";

const mockSearch = searchDecisions as ReturnType<typeof vi.fn>;

function page(items: number, total: number, domain: string) {
  return {
    items: Array.from({ length: items }, (_, i) => ({
      id: `${domain}-${i}`,
      domain,
      caseNo: `${domain}-case-${i}`,
      title: `${domain} 판례 ${i}`,
      court: "법원",
      date: "20240101",
    })),
    totalCount: total,
    page: 1,
    pageSize: 5,
  };
}

describe("impact-map", () => {
  beforeEach(() => mockSearch.mockReset());

  it("4개 도메인 탐색 (IMPACT_DOMAINS 상수)", () => {
    expect(IMPACT_DOMAINS).toEqual(["prec", "detc", "ppc", "ordin"]);
  });

  it("도메인별 그룹 + totalCitations 합산", async () => {
    mockSearch.mockImplementation(async (_q: string, domain: string) => {
      if (domain === "prec") return page(2, 2, "prec");
      if (domain === "detc") return page(5, 7, "detc");
      if (domain === "ordin") return page(5, 30, "ordin");
      return page(0, 0, domain); // ppc 0건
    });

    const r = await buildImpactMap("소득세법", "제89조");
    expect(r.citationQuery).toBe("소득세법 제89조");
    // 0건(ppc) 도메인은 그룹에서 제외
    expect(r.groups.map((g) => g.domain)).toEqual(["prec", "detc", "ordin"]);
    expect(r.totalCitations).toBe(2 + 7 + 30);
    expect(r.groups[1].totalCount).toBe(7);
    expect(r.groups[1].items).toHaveLength(5);
  });

  it("별칭 해석 + 조문번호 정규화", async () => {
    mockSearch.mockResolvedValue(page(1, 1, "prec"));
    const r = await buildImpactMap("상증법", "22");
    expect(r.lawName).toBe("상속세및증여세법");
    expect(r.articleNo).toBe("제22조");
    expect(r.citationQuery).toBe("상속세및증여세법 제22조");
  });

  it("일부 도메인 실패해도 나머지 진행 (graceful)", async () => {
    mockSearch.mockImplementation(async (_q: string, domain: string) => {
      if (domain === "detc") throw new Error("도메인 장애");
      return page(1, 1, domain);
    });
    const r = await buildImpactMap("소득세법", "제89조");
    expect(r.groups.some((g) => g.domain === "detc")).toBe(false);
    expect(r.groups.length).toBe(3); // prec·ppc·ordin
  });

  it("전 도메인 0건 → 빈 groups", async () => {
    mockSearch.mockResolvedValue(page(0, 0, "x"));
    const r = await buildImpactMap("소득세법", "제89조");
    expect(r.groups).toHaveLength(0);
    expect(r.totalCitations).toBe(0);
  });
});
