/**
 * 국가법령정보센터 DRF Open API 프록시
 * GET /api/law/article?law={법령명}&articleNum={조문번호}
 *
 * 캐시 클라이언트(getLawText) 경유 — `.legal-cache/` 파일 캐시 + 법제처 주말·공휴일
 * 접속 차단 시 stale 캐시 fallback 공유 (lib/legal-verification/korean-law-client.ts).
 * 환경변수: KOREAN_LAW_OC — law.go.kr Open API 인증키(OC)
 */

import { NextRequest, NextResponse } from "next/server";
import { getLawText } from "@/lib/korean-law/client-law";
import { LawApiError } from "@/lib/korean-law/client-core";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const law        = searchParams.get("law")?.trim() ?? "";
  const articleNum = searchParams.get("articleNum")?.trim() ?? "";

  if (!law || !articleNum) {
    return NextResponse.json(
      { error: { code: "MISSING_PARAMS", message: "law, articleNum 파라미터가 필요합니다." } },
      { status: 400 },
    );
  }

  try {
    // getLawText: searchLaw + fetchArticle (둘 다 캐시·stale fallback 적용)
    const article = await getLawText(law, articleNum);
    if (!article) {
      return NextResponse.json(
        { error: { code: "ARTICLE_NOT_FOUND", message: `조문을 찾을 수 없습니다: ${law} 제${articleNum}조` } },
        { status: 404 },
      );
    }
    return NextResponse.json({
      law,
      articleNum,
      content: article.fullText,
      title: article.title,
      sourceUrl: article.sourceUrl,
    });
  } catch (err) {
    const isKeyMissing = err instanceof LawApiError && err.code === "API_KEY_MISSING";
    return NextResponse.json(
      {
        error: {
          code: isKeyMissing ? "API_KEY_MISSING" : "UPSTREAM",
          message: err instanceof Error ? err.message : "법제처 API 조회에 실패했습니다.",
        },
      },
      { status: isKeyMissing ? 503 : 502 },
    );
  }
}
