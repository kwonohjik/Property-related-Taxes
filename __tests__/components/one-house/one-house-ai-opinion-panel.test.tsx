/**
 * @vitest-environment jsdom
 *
 * 판정 결과 아래 「AI 참고 의견」 — 신호 표시 · 호출 본문 · 의견 표시 · 결과가 바뀌면 옛 의견을 숨김. 서버 경로는 모의한다.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { OneHouseAiOpinionPanel } from "@/components/calc/one-house/OneHouseAiOpinionPanel";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import type { OneHouseAiOpinionData } from "@/app/api/one-house-ai/opinion/route";
import type { OneHouseAiVerifyData } from "@/lib/one-house-ai/verify/verify-schema";

const result = (undeterminedCount: number) =>
  ({
    judgment: {
      isExempt: false,
      undetermined: Array.from({ length: undeterminedCount }, (_, i) => ({ id: `u${i}`, reason: "확인 필요" })),
      unmetExceptions: [],
    },
  }) as never;

const data: OneHouseAiOpinionData = {
  opinion: {
    engineAgreement: "possible_difference",
    summary: "임대 개시 시점에 따라 결론이 달라질 수 있습니다.",
    points: [
      {
        topic: "장기임대주택 요건",
        opinion: "의견 본문",
        citedDocNos: ["DOC-1", "서면-2026-법규재산-0109"],
        statutes: [{ law: "소득세법 시행령", article: 155, paragraph: 20 }],
      },
    ],
    factsToConfirm: ["임대 개시일은 언제입니까?"],
    caveats: ["해석 당시 법령 기준입니다."],
  },
  cards: [{ docNo: "DOC-1", kind: "해석", date: "2020.01.01.", url: "https://example.test/1", title: "제목" }],
  citations: [
    { docNo: "DOC-1", origin: "card", title: "제목", date: "2020.01.01.", url: "https://example.test/1" },
    { docNo: "서면-2026-법규재산-0109", origin: "live", title: "실시간 제목", date: "2026.06.08.", url: "https://taxlaw.nts.go.kr/qt/1", source: "nts", id: "1" },
  ],
  liveDocs: [{ source: "nts", id: "1", docNo: "서면-2026-법규재산-0109", title: "실시간 제목", date: "2026.06.08.", url: "https://taxlaw.nts.go.kr/qt/1" }],
  lawLookups: [
    { tool: "read_interpretation", input: { source: "nts", id: "1" }, ok: true, summary: "서면-2026-법규재산-0109", url: "https://taxlaw.nts.go.kr/qt/1" },
    { tool: "search_interpretations", input: { query: "임대주택", source: "moef" }, ok: false, error: "법제처 API 오류 (503)" },
  ],
  droppedCitations: ["DOC-X"],
  model: "claude-opus-5-5",
  usage: { input: 10000, cacheRead: 20000, cacheWrite: 0, output: 5000 },
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AI 참고 의견 패널", () => {
  it("판정 보류·추출 메모가 있으면 그 수를 알린다", () => {
    render(<OneHouseAiOpinionPanel form={createInitialOneHouseJudgmentForm()} result={result(2)} notes={["메모"]} />);
    expect(screen.getByTestId("one-house-ai-opinion-signals").textContent).toContain("판정 보류·확인 필요 2건 · 폼으로 표현하지 못한 메모 1건");
  });

  it("누르면 폼·결과·원문을 보내고, 의견·인용·지운 인용을 보여 준다. 결과가 바뀌면 옛 의견을 숨긴다", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data }) });
    const form = createInitialOneHouseJudgmentForm();
    const r1 = result(1);
    const { rerender } = render(<OneHouseAiOpinionPanel form={form} result={r1} sourceText="원문" notes={[]} />);
    fireEvent.click(screen.getByTestId("one-house-ai-opinion-run"));

    const view = await screen.findByTestId("one-house-ai-opinion-view");
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/one-house-ai/opinion");
    expect(sent).toMatchObject({ result: r1, sourceText: "원문", notes: [] });
    expect(view.textContent).toContain("결론이 달라질 수 있는 쟁점이 있음");
    expect(view.textContent).toContain("판정의 정본은 위 엔진 결론입니다");
    expect(screen.getAllByRole("link", { name: "DOC-1" })[0].getAttribute("href")).toBe("https://example.test/1");
    expect(view.textContent).toContain("DOC-X");
    // 구조화 조문은 화면 표기로 · 실시간으로 읽은 문서는 [실시간] 표지 · 조회 기록은 실패까지
    expect(view.textContent).toContain("소득세법 시행령 §155⑳");
    expect(view.textContent).toContain("서면-2026-법규재산-0109 [실시간]");
    expect(screen.getByTestId("one-house-ai-live-docs").textContent).toContain("실시간으로 읽은 문서 1건");
    const lookups = screen.getByTestId("one-house-ai-law-lookups").textContent ?? "";
    expect(lookups).toContain("AI가 조회한 법령·해석례 2건 (실패 1건)");
    expect(lookups).toContain("실패 — 임대주택 · 법제처 API 오류 (503)");
    // 0.04 + 0.004 + 0.1
    expect(screen.getByTestId("one-house-ai-usage-cost").textContent).toContain("이번 호출 비용 약 $0.144");

    rerender(<OneHouseAiOpinionPanel form={form} result={result(1)} sourceText="원문" notes={[]} />);
    expect(screen.queryByTestId("one-house-ai-opinion-view")).toBeNull();
  });

  it("의견을 받으면 곧바로 원문 검증을 불러 쟁점마다 배지를 붙인다 — 「원문과 다름」도 숨기지 않는다", async () => {
    const verify: OneHouseAiVerifyData = {
      statutes: [{ key: "소득세법 시행령 §155⑳", ref: { law: "소득세법 시행령", article: 155, paragraph: 20 }, status: "verified", baseDate: "2024-04-30", excerpt: "⑳ 장기임대주택" }],
      docs: [{ docNo: "DOC-1", status: "fetched", excerpt: "요지: …" }],
      points: [
        { index: 0, support: "not_supported", reason: "원문은 반대다", unsupportedClaims: ["임대 개시 전이면 비과세"], statuteKeys: ["소득세법 시행령 §155⑳"], docNos: ["DOC-1"] },
      ],
      model: "claude-opus-5-5",
      usage: { input: 1000, cacheRead: 0, cacheWrite: 0, output: 1000 },
    };
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: verify }) });
    const form = { ...createInitialOneHouseJudgmentForm(), transferDate: "2024-04-30" };
    render(<OneHouseAiOpinionPanel form={form} result={result(1)} />);
    fireEvent.click(screen.getByTestId("one-house-ai-opinion-run"));

    const badge = await screen.findByTestId("one-house-ai-verify-badge-0");
    expect(badge.textContent).toBe("원문과 다름");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/one-house-ai/verify");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      transferDate: "2024-04-30",
      opinion: data.opinion,
      citations: [
        { docNo: "DOC-1", origin: "card" },
        { docNo: "서면-2026-법규재산-0109", origin: "live", source: "nts", id: "1" },
      ],
    });
    const excerpt = screen.getByTestId("one-house-ai-verify-excerpt-0").textContent ?? "";
    expect(excerpt).toContain("원문에 없음: 임대 개시 전이면 비과세");
    expect(excerpt).toContain("소득세법 시행령 §155⑳ — 확인됨 (2024-04-30 시행본)");
    // 비용은 의견 + 검증 합산: 0.144 + (0.004 + 0.02)
    expect(screen.getByTestId("one-house-ai-usage-cost").textContent).toContain("이번 호출 비용 약 $0.168");
  });

  it("의견을 다시 받으면 옛 의견의 검증 응답이 늦게 와도 새 의견의 검증을 덮지 않는다", async () => {
    const verifyOf = (support: string): OneHouseAiVerifyData => ({
      statutes: [],
      docs: [],
      points: [{ index: 0, support: support as "supported", reason: support, unsupportedClaims: [], statuteKeys: [], docNos: [] }],
      model: null,
      usage: null,
    });
    let releaseOld: (v: unknown) => void = () => {};
    const oldVerify = new Promise((r) => (releaseOld = r));
    const data2 = { ...data, opinion: { ...data.opinion, summary: "두 번째 의견" } };
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data }) })
      .mockReturnValueOnce(oldVerify) // 첫 의견의 검증 — 나중에 끝난다
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: data2 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: verifyOf("supported") }) });
    render(<OneHouseAiOpinionPanel form={createInitialOneHouseJudgmentForm()} result={result(1)} />);
    fireEvent.click(screen.getByTestId("one-house-ai-opinion-run"));
    await screen.findByTestId("one-house-ai-verify-status"); // 첫 검증 중
    fireEvent.click(screen.getByTestId("one-house-ai-opinion-run"));
    expect((await screen.findByTestId("one-house-ai-verify-badge-0")).textContent).toBe("원문 일치");
    // 옛 검증이 이제 끝난다 — 새 의견의 배지는 그대로
    releaseOld({ ok: true, status: 200, json: async () => ({ data: verifyOf("not_supported") }) });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("one-house-ai-verify-badge-0").textContent).toBe("원문 일치");
    expect(screen.getByTestId("one-house-ai-opinion-view").textContent).toContain("두 번째 의견");
  });

  it("원문 검증이 실패하면 실패를 알리고 다시 검증할 수 있다", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data }) })
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: { message: "법제처 응답 없음" } }) });
    render(<OneHouseAiOpinionPanel form={createInitialOneHouseJudgmentForm()} result={result(1)} />);
    fireEvent.click(screen.getByTestId("one-house-ai-opinion-run"));
    const status = await screen.findByText(/원문 검증 실패 — 법제처 응답 없음/);
    expect(status).toBeTruthy();
    expect(screen.queryByTestId("one-house-ai-verify-badge-0")).toBeNull();
  });

  it("서버 오류 문구를 보여 준다", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: { message: "해석례 카드를 찾지 못했습니다" } }) });
    render(<OneHouseAiOpinionPanel form={createInitialOneHouseJudgmentForm()} result={result(0)} />);
    fireEvent.click(screen.getByTestId("one-house-ai-opinion-run"));
    expect((await screen.findByRole("alert")).textContent).toBe("해석례 카드를 찾지 못했습니다");
  });
});
