/**
 * GET /api/law/cite-check?caseNo=2017두38959
 *
 * 판례 생사 확인 — 후속 인용 역추적 + 변경·폐기 신호 스캔 (단정 금지, 검토 보조).
 */

import { NextResponse, type NextRequest } from "next/server";
import { checkPrecedentStatus } from "@/lib/korean-law/client";
import { citeCheckInputSchema } from "@/lib/korean-law/types";
import { ensureRateLimit, mapErrorToResponse, parseQuery } from "../_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const { caseNo } = parseQuery(req, citeCheckInputSchema);
    const result = await checkPrecedentStatus(caseNo);
    return NextResponse.json({ result });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
