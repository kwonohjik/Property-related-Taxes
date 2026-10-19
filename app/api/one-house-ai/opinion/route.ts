/**
 * 1세대1주택 AI 참고 의견 API Route (하이브리드 AI 검토 도구) — **로컬 개발 서버 전용**.
 *
 * POST /api/one-house-ai/opinion  { form, result, sourceText?, notes? }
 *
 *   Rate limit → 개발 서버 게이트 → Zod → API 키 → 해석례 카드(로컬 폴더) → 관련 카드 고르기 → LLM 의견
 *   → 받지 않은 문서번호 인용은 걸러 낸다
 *
 * 판정은 하지 않는다 — 판정의 정본은 판정 메뉴(`/api/calc/one-house-exemption`)의 결정론 엔진이다. 화면이 보낸 판정 결과를
 * 맥락으로 쓸 뿐이다(로컬 도구라 다시 판정하지 않는다).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { checkOneHouseAiAccess } from "@/lib/one-house-ai/access-guard";
import { ExtractionFailedError, type ExtractionRun } from "@/lib/one-house-ai/extract";
import { ONE_HOUSE_AI_TEXT_MAX } from "@/lib/one-house-ai/text-limit";
import { cardRefOf, selectCards, type OneHouseCardRef } from "@/lib/one-house-ai/opinion/cards";
import { loadOneHouseCards, oneHouseCardsDir } from "@/lib/one-house-ai/opinion/card-store";
import { compactJudgmentForm } from "@/lib/one-house-ai/opinion/compact-form";
import { generateOneHouseOpinion } from "@/lib/one-house-ai/opinion/opinion";
import type { OneHouseOpinion } from "@/lib/one-house-ai/opinion/opinion-schema";

export const maxDuration = 120;

const bodySchema = z.object({
  form: z.record(z.string(), z.unknown()),
  result: z.object({ judgment: z.record(z.string(), z.unknown()) }).passthrough(),
  sourceText: z.string().max(ONE_HOUSE_AI_TEXT_MAX).optional(),
  notes: z.array(z.string()).max(50).optional(),
});

/** 화면(`OneHouseAiOpinionPanel`)이 읽는 응답 `data` */
export type OneHouseAiOpinionData = {
  opinion: OneHouseOpinion;
  /** 의견에 넣은 해석례 — 공개 원문 서지만 */
  cards: OneHouseCardRef[];
  /** 받지 않은 문서번호 인용 — 의견에서 지웠다 */
  droppedCitations: string[];
  model: string;
  usage: ExtractionRun["usage"];
};

const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`one-house-ai-opinion:${getClientIp(request)}`, {
    limit: 5,
    windowMs: 60_000,
    bypass: shouldBypassRateLimit(request),
  });
  if (!rl.allowed) return fail(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도하세요");

  const gate = checkOneHouseAiAccess();
  if (!gate.ok) return fail(gate.status, gate.code, gate.message);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, "INVALID_JSON", "요청 본문을 파싱할 수 없습니다");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail(400, "INVALID_INPUT", "판정 결과가 있어야 참고 의견을 받을 수 있습니다");

  if (!process.env.ANTHROPIC_API_KEY) return fail(503, "AI_UNAVAILABLE", "AI 참고 의견이 설정되지 않았습니다(ANTHROPIC_API_KEY).");

  const allCards = await loadOneHouseCards();
  if (allCards.length === 0) {
    return fail(503, "CARDS_UNAVAILABLE", `해석례 카드를 찾지 못했습니다(${oneHouseCardsDir()}). ONE_HOUSE_AI_CARDS_DIR를 확인하세요.`);
  }

  const { form, result, sourceText, notes } = parsed.data;
  const facts = compactJudgmentForm(form);
  const cards = selectCards(allCards, [JSON.stringify(result), JSON.stringify(facts), sourceText ?? "", ...(notes ?? [])].join("\n"));

  let run: Awaited<ReturnType<typeof generateOneHouseOpinion>>;
  try {
    run = await generateOneHouseOpinion({ judgment: result, facts, cards, sourceText, notes });
  } catch (e) {
    if (e instanceof ExtractionFailedError) return fail(422, "OPINION_FAILED", e.message);
    console.error("[one-house-ai opinion] LLM 호출 실패", { name: (e as Error).name, message: (e as Error).message });
    return fail(502, "AI_UPSTREAM_ERROR", "AI 참고 의견 호출에 실패했습니다. 잠시 후 다시 시도하세요");
  }

  // 보내지 않은 해석례 번호는 지어낸 인용이다 — 지우고 알린다
  const known = new Set(cards.map((c) => c.docNo));
  const dropped = new Set<string>();
  const points = run.opinion.points.map((p) => ({
    ...p,
    citedDocNos: p.citedDocNos.filter((d) => (known.has(d) ? true : (dropped.add(d), false))),
  }));

  const data: OneHouseAiOpinionData = {
    opinion: { ...run.opinion, points },
    cards: cards.map(cardRefOf),
    droppedCitations: [...dropped],
    model: run.model,
    usage: run.usage,
  };
  return NextResponse.json({ data });
}
