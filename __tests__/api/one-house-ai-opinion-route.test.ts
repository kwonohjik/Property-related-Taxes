/**
 * POST /api/one-house-ai/opinion — 게이트 · 입력 · 키 · 카드 폴더 · 인용 걸러 내기 · 응답에 카드 내용을 싣지 않음.
 * LLM·카드 폴더는 모의한다(카드는 가짜 — 실제 카드는 비공개).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import type { OneHouseCard } from "@/lib/one-house-ai/opinion/cards";

const gate = vi.fn();
vi.mock("@/lib/one-house-ai/access-guard", () => ({ checkOneHouseAiAccess: () => gate() }));
const loadCards = vi.fn();
vi.mock("@/lib/one-house-ai/opinion/card-store", () => ({ loadOneHouseCards: () => loadCards(), oneHouseCardsDir: () => "/cards" }));
const generate = vi.fn();
vi.mock("@/lib/one-house-ai/opinion/opinion", () => ({ generateOneHouseOpinion: (...a: unknown[]) => generate(...a) }));
const { POST } = await import("@/app/api/one-house-ai/opinion/route");

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/one-house-ai/opinion", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );

const card = (id: string, lawAxis: string[]): OneHouseCard => ({
  id, docNo: `DOC-${id}`, kind: "해석", date: "2020.01.01.", url: `https://example.test/${id}`, title: `제목 ${id}`,
  lawAxis, topic: "기타", facts: ["비공개 사실"], question: "질의", answer: "회신", verdict: "과세",
  currentRule: { text: "비공개 현행 규칙" },
});

const body = {
  form: { transferDate: "2024-04-30" },
  result: { judgment: { isExempt: false, undetermined: [{ id: "x", reason: "시행령 §155⑳ 확인 필요" }] } },
  sourceText: "원문",
  notes: ["메모"],
};

const OLD_KEY = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  gate.mockReturnValue({ ok: true });
  loadCards.mockResolvedValue([card("E1", ["소득세법 시행령 §155⑳"]), card("E2", ["소득세법 §98"])]);
  generate.mockResolvedValue({
    opinion: {
      engineAgreement: "possible_difference",
      summary: "요약",
      points: [{ topic: "쟁점", opinion: "의견", citedDocNos: ["DOC-E1", "DOC-NOPE"], statutes: [] }],
      factsToConfirm: [],
      caveats: [],
    },
    model: "claude-opus-5-5",
    usage: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 },
  });
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => {
  if (OLD_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = OLD_KEY;
  vi.clearAllMocks();
});

describe("AI 참고 의견 route", () => {
  it("관련 카드만 넣고, 받지 않은 문서번호 인용은 지우며, 응답에는 공개 서지만 싣는다", async () => {
    const res = await call(body);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const input = generate.mock.calls[0][0];
    expect(input.cards.map((c: OneHouseCard) => c.id)).toEqual(["E1"]); // §155⑳만 겹친다
    expect(input).toMatchObject({ facts: { transferDate: "2024-04-30" }, sourceText: "원문", notes: ["메모"] });
    expect(data.opinion.points[0].citedDocNos).toEqual(["DOC-E1"]);
    expect(data.droppedCitations).toEqual(["DOC-NOPE"]);
    expect(data.cards).toEqual([{ docNo: "DOC-E1", kind: "해석", date: "2020.01.01.", url: "https://example.test/E1", title: "제목 E1" }]);
    expect(JSON.stringify(data)).not.toContain("비공개");
  });

  it("개발 서버가 아니면 막고 의견을 부르지 않는다", async () => {
    gate.mockReturnValue({ ok: false, status: 403, code: "FORBIDDEN", message: "로컬 개발 서버 전용" });
    expect((await call(body)).status).toBe(403);
    expect(generate).not.toHaveBeenCalled();
  });

  it("판정 결과가 없으면 400", async () => {
    expect((await call({ form: {} })).status).toBe(400);
  });

  it("카드 폴더가 비면 503 — 폴더 경로를 알린다", async () => {
    loadCards.mockResolvedValue([]);
    const res = await call(body);
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toContain("/cards");
    expect(generate).not.toHaveBeenCalled();
  });

  it("API 키가 없으면 503", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect((await call(body)).status).toBe(503);
  });
});
