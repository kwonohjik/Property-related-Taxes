/**
 * 국세법령정보시스템 본문 — `action.do`(ASIQTB002PR01) 실응답 fixture(`fixtures/taxlaw-documents.json`, 2026-10-22 캡처).
 *
 *   nts       국세청 해석 서면-2026-법규재산-0109 (원응답 그대로)
 *   moef      기재부 해석 조세정책과-69 — 판례 목록 `trilPsagList`(약 2.1MB)만 비웠다(코드가 읽지 않는다)
 *   tribunal  국심-2006-서-3136 — 회신은 「붙임과 같습니다」, 내용은 본문(HTML)에만
 *   court     대법원-2007-두-8973
 *   missing   없는 id — `SUCCESS`인데 `dcmDVO: null`
 * 국세청 직원 내부 id 칸(`*UserId`·`inptOptrMemNo`)은 `SENSITIVE_STAFF_ID`로 바꿔 두었다(코드가 읽지 않는다).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import F from "./fixtures/taxlaw-documents.json";

vi.mock("@/lib/korean-law/client-core", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/client-core")>();
  return { ...actual, readCache: vi.fn(async () => null), writeCache: vi.fn(async () => undefined) };
});
vi.mock("@/lib/korean-law/fetch-with-retry", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/fetch-with-retry")>();
  return { ...actual, fetchWithRetry: vi.fn() };
});

import { writeCache } from "@/lib/korean-law/client-core";
import { fetchWithRetry } from "@/lib/korean-law/fetch-with-retry";
import { cleanTaxlawHtml, getTaxlawDocument } from "@/lib/korean-law/client-taxlaw";

const mockFetch = fetchWithRetry as ReturnType<typeof vi.fn>;
const mockWrite = writeCache as ReturnType<typeof vi.fn>;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
beforeEach(() => {
  mockFetch.mockReset();
  mockWrite.mockClear();
});

describe("getTaxlawDocument", () => {
  it("국세청 해석 — 문서번호·제목·일자·요지·회신·본문·관련 조문·qt 링크", async () => {
    mockFetch.mockResolvedValue(ok(F.nts));
    const d = (await getTaxlawDocument("200000000000021918"))!;
    expect(d).toMatchObject({
      ntstDcmId: "200000000000021918",
      kind: "interpretation",
      docNo: "서면-2026-법규재산-0109",
      date: "2026.06.08.",
      url: "https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=200000000000021918",
    });
    expect(d.title).toMatch(/^공동상속주택의 소수지분이 조합원입주권의 소수지분으로/);
    expect(d.gist.length).toBeGreaterThan(20);
    expect(d.answer.length).toBeGreaterThan(20);
    expect(d.relatedStatutes).toEqual(expect.arrayContaining(["소득세법 제89조", "소득세법 시행령 제156조의2"]));
    // 본문(사실관계·질의)은 HTML에서 텍스트로 — 태그·엔터티·사용자 정의 글리프가 남지 않는다
    expect(d.body.length).toBeGreaterThan(200);
    expect(d.body).not.toMatch(/<[a-z/][^>]*>|&nbsp;|&amp;/i);
    expect(d.body).not.toMatch(/[-]|[\u{F0000}-\u{FFFFD}]/u);
    // 요청 모양: POST · form-urlencoded · actionId · paramData
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://taxlaw.nts.go.kr/action.do");
    const body = new URLSearchParams(opts.init.body);
    expect(opts.init.method).toBe("POST");
    expect(body.get("actionId")).toBe("ASIQTB002PR01");
    expect(JSON.parse(body.get("paramData")!)).toEqual({ dcmDVO: { ntstDcmId: "200000000000021918" } });
  });

  it("기재부 해석도 같은 경로 — 문서번호는 taxlaw 표기(「기획재정부 」 접두사)", async () => {
    mockFetch.mockResolvedValue(ok(F.moef));
    const d = (await getTaxlawDocument("200000000000010241"))!;
    expect(d).toMatchObject({ kind: "interpretation", docNo: "기획재정부 조세정책과-69", date: "2025.01.13." });
    expect(d.relatedStatutes).toEqual(["소득세법 제95조"]);
  });

  it("심판·판례 — 내용은 본문에만 있다 · pd 링크", async () => {
    mockFetch.mockResolvedValue(ok(F.tribunal));
    const t = (await getTaxlawDocument("000000000000094932"))!;
    expect(t).toMatchObject({ kind: "decision", docNo: "국심-2006-서-3136", date: "2006.12.04." });
    expect(t.answer).toMatch(/붙임과 같습니다/);
    expect(t.body.length).toBeGreaterThan(1000);
    expect(t.url).toBe("https://taxlaw.nts.go.kr/pd/USEPDA002P.do?ntstDcmId=000000000000094932");

    mockFetch.mockResolvedValue(ok(F.court));
    expect(await getTaxlawDocument("000000000000113008")).toMatchObject({ kind: "decision", docNo: "대법원-2007-두-8973", date: "2008.09.25." });
  });

  it("캐시에는 잘라 낸 결과만 쓴다(원응답이 아니다)", async () => {
    mockFetch.mockResolvedValue(ok(F.nts));
    await getTaxlawDocument("200000000000021918");
    const [key, saved] = mockWrite.mock.calls[0];
    expect(key).toBe("taxlaw_200000000000021918_v1");
    expect(saved).not.toHaveProperty("data");
    expect(Object.keys(saved).sort()).toEqual(["answer", "body", "date", "docNo", "gist", "kind", "ntstDcmId", "relatedStatutes", "title", "url"]);
  });

  it("없는 id — SUCCESS + dcmDVO null → null(오류 아님) · 「없음」은 캐시하지 않는다", async () => {
    mockFetch.mockResolvedValue(ok(F.missing));
    expect(await getTaxlawDocument("999999999999999999")).toBeNull();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("실패는 「없음」이 아니라 UPSTREAM 오류 — 네트워크 · HTTP 오류 · JSON 아님 · 형식 변경", async () => {
    mockFetch.mockRejectedValue(new Error("fetch failed"));
    await expect(getTaxlawDocument("1")).rejects.toMatchObject({ code: "UPSTREAM" });
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
    await expect(getTaxlawDocument("1")).rejects.toMatchObject({ code: "UPSTREAM" });
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError("<html>"); } } as unknown as Response);
    await expect(getTaxlawDocument("1")).rejects.toMatchObject({ code: "UPSTREAM" });
    mockFetch.mockResolvedValue(ok({ status: "FAIL", data: {} }));
    await expect(getTaxlawDocument("1")).rejects.toMatchObject({ code: "UPSTREAM" });
    // status가 SUCCESS가 아니면 dcmDVO가 비어 있어도 「없는 문서」로 보지 않는다
    mockFetch.mockResolvedValue(ok({ status: "FAIL", data: { ASIQTB002PR01: { dcmDVO: null } } }));
    await expect(getTaxlawDocument("1")).rejects.toMatchObject({ code: "UPSTREAM" });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("id 형식이 아니면 호출하지 않는다", async () => {
    await expect(getTaxlawDocument("../x")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("cleanTaxlawHtml", () => {
  it("줄바꿈 태그·엔터티·사용자 정의 글리프", () => {
    expect(cleanTaxlawHtml("<p>가&nbsp;나</p><p>다 &lt;라&gt; &amp;lt;</p>\u{F080F}<br>마")).toBe("가 나\n다 <라> &lt;\n마");
  });

  it("숫자 엔터티 — 10진·16진 · 범위 밖은 오류 대신 버린다", () => {
    expect(cleanTaxlawHtml("&#44032;&#xAC01;&#99999999;끝")).toBe("가각끝");
  });
});
