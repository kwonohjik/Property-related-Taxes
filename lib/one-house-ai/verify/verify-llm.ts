/**
 * 1세대1주택 AI 원문 검증 — LLM 2차 대조(도구 없음 · 구조화 출력, 계획 §3.5-2).
 *
 * 쟁점별 의견 문장을 **방금 다시 받은 원문 발췌**(카드 요약이 아니다)와만 대조한다. 원문을 하나도 받지 못한 쟁점은
 * 여기 보내지 않는다(서버가 cannot_verify로 정한다).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { runStructured } from "../tool-run";
import { verifyLlmSchema, type PointSupport } from "./verify-schema";

export const VERIFY_SYSTEM_PROMPT = `너는 세무 의견 문장이 주어진 원문 발췌로 뒷받침되는지만 판단한다. 원문 밖 지식을 쓰지 않는다.
- supported: 의견의 핵심 주장이 원문에 있다
- partial: 일부만 있다
- not_supported: 원문과 다르거나 원문에 없다
- cannot_verify: 발췌만으로 판단할 수 없다
원문에 없는 주장은 그 구절을 unsupportedClaims에 그대로 옮긴다. 발췌의 시행일·해석 일자와 의견이 말하는 시점이 어긋나면
partial로 보고 사유에 적는다. 사유는 한국어 한두 문장으로 쓴다. 받은 쟁점 번호(index)마다 하나씩 답한다.`;

export type VerifyLlmPoint = { index: number; topic: string; opinion: string; excerpts: { label: string; text: string }[] };

export async function compareWithSources(
  points: readonly VerifyLlmPoint[],
  client?: Anthropic,
): Promise<{ results: Map<number, { support: PointSupport; reason: string; unsupportedClaims: string[] }>; model: string; usage: { input: number; cacheRead: number; cacheWrite: number; output: number } }> {
  const user = points
    .map(
      (p) =>
        `## 쟁점 ${p.index} — ${p.topic}\n의견: ${p.opinion}\n` +
        p.excerpts.map((e) => `### 원문 발췌 — ${e.label}\n${e.text}`).join("\n"),
    )
    .join("\n\n");
  const run = await runStructured({ system: VERIFY_SYSTEM_PROMPT, user, schema: verifyLlmSchema, maxTokens: 8000, client });
  const wanted = new Set(points.map((p) => p.index));
  const results = new Map<number, { support: PointSupport; reason: string; unsupportedClaims: string[] }>();
  for (const r of run.parsed.points) {
    // 보내지 않은 번호·중복 답은 버린다(먼저 온 답만)
    if (wanted.has(r.index) && !results.has(r.index)) results.set(r.index, { support: r.support, reason: r.reason, unsupportedClaims: r.unsupportedClaims });
  }
  return { results, model: run.model, usage: run.usage };
}
