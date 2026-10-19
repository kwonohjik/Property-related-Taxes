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
    points: [{ topic: "장기임대주택 요건", opinion: "의견 본문", citedDocNos: ["DOC-1"], statutes: ["소득세법 시행령 §155⑳"] }],
    factsToConfirm: ["임대 개시일은 언제입니까?"],
    caveats: ["해석 당시 법령 기준입니다."],
  },
  cards: [{ docNo: "DOC-1", kind: "해석", date: "2020.01.01.", url: "https://example.test/1", title: "제목" }],
  droppedCitations: ["DOC-X"],
  model: "claude-opus-5-5",
  usage: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 },
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

    rerender(<OneHouseAiOpinionPanel form={form} result={result(1)} sourceText="원문" notes={[]} />);
    expect(screen.queryByTestId("one-house-ai-opinion-view")).toBeNull();
  });

  it("서버 오류 문구를 보여 준다", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: { message: "해석례 카드를 찾지 못했습니다" } }) });
    render(<OneHouseAiOpinionPanel form={createInitialOneHouseJudgmentForm()} result={result(0)} />);
    fireEvent.click(screen.getByTestId("one-house-ai-opinion-run"));
    expect((await screen.findByRole("alert")).textContent).toBe("해석례 카드를 찾지 못했습니다");
  });
});
