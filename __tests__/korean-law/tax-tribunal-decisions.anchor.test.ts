/**
 * 조세심판원 재결(DRF `target=ttSpecialDecc`) 편입 anchor.
 *
 * 종전 `impact-map.ts` 주석은 「조세심판원은 법제처 DRF 에 없다」고 적었고, 라우터는 「조세심판」
 * 질의를 dispute_prep 체인으로 보냈지만 그 체인에는 조세심판 섹션이 없었다.
 *
 * fixture 는 2026-10-04 실응답 원문에서 필드를 그대로 옮겼다(본문은 발췌). 검색과 본문의
 * 루트 키가 다르고(`Decc` / `SpecialDeccService`), 필드명도 다른 도메인과 겹치지 않는다
 * (`특별행정심판재결례일련번호`·`청구번호`·`재결청`·`의결일자`·`재결요지`·`관련법령`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
import { searchDecisions } from "@/lib/korean-law/client-decisions-search";
import { getDecisionText } from "@/lib/korean-law/client-decisions-text";
import { routeQuery } from "@/lib/korean-law/router/query-router";
import { runChain } from "@/lib/korean-law/chains";
import { DECISION_DOMAINS, DECISION_DOMAIN_LABELS } from "@/lib/korean-law/types";

const mockFetch = fetchJson as ReturnType<typeof vi.fn>;

const SEARCH_FIXTURE = {
  Decc: {
    decc: [
      {
        id: "1",
        행정심판재결례상세링크: "/DRF/lawService.do?OC=***&target=ttSpecialDecc&ID=105794&type=HTML&mobileYn=",
        재결청: "조세심판원",
        처분청: "",
        특별행정심판재결례일련번호: "105794",
        재결구분코드: "429150",
        청구번호: "조심 2020부1558",
        의결일자: "2020.06.16",
        처분일자: "",
        재결구분명: "조세",
        사건명:
          "000공업지역에 편입된 후 환지예정지 지정을 받은 쟁점농지에 대하여 일반공업지역 편입일을 기준으로 감면세액을 산정하여 양도소득세를 과세한 처분의 당부",
        데이터기준일시: "2024.12.18",
      },
    ],
    키워드: "양도소득세",
    page: "1",
    target: "ttSpecialDecc",
    totalCnt: "7303",
    section: "evtNm",
  },
};

const TEXT_FIXTURE = {
  SpecialDeccService: {
    재결청: "조세심판원",
    청구취지: "",
    참조결정: "",
    재결요지:
      "조특법 제69조 제1항 단서 및 같은 법 시행령 제66조 제7항은 2001.12.29. 주거지역 등에 편입된 시점까지 발생한 양도차익에 대하여만 비과세 받을 수 있도록 개정되어 2002.1.1. 이후 양도분부터 적용",
    이유: "1. 처분개요 가. 청구인은 2011.3.19. 상속으로 취득한 OOO답 2,311㎡(이하 “쟁점농지”라 한다)를 2016.12.9. OOO양도하고",
    따른결정: "",
    의결일자: "20200616",
    사건명:
      "000공업지역에 편입된 후 환지예정지 지정을 받은 쟁점농지에 대하여 일반공업지역 편입일을 기준으로 감면세액을 산정하여 양도소득세를 과세한 처분의 당부",
    주문: "심판청구를 기각한다.",
    세목: "양도",
    데이터기준일시: "20241218",
    처분청: "",
    사건번호: "",
    특별행정심판재결례일련번호: "105794",
    청구번호: "",
    재결례유형코드: "429150",
    재결례유형명: "조세",
    관련법령: "「조세특례제한법」 제69조",
    처분일자: "",
  },
};

beforeEach(() => vi.clearAllMocks());

describe("TT — 조세심판원 재결 도메인", () => {
  it("TT-1: 도메인 열거·라벨에 있다", () => {
    expect(DECISION_DOMAINS as readonly string[]).toContain("ttSpecialDecc");
    expect(DECISION_DOMAIN_LABELS.ttSpecialDecc).toBe("조세심판원 재결");
  });

  it("TT-2: 검색 응답(`Decc.decc`)을 id·청구번호·재결청·의결일자로 읽는다", async () => {
    mockFetch.mockResolvedValue(SEARCH_FIXTURE);
    const p = await searchDecisions("양도소득세", "ttSpecialDecc", 1, 5);
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ target: "ttSpecialDecc", query: "양도소득세" });
    expect(p.totalCount).toBe(7303);
    expect(p.items).toEqual([
      expect.objectContaining({
        id: "105794",
        domain: "ttSpecialDecc",
        caseNo: "조심 2020부1558",
        court: "조세심판원",
        date: "2020.06.16",
      }),
    ]);
    expect(p.items[0].title).toContain("환지예정지");
  });

  it("TT-3: 본문 응답(`SpecialDeccService`)에서 재결요지·주문·이유·관련법령을 읽는다", async () => {
    mockFetch.mockResolvedValue(TEXT_FIXTURE);
    const t = await getDecisionText("105794", "ttSpecialDecc");
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ target: "ttSpecialDecc", ID: "105794" });
    expect(t).not.toBeNull();
    // 종전 루트 추론(Decc→Decc)이면 container 가 응답 전체가 되어 아래가 전부 빈다.
    expect(t!.title).toContain("환지예정지");
    expect(t!.summary).toContain("조특법 제69조");
    expect(t!.ruling).toBe("심판청구를 기각한다.");
    expect(t!.reasoning).toContain("처분개요");
    expect(t!.court).toBe("조세심판원");
    expect(t!.date).toBe("20200616");
    expect(t!.refLaws ?? JSON.stringify(t!.refLawsStructured)).toContain("조세특례제한법");
  });
});

describe("TT — 「조세심판」 질의는 트리거어를 뺀 검색어로 체인에 간다", () => {
  it.each([
    ["조세심판 비사업용토지", "비사업용토지"],
    ["양도소득세 조세심판", "양도소득세"],
    ["양도소득세 조세심판원 결정", "양도소득세 결정"],
    ["양도소득세 헌법재판소", "양도소득세"],
  ])("TT-4: %s → 검색어 %s", (q, expected) => {
    const r = routeQuery(q);
    expect(r.chainType).toBe("dispute_prep");
    expect(r.params.query).toBe(expected);
  });

  it("TT-5(긍정 짝): 트리거어만 있으면 원문을 그대로 쓴다(빈 검색어 금지)", () => {
    const r = routeQuery("조세심판");
    expect(r.chainType).toBe("dispute_prep");
    expect(r.params.query).toBe("조세심판");
  });
});

describe("TT — 분쟁대응 체인에 조세심판원 섹션이 있다", () => {
  it("TT-6: dispute_prep 이 ttSpecialDecc 를 검색해 섹션으로 싣는다", async () => {
    mockFetch.mockImplementation(async (_ep: string, params: Record<string, string>) =>
      params.target === "ttSpecialDecc" ? SEARCH_FIXTURE : {}
    );
    const r = await runChain({ type: "dispute_prep", query: "양도소득세" });
    expect(mockFetch.mock.calls.map((c) => c[1].target)).toContain("ttSpecialDecc");
    const sec = r.sections.find((s) => s.heading === "조세심판원 재결");
    expect(sec?.decisions?.map((d) => d.caseNo)).toEqual(["조심 2020부1558"]);
  });
});
