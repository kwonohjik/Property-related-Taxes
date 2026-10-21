/**
 * 1세대1주택 AI 참고 의견 원문 검증 API Route — **로컬 개발 서버 전용**(계획 §3.5).
 *
 * POST /api/one-house-ai/verify  { transferDate?, opinion, citations }
 *
 *   Rate limit → 개발 서버 게이트 → Zod → API 키 → 결정론 단계(조문 시행본 재조회 · 해석례 원문 재수신) → LLM 2차 대조
 *
 * 화면이 의견을 받은 직후 자동으로 부른다(의견을 먼저 보여 주고 검증은 뒤따라 채운다 · 재검증만 따로 돌릴 수 있다).
 * 조회 실패는 통과로 치지 않는다 — 원문을 하나도 받지 못한 쟁점은 LLM에 보내지 않고 cannot_verify.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { checkOneHouseAiAccess } from "@/lib/one-house-ai/access-guard";
import { ExtractionFailedError } from "@/lib/one-house-ai/extract";
import { loadOneHouseCards } from "@/lib/one-house-ai/opinion/card-store";
import { checkDoc, checkStatute, mapLimit, statuteKey, VERIFY_LIMITS } from "@/lib/one-house-ai/verify/verify";
import { compareWithSources, type VerifyLlmPoint } from "@/lib/one-house-ai/verify/verify-llm";
import { verifyBodySchema, type OneHouseAiVerifyData, type PointCheck } from "@/lib/one-house-ai/verify/verify-schema";
import { docKey } from "@/lib/korean-law/doc-key";

export const maxDuration = 120;

const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(`one-house-ai-verify:${getClientIp(request)}`, {
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
  const parsed = verifyBodySchema.safeParse(raw);
  if (!parsed.success) return fail(400, "INVALID_INPUT", "검증할 의견이 올바르지 않습니다");
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, "AI_UNAVAILABLE", "AI 원문 검증이 설정되지 않았습니다(ANTHROPIC_API_KEY).");

  const { opinion, citations, transferDate } = parsed.data;
  const baseDate = transferDate ?? null;

  // 결정론 단계 — 조문은 중복 없이 한 번씩, 해석례는 인용된 것만
  const refs = new Map(opinion.points.flatMap((p) => p.statutes).map((r) => [statuteKey(r), r]));
  const statuteChecks = await mapLimit([...refs.entries()], VERIFY_LIMITS.statuteConcurrency, async ([key, r]) => ({
    key,
    ...(await checkStatute(r, baseDate)),
  }));
  const citedKeys = new Set(opinion.points.flatMap((p) => p.citedDocNos).map(docKey));
  const toCheck = citations.filter((c, i, all) => citedKeys.has(docKey(c.docNo)) && all.findIndex((x) => docKey(x.docNo) === docKey(c.docNo)) === i);
  const cards = toCheck.some((c) => c.origin === "card") ? await loadOneHouseCards() : [];
  const docChecks = await mapLimit(toCheck, VERIFY_LIMITS.docConcurrency, (c) => checkDoc(c, cards));

  const statuteBy = new Map(statuteChecks.map((s) => [s.key, s]));
  const docBy = new Map(docChecks.map((d) => [docKey(d.docNo), d]));

  // 쟁점별 원문 발췌 — 받은 것만
  const llmPoints: VerifyLlmPoint[] = [];
  const points: PointCheck[] = opinion.points.map((p, index) => {
    const statuteKeys = p.statutes.map(statuteKey);
    const docNos = p.citedDocNos;
    const excerpts = [
      ...statuteKeys.flatMap((k) => {
        const s = statuteBy.get(k);
        return s?.status === "verified" && s.excerpt ? [{ label: `${k}${baseDate ? ` (${baseDate} 시행본)` : " (현행)"}`, text: s.excerpt }] : [];
      }),
      ...docNos.flatMap((d) => {
        const c = docBy.get(docKey(d));
        return c?.status === "fetched" && c.excerpt ? [{ label: d, text: c.excerpt }] : [];
      }),
    ];
    if (excerpts.length > 0) llmPoints.push({ index, topic: p.topic, opinion: p.opinion, excerpts });
    return {
      index,
      support: "cannot_verify",
      reason: excerpts.length > 0 ? "" : statuteKeys.length + docNos.length === 0 ? "인용한 조문·해석례가 없습니다." : "인용한 원문을 받지 못했습니다.",
      unsupportedClaims: [],
      statuteKeys,
      docNos,
    };
  });

  let model: string | null = null;
  let usage: OneHouseAiVerifyData["usage"] = null;
  if (llmPoints.length > 0) {
    try {
      const r = await compareWithSources(llmPoints);
      model = r.model;
      usage = r.usage;
      for (const p of points) {
        const got = r.results.get(p.index);
        if (got) Object.assign(p, got);
        // 인용 중 하나라도 확인되지 않았으면(없음·실패·불일치) 받은 원문만으로 「원문 일치」라 하지 않는다 — 최대 일부 일치
        const unconfirmed = [
          ...p.statuteKeys.filter((k) => statuteBy.get(k)?.status !== "verified"),
          ...p.docNos.filter((d) => docBy.get(docKey(d))?.status !== "fetched"),
        ];
        if (got && p.support === "supported" && unconfirmed.length > 0) {
          p.support = "partial";
          p.reason = `${p.reason} (확인되지 않은 인용: ${unconfirmed.join(", ")})`;
        }
        else if (llmPoints.some((l) => l.index === p.index)) p.reason = "2차 대조가 이 쟁점에 답하지 않았습니다.";
      }
    } catch (e) {
      if (!(e instanceof ExtractionFailedError)) {
        console.error("[one-house-ai verify] LLM 호출 실패", { name: (e as Error).name, message: (e as Error).message });
      }
      // 2차 대조 실패는 통과가 아니다 — 결정론 결과만 돌려주고 쟁점은 확인 불가로 둔다
      for (const p of points) if (llmPoints.some((l) => l.index === p.index)) p.reason = "원문 2차 대조 호출에 실패했습니다.";
    }
  }

  const data: OneHouseAiVerifyData = { statutes: statuteChecks, docs: docChecks, points, model, usage };
  return NextResponse.json({ data });
}

