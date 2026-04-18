/**
 * GET /api/law/annexes?lawName=소득세법
 * 별표·서식 목록 (Phase 1: 메타데이터만)
 */

import { NextResponse, type NextRequest } from "next/server";
import { getAnnexes } from "@/lib/korean-law/client";
import { annexesInputSchema } from "@/lib/korean-law/types";
import { ensureRateLimit, mapErrorToResponse, parseQuery } from "../_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const { lawName } = parseQuery(req, annexesInputSchema);
    const annexes = await getAnnexes(lawName);
    return NextResponse.json({ annexes });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
