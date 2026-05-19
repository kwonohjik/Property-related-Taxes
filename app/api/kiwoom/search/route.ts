/**
 * POST /api/kiwoom/search
 *
 * 키움 ka10001 주식기본정보요청 wrapper.
 *
 * 요청: { stockCode: string (6자리) }
 * 응답: { stockCode, stockName, marketType, marketCap, listedShares, tradingHalt, adminIssue }
 * 또는 503/400/404 (KiwoomError 분류)
 *
 * 보안: secret은 서버 측 process.env만. 클라이언트는 본 Route만 호출.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchStockInfo } from "@/lib/kiwoom/tr/ka10001";
import { getCachedStockMeta, setCachedStockMeta } from "@/lib/kiwoom/cache";
import { deduplicate } from "@/lib/kiwoom/dedup";
import { normalizeMarketTypeToStore } from "@/lib/kiwoom/market-mapping";
import { KiwoomError } from "@/lib/kiwoom/types";

const RequestSchema = z.object({
  stockCode: z.string().regex(/^\d{6}$/, "종목코드는 6자리 숫자여야 합니다."),
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

  const { stockCode } = parsed.data;

  try {
    const cached = getCachedStockMeta(stockCode);
    if (cached) {
      return NextResponse.json({
        ...cached,
        marketTypeStore: normalizeMarketTypeToStore(
          cached.marketType as "KOSPI" | "KOSDAQ" | "KONEX" | "UNKNOWN",
        ),
        cached: true,
      });
    }

    const meta = await deduplicate(`ka10001|${stockCode}`, () => fetchStockInfo({ stockCode }));

    setCachedStockMeta({
      stockCode: meta.stockCode,
      stockName: meta.stockName,
      marketType: meta.marketType,
      marketCap: meta.marketCap,
      listedShares: meta.listedShares,
      tradingHalt: meta.tradingHalt,
      adminIssue: meta.adminIssue,
    });

    return NextResponse.json({
      ...meta,
      marketTypeStore: normalizeMarketTypeToStore(meta.marketType),
      cached: false,
    });
  } catch (e) {
    return handleKiwoomError(e);
  }
}

function handleKiwoomError(e: unknown) {
  if (e instanceof KiwoomError) {
    const status =
      e.code === "missing_env"
        ? 503
        : e.code === "stock_not_found"
          ? 404
          : e.code === "rate_limited"
            ? 429
            : e.code === "auth_failed"
              ? 502
              : 502;
    return NextResponse.json({ error: e.code, message: e.message }, { status });
  }
  return NextResponse.json(
    { error: "internal_error", message: (e as Error)?.message ?? "unknown" },
    { status: 500 },
  );
}

export { handleKiwoomError };
