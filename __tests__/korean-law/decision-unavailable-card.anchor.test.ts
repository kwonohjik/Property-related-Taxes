/**
 * 본문을 읽지 못한 결정도 「본문 제공 불가」 카드로 원문 링크까지 보여 준다 + 그 경로의 함정 2건.
 *
 * 2026-10-04 실측: 자치법규·조약·위원회 결정문(공정위·노동위·권익위·금융위·방통위)은 getDecisionText 가
 * null 이었다(응답 루트·구조가 판례형이 아니다). 라우트는 null 을 404 로 돌려 화면엔 오류 한 줄만 뜨고,
 * 고쳐 둔 「원문 보기」 링크가 있는 상세 화면에 닿지 못했다. 업스트림 실패 때 이미 쓰던 카드를 null 에도 쓴다.
 *
 * 함정 1 — 자치법규 본문 API 의 `ID=` 는 **자치법규ID** 를 받는다. 우리 id 는 자치법규일련번호이고
 *   (원문 링크 `ordinSeq=` 가 받는 값 — 7/7 실측), 일련번호를 `ID=` 로 넘기면 **엉뚱한 조례**가 오류 없이
 *   돌아온다(춘천시 조례의 일련번호 2088205 → 양구군 조례). 일련번호는 `MST=` 로 보낸다.
 * 함정 2 — 공공기관 규정(public) 검색 응답 루트는 `PublicSearch.public` 이 아니라 `AdmRulSearch.admrul` 이다.
 *   종전 매핑으로는 결과 목록 자체가 0건이었다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/korean-law/client-core", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/client-core")>();
  return {
    ...actual,
    fetchJson: vi.fn(),
    readCache: vi.fn(async () => null),
    writeCache: vi.fn(async () => undefined),
    readCacheNonEmpty: vi.fn(async () => null),
    writeCacheNonEmpty: vi.fn(async () => undefined),
  };
});

import { fetchJson } from "@/lib/korean-law/client-core";
import { getDecisionText } from "@/lib/korean-law/client-decisions-text";
import { searchDecisions } from "@/lib/korean-law/client-decisions-search";
import { GET } from "@/app/api/law/decision-text/route";

const mockFetch = fetchJson as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

const call = (domain: string, id: string) =>
  GET(new NextRequest(`http://localhost/api/law/decision-text?id=${id}&domain=${domain}`));

describe("CARD — 본문을 읽지 못해도 원문 링크까지 닿는다", () => {
  it("CARD-1: 파서가 null 을 돌려도 404 가 아니라 원문 링크가 달린 카드다", async () => {
    // 실응답 모양: 조약 본문 루트 `BothTrtyService` — 판례형 필드가 없어 파서가 null.
    mockFetch.mockResolvedValue({ BothTrtyService: { 조약내용: {}, 추가정보: {}, 조약기본정보: {}, 첨부파일: {} } });
    const res = await call("trty", "8757");
    expect(res.status).toBe(200);
    const { decision } = await res.json();
    expect(decision.title).toBe("(본문 제공 불가)");
    expect(decision.sourceUrl).toBe("https://www.law.go.kr/LSW/trtyInfoP.do?trtySeq=8757");
    expect(decision.reasoning).toContain("아래 법제처 링크");
  });

  it("CARD-2: 웹 상세 페이지가 없는 도메인(금융위)은 링크도, 「아래 링크」 안내도 없다", async () => {
    mockFetch.mockResolvedValue({ FscService: { 안건명: "x" } });
    // 안건명만으로도 제목이 잡혀 null 이 아닐 수 있다 — 링크 유무만 본다.
    const res = await call("fsc", "14597");
    const { decision } = await res.json();
    expect(decision.sourceUrl).toBeUndefined();
    expect(decision.reasoning ?? "").not.toContain("아래 법제처 링크");
  });

  it("CARD-3(긍정 짝): 본문을 읽은 결정은 카드가 아니라 본문 그대로", async () => {
    mockFetch.mockResolvedValue({ PrecService: { 사건번호: "2020두1", 사건명: "양도소득세부과처분취소", 판례내용: "이유 본문" } });
    const res = await call("prec", "1");
    const { decision } = await res.json();
    expect(decision.title).toBe("양도소득세부과처분취소");
    expect(decision.reasoning).toBe("이유 본문");
  });
});

describe("ORDIN — 자치법규 본문은 일련번호를 MST 로 보낸다", () => {
  it("ORDIN-1: `ID=` 가 아니라 `MST=` (ID 는 자치법규ID 체계라 엉뚱한 조례가 온다)", async () => {
    mockFetch.mockResolvedValue({ Law: "일치하는 자치법규가 없습니다.  자치법규명을 확인하여 주십시오." });
    await getDecisionText("2088205", "ordin");
    const params = mockFetch.mock.calls[0][1];
    expect(params).toMatchObject({ target: "ordin", MST: "2088205" });
    expect(params).not.toHaveProperty("ID");
  });

  it("ORDIN-2(긍정 짝): 다른 도메인은 여전히 `ID=`", async () => {
    mockFetch.mockResolvedValue({ PrecService: { 사건명: "x", 판례내용: "y" } });
    await getDecisionText("1", "prec");
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ target: "prec", ID: "1" });
  });
});

describe("PUBLIC — 공공기관 규정 검색 결과가 0건이 아니다", () => {
  it("PUBLIC-1: 응답 루트 `AdmRulSearch.admrul` 을 읽는다", async () => {
    mockFetch.mockResolvedValue({
      AdmRulSearch: {
        admrul: [{ 행정규칙명: "(거제해양관광개발공사) 감사 규정", 행정규칙일련번호: "2200000133923", 소관부처명: "거제해양관광개발공사", 발령일자: "20211019" }],
        totalCnt: "1",
      },
    });
    const p = await searchDecisions("감사", "public", 1, 1);
    expect(p.items).toHaveLength(1);
    expect(p.items[0]).toMatchObject({ id: "2200000133923", title: "(거제해양관광개발공사) 감사 규정" });
  });
});
