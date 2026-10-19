/**
 * 1세대1주택 AI 사실 추출 — Anthropic API 호출(서버 전용).
 *
 * LLM은 사실 추출만 맡는다. 판정은 결정론 엔진(`lib/tax-engine/one-house/judge.ts`)이 한다.
 * 출력은 구조화 출력으로 스키마를 강제하고, 경로·값은 `applyExtraction`이 필드 사전으로 다시 검증한다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ONE_HOUSE_FIELD_CATALOG } from "./field-catalog";
import { oneHouseExtractionSchema, type OneHouseExtraction } from "./extraction-schema";
import { buildExtractionSystemPrompt, buildExtractionUserMessage } from "./prompt";

export const ONE_HOUSE_EXTRACTION_MODEL = "claude-opus-5-5";

export { ONE_HOUSE_AI_TEXT_MAX } from "./text-limit";

export type ExtractionRun = {
  extraction: OneHouseExtraction;
  model: string;
  usage: { input: number; cacheRead: number; cacheWrite: number; output: number };
};

export class ExtractionFailedError extends Error {}

const SYSTEM_PROMPT = buildExtractionSystemPrompt(ONE_HOUSE_FIELD_CATALOG);

export async function extractOneHouseFacts(
  text: string,
  client: Anthropic = new Anthropic(),
): Promise<ExtractionRun> {
  // 스트리밍 — max_tokens가 커서 SDK가 비스트리밍 요청을 「10분 넘게 걸릴 수 있다」며 보내기 전에 막는다.
  //   `finalMessage()`가 구조화 출력(`parsed_output`)까지 돌려준다.
  const response = await client.beta.messages
    .stream({
      model: ONE_HOUSE_EXTRACTION_MODEL,
      max_tokens: 32000,
      // 정책 거절(refusal) 시 서버가 기본 대체 모델로 다시 돌린다.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // 법적 사실(취득 경위·세대·기준일)을 가려 읽어야 해서 high — Opus 5.5 기본값은 medium.
      output_config: { effort: "high", format: betaZodOutputFormat(oneHouseExtractionSchema) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: buildExtractionUserMessage(text) }],
    })
    .finalMessage();

  if (response.stop_reason === "refusal") {
    throw new ExtractionFailedError(`추출 거절: ${response.stop_details?.category ?? "unknown"}`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new ExtractionFailedError("출력 한도에 걸려 추출이 잘렸습니다");
  }
  if (!response.parsed_output) {
    throw new ExtractionFailedError("구조화 출력 파싱 실패");
  }
  const u = response.usage;
  return {
    extraction: response.parsed_output,
    model: response.model,
    usage: {
      input: u.input_tokens,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      output: u.output_tokens,
    },
  };
}
