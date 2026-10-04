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

  it.each([
    ["prec", "https://www.law.go.kr/LSW/precInfoP.do?precSeq=624271"],
    ["detc", "https://www.law.go.kr/LSW/detcInfoP.do?detcSeq=624271"],
    ["expc", "https://www.law.go.kr/LSW/expcInfoP.do?expcSeq=624271"],
    ["admrul", "https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=624271"],
  ] as const)(
    "LINK-3: %s 도 한글주소가 아니라 일련번호로 여는 상세 팝업이다 (한글주소+일련번호는 7/7 미열림)",
    (domain, expected) => {
      const u = buildDecisionSourceUrl(domain, "624271");
      expect(u).toBe(expected);
      expect(decodeURIComponent(u)).not.toMatch(/\/(판례|헌재결정례|법령해석례|행정규칙)\/\(/);
    }
  );

  it("LINK-3b: 상세 팝업이 확인된 5개 도메인은 법령 검색 default 로 떨어지지 않는다", () => {
    for (const d of ["prec", "detc", "expc", "admrul", "ttSpecialDecc"] as const) {
      expect(buildDecisionSourceUrl(d, "1")).toMatch(/\/LSW\/\w+InfoP\.do\?/);
      expect(buildDecisionSourceUrl(d, "1")).not.toContain("lsScListR");
    }
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
