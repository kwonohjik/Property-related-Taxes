/**
 * @vitest-environment jsdom
 *
 * 판정 메뉴 「원문으로 채우기 (AI)」(하이브리드 AI 검토 도구 P4) — 버튼 노출 · 추출 미리보기 · 통째로 바꾸기 · 질문 카드.
 * 서버 경로는 모의한다(실호출은 비용이 든다 — route 자체는 `one-house-ai-extract-route.test.ts`).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import OneHouseJudgmentCalculator from "@/app/calc/one-house-exemption/OneHouseJudgmentCalculator";
import { useOneHouseJudgmentStore } from "@/lib/stores/one-house-judgment-store";
import type { OneHouseAiExtractData } from "@/app/api/one-house-ai/extract/route";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: () => ({ savedId: null }),
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

const data: OneHouseAiExtractData = {
  form: {
    isOneHousehold: true,
    transferDate: "2024-04-30",
    asset: { acquisitionDate: "2018-03-15" },
    houses: [{ id: "B", acquisitionDate: "2022-05-20", region: "capital" }],
  },
  facts: [
    { path: "transferDate", value: "2024-04-30", evidence: "2024.4.30. A를 양도", label: "양도일" },
    { path: "houses[B].region", value: "capital", evidence: "경기 고양시 B아파트", label: "지역", valueLabel: "수도권" },
  ],
  questions: [
    { path: "asset.residencePeriods[].moveInDate", label: "전입일", question: "A아파트에 입주한 날은 언제입니까?", why: "거주 기간", source: "llm" },
  ],
  notes: ["취득 원인이 원문에 없습니다."],
  issues: [],
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
  useOneHouseJudgmentStore.getState().reset();
});

const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });

async function extract(text = "甲이 2018.3.15. A아파트를 취득…") {
  fireEvent.click(screen.getByTestId("one-house-ai-extract-open"));
  fireEvent.change(await screen.findByTestId("one-house-ai-extract-text"), { target: { value: text } });
  fireEvent.click(screen.getByTestId("one-house-ai-extract-run"));
}

describe("판정 메뉴 AI 사실 추출 (P4)", () => {
  it("관리자가 아니면(서버가 끄면) 버튼이 없다", () => {
    render(<OneHouseJudgmentCalculator />);
    expect(screen.queryByTestId("one-house-ai-extract-open")).toBeNull();
  });

  it("추출 결과를 근거와 함께 보여 주고, 적용하면 폼을 채우고 질문 카드를 남긴다", async () => {
    respond(200, { data });
    render(<OneHouseJudgmentCalculator aiExtractEnabled />);
    await extract();

    const preview = await screen.findByTestId("one-house-ai-extract-preview");
    expect(fetchMock).toHaveBeenCalledWith("/api/one-house-ai/extract", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: "甲이 2018.3.15. A아파트를 취득…" });
    expect(preview.textContent).toContain("수도권"); // 선택지 뜻
    expect(preview.textContent).toContain("근거: 「경기 고양시 B아파트」");
    expect(preview.textContent).toContain("A아파트에 입주한 날은 언제입니까?");
    expect(preview.textContent).toContain("참고용");

    fireEvent.click(screen.getByTestId("one-house-ai-extract-apply"));
    const f = useOneHouseJudgmentStore.getState().formData;
    expect(f.transferDate).toBe("2024-04-30");
    expect(f.assets[0].acquisitionDate).toBe("2018-03-15");
    expect(f.houses.map((h) => [h.id, h.acquisitionDate, h.region])).toEqual([["B", "2022-05-20", "capital"]]);

    const card = screen.getByTestId("one-house-ai-review");
    expect(card.textContent).toContain("A아파트에 입주한 날은 언제입니까?");
    // 전입일은 ② 양도 대상 주택 화면의 칸이다
    fireEvent.click(screen.getByRole("button", { name: "「양도 대상 주택」 단계에서 입력" }));
    expect(useOneHouseJudgmentStore.getState().currentStep).toBe(1);
  });

  it("입력이 있으면 지운다고 알리고, 적용하면 기존 명부 행과 섞지 않는다", async () => {
    respond(200, { data });
    useOneHouseJudgmentStore.getState().updateFormData({
      houses: [{ ...useOneHouseJudgmentStore.getState().formData.houses[0], id: "old", acquisitionDate: "2010-01-01" } as never],
    });
    render(<OneHouseJudgmentCalculator aiExtractEnabled />);
    await extract();

    const apply = await screen.findByTestId("one-house-ai-extract-apply");
    expect(apply.textContent).toBe("지금 입력을 지우고 적용");
    expect(screen.getByText("적용하면 지금 입력한 값은 모두 지워집니다.")).toBeTruthy();
    fireEvent.click(apply);
    expect(useOneHouseJudgmentStore.getState().formData.houses.map((h) => h.id)).toEqual(["B"]);
  });

  it("서버 오류 문구를 그대로 보여 주고 폼은 바꾸지 않는다", async () => {
    respond(403, { error: { code: "FORBIDDEN", message: "AI 사실 추출은 관리자 전용입니다." } });
    render(<OneHouseJudgmentCalculator aiExtractEnabled />);
    await extract();

    expect((await screen.findByRole("alert")).textContent).toBe("AI 사실 추출은 관리자 전용입니다.");
    expect(screen.queryByTestId("one-house-ai-extract-apply")).toBeNull();
    expect(useOneHouseJudgmentStore.getState().formData.transferDate).toBe("");
  });

  it("초기화하면 질문 카드도 사라진다", async () => {
    respond(200, { data });
    render(<OneHouseJudgmentCalculator aiExtractEnabled />);
    await extract();
    fireEvent.click(await screen.findByTestId("one-house-ai-extract-apply"));
    expect(screen.getByTestId("one-house-ai-review")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "입력값 초기화" }));
    fireEvent.click(await screen.findByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(screen.queryByTestId("one-house-ai-review")).toBeNull());
  });
});
