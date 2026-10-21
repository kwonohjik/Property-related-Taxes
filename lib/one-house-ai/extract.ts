/**
 * 1세대1주택 AI 사실 추출 — Anthropic API 호출(서버 전용).
 *
 * LLM은 사실 추출만 맡는다. 판정은 결정론 엔진(`lib/tax-engine/one-house/judge.ts`)이 한다.
 * 출력은 구조화 출력으로 스키마를 강제하고, 경로·값은 `applyExtraction`이 필드 사전으로 다시 검증한다.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { ONE_HOUSE_FIELD_CATALOG } from "./field-catalog";
import { oneHouseExtractionSchema, type OneHouseExtraction } from "./extraction-schema";
import { createLawTools, type LawLookup } from "./law-tools";
import type { AiUsage } from "./model";
import { buildExtractionSystemPrompt, buildExtractionUserMessage } from "./prompt";
import { runWithTools } from "./tool-run";

export { ONE_HOUSE_EXTRACTION_MODEL, ExtractionFailedError } from "./model";

export { ONE_HOUSE_AI_TEXT_MAX } from "./text-limit";

export type ExtractionRun = {
  extraction: OneHouseExtraction;
  model: string;
  usage: AiUsage;
  /** 조문 조회 기록(성공·실패) */
  lookups?: LawLookup[];
};

const SYSTEM_PROMPT = buildExtractionSystemPrompt(ONE_HOUSE_FIELD_CATALOG);

/** 추출 단계 도구 반복 상한 — 용어 정의 조문 조회만 한다(계획 §3.3) */
export const EXTRACTION_MAX_ITERATIONS = 4;

export async function extractOneHouseFacts(text: string, client?: Anthropic): Promise<ExtractionRun> {
  // 스트리밍 도구 루프 — max_tokens가 커서 SDK가 비스트리밍 요청을 「10분 넘게 걸릴 수 있다」며 보내기 전에 막는다.
  //   정책 거절(refusal) 시 서버가 기본 대체 모델로 다시 돌린다 · 법적 사실을 가려 읽어야 해서 effort high(`runWithTools`).
  //   도구는 lookup_statute 하나 — 칸의 뜻(용어 정의)만 확인하고 값은 여전히 원문 구절로만 넣는다.
  const law = createLawTools({ allow: ["lookup_statute"] });
  const run = await runWithTools({
    system: SYSTEM_PROMPT,
    user: buildExtractionUserMessage(text),
    schema: oneHouseExtractionSchema,
    tools: law.tools,
    maxIterations: EXTRACTION_MAX_ITERATIONS,
    maxTokens: 32000,
    client,
  });
  return { extraction: run.parsed, model: run.model, usage: run.usage, lookups: law.lookups };
}
