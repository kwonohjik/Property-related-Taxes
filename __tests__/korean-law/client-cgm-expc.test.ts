/**
 * 국세청·기재부 해석 검색 — DRF 실응답 fixture(`fixtures/drf-search-cgm-expc.json`, 2026-10-22 캡처 · OC 키 없음).
 *
 *   nts_list      「공동상속주택 소수지분」 3건(배열)
 *   nts_single    「서면-2016-부동산-2944」 1건 — **배열이 아니라 객체**로 온다 · 안건번호에 [꼬리]
 *   moef_partial  「조세정책과-69」 — 검색이 부분 일치라 -695·-697도 함께 온다
 *   moef_single   「재산세제과-906」 1건(객체) · 꼬리 안에 괄호·날짜
 *   empty         0건 — `cgmExpc` 칸 자체가 없다
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import F from "./fixtures/drf-search-cgm-expc.json";

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

import { fetchJson, LawApiError } from "@/lib/korean-law/client-core";
import { findInterpretationByDocNo, searchTaxInterpretations } from "@/lib/korean-law/client-cgm-expc";

const mockFetch = fetchJson as ReturnType<typeof vi.fn>;
// 블록 본문 — `beforeEach`가 함수를 돌려주면 vitest가 그것을 정리 훅으로 다시 부른다(mock을 인자 없이 호출)
beforeEach(() => {
  mockFetch.mockReset();
});

/** target별로 응답을 돌려준다 — findInterpretationByDocNo는 국세청·기재부를 함께 부른다 */
function respond(by: { nts?: unknown; moef?: unknown | Error }) {
  mockFetch.mockImplementation(async (_ep: string, p: Record<string, string>) => {
    const r = p.target === "ntsCgmExpc" ? by.nts : by.moef;
    if (r instanceof Error) throw r;
    return r ?? F.empty;
  });
}

describe("searchTaxInterpretations", () => {
  it("목록 → 문서번호·제목·일자·taxlaw id·링크, 최신순·본문 검색 파라미터", async () => {
    respond({ nts: F.nts_list });
    const page = await searchTaxInterpretations("공동상속주택 소수지분", { source: "nts", bodySearch: true, display: 3 });
    expect(page.total).toBe(73);
    expect(page.items).toHaveLength(3);
    expect(page.items[0]).toEqual({
      source: "nts",
      docNo: "서면-2026-법규재산-0109",
      title: "공동상속주택의 소수지분이 조합원입주권의 소수지분으로 변경된 경우에도 다른 주택 양도시 주택수에서 제외되는지",
      date: "2026.06.08.",
      drfId: "2807319",
      ntstDcmId: "200000000000021918",
      url: "https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=200000000000021918",
    });
    expect(mockFetch).toHaveBeenCalledWith("lawSearch.do", expect.objectContaining({ target: "ntsCgmExpc", sort: "ddes", search: "2", display: "3" }));
  });

  it("제목 검색이면 search 파라미터를 보내지 않는다", async () => {
    respond({ moef: F.moef_partial });
    await searchTaxInterpretations("조세정책과-69", { source: "moef" });
    expect(mockFetch.mock.calls.map((c) => c[0])).toEqual(["lawSearch.do"]);
    expect(mockFetch.mock.calls[0][1]).not.toHaveProperty("search");
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ target: "moefCgmExpc" });
  });

  it("응답 루트가 없거나 resultCode가 00이 아니면 0건이 아니라 실패", async () => {
    respond({ nts: { Law: "미신청된 목록/본문에 대한 접근입니다." } });
    await expect(searchTaxInterpretations("x", { source: "nts" })).rejects.toMatchObject({ code: "UPSTREAM" });
    respond({ nts: { CgmExpc: { ...F.empty.CgmExpc, resultCode: "99", resultMsg: "fail" } } });
    await expect(searchTaxInterpretations("x", { source: "nts" })).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("상세 링크는 국세법령정보시스템 주소만 — 다른 주소면 링크·id 없음", async () => {
    const item = { ...F.nts_single.CgmExpc.cgmExpc, 법령해석상세링크: "javascript:alert(1)//?ntstDcmId=1" };
    respond({ nts: { CgmExpc: { ...F.nts_single.CgmExpc, cgmExpc: item } } });
    expect((await searchTaxInterpretations("x", { source: "nts" })).items[0]).toMatchObject({ url: null, ntstDcmId: null });
  });

  it("1건 응답(객체)도 목록으로 · 0건(칸 없음)은 빈 목록", async () => {
    respond({ nts: F.nts_single });
    expect((await searchTaxInterpretations("서면-2016-부동산-2944", { source: "nts" })).items.map((i) => i.docNo)).toEqual([
      "서면-2016-부동산-2944[부동산납세과-425]",
    ]);
    respond({ nts: F.empty });
    expect(await searchTaxInterpretations("없는번호-0000", { source: "nts" })).toEqual({ total: 0, items: [] });
  });
});

describe("findInterpretationByDocNo", () => {
  it("부분 일치 결과 중 docKey가 같은 것만 — 「조세정책과-69」는 -695가 아니다", async () => {
    respond({ moef: F.moef_partial });
    const hit = await findInterpretationByDocNo("기획재정부 조세정책과-69");
    expect(hit?.docNo).toBe("조세정책과-69");
    expect(hit?.date).toBe("2025.01.13.");
    // 목록 맨 앞이 아닌 문서도 번호로 집는다 — 「첫 건 채택」이면 -69가 나온다
    expect((await findInterpretationByDocNo("조세정책과-695"))?.docNo).toBe("조세정책과-695");
    // DRF 검색어에는 「기획재정부 」 접두사를 빼고 보낸다
    expect(mockFetch).toHaveBeenCalledWith("lawSearch.do", expect.objectContaining({ query: "조세정책과-69", target: "moefCgmExpc" }));
  });

  it("카드 표기([꼬리])로 찾아도 같은 문서 · 일자가 같아야 채택", async () => {
    respond({ moef: F.moef_single });
    expect((await findInterpretationByDocNo("기획재정부 재산세제과-906 [재산세제과-906(2024.07.31.)]", "2024.07.31."))?.docNo).toBe(
      "재산세제과-906[재산세제과-906(2024.07.31.)]",
    );
    expect(await findInterpretationByDocNo("재산세제과-906", "2024.08.01.")).toBeNull();
  });

  it("화면 일자 표기(2024-07-31)도 받는다 · 읽지 못하는 일자는 조용히 버리지 않고 오류", async () => {
    respond({ moef: F.moef_single });
    expect((await findInterpretationByDocNo("재산세제과-906", "2024-07-31"))?.date).toBe("2024.07.31.");
    await expect(findInterpretationByDocNo("재산세제과-906", "2024. 7. 31.")).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("부분 일치 결과가 한 쪽(100건)을 넘었는데 못 찾으면 「없음」이 아니라 확인 불가", async () => {
    respond({ moef: { CgmExpc: { ...F.moef_partial.CgmExpc, totalCnt: "250" } } });
    await expect(findInterpretationByDocNo("조세정책과-6")).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("어디에도 없으면 null", async () => {
    respond({});
    expect(await findInterpretationByDocNo("없는번호-0000")).toBeNull();
  });

  it("한쪽이 실패해도 다른 쪽에서 찾으면 돌려준다", async () => {
    respond({ nts: F.nts_single, moef: new LawApiError("법제처 API 오류 (503)", "UPSTREAM") });
    expect((await findInterpretationByDocNo("서면-2016-부동산-2944"))?.source).toBe("nts");
  });

  it("못 찾았는데 실패가 있으면 「없음」이 아니라 그 오류를 던진다", async () => {
    respond({ moef: new LawApiError("법제처 API 오류 (503)", "UPSTREAM") });
    await expect(findInterpretationByDocNo("서면-2016-부동산-2944")).rejects.toThrow("503");
  });
});
