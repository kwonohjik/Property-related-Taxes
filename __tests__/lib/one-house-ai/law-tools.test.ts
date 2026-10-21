/**
 * 1세대1주택 AI 도구 — 실행·조회 기록(성공·실패)·읽은 문서 집합·검색어 보호. 법령 모듈은 모의한다(외부 호출 없음).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/korean-law/applicable-law", () => ({ getApplicableLaw: vi.fn() }));
vi.mock("@/lib/korean-law/client-law", () => ({ getLawText: vi.fn() }));
vi.mock("@/lib/korean-law/client-cgm-expc", () => ({ searchTaxInterpretations: vi.fn() }));
vi.mock("@/lib/korean-law/client-decisions-search", () => ({ searchDecisions: vi.fn() }));
vi.mock("@/lib/korean-law/client-decisions-text", () => ({ getDecisionText: vi.fn() }));
vi.mock("@/lib/korean-law/client-taxlaw", () => ({ getTaxlawDocument: vi.fn() }));

import { getApplicableLaw } from "@/lib/korean-law/applicable-law";
import { getLawText } from "@/lib/korean-law/client-law";
import { searchTaxInterpretations } from "@/lib/korean-law/client-cgm-expc";
import { searchDecisions } from "@/lib/korean-law/client-decisions-search";
import { getDecisionText } from "@/lib/korean-law/client-decisions-text";
import { getTaxlawDocument } from "@/lib/korean-law/client-taxlaw";
import { createLawTools, type LawToolName } from "@/lib/one-house-ai/law-tools";

const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
});

function setup(allow: LawToolName[] = ["lookup_statute", "search_interpretations", "read_interpretation"]) {
  const law = createLawTools({ allow });
  const tool = (name: LawToolName) => {
    const t = law.tools.find((x) => x.name === name)!;
    return (input: unknown) => t.run(t.parse(input));
  };
  return { law, tool };
}

const DECREE_155 = "제155조(1세대1주택의 특례) ① 첫째\n⑳ 스무째\n㉑ 1세대가 장기임대주택의\n㉒ 다음";

describe("createLawTools", () => {
  it("allow로 준 도구만 만든다 — 추출 단계는 lookup_statute 하나", () => {
    expect(setup(["lookup_statute"]).law.tools.map((t) => t.name)).toEqual(["lookup_statute"]);
  });

  it("lookup_statute — 기준일이 있으면 그 날 시행본, 항을 주면 그 항만", async () => {
    m(getApplicableLaw).mockResolvedValue({
      lawName: "소득세법 시행령",
      articleNo: "제155조",
      article: { title: "1세대1주택의 특례", fullText: DECREE_155 },
      version: { efYd: "20240229" },
      sameAsCurrentText: false,
      sourceUrl: "https://www.law.go.kr/x",
    });
    const { law, tool } = setup();
    const text = await tool("lookup_statute")({ lawName: "소득세법 시행령", article: "제155조", paragraph: 21, baseDate: "2024-04-30" });
    expect(getApplicableLaw).toHaveBeenCalledWith("소득세법 시행령", "제155조", "2024-04-30");
    expect(text).toContain("2024-04-30 시행본(시행일 20240229) · 현행과 다름");
    expect(text).toContain("㉑ 1세대가 장기임대주택의");
    expect(text).not.toContain("스무째");
    expect(law.lookups).toEqual([
      { tool: "lookup_statute", input: expect.objectContaining({ paragraph: 21 }), ok: true, summary: "소득세법 시행령 제155조 제21항 (2024-04-30 시행본(시행일 20240229))", url: "https://www.law.go.kr/x" },
    ]);
  });

  it("lookup_statute — 기준일이 없으면 현행 · 없는 항은 실패로 기록하고 던진다(SDK가 is_error로 돌려준다)", async () => {
    m(getLawText).mockResolvedValue({ title: "1세대1주택의 특례", fullText: DECREE_155, lawName: "소득세법 시행령", articleNo: "제155조", sourceUrl: "u" });
    const { law, tool } = setup();
    await expect(tool("lookup_statute")({ lawName: "소득세법 시행령", article: "제155조", paragraph: 30 })).rejects.toThrow("제30항이 없습니다(현행)");
    expect(getApplicableLaw).not.toHaveBeenCalled();
    expect(law.lookups[0]).toMatchObject({ tool: "lookup_statute", ok: false, error: expect.stringContaining("제30항") });
  });

  it("search_interpretations — 국세청·기재부는 해석 검색, 조세심판은 DRF · 목록에 id", async () => {
    m(searchTaxInterpretations).mockResolvedValue({
      total: 1,
      items: [{ source: "nts", docNo: "서면-2026-법규재산-0109", title: "제목", date: "2026.06.08.", drfId: "1", ntstDcmId: "200000000000021918", url: "u" }],
    });
    m(searchDecisions).mockResolvedValue({ items: [{ id: "2085435", caseNo: "조심 2025중4302", title: "심판 제목", date: "2026.04.08", domain: "ttSpecialDecc", court: "" }], totalCount: 1, page: 1, pageSize: 10 });
    const { law, tool } = setup();
    const nts = await tool("search_interpretations")({ query: "공동상속주택 소수지분", source: "nts", bodySearch: true });
    expect(searchTaxInterpretations).toHaveBeenCalledWith("공동상속주택 소수지분", { source: "nts", bodySearch: true, display: 10 });
    expect(nts).toContain("서면-2026-법규재산-0109 (2026.06.08.) 제목 · id=200000000000021918");
    const tt = await tool("search_interpretations")({ query: "일시적 2주택", source: "tax_tribunal" });
    expect(searchDecisions).toHaveBeenCalledWith("일시적 2주택", "ttSpecialDecc", 1, 10, { bodySearch: false });
    expect(tt).toContain("조심 2025중4302 (2026.04.08.) 심판 제목 · id=2085435");
    // 검색만으로는 읽은 문서가 되지 않는다
    expect(law.readDocs.size).toBe(0);
  });

  it("검색어 보호 — 40자 초과는 스키마가, 긴 숫자열(주민번호·전화번호 꼴)은 실행이 거절한다", async () => {
    const { law, tool } = setup();
    expect(() => tool("search_interpretations")({ query: "가".repeat(41), source: "nts" })).toThrow();
    await expect(tool("search_interpretations")({ query: "홍길동 800101-1234567", source: "nts" })).rejects.toThrow("긴 숫자열");
    expect(searchTaxInterpretations).not.toHaveBeenCalled();
    expect(law.lookups[0]).toMatchObject({ ok: false });
  });

  it("검색은 요청당 4회까지 — 다섯 번째는 실패로 기록하고 호출하지 않는다", async () => {
    m(searchTaxInterpretations).mockResolvedValue({ total: 0, items: [] });
    const { law, tool } = setup();
    for (let i = 0; i < 4; i++) await tool("search_interpretations")({ query: `쟁점 ${i}`, source: "nts" });
    await expect(tool("search_interpretations")({ query: "쟁점 5", source: "nts" })).rejects.toThrow("요청당 4회까지");
    expect(searchTaxInterpretations).toHaveBeenCalledTimes(4);
    expect(law.lookups.map((l) => l.ok)).toEqual([true, true, true, true, false]);
  });

  it("read_interpretation — 읽은 문서만 readDocs에 docKey로 쌓인다 · 없는 문서는 실패", async () => {
    m(getTaxlawDocument).mockImplementation(async (id: string) =>
      id === "200000000000021918"
        ? { ntstDcmId: id, kind: "interpretation", docNo: "서면-2026-법규재산-0109", title: "제목", date: "2026.06.08.", gist: "요지", answer: "회신", body: "본문", relatedStatutes: [], url: "https://taxlaw.nts.go.kr/qt/x" }
        : null,
    );
    const { law, tool } = setup();
    const text = await tool("read_interpretation")({ source: "nts", id: "200000000000021918" });
    expect(text).toContain("요지: 요지");
    expect([...law.readDocs.entries()]).toEqual([
      ["서면2026법규재산0109", { source: "nts", id: "200000000000021918", docNo: "서면-2026-법규재산-0109", title: "제목", date: "2026.06.08.", url: "https://taxlaw.nts.go.kr/qt/x" }],
    ]);
    await expect(tool("read_interpretation")({ source: "moef", id: "999" })).rejects.toThrow("찾지 못했습니다");
    expect(law.readDocs.size).toBe(1);
    expect(law.lookups.map((l) => l.ok)).toEqual([true, false]);
  });

  it("read_interpretation — 조세심판 본문이 막힌 건은 읽은 문서가 아니다", async () => {
    m(getDecisionText).mockResolvedValue({ id: "1", domain: "ttSpecialDecc", caseNo: "", title: "(본문 제공 불가)", holdings: "", reasoning: "", court: "", date: "" });
    const { law, tool } = setup();
    await expect(tool("read_interpretation")({ source: "tax_tribunal", id: "1" })).rejects.toThrow("본문을 받지 못했습니다");
    expect(law.readDocs.size).toBe(0);
  });
});
