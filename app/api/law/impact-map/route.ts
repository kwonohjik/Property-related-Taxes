/**
 * GET /api/law/impact-map?lawName=소득세법&articleNo=제89조
 *
 * 조문 영향 그래프 — 조문을 인용한 판례·해석례·심판례·자치법규 역방향 탐색.
 */

import { NextResponse, type NextRequest } from "next/server";
import { buildImpactMap } from "@/lib/korean-law/client";
import { impactMapInputSchema } from "@/lib/korean-law/types";
import { ensureRateLimit, mapErrorToResponse, parseQuery } from "../_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const { lawName, articleNo } = parseQuery(req, impactMapInputSchema);
    const result = await buildImpactMap(lawName, articleNo);
    return NextResponse.json({ result });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
