/**
 * 1세대1주택 AI 참고 의견 — Anthropic API 호출(서버 전용).
 *
 * 카드가 먼저다(route가 고른 카드를 사용자 메시지에 싣는다). 카드가 답하지 못하는 쟁점만 도구로 실시간 보충한다
 * (계획 §3.4 — 국세청·기재부 해석, 조세심판, 조문). 읽은 문서(`readDocs`)만 인용 가능 집합에 더해진다(route가 거른다).
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ExtractionRun } from "../extract";
import { createLawTools, type LawLookup, type ReadDoc } from "../law-tools";
import { runWithTools } from "../tool-run";
import { oneHouseOpinionSchema, type OneHouseOpinion } from "./opinion-schema";
import { OPINION_SYSTEM_PROMPT, buildOpinionUserMessage } from "./opinion-prompt";

/** 의견 단계 도구 반복 상한 — 실호출(V-7)로 조정 */
export const OPINION_MAX_ITERATIONS = 8;

export type OpinionRun = {
  opinion: OneHouseOpinion;
  model: string;
  usage: ExtractionRun["usage"];
  /** 이번 호출에서 본문을 읽은 문서 */
  readDocs: ReadDoc[];
  /** 도구 조회 기록(성공·실패) */
  lookups: LawLookup[];
};

export async function generateOneHouseOpinion(
  input: Parameters<typeof buildOpinionUserMessage>[0],
  client?: Anthropic,
): Promise<OpinionRun> {
  const law = createLawTools({ allow: ["lookup_statute", "search_interpretations", "read_interpretation"] });
  const run = await runWithTools({
    system: OPINION_SYSTEM_PROMPT,
    user: buildOpinionUserMessage(input),
    schema: oneHouseOpinionSchema,
    tools: law.tools,
    maxIterations: OPINION_MAX_ITERATIONS,
    maxTokens: 16000,
    client,
  });
  return { opinion: run.parsed, model: run.model, usage: run.usage, readDocs: [...law.readDocs.values()], lookups: law.lookups };
}
