/**
 * impact-map 단위 테스트 — 도메인별 역방향 인용 수집.
 * searchDecisions mock. 실 API 검증은 anchor(소득세법 §89 39건 3도메인).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/korean-law/client", () => ({
  searchDecisions: vi.fn(),
  searchLaw: vi.fn(),
}));
// 캐시 우회
vi.mock("@/lib/korean-law/client-core", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/client-core")>();
  // ⚠ 부분 mock 은 이름 단위 — 캐시 진입점이 늘면 스텁을 빠져나가 실제 캐시를 건드린다.
  return {
    ...actual,
    readCache: vi.fn(async () => null),
    writeCache: vi.fn(async () => undefined),
    readCacheNonEmpty: vi.fn(async () => null),
    writeCacheNonEmpty: vi.fn(async () => undefined),
  };
});

import { searchDecisions, searchLaw } from "@/lib/korean-law/client";
import { buildImpactMap, IMPACT_DOMAINS } from "@/lib/korean-law/impact-map";

const mockSearch = searchDecisions as ReturnType<typeof vi.fn>;
const mockSearchLaw = searchLaw as ReturnType<typeof vi.fn>;

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
  beforeEach(() => {
    mockSearch.mockReset();
    mockSearchLaw.mockReset();
    mockSearchLaw.mockResolvedValue(null);
  });

  it("4개 도메인 탐색 (IMPACT_DOMAINS 상수)", () => {
    // 법령해석례의 target 은 expc 다 — detc 는 헌재결정례(types.ts 주석·실측).
    // 종전 상수는 "법령해석례"를 의도하면서 detc 를 넣어 헌재결정례를 뒤지고 있었다.
    // ppc 는 조세심판원인 줄 알았으나 개인정보보호위원회였다 — 조세심판원은 ttSpecialDecc.
    expect(IMPACT_DOMAINS).toEqual(["prec", "ttSpecialDecc", "expc", "ordin"]);
  });

  it("본문 검색(bodySearch) + 공식 법령명 구절(큰따옴표)로 조회한다", async () => {
    // 별칭 해석은 띄어쓰기를 지운다 — 본문 구절은 공식 명칭으로만 걸린다(실측 0건 vs 5건).
    mockSearchLaw.mockResolvedValue({ lawName: "상속세 및 증여세법", lawId: "1", mst: "2" });
    mockSearch.mockResolvedValue(page(1, 1, "prec"));
    const r = await buildImpactMap("상증법", "22");
    for (const call of mockSearch.mock.calls) {
      expect(call[0]).toBe('"상속세 및 증여세법 제22조"');
      expect(call[4]).toEqual({ bodySearch: true });
    }
    expect(mockSearch.mock.calls.map((c) => c[1])).toEqual(IMPACT_DOMAINS);
    expect(r.citationQuery).toBe("상속세및증여세법 제22조"); // 표시값은 종전 그대로
  });

  it("법령 검색이 실패하면 별칭 해석 이름으로 구절을 만든다(조회 자체는 계속)", async () => {
    mockSearchLaw.mockRejectedValue(new Error("upstream"));
    mockSearch.mockResolvedValue(page(1, 1, "prec"));
    await buildImpactMap("소득세법", "89");
    expect(mockSearch.mock.calls[0][0]).toBe('"소득세법 제89조"');
  });

  it("도메인별 그룹 + totalCitations 합산", async () => {
    mockSearch.mockImplementation(async (_q: string, domain: string) => {
      if (domain === "prec") return page(2, 2, "prec");
      if (domain === "expc") return page(5, 7, "expc");
      return page(0, 0, domain); // ordin 은 아래에서 0건 처리 확인용
    });

    const r = await buildImpactMap("소득세법", "제89조");
    expect(r.citationQuery).toBe("소득세법 제89조");
    // 0건(ordin) 도메인은 그룹에서 제외
    expect(r.groups.map((g) => g.domain)).toEqual(["prec", "expc"]);
    expect(r.totalCitations).toBe(2 + 7);
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
      if (domain === "expc") throw new Error("도메인 장애");
      return page(1, 1, domain);
    });
    const r = await buildImpactMap("소득세법", "제89조");
    expect(r.groups.some((g) => g.domain === "expc")).toBe(false);
    expect(r.groups.length).toBe(3); // prec·ttSpecialDecc·ordin
  });

  it("전 도메인 0건 → 빈 groups", async () => {
    mockSearch.mockResolvedValue(page(0, 0, "x"));
    const r = await buildImpactMap("소득세법", "제89조");
    expect(r.groups).toHaveLength(0);
    expect(r.totalCitations).toBe(0);
  });
});
