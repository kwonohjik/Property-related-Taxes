/**
 * POST /api/kiwoom/daily-close — F-04 단건 일자 종가 조회.
 *
 * 용도: 대주주 시가총액 임계 판정 (소득세법 시행령 §157).
 *   시총 = 직전 사업연도말 종가 × 본인(+특수관계인) 보유 주식수
 *   2024.1.1.~ 임계 50억
 *
 * 흐름:
 *   1. Zod 검증 { stockCode, date }
 *   2. 캐시 hit 우선 (과거 거래일 종가는 영구 캐시)
 *   3. miss 시 ka10081 (base_dt = date, fromDate = date) → 단일 일자 응답
 *   4. 응답에 해당 일자 없으면 직전 거래일 종가 + 경고 메타 반환
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchDailyChart } from "@/lib/kiwoom/tr/ka10081";
import { getCachedDailyClose, setCachedDailyCloses } from "@/lib/kiwoom/cache";
import { deduplicate } from "@/lib/kiwoom/dedup";
import { isKrxTradingDay } from "@/lib/kiwoom/calendar";
import { handleKiwoomError } from "../search/route";

const RequestSchema = z.object({
  stockCode: z.string().regex(/^\d{6}$/, "종목코드는 6자리 숫자여야 합니다."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "일자는 YYYY-MM-DD 형식이어야 합니다."),
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

  const { stockCode, date } = parsed.data;

  try {
    // 1. 캐시 hit
    const cached = getCachedDailyClose(stockCode, date);
    if (cached !== undefined) {
      return NextResponse.json({
        stockCode,
        date,
        close: cached,
        isTradingDay: isKrxTradingDay(date),
        source: "cache",
      });
    }

    // 2. ka10081 단건 조회 — base_dt = date, fromDate = date (응답 ~200거래일 중 해당 일자만)
    //    비거래일이면 응답에 해당 일자 없음 → 직전 거래일 fallback
    const quotes = await deduplicate(`ka10081|${stockCode}|${date}`, () =>
      fetchDailyChart({
        stockCode,
        baseDateIso: date,
      }),
    );

    // 캐시 일괄 저장
    setCachedDailyCloses(stockCode, quotes);

    // 정확한 일자 hit
    const exact = quotes.find((q) => q.date === date);
    if (exact) {
      return NextResponse.json({
        stockCode,
        date,
        close: exact.close,
        isTradingDay: true,
        source: "api",
      });
    }

    // 비거래일 → 직전 거래일 fallback (자동 안내 — 사용자 선택 가능)
    const before = quotes
      .filter((q) => q.date <= date)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    if (before) {
      return NextResponse.json({
        stockCode,
        date,
        close: before.close,
        isTradingDay: false,
        priorTradingDate: before.date,
        source: "prior_trading_day",
      });
    }

    return NextResponse.json(
      {
        stockCode,
        date,
        close: null,
        isTradingDay: false,
        error: "no_data",
        message: "해당 일자 및 직전 거래일 종가를 조회할 수 없습니다.",
      },
      { status: 404 },
    );
  } catch (e) {
    return handleKiwoomError(e);
  }
}
