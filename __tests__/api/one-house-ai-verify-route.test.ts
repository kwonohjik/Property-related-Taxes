/**
 * POST /api/one-house-ai/verify — 게이트 · 입력 · 키 · 결정론 결과 → 원문이 있는 쟁점만 2차 대조 · 실패는 확인 불가.
 * 결정론 함수·LLM·카드 저장소는 모의한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

const gate = vi.fn();
vi.mock("@/lib/one-house-ai/access-guard", () => ({ checkOneHouseAiAccess: () => gate() }));
vi.mock("@/lib/one-house-ai/opinion/card-store", () => ({ loadOneHouseCards: async () => [], oneHouseCardsDir: () => "/cards" }));
const statute = vi.fn();
const doc = vi.fn();
vi.mock("@/lib/one-house-ai/verify/verify", async (orig) => ({
  ...(await orig<typeof import("@/lib/one-house-ai/verify/verify")>()),
  checkStatute: (...a: unknown[]) => statute(...a),
  checkDoc: (...a: unknown[]) => doc(...a),
}));
const compare = vi.fn();
vi.mock("@/lib/one-house-ai/verify/verify-llm", () => ({ compareWithSources: (...a: unknown[]) => compare(...a) }));
const { POST } = await import("@/app/api/one-house-ai/verify/route");

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/one-house-ai/verify", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );

const ref = { law: "소득세법 시행령", article: 155, paragraph: 21 };
const body = {
  transferDate: "2024-04-30",
  opinion: {
    engineAgreement: "possible_difference",
    summary: "요약",
    points: [
      { topic: "조문만", opinion: "의견 0", citedDocNos: [], statutes: [ref] },
      { topic: "해석례 실패", opinion: "의견 1", citedDocNos: ["DOC-F"], statutes: [] },
      { topic: "인용 없음", opinion: "의견 2", citedDocNos: [], statutes: [] },
    ],
    factsToConfirm: [],
    caveats: [],
  },
  citations: [{ docNo: "DOC-F", origin: "live", source: "nts", id: "1" }],
};

const OLD_KEY = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  gate.mockReturnValue({ ok: true });
  statute.mockResolvedValue({ ref, status: "verified", baseDate: "2024-04-30", excerpt: "㉑ 1세대가 장기임대주택의" });
  doc.mockResolvedValue({ docNo: "DOC-F", status: "failed", reason: "국세법령정보시스템 오류 (500)" });
  compare.mockResolvedValue({
    results: new Map([[0, { support: "supported", reason: "원문과 같다", unsupportedClaims: [] }]]),
    model: "claude-opus-5-5",
    usage: { input: 5, cacheRead: 0, cacheWrite: 0, output: 5 },
  });
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => {
  if (OLD_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = OLD_KEY;
  vi.clearAllMocks();
});

describe("원문 검증 route", () => {
  it("원문을 받은 쟁점만 2차 대조 · 받지 못한 쟁점은 cannot_verify(통과 아님) · 인용 없는 쟁점도 cannot_verify", async () => {
    const res = await call(body);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(statute).toHaveBeenCalledWith(ref, "2024-04-30");
    // 2차 대조에는 쟁점 0만 — 발췌는 방금 다시 받은 원문
    expect(compare.mock.calls[0][0]).toEqual([
      { index: 0, topic: "조문만", opinion: "의견 0", excerpts: [{ label: "소득세법 시행령 §155㉑ (2024-04-30 시행본)", text: "㉑ 1세대가 장기임대주택의" }] },
    ]);
    expect(data.points.map((p: { support: string }) => p.support)).toEqual(["supported", "cannot_verify", "cannot_verify"]);
    expect(data.points[1].reason).toBe("인용한 원문을 받지 못했습니다.");
    expect(data.points[2].reason).toBe("인용한 조문·해석례가 없습니다.");
    expect(data.docs).toEqual([{ docNo: "DOC-F", status: "failed", reason: "국세법령정보시스템 오류 (500)" }]);
    expect(data.statutes[0]).toMatchObject({ key: "소득세법 시행령 §155㉑", status: "verified" });
    expect(data.model).toBe("claude-opus-5-5");
  });

  it("한 쟁점의 인용 중 하나라도 확인되지 않으면 「원문 일치」가 아니라 최대 일부 일치", async () => {
    const mixed = { ...body, opinion: { ...body.opinion, points: [{ topic: "혼합", opinion: "의견", citedDocNos: ["DOC-F"], statutes: [ref] }] } };
    const { data } = await (await call(mixed)).json();
    expect(data.points[0].support).toBe("partial");
    expect(data.points[0].reason).toContain("확인되지 않은 인용: DOC-F");
  });

  it("2차 대조 호출이 실패해도 결정론 결과는 돌려주고, 쟁점은 확인 불가로 둔다", async () => {
    compare.mockRejectedValue(new Error("upstream"));
    const { data } = await (await call(body)).json();
    expect(data.points[0]).toMatchObject({ support: "cannot_verify", reason: "원문 2차 대조 호출에 실패했습니다." });
    expect(data.statutes).toHaveLength(1);
    expect(data.model).toBeNull();
  });

  it("대조할 원문이 하나도 없으면 LLM을 부르지 않는다", async () => {
    statute.mockResolvedValue({ ref, status: "failed", baseDate: "2024-04-30", reason: "fetch failed" });
    const { data } = await (await call(body)).json();
    expect(compare).not.toHaveBeenCalled();
    expect(data.points.every((p: { support: string }) => p.support === "cannot_verify")).toBe(true);
  });

  it("개발 서버가 아니면 403 · 의견이 없으면 400 · 키가 없으면 503", async () => {
    gate.mockReturnValue({ ok: false, status: 403, code: "FORBIDDEN", message: "로컬 개발 서버 전용" });
    expect((await call(body)).status).toBe(403);
    gate.mockReturnValue({ ok: true });
    expect((await call({ citations: [] })).status).toBe(400);
    delete process.env.ANTHROPIC_API_KEY;
    expect((await call(body)).status).toBe(503);
    expect(statute).not.toHaveBeenCalled();
  });
});
