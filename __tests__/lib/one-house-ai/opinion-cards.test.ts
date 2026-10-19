/** AI 참고 의견 — 관련 카드 고르기 · 폼 요약. 카드는 가짜다(실제 카드는 비공개 — 저장소에 넣지 않는다). */
import { describe, it, expect } from "vitest";
import { articleTokens, selectCards, topicsIn, type OneHouseCard } from "@/lib/one-house-ai/opinion/cards";
import { compactJudgmentForm } from "@/lib/one-house-ai/opinion/compact-form";
import { OPINION_SYSTEM_PROMPT } from "@/lib/one-house-ai/opinion/opinion-prompt";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { createHouseEntry } from "@/lib/stores/house-entry-factory";

const card = (id: string, lawAxis: string[], topic: string, assertable = true): OneHouseCard => ({
  id,
  docNo: `DOC-${id}`,
  kind: "해석",
  date: "2020.01.01.",
  url: `https://example.test/${id}`,
  title: `제목 ${id}`,
  lawAxis,
  topic,
  facts: [],
  question: "",
  answer: "",
  verdict: "기타",
  assertable,
});

describe("articleTokens", () => {
  it("조·항을 뽑고 법·령 층위와 공백은 버린다", () => {
    expect([...articleTokens("소득세법 시행령 §155 ⑳ · 영 §154의2① · 소득세법 §89①3호")]).toEqual([
      "155",
      "155⑳",
      "154의2",
      "154의2①",
      "89",
      "89①",
    ]);
  });
  it("㉑ 이후 항도 뽑는다", () => {
    expect(articleTokens("시행령 §155㉓").has("155㉓")).toBe(true);
  });
});

describe("selectCards", () => {
  const cards = [
    card("E001", ["소득세법 시행령 §155⑳"], "장기임대거주주택"),
    card("E002", ["소득세법 시행령 §155①"], "일시적2주택"),
    card("E003", ["소득세법 시행령 §155②"], "상속"),
    card("E004", ["소득세법 시행령 §155①"], "일시적2주택", false),
    card("E005", ["소득세법 §98"], "기타"),
  ];
  it("항 일치 2점 · 조 일치 1점 · 주제 3점 — 0점 카드는 넣지 않는다", () => {
    const got = selectCards(cards, "판정 보류: 시행령 §155① 일시적 2주택 처분기한", 10).map((c) => c.id);
    // E002·E004: 주제 3 + 항 2 + 조 1 = 6 (동점 → 단언 가능 먼저) · E001·E003: 조 1 · E005: 0
    expect(got).toEqual(["E002", "E004", "E001", "E003"]);
  });
  it("개수 상한", () => {
    expect(selectCards(cards, "§155①", 2)).toHaveLength(2);
  });
  it("주제어", () => {
    expect([...topicsIn("동거봉양 합가 · 상속받은 주택")].sort()).toEqual(["동거봉양", "상속"].sort());
  });
});

describe("compactJudgmentForm", () => {
  it("빈 폼은 아무것도 남지 않는다", () => {
    expect(compactJudgmentForm(createInitialOneHouseJudgmentForm() as never)).toEqual({});
  });
  it("입력한 칸과 명부 행의 기본값과 다른 칸만 남긴다", () => {
    const base = createInitialOneHouseJudgmentForm();
    const form = {
      ...base,
      transferDate: "2024-04-30",
      assets: [{ ...base.assets[0], acquisitionDate: "2018-03-15" }],
      houses: [{ ...createHouseEntry("B"), acquisitionDate: "2022-05-20" }],
    };
    expect(compactJudgmentForm(form as never)).toEqual({
      transferDate: "2024-04-30",
      asset: { acquisitionDate: "2018-03-15" },
      houses: [{ id: "B", acquisitionDate: "2022-05-20" }],
    });
  });
});

describe("buildOpinionUserMessage", () => {
  it("카드 파일 경로·검증일은 보내지 않고, 맞는 카드가 없으면 근거 부족으로 답하라고 알린다", async () => {
    const { buildOpinionUserMessage } = await import("@/lib/one-house-ai/opinion/opinion-prompt");
    const withCard = buildOpinionUserMessage({
      judgment: {},
      facts: {},
      cards: [{ ...card("E9", [], "기타"), rawFile: "raw/nts/E9.txt", verifiedAt: "2026-10-06" }],
    });
    expect(withCard).toContain("DOC-E9");
    expect(withCard).not.toContain("raw/nts");
    expect(withCard).not.toContain("2026-10-06");
    expect(buildOpinionUserMessage({ judgment: {}, facts: {}, cards: [] })).toContain("insufficient_basis");
  });
});

// 첫 실호출 의견(2026-10-20)에서 본 세 가지 — 카드 메모를 해석례 결론으로 인용 · 입력 밖 지정일 단정 · 쓰지 않은 카드 나열
describe("OPINION_SYSTEM_PROMPT", () => {
  it("docNo는 질의·회신이 직접 말한 내용에만 붙이고 eraCaution·currentRule에는 붙이지 않는다", () => {
    expect(OPINION_SYSTEM_PROMPT).toContain("질의(question)·회신(answer)이 직접 말한 내용에만");
    expect(OPINION_SYSTEM_PROMPT).toContain("그 내용을 말하는 문장에는 docNo를 붙이지 않는다");
  });
  it("입력·카드에 없는 사실을 단정하지 않고 확인 사항으로 넘긴다", () => {
    expect(OPINION_SYSTEM_PROMPT).toContain("당신의 지식으로 단정하지 않는다");
  });
  it("쓰지 않은 카드를 나열하지 않는다", () => {
    expect(OPINION_SYSTEM_PROMPT).toContain("쓰지 않은 카드는 나열하지 않는다");
  });
});
