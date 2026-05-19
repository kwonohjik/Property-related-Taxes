/**
 * POST /api/kiwoom/post-listing-1month — F-02 §165⑤ 상장일 이후 1개월 자동조회.
 *
 * 사례 48 취득 후 상장 환산 산식의 분자 (1주당 취득기준시가의 평균).
 *
 * 법령 체인:
 *   소득세법 §99①3·§99①4 → 시행령 §165⑤ (취득 후 상장 환산) → 시행령 §165③ 준용
 *     → 상증법 §63①1가목 → 상증령 §52의2 (거래일 분모·거래정지 제외)
 *   다만 §165⑤은 "상장일 이후 1개월"로 기간 치환.
 *
 * 흐름:
 *   1. Zod 검증 { stockCode, listingDate }
 *   2. ka10001 + ka10099 마스터 → 거래정지·관리종목 확인
 *   3. ka10081 (base_dt = 상장일 + 1개월 - 1일) → 200거래일 응답
 *   4. 클라이언트 필터 [listingDate, listingDate + 1month - 1day]
 *   5. oneMonthAfterListingAvg() → 슬롯·평균
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchStockInfo } from "@/lib/kiwoom/tr/ka10001";
import { fetchDailyChart } from "@/lib/kiwoom/tr/ka10081";
import { oneMonthAfterListingAvg } from "@/lib/kiwoom/averages";
import {
  getCachedDailyClose,
  setCachedDailyCloses,
  getCachedStockMeta,
  setCachedStockMeta,
} from "@/lib/kiwoom/cache";
import { deduplicate } from "@/lib/kiwoom/dedup";
import { buildOneMonthAfterListingSlots } from "@/lib/kiwoom/calendar";
import { handleKiwoomError } from "../search/route";
import { type KiwoomDailyQuote } from "@/lib/kiwoom/types";

const RequestSchema = z.object({
  stockCode: z.string().regex(/^[0-9A-Z]{6}$/, "종목코드는 6자리 숫자 또는 대문자입니다 (KONEX 영문 포함)."),
  listingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "상장일은 YYYY-MM-DD 형식이어야 합니다."),
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

  const { stockCode, listingDate } = parsed.data;

  try {
    // 1. 종목 메타
    let meta = getCachedStockMeta(stockCode);
    if (!meta) {
      const fetched = await deduplicate(`ka10001|${stockCode}`, () =>
        fetchStockInfo({ stockCode }),
      );
      setCachedStockMeta(fetched);
      meta = fetched;
    }

    // 2. 거래정지 자동조회 차단 (상증령 §52의2③)
    if (meta.tradingHalt || meta.adminIssue) {
      return NextResponse.json(
        {
          error: "trading_halted",
          message: meta.tradingHalt
            ? "거래정지 종목 — 상증령 §52의2③에 따라 본 평가 미적용. 수동 입력 필요."
            : "관리종목 — 상증령 §52의2③에 따라 본 평가 미적용. 수동 입력 필요.",
          tradingHalt: meta.tradingHalt,
          adminIssue: meta.adminIssue,
          marketType: meta.marketType,
          stockName: meta.stockName,
        },
        { status: 409 },
      );
    }

    // 3. 1개월 슬롯 [listingDate, listingDate + 1month - 1day]
    const slotDates = buildOneMonthAfterListingSlots(listingDate);
    const endDate = slotDates[slotDates.length - 1];

    // 4. 캐시 hit / miss 판정
    let cacheMiss = false;
    for (const iso of slotDates) {
      if (getCachedDailyClose(stockCode, iso) === undefined) {
        cacheMiss = true;
        break;
      }
    }

    let quotes: KiwoomDailyQuote[];
    if (cacheMiss) {
      // ka10081 base_dt = end (상장 후 1개월 마지막 거래일), 응답 200거래일
      quotes = await deduplicate(`ka10081|${stockCode}|${endDate}`, () =>
        fetchDailyChart({
          stockCode,
          baseDateIso: endDate,
          fromDateIso: listingDate,
        }),
      );
      setCachedDailyCloses(stockCode, quotes);
    } else {
      quotes = slotDates
        .map((iso) => {
          const close = getCachedDailyClose(stockCode, iso);
          return close !== undefined ? { date: iso, close } : null;
        })
        .filter((q): q is KiwoomDailyQuote => q !== null);
    }

    // 5. 평균 산정
    const result = oneMonthAfterListingAvg({
      quotes,
      listingDateIso: listingDate,
      tradingHalt: meta.tradingHalt,
      adminIssue: meta.adminIssue,
    });

    return NextResponse.json({
      stockCode,
      stockName: meta.stockName,
      marketType: meta.marketType,
      listingDate,
      ...result,
      cached: !cacheMiss,
    });
  } catch (e) {
    return handleKiwoomError(e);
  }
}
