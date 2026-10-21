/**
 * 도구 루프 공통 실행부 — 반복별 usage 합산 · 마지막 메시지의 구조화 출력 · 중단 사유(거절·출력 한도·반복 상한). SDK는 모의한다.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { ExtractionFailedError } from "@/lib/one-house-ai/extract";
import { runWithTools } from "@/lib/one-house-ai/tool-run";

type Msg = { stop_reason: string; model: string; usage: Record<string, number>; parsed_output?: unknown; stop_details?: { category: string } };

function fakeClient(messages: Msg[]) {
  const calls: unknown[] = [];
  const client = {
    beta: {
      messages: {
        toolRunner: (params: unknown) => {
          calls.push(params);
          return {
            async *[Symbol.asyncIterator]() {
              for (const m of messages) yield { finalMessage: async () => m };
            },
            done: async () => messages.at(-1),
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const usage = (i: number, o: number, cr = 0, cw = 0) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cw });
const base = { system: "S", user: "U", schema: z.object({ a: z.number() }), tools: [], maxIterations: 4, maxTokens: 1000 };

describe("runWithTools", () => {
  it("반복마다 usage를 더하고 마지막 메시지의 구조화 출력을 돌려준다", async () => {
    const { client, calls } = fakeClient([
      { stop_reason: "tool_use", model: "claude-opus-5-5", usage: usage(100, 10, 50, 20) },
      { stop_reason: "end_turn", model: "claude-opus-5-5", usage: usage(200, 30, 60, 0), parsed_output: { a: 1 } },
    ]);
    const r = await runWithTools({ ...base, client });
    expect(r).toEqual({ parsed: { a: 1 }, model: "claude-opus-5-5", usage: { input: 300, cacheRead: 110, cacheWrite: 20, output: 40 }, iterations: 2 });
    expect(calls[0]).toMatchObject({ stream: true, max_iterations: 4, fallbacks: "default", max_tokens: 1000, system: [{ text: "S", cache_control: { type: "ephemeral", ttl: "1h" } }] });
  });

  it.each([
    ["refusal", "거절"],
    ["max_tokens", "출력 한도"],
    ["tool_use", "조회 반복 상한(4회)"],
  ])("마지막 stop_reason %s → %s", async (stop, msg) => {
    const { client } = fakeClient([{ stop_reason: stop, model: "m", usage: usage(1, 1), stop_details: { category: "x" } }]);
    await expect(runWithTools({ ...base, client })).rejects.toThrow(msg);
  });

  it("구조화 출력이 없으면 실패 · 응답이 없으면 실패", async () => {
    await expect(runWithTools({ ...base, client: fakeClient([{ stop_reason: "end_turn", model: "m", usage: usage(1, 1) }]).client })).rejects.toBeInstanceOf(
      ExtractionFailedError,
    );
    await expect(runWithTools({ ...base, client: fakeClient([]).client })).rejects.toThrow("응답이 없습니다");
  });
});
