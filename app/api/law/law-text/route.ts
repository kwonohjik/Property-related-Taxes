/**
 * GET /api/law/law-text?lawName=소득세법&articleNo=제89조
 * 조문 본문 조회
 */

import { NextResponse, type NextRequest } from "next/server";
import { getLawText } from "@/lib/korean-law/client";
import { lawTextInputSchema } from "@/lib/korean-law/types";
import { ensureRateLimit, mapErrorToResponse, parseQuery } from "../_helpers";

export const dynamic = "force-dynamic";
// getLawText 는 upstream 을 2회 «연속» 호출한다(searchLaw → fetchArticle).
// 호출당 재시도 예산 ≈10.6s 이므로 20s 로는 최악의 경우가 들어가지 않는다.
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const { lawName, articleNo } = parseQuery(req, lawTextInputSchema);
    const article = await getLawText(lawName, articleNo);
    if (!article) {
      return NextResponse.json(
        {
          error: "해당 조문을 찾을 수 없습니다.",
          code: "NOT_FOUND",
          hint:
            `💡 다음 액션: search_law(q="${lawName}") 로 법령명을 재확인하거나, ` +
            `조문번호 형식을 "제N조" · "제N조의M" 으로 수정해 재시도하세요.`,
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ article });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
