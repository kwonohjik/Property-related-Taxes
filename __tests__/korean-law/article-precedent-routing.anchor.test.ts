/**
 * 「소득세법 제89조 판례」 — 조문 + 판례 키워드가 함께 오면 판례 탭으로, 그 조문을 **본문에서 인용한** 결정을 찾는다.
 *
 * 종전: 조문 패턴(priority 1·2)이 판례 키워드(priority 30)보다 먼저 잡아 조문 팝업만 떴다.
 * 판례 탭으로 넘기더라도 질의를 그대로 보내면 0건이다 — DRF 는 search 미지정 시 **사건명**만 본다.
 *
 * 2026-10-04 실측(판례 prec):
 *   · `소득세법 제89조 판례` 사건명 검색 0건 · `소득세법 제89조` 사건명 3건
 *   · `"소득세법 제89조"` + search=2(본문, 구절 일치) **643건** (expc 11건 · ttSpecialDecc 28건)
 *   · 법령명은 공식 명칭이어야 걸린다 — `"상속세및증여세법 제22조"` 본문 0건 / `"상속세 및 증여세법 제22조"` 5건.
 *     별칭 해석(resolveLawAlias)은 띄어쓰기를 지우므로 서버가 법령 검색으로 공식 명칭을 확정한다.
 *   · search=2 는 detc·admrul·ftc·trty 에서도 오류 없이 동작했다(건수 증가 33→305 등).
 *
 * ⇒ 큰따옴표로 감싼 질의 = 「본문에서 구절 그대로」. 라우터가 그 형태로 넘기고, 화면에도 따옴표가 보이므로
 *    사용자가 다시 검색하거나 페이지를 넘겨도 같은 방식으로 찾는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/korean-law/client", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/client")>();
  return { ...actual, searchDecisions: vi.fn(), searchLaw: vi.fn() };
});

import { searchDecisions, searchLaw } from "@/lib/korean-law/client";
import { routeQuery } from "@/lib/korean-law/router/query-router";
import { GET } from "@/app/api/law/search-decisions/route";

const mockSearch = searchDecisions as ReturnType<typeof vi.fn>;
const mockLaw = searchLaw as ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mockSearch.mockResolvedValue({ items: [{ id: "1", title: "t" }], totalCount: 1, page: 1, pageSize: 10 });
});

const call = (q: string, domain = "prec") =>
  GET(new NextRequest(`http://localhost/api/law/search-decisions?q=${encodeURIComponent(q)}&domain=${domain}`));

describe("ROUTE — 조문 + 판례 키워드는 판례 탭으로", () => {
  it.each([
    ["소득세법 제89조 판례", '"소득세법 제89조"', "prec"],
    ["소득세법 89조 판례", '"소득세법 제89조"', "prec"],
    ["소득세법 제89조의2 판결", '"소득세법 제89조의2"', "prec"],
    ["소득세법 시행령 제154조 판례", '"소득세법 시행령 제154조"', "prec"],
    ["상증법 제22조 판례", '"상속세및증여세법 제22조"', "prec"],
    ["소득세법 제89조 해석례", '"소득세법 제89조"', "expc"],
  ])("ROUTE-1: %s → search_decisions, 구절 %s, %s", (query, q, domain) => {
    const r = routeQuery(query);
    expect(r.tool).toBe("search_decisions");
    expect(r.targetTab).toBe("decision");
    expect(r.params).toEqual({ q, domain });
  });

  it.each([
    ["소득세법 제89조", "specific_article"],
    ["소득세법 89조", "specific_article_no_je"],
    ["소득세법 제89조 영향", "impact_map"],
    ["소득세법 89조 개정", "amendment_article"],
  ])("ROUTE-2(긍정 짝): 판례 키워드가 없으면 그대로 — %s → %s", (query, name) => {
    expect(routeQuery(query).patternName).toBe(name);
  });

  it("ROUTE-3(긍정 짝): 조문 없는 판례 질의는 종전대로 따옴표 없이 사건명 검색", () => {
    expect(routeQuery("양도소득세 판례").params).toEqual({ q: "양도소득세 판례", domain: "prec" });
  });
});

describe("API — 큰따옴표 질의는 본문 구절 검색", () => {
  it("API-1: 따옴표 질의 → bodySearch, 조문 인용이면 법령명을 공식 명칭으로", async () => {
    mockLaw.mockResolvedValue({ lawName: "상속세 및 증여세법" });
    const res = await call('"상속세및증여세법 제22조"');
    expect(res.status).toBe(200);
    expect(mockLaw).toHaveBeenCalledWith("상속세및증여세법");
    const [q, domain, , , options] = mockSearch.mock.calls[0];
    expect(q).toBe('"상속세 및 증여세법 제22조"');
    expect(domain).toBe("prec");
    expect(options).toMatchObject({ bodySearch: true });
  });

  it("API-2: 법령 검색이 실패하면 입력한 이름 그대로 (검색 자체는 계속)", async () => {
    mockLaw.mockRejectedValue(new Error("upstream"));
    await call('"소득세법 제89조"');
    expect(mockSearch.mock.calls[0][0]).toBe('"소득세법 제89조"');
    expect(mockSearch.mock.calls[0][4]).toMatchObject({ bodySearch: true });
  });

  it("API-3: 조문 인용이 아닌 따옴표 구절은 법령 검색 없이 본문 검색만", async () => {
    await call('"1세대 1주택"', "expc");
    expect(mockLaw).not.toHaveBeenCalled();
    expect(mockSearch.mock.calls[0][0]).toBe('"1세대 1주택"');
    expect(mockSearch.mock.calls[0][4]).toMatchObject({ bodySearch: true });
  });

  it("API-4(긍정 짝): 따옴표 없는 질의는 종전대로 사건명 검색 (bodySearch 없음)", async () => {
    await call("양도소득세");
    expect(mockLaw).not.toHaveBeenCalled();
    expect(mockSearch.mock.calls[0][0]).toBe("양도소득세");
    expect(mockSearch.mock.calls[0][4]?.bodySearch).toBeUndefined();
  });
});
