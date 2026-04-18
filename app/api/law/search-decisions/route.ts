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
import { searchDecisions } from "@/lib/korean-law/client";
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
    return NextResponse.json(result);
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
