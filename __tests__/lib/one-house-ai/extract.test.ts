/**
 * `extractOneHouseFacts` — 스트리밍 도구 루프 호출 · 실패 분기. Anthropic client는 가짜로 넣는다(비용 없음).
 *
 * max_tokens가 커서 SDK가 비스트리밍 요청을 보내기 전에 막는다(2026-10-19 실호출에서 발견) — `stream: true`를 고정한다.
 * 도구는 용어 정의 확인용 lookup_statute 하나다(계획 §3.3 — 해석례 도구는 주지 않는다).
 */
import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { extractOneHouseFacts, ExtractionFailedError, ONE_HOUSE_EXTRACTION_MODEL } from "@/lib/one-house-ai/extract";

const parsed = { rows: [], facts: [{ path: "transferDate", value: "2024-04-30", evidence: "2024.4.30. 양도" }], missingFacts: [], notes: [] };
const message = (over: object = {}) => ({
  model: ONE_HOUSE_EXTRACTION_MODEL,
  stop_reason: "end_turn",
  parsed_output: parsed,
  usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, output_tokens: 40 },
  ...over,
});
const fakeClient = (msg: object) => {
  const toolRunner = vi.fn<(params: Record<string, unknown>) => unknown>(() => ({
    async *[Symbol.asyncIterator]() {
      yield { finalMessage: async () => msg };
    },
  }));
  const parse = vi.fn();
  return { client: { beta: { messages: { toolRunner, parse } } } as unknown as Anthropic, toolRunner, parse };
};

describe("extractOneHouseFacts", () => {
  it("스트리밍 도구 루프로 부르고 구조화 출력·사용량·조회 기록을 돌려준다", async () => {
    const f = fakeClient(message());
    const r = await extractOneHouseFacts("원문", f.client);
    expect(f.toolRunner).toHaveBeenCalledTimes(1);
    expect(f.parse).not.toHaveBeenCalled();
    const params = f.toolRunner.mock.calls[0][0];
    expect(params).toMatchObject({ model: ONE_HOUSE_EXTRACTION_MODEL, max_tokens: 32000, stream: true, max_iterations: 4 });
    expect((params.tools as { name: string }[]).map((t) => t.name)).toEqual(["lookup_statute"]);
    expect(r.extraction).toEqual(parsed);
    expect(r.usage).toEqual({ input: 10, cacheRead: 20, cacheWrite: 30, output: 40 });
    expect(r.lookups).toEqual([]);
  });
  it("거절 · 출력 한도 · 파싱 실패는 ExtractionFailedError", async () => {
    for (const over of [{ stop_reason: "refusal", stop_details: { category: "cyber" } }, { stop_reason: "max_tokens" }, { parsed_output: null }]) {
      await expect(extractOneHouseFacts("원문", fakeClient(message(over)).client)).rejects.toBeInstanceOf(ExtractionFailedError);
    }
  });
});
