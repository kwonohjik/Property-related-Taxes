/**
 * 1세대1주택 AI 참고 의견 — Anthropic API 호출(서버 전용). 호출 방식은 사실 추출(`../extract.ts`)과 같다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ExtractionFailedError, ONE_HOUSE_EXTRACTION_MODEL, type ExtractionRun } from "../extract";
import { oneHouseOpinionSchema, type OneHouseOpinion } from "./opinion-schema";
import { OPINION_SYSTEM_PROMPT, buildOpinionUserMessage } from "./opinion-prompt";

export type OpinionRun = { opinion: OneHouseOpinion; model: string; usage: ExtractionRun["usage"] };

export async function generateOneHouseOpinion(
  input: Parameters<typeof buildOpinionUserMessage>[0],
  client: Anthropic = new Anthropic(),
): Promise<OpinionRun> {
  // 스트리밍 — max_tokens가 크면 SDK가 비스트리밍 요청을 보내기 전에 막는다(추출과 같은 이유)
  const response = await client.beta.messages
    .stream({
      model: ONE_HOUSE_EXTRACTION_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // 해석례와 사실의 차이를 가려 읽어야 해서 high
      output_config: { effort: "high", format: betaZodOutputFormat(oneHouseOpinionSchema) },
      system: [{ type: "text", text: OPINION_SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: buildOpinionUserMessage(input) }],
    })
    .finalMessage();

  if (response.stop_reason === "refusal") {
    throw new ExtractionFailedError(`의견 거절: ${response.stop_details?.category ?? "unknown"}`);
  }
  if (response.stop_reason === "max_tokens") throw new ExtractionFailedError("출력 한도에 걸려 의견이 잘렸습니다");
  if (!response.parsed_output) throw new ExtractionFailedError("구조화 출력 파싱 실패");
  const u = response.usage;
  return {
    opinion: response.parsed_output,
    model: response.model,
    usage: {
      input: u.input_tokens,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      output: u.output_tokens,
    },
  };
}
