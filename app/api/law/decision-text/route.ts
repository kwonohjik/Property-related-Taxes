/**
 * GET /api/law/decision-text?id=...&domain=prec
 * 판례·결정례 본문 조회
 */

import { NextResponse, type NextRequest } from "next/server";
import { buildDecisionSourceUrl, getDecisionText, LawApiError } from "@/lib/korean-law/client";
import { decisionTextInputSchema, type DecisionDomain } from "@/lib/korean-law/types";
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

/**
 * 본문을 받지 못한 결정의 안내 카드 — 화면은 `title === "(본문 제공 불가)"` 로 이 카드를 그리고 원문 링크를 단다.
 * 웹 상세 페이지가 없는 도메인(금융위·방통위)은 링크가 없으므로 「아래 링크」 안내도 하지 않는다.
 */
function unavailableDecision(domain: DecisionDomain, id: string, reason: string) {
  const sourceUrl = buildDecisionSourceUrl(domain, id);
  return {
    id,
    domain,
    caseNo: "",
    title: "(본문 제공 불가)",
    holdings: "",
    reasoning: sourceUrl
      ? `${reason} 아래 법제처 링크에서 확인하세요.`
      : `${reason} 법제처 웹에도 이 결정의 상세 페이지가 없습니다.`,
    court: "",
    date: "",
    sourceUrl,
  };
}

export async function GET(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const { id, domain, full } = parseQuery(req, decisionTextInputSchema);
    const decision = await withTimeout(getDecisionText(id, domain, { full }), OVERALL_TIMEOUT_MS);
    if (!decision) {
      // 응답은 왔지만 파서가 본문을 읽지 못했다(자치법규·조약·위원회 결정문 등 — 판례형이 아닌 구조).
      // 종전엔 404 라 오류 한 줄만 뜨고 원문 링크가 있는 화면에 닿지 못했다.
      return NextResponse.json({
        decision: unavailableDecision(
          domain,
          id,
          "이 결정의 본문은 앱에서 아직 표시하지 못합니다."
        ),
      });
    }
    return NextResponse.json({ decision });
  } catch (err) {
    // 법제처 upstream 실패(502)는 사용자 입장에선 "본문을 받을 수 없는 판례"와 동일하므로
    // 200으로 graceful fallback — UI가 "(본문 제공 불가)" 카드로 렌더하도록 한다.
    if (err instanceof LawApiError && (err.code === "UPSTREAM" || err.code === "NOT_FOUND")) {
      const { id, domain } = parseQuery(req, decisionTextInputSchema);
      return NextResponse.json({
        decision: unavailableDecision(
          domain,
          id,
          "법제처 Open API가 본문을 반환하지 않았습니다. 해당 결정은 웹에서는 공개되나 API 제공 대상이 아닌 경우가 많습니다."
        ),
      });
    }
    return mapErrorToResponse(err);
  }
}
