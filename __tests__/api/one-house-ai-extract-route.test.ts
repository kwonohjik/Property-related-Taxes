/**
 * POST /api/one-house-ai/extract — 개발 서버 게이트 · 원문 길이 · API 키 · 추출 실패 · 질문 합치기.
 * LLM 호출(`extractOneHouseFacts`)과 로그인 확인은 모의한다(비용·네트워크 없음).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import type { OneHouseExtraction } from "@/lib/one-house-ai/extraction-schema";

const gate = vi.fn();
const extract = vi.fn();
vi.mock("@/lib/one-house-ai/access-guard", () => ({ checkOneHouseAiAccess: () => gate() }));
vi.mock("@/lib/one-house-ai/extract", async (orig) => ({
  ...(await orig<typeof import("@/lib/one-house-ai/extract")>()),
  extractOneHouseFacts: (text: string) => extract(text),
}));

const { POST } = await import("@/app/api/one-house-ai/extract/route");
const { ExtractionFailedError } = await import("@/lib/one-house-ai/extract");

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/one-house-ai/extract", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );

const extraction = (over: Partial<OneHouseExtraction> = {}): OneHouseExtraction => ({
  rows: [{ collection: "houses", rowId: "B", description: "다른 주택" }],
  facts: [
    { path: "transferDate", value: "2024-06-15", evidence: "2024.6.15. 양도" },
    { path: "isOneHousehold", value: "true", evidence: "1세대" },
    { path: "asset.assetKind", value: "housing", evidence: "주택" },
    { path: "asset.acquisitionDate", value: "2015-03-01", evidence: "2015.3.1. 취득" },
    { path: "asset.residencePeriodMonthsAsset", value: "36", evidence: "3년 거주" },
    { path: "houses[B].acquisitionDate", value: "2023-05-01", evidence: "2023.5.1. B 취득" },
    { path: "houses[B].region", value: "capital", evidence: "서울" },
  ],
  missingFacts: [{ path: "houses[B].acquisitionOrigin", question: "B주택은 어떻게 취득했습니까?", why: "신규 주택 경위" }],
  notes: [],
  ...over,
});

const OLD_KEY = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  gate.mockReturnValue({ ok: true });
  extract.mockResolvedValue({ extraction: extraction(), model: "claude-opus-5-5", usage: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 } });
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => {
  vi.clearAllMocks();
  if (OLD_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = OLD_KEY;
});

describe("POST /api/one-house-ai/extract", () => {
  it("개발 서버가 아니면 막고 추출을 부르지 않는다", async () => {
    gate.mockReturnValue({ ok: false, status: 403, code: "FORBIDDEN", message: "AI 사실 추출은 로컬 개발 서버에서만 쓸 수 있습니다." });
    const res = await call({ text: "사실관계" });
    expect(res.status).toBe(403);
    expect(extract).not.toHaveBeenCalled();
  });

  it("빈 원문 · 1만 자 초과는 400", async () => {
    expect((await call({ text: "  " })).status).toBe(400);
    expect((await call({ text: "가".repeat(10_001) })).status).toBe(400);
    expect(extract).not.toHaveBeenCalled();
  });

  it("API 키가 없으면 503이고 추출을 부르지 않는다", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await call({ text: "사실관계" });
    expect(res.status).toBe(503);
    expect(extract).not.toHaveBeenCalled();
  });

  it("추출 거절·잘림은 422, 그 밖의 호출 실패는 502", async () => {
    extract.mockRejectedValueOnce(new ExtractionFailedError("출력 한도에 걸려 추출이 잘렸습니다"));
    expect((await call({ text: "사실관계" })).status).toBe(422);
    extract.mockRejectedValueOnce(new Error("network"));
    expect((await call({ text: "사실관계" })).status).toBe(502);
  });

  it("폼 조각 · 근거 · LLM 질문 뒤에 검증이 막는 칸(LLM이 묻지 않은 것만)을 덧붙인다", async () => {
    const res = await call({ text: "사실관계" });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.form).toMatchObject({ transferDate: "2024-06-15", houses: [{ id: "B", acquisitionDate: "2023-05-01" }] });
    expect(data.facts).toHaveLength(7);
    // 화면은 필드 사전을 싣지 않으므로 칸 이름·선택지 뜻을 응답에 붙인다
    expect(data.facts).toContainEqual(
      expect.objectContaining({ path: "houses[B].region", value: "capital", label: expect.any(String), valueLabel: expect.any(String) }),
    );
    expect(data.facts.find((f: { path: string }) => f.path === "transferDate")).toMatchObject({ label: expect.any(String) });
    expect(data.facts.find((f: { path: string }) => f.path === "transferDate").valueLabel).toBeUndefined();
    const q = data.questions as { path: string; source: string; question: string }[];
    // LLM이 물은 칸은 한 번만
    expect(q.filter((x) => x.path === "houses[B].acquisitionOrigin")).toEqual([
      expect.objectContaining({ source: "llm", question: "B주택은 어떻게 취득했습니까?" }),
    ]);
    // 원문에 없는 양도가액 — LLM이 묻지 않았어도 ⑧이 막으므로 질문이 된다
    expect(q).toContainEqual(expect.objectContaining({ path: "contractTotalPrice", source: "validation", question: "예상 양도가액을 입력하세요." }));
  });

  it("LLM이 거주를 행 이름 없이 물었으면 검증의 거주 질문은 덧붙이지 않고, 라벨은 사전에서 찾는다", async () => {
    const facts = extraction().facts.filter((f) => f.path !== "asset.residencePeriodMonthsAsset");
    extract.mockResolvedValueOnce({
      extraction: extraction({
        facts,
        missingFacts: [{ path: "asset.residencePeriods[].moveInDate", question: "A에 입주한 날은 언제입니까?", why: "거주기간" }],
      }),
      model: "m",
      usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
    });
    const { data } = await (await call({ text: "사실관계" })).json();
    const q = data.questions as { path: string; source: string; label?: string }[];
    expect(q.filter((x) => x.path.startsWith("asset.residencePeriods"))).toEqual([
      expect.objectContaining({ path: "asset.residencePeriods[].moveInDate", source: "llm", label: expect.any(String) }),
    ]);
  });

  it("사전에 없는 경로·형식 오류는 넣지 않고 issues로 돌려준다", async () => {
    extract.mockResolvedValueOnce({
      extraction: extraction({ facts: [...extraction().facts, { path: "transferDate2", value: "x", evidence: "" }] }),
      model: "m",
      usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
    });
    const { data } = await (await call({ text: "사실관계" })).json();
    expect(data.issues).toContainEqual(expect.objectContaining({ path: "transferDate2" }));
    expect(data.form.transferDate2).toBeUndefined();
  });
});
