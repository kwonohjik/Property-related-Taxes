/**
 * GET /api/law/decision-text?id=...&domain=prec
 * 판례·결정례 본문 조회
 */

import { NextResponse, type NextRequest } from "next/server";
import { getDecisionText } from "@/lib/korean-law/client";
import { decisionTextInputSchema } from "@/lib/korean-law/types";
import { ensureRateLimit, mapErrorToResponse, parseQuery } from "../_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const { id, domain, full } = parseQuery(req, decisionTextInputSchema);
    const decision = await getDecisionText(id, domain, { full });
    if (!decision) {
      return NextResponse.json(
        { error: "해당 결정 본문을 찾을 수 없습니다.", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    return NextResponse.json({ decision });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
