/**
 * `extractOneHouseFacts` — 스트리밍 호출 · 실패 분기. Anthropic client는 가짜로 넣는다(비용 없음).
 *
 * max_tokens가 커서 SDK가 비스트리밍 요청(`messages.parse`)을 보내기 전에 막는다(2026-10-19 실호출에서 발견) —
 * 스트리밍(`messages.stream(...).finalMessage()`)으로 부르는지 고정한다.
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
  const stream = vi.fn<(params: Record<string, unknown>) => { finalMessage: () => Promise<object> }>(() => ({ finalMessage: async () => msg }));
  const parse = vi.fn();
  return { client: { beta: { messages: { stream, parse } } } as unknown as Anthropic, stream, parse };
};

describe("extractOneHouseFacts", () => {
  it("스트리밍으로 부르고 구조화 출력·사용량을 돌려준다", async () => {
    const f = fakeClient(message());
    const r = await extractOneHouseFacts("원문", f.client);
    expect(f.stream).toHaveBeenCalledTimes(1);
    expect(f.parse).not.toHaveBeenCalled();
    expect(f.stream.mock.calls[0][0]).toMatchObject({ model: ONE_HOUSE_EXTRACTION_MODEL, max_tokens: 32000 });
    expect(r.extraction).toEqual(parsed);
    expect(r.usage).toEqual({ input: 10, cacheRead: 20, cacheWrite: 30, output: 40 });
  });
  it("거절 · 출력 한도 · 파싱 실패는 ExtractionFailedError", async () => {
    for (const over of [{ stop_reason: "refusal", stop_details: { category: "cyber" } }, { stop_reason: "max_tokens" }, { parsed_output: null }]) {
      await expect(extractOneHouseFacts("원문", fakeClient(message(over)).client)).rejects.toBeInstanceOf(ExtractionFailedError);
    }
  });
});
