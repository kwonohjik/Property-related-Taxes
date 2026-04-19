/**
 * GET /api/law/decision-text?id=...&domain=prec
 * 판례·결정례 본문 조회
 */

import { NextResponse, type NextRequest } from "next/server";
import { getDecisionText, LawApiError } from "@/lib/korean-law/client";
import { decisionTextInputSchema } from "@/lib/korean-law/types";
import { ensureRateLimit, mapErrorToResponse, parseQuery } from "../_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** 판례 본문 전체 요청 타임아웃(ms). 초과 시 "본문 제공 불가" 카드로 graceful fallback. */
const OVERALL_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LawApiError(`요청 타임아웃(${ms}ms)`, "UPSTREAM")), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function GET(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const { id, domain, full } = parseQuery(req, decisionTextInputSchema);
    const decision = await withTimeout(getDecisionText(id, domain, { full }), OVERALL_TIMEOUT_MS);
    if (!decision) {
      return NextResponse.json(
        { error: "해당 결정 본문을 찾을 수 없습니다.", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    return NextResponse.json({ decision });
  } catch (err) {
    // 법제처 upstream 실패(502)는 사용자 입장에선 "본문을 받을 수 없는 판례"와 동일하므로
    // 200으로 graceful fallback — UI가 "(본문 제공 불가)" 카드로 렌더하도록 한다.
    if (err instanceof LawApiError && (err.code === "UPSTREAM" || err.code === "NOT_FOUND")) {
      const { id, domain } = parseQuery(req, decisionTextInputSchema);
      return NextResponse.json({
        decision: {
          id,
          domain,
          caseNo: "",
          title: "(본문 제공 불가)",
          holdings: "",
          reasoning:
            "법제처 Open API가 본문을 반환하지 않았습니다. 해당 결정은 웹에서는 공개되나 API 제공 대상이 아닌 경우가 많습니다. 아래 법제처 링크에서 확인하세요.",
          court: "",
          date: "",
          sourceUrl: `https://www.law.go.kr/LSW/${domain}InfoR.do?ID=${encodeURIComponent(id)}`,
        },
      });
    }
    return mapErrorToResponse(err);
  }
}
