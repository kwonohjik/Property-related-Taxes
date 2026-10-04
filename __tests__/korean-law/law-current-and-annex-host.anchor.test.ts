/**
 * /law 감사(2026-10-04) 회귀 anchor.
 *
 * CUR — `/law` 조문 조회가 공포본(`target=law&MST`)이 아니라 현행 시행본(`target=eflaw&ID`)을
 *       받도록 `lawId`를 넘긴다. 공포본은 «뒤에 공포됐지만 먼저 시행된» 개정을 빠뜨리는데
 *       (`lib/legal-verification/korean-law-client.ts` fetchArticle 주석의 실측), 화면은 그
 *       본문에 [현행] 배지를 붙인다.
 * HOST — annex-content 는 law.go.kr 호스트만 내려받는다. 종전 정규식은 앵커가 없어
 *        `https://evil.example/?x=//law.go.kr/` 같은 임의 URL을 통과시켰다(SSRF).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/legal-verification/korean-law-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/legal-verification/korean-law-client")>()),
  searchLaw: vi.fn(),
  fetchArticle: vi.fn(),
}));

vi.mock("@/lib/korean-law/annex-body-parser", () => ({
  parseAnnexBody: vi.fn(async () => ({
    content: "본문",
    truncated: false,
    status: "OK",
    fileType: "PDF",
  })),
}));

import { searchLaw, fetchArticle } from "@/lib/legal-verification/korean-law-client";
import { parseAnnexBody } from "@/lib/korean-law/annex-body-parser";
import { getLawText } from "@/lib/korean-law/client-law";
import { GET as annexContentGET } from "@/app/api/law/annex-content/route";

const mockSearchLaw = searchLaw as ReturnType<typeof vi.fn>;
const mockFetchArticle = fetchArticle as ReturnType<typeof vi.fn>;
const mockParseAnnexBody = parseAnnexBody as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CUR — /law 조문 조회는 현행 시행본 경로를 탄다", () => {
  it("CUR-1: getLawText 가 검색 결과의 lawId 를 fetchArticle 에 넘긴다", async () => {
    // 캐시 충돌을 피하려 실재하지 않는 법령명을 쓴다.
    const lawName = "감사앵커현행본확인법";
    mockSearchLaw.mockResolvedValue({
      lawName,
      lawId: "009999",
      mst: "276123",
      promulgationDate: "20251001",
    });
    mockFetchArticle.mockResolvedValue({
      articleNo: "제1조",
      title: "목적",
      content: "본문",
      fullText: "제1조(목적) 본문",
    });

    await getLawText(lawName, "1");

    expect(mockFetchArticle).toHaveBeenCalledTimes(1);
    const args = mockFetchArticle.mock.calls[0];
    expect(args[0]).toBe("276123");
    expect(args[3]).toBe("009999");
  });
});

describe("HOST — annex-content 는 law.go.kr 호스트만 받는다", () => {
  const call = (url: string) =>
    annexContentGET(
      new NextRequest(`http://localhost/api/law/annex-content?url=${encodeURIComponent(url)}`)
    );

  it.each([
    "https://evil.example/?x=//law.go.kr/",
    "http://169.254.169.254/latest//law.go.kr/",
    "https://law.go.kr.evil.example/x.pdf",
    "file://law.go.kr/etc/passwd",
    "not a url",
  ])("HOST-1: %s 는 400 으로 거부되고 다운로드하지 않는다", async (url) => {
    const res = await call(url);
    expect(res.status).toBe(400);
    expect(mockParseAnnexBody).not.toHaveBeenCalled();
  });

  it.each([
    "https://www.law.go.kr/LSW/flDownload.do?flSeq=1",
    "https://law.go.kr/LSW/flDownload.do?flSeq=2",
    "http://www.law.go.kr/x.pdf",
  ])("HOST-2(긍정 짝): %s 는 통과해 변환기로 간다", async (url) => {
    const res = await call(url);
    expect(res.status).toBe(200);
    expect(mockParseAnnexBody).toHaveBeenCalledTimes(1);
    expect(mockParseAnnexBody.mock.calls[0][0]).toBe(url);
  });
});
