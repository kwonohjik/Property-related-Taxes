/**
 * @vitest-environment jsdom
 *
 * 판정 메뉴 「원문으로 채우기 (AI)」(하이브리드 AI 검토 도구 P4) — 버튼 노출 · 추출 미리보기 · 통째로 바꾸기 · 질문 카드.
 * 서버 경로는 모의한다(실호출은 비용이 든다 — route 자체는 `one-house-ai-extract-route.test.ts`).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import OneHouseJudgmentCalculator from "@/app/calc/one-house-exemption/OneHouseJudgmentCalculator";
import { OneHouseAiExtractDialog } from "@/components/calc/one-house/OneHouseAiExtractDialog";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { useOneHouseJudgmentStore } from "@/lib/stores/one-house-judgment-store";
import type { OneHouseAiExtractData } from "@/app/api/one-house-ai/extract/route";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";
import type { FieldSpec } from "@/lib/one-house-ai/field-catalog.types";

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
  lawLookups: [{ tool: "lookup_statute", input: { lawName: "소득세법 시행령", article: "제154조" }, ok: true, summary: "소득세법 시행령 제154조 (현행)" }],
  sourceCitations: [
    { kind: "statute", raw: "소득세법 시행령 제155조 제20항", status: "not_found", basis: "current", note: "현행에 없음 — 과거 조문일 수 있음" },
    { kind: "doc", raw: "서면-2016-부동산-2944", status: "found", docNo: "서면-2016-부동산-2944[부동산납세과-425]", url: "https://taxlaw.nts.go.kr/qt/x" },
  ],
  model: "claude-opus-5-5",
  usage: { input: 2000, cacheRead: 30000, cacheWrite: 0, output: 4000 },
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
  it("서버 페이지가 끄면(배포·키 없음) 버튼이 없다", () => {
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
    // 원문 속 인용 대조(결정론)와 AI 조문 조회 기록
    const cites = screen.getByTestId("one-house-ai-source-citations").textContent ?? "";
    expect(cites).toContain("원문 속 인용 대조 2건");
    expect(cites).toContain("소득세법 시행령 제155조 제20항 — 찾지 못함 (현행 기준) · 현행에 없음 — 과거 조문일 수 있음");
    expect(cites).toContain("서면-2016-부동산-2944 — 확인됨");
    expect(screen.getByTestId("one-house-ai-law-lookups").textContent).toContain("소득세법 시행령 제154조 (현행)");
    // 0.008 + 0.006 + 0.08
    expect(screen.getByTestId("one-house-ai-usage-cost").textContent).toContain("이번 호출 비용 약 $0.094");

    fireEvent.click(screen.getByTestId("one-house-ai-extract-apply"));
    const f = useOneHouseJudgmentStore.getState().formData;
    expect(f.transferDate).toBe("2024-04-30");
    expect(f.assets[0].acquisitionDate).toBe("2018-03-15");
    expect(f.houses.map((h) => [h.id, h.acquisitionDate, h.region])).toEqual([["B", "2022-05-20", "capital"]]);

    const card = screen.getByTestId("one-house-ai-review");
    expect(card.textContent).toContain("A아파트에 입주한 날은 언제입니까?");
    // 적용 후 남는 검토 카드에도 대조 결과가 남는다
    expect(card.textContent).toContain("원문 속 인용 대조 2건");
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
    respond(403, { error: { code: "FORBIDDEN", message: "AI 사실 추출은 로컬 개발 서버에서만 쓸 수 있습니다." } });
    render(<OneHouseJudgmentCalculator aiExtractEnabled />);
    await extract();

    expect((await screen.findByRole("alert")).textContent).toBe("AI 사실 추출은 로컬 개발 서버에서만 쓸 수 있습니다.");
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

  // 질문에 그 자리에서 답하기(사용자 결정 2026-10-20 — 미리보기 창과 검토 카드 둘 다 · 행이 특정되는 질문만)
  describe("질문에 바로 답하기", () => {
    // 추출 API가 질문에 붙이는 칸 정보(사전 한 줄)
    const field = (path: string) => {
      const s: FieldSpec = ONE_HOUSE_FIELD_CATALOG.find((x) => x.path === path)!;
      return { path: s.path, kind: s.kind, label: s.label, values: s.values };
    };
    const withAnswerable: OneHouseAiExtractData = {
      ...data,
      questions: [
        { path: "isOneHousehold", label: "1세대", field: field("isOneHousehold"), question: "1세대입니까?", source: "validation" },
        { path: "houses[B].region", label: "지역", field: field("houses[].region"), question: "B주택은 어디에 있습니까?", source: "llm" },
        ...data.questions,
      ],
    };
    const radio = (container: HTMLElement, path: string, value: string) =>
      container.querySelector<HTMLInputElement>(`input[type="radio"][name="one-house-ai-answer-${path}"][value="${value}"]`)!;
    const otherRegion = field("houses[].region").values!.find((v) => v.value !== "capital")!.value;

    it("미리보기 창에서 답한 값이 추출값과 함께 적용된다", async () => {
      respond(200, { data: withAnswerable });
      render(<OneHouseJudgmentCalculator aiExtractEnabled />);
      await extract();
      const preview = await screen.findByTestId("one-house-ai-extract-preview"); // 창은 portal로 body에 붙는다

      fireEvent.click(radio(preview, "isOneHousehold", "false"));
      fireEvent.click(radio(preview, "houses[B].region", otherRegion));
      // 행을 새로 만들어야 하는 묶음 질문은 이 창에서 받지 않는다
      expect(screen.getByText("적용한 뒤 판정 화면의 검토 카드에서 해당 단계로 이동해 입력합니다.")).toBeTruthy();

      fireEvent.click(screen.getByTestId("one-house-ai-extract-apply"));
      const f = useOneHouseJudgmentStore.getState().formData;
      expect(f.isOneHousehold).toBe(false);
      expect(f.houses.map((h) => [h.id, h.region])).toEqual([["B", otherRegion]]);
      expect(f.transferDate).toBe("2024-04-30");
    });

    it("적용 뒤 검토 카드에서 답하면 판정 메뉴 폼에 곧바로 들어간다", async () => {
      respond(200, { data: withAnswerable });
      const { container } = render(<OneHouseJudgmentCalculator aiExtractEnabled />);
      await extract();
      fireEvent.click(await screen.findByTestId("one-house-ai-extract-apply"));

      const card = screen.getByTestId("one-house-ai-review");
      expect(radio(card, "isOneHousehold", "true").checked).toBe(true); // 추출값을 보여 준다
      fireEvent.click(radio(card, "houses[B].region", otherRegion));
      expect(useOneHouseJudgmentStore.getState().formData.houses[0].region).toBe(otherRegion);
      // 묶음 질문은 여전히 단계 이동 버튼
      expect(screen.getByRole("button", { name: "「양도 대상 주택」 단계에서 입력" })).toBeTruthy();
      expect(container.querySelectorAll('[data-testid^="one-house-ai-answer-"][data-testid$="-field"]')).toHaveLength(2);
    });
  });
});

// 계획서 docs/00-pm/one-house-ai-recorded-leftovers.plan.md §3.3-2·3 (F-9 · F-10, Q-2 c)
describe("원문 수정 뒤 적용 · 응답 본문을 읽지 못함", () => {
  it("추출 뒤 원문을 고치면 적용을 막고, 되돌리면 추출에 쓴 원문으로 적용한다", async () => {
    respond(200, { data });
    const onApply = vi.fn();
    render(<OneHouseAiExtractDialog form={createInitialOneHouseJudgmentForm()} onApply={onApply} />);
    await extract("원문 가");
    await screen.findByTestId("one-house-ai-extract-preview");
    const box = screen.getByTestId("one-house-ai-extract-text");
    const applyButton = () => screen.getByTestId("one-house-ai-extract-apply") as HTMLButtonElement;

    fireEvent.change(box, { target: { value: "원문 가 고침" } });
    expect(screen.getByTestId("one-house-ai-extract-stale").textContent).toContain("다시 추출해야 적용할 수 있습니다");
    expect(applyButton().disabled).toBe(true);

    // 앞뒤 공백만 다르면 같은 원문이다(서버와 같은 기준)
    fireEvent.change(box, { target: { value: "  원문 가  " } });
    expect(screen.queryByTestId("one-house-ai-extract-stale")).toBeNull();
    fireEvent.click(applyButton());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][1].sourceText).toBe("원문 가");
  });

  it("200인데 본문을 읽지 못하면 네트워크가 아니라 응답 문제로 알린다", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } });
    render(<OneHouseAiExtractDialog form={createInitialOneHouseJudgmentForm()} onApply={vi.fn()} />);
    await extract();
    expect((await screen.findByRole("alert")).textContent).toBe("AI 사실 추출 응답을 읽지 못했습니다. 다시 시도하세요.");
    expect(screen.queryByTestId("one-house-ai-extract-preview")).toBeNull();
  });
});
