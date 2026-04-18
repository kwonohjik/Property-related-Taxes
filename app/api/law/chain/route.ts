/**
 * POST /api/law/chain
 * 리서치 체인 실행 (8종)
 *
 * Body: { type: ChainType, query: string, rawText?: string }
 */

import { NextResponse, type NextRequest } from "next/server";
import { runChain } from "@/lib/korean-law/chains";
import { chainInputSchema } from "@/lib/korean-law/types";
import { ensureRateLimit, mapErrorToResponse } from "../_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const body = await req.json();
    const input = chainInputSchema.parse(body);
    const result = await runChain(input);
    return NextResponse.json({ result });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
