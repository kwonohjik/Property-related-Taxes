/**
 * 나머지 8개 결정례 도메인의 「원문 보기」 링크 anchor.
 *
 * 종전엔 전부 buildDecisionSourceUrl 의 default(`lsScListR.do?query=<일련번호>` — 법령 검색에
 * 일련번호를 질의어로 넣는 쓸모없는 링크)였다. 게다가 자치법규·조약은 검색 결과의 일련번호 필드
 * (`자치법규일련번호`·`조약일련번호`)가 id 후보 목록에 없어 **id 가 빈 문자열**이었다.
 *
 * 근거(2026-10-04 실측) — 각 도메인 표본의 제목이 상세 페이지 본문에 있는지 대조, 대조군(없는 id)은
 * 껍데기·제목 빈 페이지:
 *   ftc 7/7 · nlrc 7/7 · acr 6/6 · ordin 7/7 · public 7/7 · trty 7/7
 *   · public 은 행정규칙(admRulInfoP)이 아니라 「공공기관/공단 규정」 팝업(schlPubRulInfoP)이다 —
 *     admRulInfoP 로는 제목 없는 껍데기만 나왔다. 사이트의 showSchlPubRulCts → schlPubRulInfPop 에서 추출.
 *   · fsc(금융위)·kcc(방통위)는 법제처 웹에 상세 페이지가 없다: 사이트 스크립트 전체에서 `*InfoP.do`
 *     목록을 뽑았을 때 acr·ftc·ppc 는 있고 fsc·kcc 는 없었으며, `fscInfoP`·`kccInfoP` 는 오류 페이지.
 *     ⇒ 쓸모없는 링크 대신 **링크를 내지 않는다**(undefined → 화면의 `sourceUrl &&` 가드가 숨긴다).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/korean-law/client-core", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/client-core")>();
  return {
    ...actual,
    fetchJson: vi.fn(),
    readCacheNonEmpty: vi.fn(async () => null),
    writeCacheNonEmpty: vi.fn(async () => undefined),
  };
});

import { fetchJson } from "@/lib/korean-law/client-core";
import { buildDecisionSourceUrl } from "@/lib/korean-law/client-law";
import { searchDecisions } from "@/lib/korean-law/client-decisions-search";
import { DECISION_DOMAINS } from "@/lib/korean-law/types";

const mockFetch = fetchJson as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

const L = "https://www.law.go.kr/LSW/";

describe("SRC — 상세 페이지가 있는 6개 도메인", () => {
  it.each([
    ["ftc", `${L}ftcInfoP.do?ftcSeq=18701`],
    ["nlrc", `${L}nlrcInfoP.do?nlrcSeq=18701`],
    ["acr", `${L}acrInfoP.do?acrSeq=18701`],
    ["ordin", `${L}ordinInfoP.do?ordinSeq=18701`],
    ["public", `${L}schlPubRulInfoP.do?schlPubRulSeq=18701`],
    ["trty", `${L}trtyInfoP.do?trtySeq=18701`],
  ] as const)("SRC-1: %s → 일련번호로 여는 상세 팝업", (domain, expected) => {
    expect(buildDecisionSourceUrl(domain, "18701")).toBe(expected);
  });

  it("SRC-2: public 은 행정규칙 팝업이 아니다 (admRulInfoP 는 제목 없는 껍데기)", () => {
    expect(buildDecisionSourceUrl("public", "1")).not.toContain("admRulInfoP");
  });
});

describe("SRC — 웹 상세 페이지가 없는 도메인은 링크를 내지 않는다", () => {
  it.each(["fsc", "kcc"] as const)("SRC-3: %s → undefined (쓸모없는 법령 검색 링크 금지)", (domain) => {
    expect(buildDecisionSourceUrl(domain, "14597")).toBeUndefined();
  });

  it("SRC-4: 어떤 도메인도 법령 검색 default(lsScListR)로 떨어지지 않는다", () => {
    for (const d of DECISION_DOMAINS) {
      expect(buildDecisionSourceUrl(d, "1") ?? "").not.toContain("lsScListR");
    }
  });
});

describe("SRC — 자치법규·조약의 id 가 비지 않는다", () => {
  it("SRC-5: 자치법규 검색 결과의 id 는 자치법규일련번호다 (종전엔 빈 문자열)", async () => {
    mockFetch.mockResolvedValue({
      OrdinSearch: {
        law: [{ 자치법규ID: "2018824", 자치법규명: "2018성공개최평창군위원회 설립 및 지원 조례", 자치법규일련번호: "1013533", 지자체기관명: "강원특별자치도 평창군", 공포일자: "20150102" }],
        totalCnt: "1",
      },
    });
    const p = await searchDecisions("평창", "ordin", 1, 1);
    expect(p.items[0].id).toBe("1013533");
  });

  it("SRC-6: 조약 검색 결과의 id 는 조약일련번호다 (종전엔 빈 문자열)", async () => {
    mockFetch.mockResolvedValue({
      TrtySearch: {
        Trty: [{ 조약명: "대한민국 정부와 ○○ 정부 간의 소득에 대한 조세의 이중과세회피 협약", 조약번호: "666", 조약일련번호: "8757", 발효일자: "19790101" }],
        totalCnt: "1",
      },
    });
    const p = await searchDecisions("이중과세", "trty", 1, 1);
    expect(p.items[0].id).toBe("8757");
  });
});
