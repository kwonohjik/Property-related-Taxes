/**
 * POST /api/kiwoom/search-by-name — F-10 종목명 자동완성.
 *
 * stock-master(KOSPI + KOSDAQ + KONEX 4,384 종목) prefetch 활용.
 * 검색 우선순위: 종목코드 exact → 종목명 prefix → 종목명 contains.
 *
 * 요청: { query: string, limit?: number }
 * 응답: { matches: Array<{ stockCode, stockName, marketCode, marketTypeStore, tradingHalt }> }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { searchStockMaster, masterMarketCodeToStore } from "@/lib/kiwoom/stock-master";
import { handleKiwoomError } from "../search/route";

const RequestSchema = z.object({
  query: z.string().min(1, "검색어를 입력하세요.").max(50, "검색어는 50자 이내."),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { query, limit } = parsed.data;

  try {
    const entries = await searchStockMaster(query, limit ?? 10);
    return NextResponse.json({
      matches: entries.map((e) => ({
        stockCode: e.stockCode,
        stockName: e.stockName,
        marketCode: e.marketCode,
        marketName: e.marketName,
        marketTypeStore: masterMarketCodeToStore(e.marketCode),
        tradingHalt: e.tradingHalt,
        adminIssue: e.adminIssue,
      })),
    });
  } catch (e) {
    return handleKiwoomError(e);
  }
}
