/**
 * 조세심판원 재결(ttSpecialDecc)의 「원문 보기」 링크 anchor.
 *
 * 종전엔 buildDecisionSourceUrl 의 default 분기(`lsScListR.do?query=<일련번호>` — 법령 검색에
 * 일련번호를 질의어로 넣는 쓸모없는 링크)로 떨어졌고, decision-text 라우트의 업스트림 실패
 * fallback 은 `LSW/${domain}InfoR.do` 를 하드코딩해 존재하지 않는 주소를 만들었다.
 *
 * 근거(2026-10-04 실측):
 *   · 한글주소 `/조세심판재결례/(조심2020부1558)` 는 `LSW//specialDeccInfoP.do?specialDeccSeq=105794
 *     &trbClsCd=360101` 로 연결된다 — specialDeccSeq 는 DRF 일련번호(= 우리 id) 그대로다.
 *   · trbClsCd 는 필수다: 파라미터 없음·`999999`·없는 id 는 전부 오류 페이지, `360101` 이면 본문 전체.
 *   · 재결 1,200행 전부 `조세심판원|429150|조세`(균질), 의결일자순 표본 40건 40/40 열림.
 *   · 청구번호 기반 한글주소는 쓰지 않는다 — 18/1,146건(1.6%)은 청구번호가 비어 있고,
 *     본문 응답(getDecisionText)에는 청구번호가 아예 없다. id 기반 주소는 어디서든 만들 수 있다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/korean-law/client", async (orig) => ({
  ...(await orig<typeof import("@/lib/korean-law/client")>()),
  getDecisionText: vi.fn(),
}));

import { getDecisionText, LawApiError } from "@/lib/korean-law/client";
import { buildDecisionSourceUrl } from "@/lib/korean-law/client-law";
import { GET } from "@/app/api/law/decision-text/route";

const mockGetDecisionText = getDecisionText as ReturnType<typeof vi.fn>;

const POPUP = "https://www.law.go.kr/LSW/specialDeccInfoP.do?specialDeccSeq=105794&trbClsCd=360101";

beforeEach(() => vi.clearAllMocks());

describe("LINK — 조세심판원 재결 원문 링크", () => {
  it("LINK-1: 일련번호로 실재하는 재결 상세 페이지를 가리킨다", () => {
    expect(buildDecisionSourceUrl("ttSpecialDecc", "105794")).toBe(POPUP);
  });

  it("LINK-2: id 는 인코딩된다 (질의 문자열 주입 금지)", () => {
    const u = buildDecisionSourceUrl("ttSpecialDecc", "1&trbClsCd=999999");
    expect(u).toContain("specialDeccSeq=1%26trbClsCd%3D999999&trbClsCd=360101");
    expect(new URL(u).searchParams.get("trbClsCd")).toBe("360101");
  });

  it("LINK-3(긍정 짝): 다른 도메인의 링크는 그대로", () => {
    expect(decodeURIComponent(buildDecisionSourceUrl("prec", "1"))).toContain("/판례/");
    expect(decodeURIComponent(buildDecisionSourceUrl("detc", "1"))).toContain("/헌재결정례/");
    expect(decodeURIComponent(buildDecisionSourceUrl("expc", "1"))).toContain("/법령해석례/");
    expect(decodeURIComponent(buildDecisionSourceUrl("admrul", "1"))).toContain("/행정규칙/");
  });
});

describe("LINK — decision-text 라우트의 업스트림 실패 fallback 링크", () => {
  const call = (domain: string, id: string) =>
    GET(new NextRequest(`http://localhost/api/law/decision-text?id=${id}&domain=${domain}`));

  it("LINK-4: ttSpecialDecc 실패 시에도 실재하는 상세 페이지를 안내한다", async () => {
    mockGetDecisionText.mockRejectedValue(new LawApiError("upstream down", "UPSTREAM"));
    const res = await call("ttSpecialDecc", "105794");
    expect(res.status).toBe(200);
    const { decision } = await res.json();
    expect(decision.title).toBe("(본문 제공 불가)");
    expect(decision.sourceUrl).toBe(POPUP);
  });

  it("LINK-5: fallback 도 다른 도메인에서 같은 빌더를 쓴다 (하드코딩 `…InfoR.do` 금지)", async () => {
    mockGetDecisionText.mockRejectedValue(new LawApiError("not found", "NOT_FOUND"));
    const res = await call("expc", "5");
    const { decision } = await res.json();
    expect(decision.sourceUrl).toBe(buildDecisionSourceUrl("expc", "5"));
    expect(decision.sourceUrl).not.toContain("InfoR.do");
  });
});
