/**
 * GET /api/law/search-law?q=소득세법&limit=5
 * 법령명 검색 (약칭 자동 해석 포함).
 *
 * NOT_FOUND 응답 시 키워드 간소화 힌트를 포함:
 *   { results: [], hint: "'소득세법' 으로 재시도해 보세요" }
 */

import { NextResponse, type NextRequest } from "next/server";
import { searchLawMany } from "@/lib/korean-law/client";
import { searchLawInputSchema } from "@/lib/korean-law/types";
import { extractLawNames } from "@/lib/korean-law/search-normalizer";
import { ensureRateLimit, mapErrorToResponse, parseQuery } from "../_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const { q, limit, sort, ancYd, efYd } = parseQuery(req, searchLawInputSchema);
    const results = await searchLawMany(q, limit, { sort, ancYd, efYd });

    // 결과 없음 — 키워드 간소화 힌트 제공
    if (results.length === 0) {
      const extracted = extractLawNames(q);
      const hint = extracted.length > 0
        ? `'${extracted[0]}' 만으로 재시도해 보세요.`
        : "키워드를 법령명 중심으로 짧게(예: '소득세법', '지방세법') 시도해 보세요.";
      return NextResponse.json({ results, hint });
    }

    return NextResponse.json({ results });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
