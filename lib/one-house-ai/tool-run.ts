/**
 * 1세대1주택 AI — 도구 루프 + 구조화 출력 공통 실행부(서버 전용).
 *
 * SDK `client.beta.messages.toolRunner`에 스트리밍·서버 측 대체 모델(fallback)·구조화 출력을 함께 건다
 * (조합 동작은 계획 F-9 실호출로 확인). 반복마다 usage를 더하고, 마지막 메시지의 구조화 출력을 돌려준다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import type { z } from "zod";
import { ExtractionFailedError, ONE_HOUSE_EXTRACTION_MODEL, type AiUsage } from "./model";

export type ToolRunResult<T> = { parsed: T; model: string; usage: AiUsage; iterations: number };

/** 도구 없는 단발 구조화 호출(원문 검증의 2차 대조) — 추출·의견과 같은 호출 방식 */
export async function runStructured<T>(params: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  client?: Anthropic;
}): Promise<Omit<ToolRunResult<T>, "iterations">> {
  const client = params.client ?? new Anthropic();
  const response = await client.beta.messages
    .stream({
      model: ONE_HOUSE_EXTRACTION_MODEL,
      max_tokens: params.maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(params.schema) },
      system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: params.user }],
    })
    .finalMessage();
  if (response.stop_reason === "refusal") throw new ExtractionFailedError(`거절: ${response.stop_details?.category ?? "unknown"}`);
  if (response.stop_reason === "max_tokens") throw new ExtractionFailedError("출력 한도에 걸려 응답이 잘렸습니다");
  if (!response.parsed_output) throw new ExtractionFailedError("구조화 출력 파싱 실패");
  const u = response.usage;
  return {
    parsed: response.parsed_output,
    model: response.model,
    usage: { input: u.input_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, output: u.output_tokens },
  };
}

export async function runWithTools<T>(params: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  tools: BetaRunnableTool<unknown>[];
  maxIterations: number;
  maxTokens: number;
  client?: Anthropic;
}): Promise<ToolRunResult<T>> {
  const client = params.client ?? new Anthropic();
  const runner = client.beta.messages.toolRunner({
    model: ONE_HOUSE_EXTRACTION_MODEL,
    max_tokens: params.maxTokens,
    stream: true,
    max_iterations: params.maxIterations,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(params.schema) },
    // 시스템 프롬프트·도구 정의는 고정 문자열이다(도구 정의가 시스템 앞에 놓여 함께 캐시된다)
    system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral", ttl: "1h" } }],
    messages: [{ role: "user", content: params.user }],
    tools: params.tools,
  });

  const usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  let iterations = 0;
  let last: Awaited<ReturnType<typeof runner.done>> | null = null;
  for await (const stream of runner) {
    const message = await stream.finalMessage();
    iterations++;
    const u = message.usage;
    usage.input += u.input_tokens;
    usage.cacheRead += u.cache_read_input_tokens ?? 0;
    usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    usage.output += u.output_tokens;
    last = message;
  }
  if (!last) throw new ExtractionFailedError("AI 응답이 없습니다");
  if (last.stop_reason === "refusal") throw new ExtractionFailedError(`거절: ${last.stop_details?.category ?? "unknown"}`);
  if (last.stop_reason === "max_tokens") throw new ExtractionFailedError("출력 한도에 걸려 응답이 잘렸습니다");
  if (last.stop_reason === "tool_use") throw new ExtractionFailedError(`조회 반복 상한(${params.maxIterations}회)에 걸려 결론을 내지 못했습니다`);
  const parsed = (last as { parsed_output?: T | null }).parsed_output;
  if (!parsed) throw new ExtractionFailedError("구조화 출력 파싱 실패");
  return { parsed, model: last.model, usage, iterations };
}
