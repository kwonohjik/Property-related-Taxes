/**
 * POST /api/law/route-router
 * GET  /api/law/route-router?query=...
 *
 * Query Router — 자연어 질의를 법제처 도구 + 파라미터로 매핑.
 * Design Ref: §4.2 route-router / Plan FR-09
 */

import { NextResponse, type NextRequest } from "next/server";
import { routeQuery } from "@/lib/korean-law/router/query-router";
import { routeRouterInputSchema } from "@/lib/korean-law/types";
import { ensureRateLimit, mapErrorToResponse, parseQuery } from "../_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const { query } = parseQuery(req, routeRouterInputSchema);
    return NextResponse.json(routeQuery(query));
  } catch (err) {
    return mapErrorToResponse(err);
  }
}

export async function POST(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const body = await req.json();
    const parsed = routeRouterInputSchema.parse(body);
    return NextResponse.json(routeQuery(parsed.query));
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
