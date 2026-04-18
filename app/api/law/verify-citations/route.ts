/**
 * POST /api/law/verify-citations
 * LLM이 생성한 텍스트 내 법령 조문 인용을 법제처 API에 병렬 조회해
 * 환각(존재하지 않는 조문)을 감지한다.
 *
 * Body: { text: string, maxCitations?: number }
 * Response: VerifyCitationsResult (header, isError, citations[], summary)
 *   - header === "[HALLUCINATION_DETECTED]" 이면 HTTP 200 + isError:true
 *     (클라이언트가 성공 응답으로 오해하지 않도록 UI에서 배너 표시)
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyCitations } from "@/lib/korean-law/verify-citations";
import { ensureRateLimit, mapErrorToResponse } from "../_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const verifyInputSchema = z.object({
  text: z.string().min(1, "검증할 텍스트를 입력하세요.").max(10_000, "최대 10,000자까지 지원합니다."),
  maxCitations: z.number().int().min(1).max(50).optional(),
});

export async function POST(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const body = await req.json();
    const input = verifyInputSchema.parse(body);
    const result = await verifyCitations(input.text, {
      maxCitations: input.maxCitations,
    });
    // 환각 감지 시에도 HTTP 200 — isError 플래그로 UI 분기
    return NextResponse.json({ result });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
