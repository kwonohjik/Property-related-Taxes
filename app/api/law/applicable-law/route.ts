/**
 * GET /api/law/applicable-law?lawName=소득세법&articleNo=제89조&baseDate=20210601
 *
 * 행위시법 판단 — 기준일에 시행 중이던 조문 버전 + 현행 대비 + 부칙 경과규정.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getApplicableLaw } from "@/lib/korean-law/client";
import { applicableLawInputSchema } from "@/lib/korean-law/types";
import { ensureRateLimit, mapErrorToResponse, parseQuery } from "../_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const { lawName, articleNo, baseDate } = parseQuery(req, applicableLawInputSchema);
    const result = await getApplicableLaw(lawName, articleNo, baseDate);
    return NextResponse.json({ result });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
