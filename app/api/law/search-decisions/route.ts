/**
 * GET /api/law/search-decisions?q=양도소득세&domain=prec&page=1&pageSize=10
 * 판례·결정례 검색 (17 도메인 enum) — 도메인별 고급 옵션 passthrough.
 *
 * 도메인별 추가 쿼리스트링(있으면 반영):
 *   prec:  curt, caseNumber, fromDate, toDate
 *   ppc:   cls, gana, dpaYd, rslYd
 *   detc:  knd, inq, rpl
 *   expc:  caseNumber, fromDate, toDate
 *   admrul: knd
 *   trty:  cls, natCd, eftYd, concYd
 *   ordin: locGov
 */

import { NextResponse, type NextRequest } from "next/server";
import { searchDecisions, LawApiError } from "@/lib/korean-law/client";
import {
  searchDecisionsInputSchema,
  domainSearchOptionsSchema,
} from "@/lib/korean-law/types";
import { ensureRateLimit, mapErrorToResponse } from "../_helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const OPTION_KEYS = [
  "curt", "caseNumber", "fromDate", "toDate",
  "cls", "gana", "dpaYd", "rslYd",
  "knd", "inq", "rpl",
  "natCd", "eftYd", "concYd",
  "locGov",
] as const;

export async function GET(req: NextRequest) {
  const limited = ensureRateLimit(req);
  if (limited) return limited;
  try {
    const url = new URL(req.url);
    const baseObj: Record<string, string> = {};
    const optionsObj: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      if ((OPTION_KEYS as readonly string[]).includes(k)) {
        optionsObj[k] = v;
      } else {
        baseObj[k] = v;
      }
    });
    const base = searchDecisionsInputSchema
      .omit({ options: true })
      .parse(baseObj);
    const options = Object.keys(optionsObj).length
      ? domainSearchOptionsSchema.parse(optionsObj)
      : undefined;

    const result = await searchDecisions(
      base.q,
      base.domain,
      base.page,
      base.pageSize,
      options
    );
    // No-result 힌트: 0건이면 다음 액션 가이드 포함 (원본 MCP 패턴).
    if (result.items.length === 0 && base.page === 1) {
      const hint = buildDecisionHint(base.q, base.domain);
      return NextResponse.json({ ...result, hint });
    }
    return NextResponse.json(result);
  } catch (err) {
    // 법제처 UPSTREAM fetch-failed 를 0건 + 힌트로 정규화 (search-law 와 동일 정책).
    if (
      err instanceof LawApiError &&
      err.code === "UPSTREAM" &&
      /fetch\s*failed|ENOTFOUND|ETIMEDOUT|ECONNRESET|socket/i.test(err.message)
    ) {
      return NextResponse.json({
        items: [],
        totalCount: 0,
        page: 1,
        pageSize: 10,
        hint:
          "💡 판례·결정례가 없거나 법제처 서버가 일시 응답 실패했을 수 있습니다. " +
          "짧은 키워드로 재시도하거나 도메인을 바꿔보세요.",
      });
    }
    return mapErrorToResponse(err);
  }
}

function buildDecisionHint(q: string, domain: string): string {
  if (domain === "prec") {
    return `💡 다음 액션: search_decisions(q="${q}", domain="detc") 로 법령해석례를 시도하거나, run_chain(full_research, query="${q}") 로 법령·판례·해석례를 한 번에 조회하세요.`;
  }
  if (domain === "detc" || domain === "admrul") {
    return `💡 다음 액션: 도메인을 "prec"(대법원 판례)로 변경하거나, search_law(q="${q}") 로 관련 법령을 먼저 조회하세요.`;
  }
  return `💡 다음 액션: 짧은 키워드로 재시도하거나, run_chain(full_research, query="${q}") 로 여러 도메인을 동시에 검색하세요.`;
}
