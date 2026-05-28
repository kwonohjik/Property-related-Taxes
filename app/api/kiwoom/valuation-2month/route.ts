/**
 * POST /api/kiwoom/valuation-2month — F-01 §63①1가목 평가기준일 전후 2개월 자동조회.
 *
 * 사용처: 상속·증여세 상장주식 평가 (StockValuationForm ListedStockEditor).
 *
 * 법령 체인:
 *   상증법 §63①1가목 본문 — 평가기준일 이전·이후 각 2개월 종가 단순평균
 *   상증령 §52의2② 평균액 산정·③ 거래정지 제외·④ 거래일 분모 (공휴일·토요일)
 *
 * 흐름:
 *   1. Zod 검증 { stockCode, valuationDate }
 *   2. ka10001 + 마스터 → 거래정지 차단
 *   3. ka10081 base_dt = valuationDate + 2month (응답 ~200거래일)
 *   4. 클라이언트 필터 [valuationDate − 2month, valuationDate + 2month]
 *   5. twoMonthSurroundingAvg() → 슬롯·평균
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchStockInfo } from "@/lib/kiwoom/tr/ka10001";
import { fetchDailyChart } from "@/lib/kiwoom/tr/ka10081";
import { twoMonthSurroundingAvg } from "@/lib/kiwoom/averages";
import {
  getCachedDailyClose,
  setCachedDailyCloses,
  getCachedStockMeta,
  setCachedStockMeta,
} from "@/lib/kiwoom/cache";
import { deduplicate } from "@/lib/kiwoom/dedup";
import { buildTwoMonthSurroundingSlots, buildPartialSurroundingSlots } from "@/lib/kiwoom/calendar";
import { handleKiwoomError } from "../search/route";
import { type KiwoomDailyQuote } from "@/lib/kiwoom/types";

const RequestSchema = z.object({
  stockCode: z.string().regex(/^[0-9A-Z]{6}$/, "종목코드는 6자리 숫자 또는 대문자입니다."),
  valuationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "평가기준일은 YYYY-MM-DD 형식입니다."),
  /**
   * §52의2② 증자·합병 신주(미상장) 평가구간 단축 (선택).
   * client가 capitalIncreaseDate || mergerDate ∈ [D−2월, D] 일 때만 전달.
   * 미전달 시 default D±2월 전체 구간.
   */
  startOverrideDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "단축구간 시작일은 YYYY-MM-DD 형식입니다.")
    .optional(),
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

  const { stockCode, valuationDate, startOverrideDate } = parsed.data;

  try {
    let meta = getCachedStockMeta(stockCode);
    if (!meta) {
      const fetched = await deduplicate(`ka10001|${stockCode}`, () =>
        fetchStockInfo({ stockCode }),
      );
      setCachedStockMeta(fetched);
      meta = fetched;
    }

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

    const slotDates =
      startOverrideDate && startOverrideDate <= valuationDate
        ? buildPartialSurroundingSlots(startOverrideDate, valuationDate)
        : buildTwoMonthSurroundingSlots(valuationDate);
    const fromDate = slotDates[0];
    const endDate = slotDates[slotDates.length - 1];

    let cacheMiss = false;
    for (const iso of slotDates) {
      if (getCachedDailyClose(stockCode, iso) === undefined) {
        cacheMiss = true;
        break;
      }
    }

    let quotes: KiwoomDailyQuote[];
    if (cacheMiss) {
      // ka10081 base_dt = end (평가기준일 + 2month) — 응답 200거래일 ≥ 약 88거래일 커버
      quotes = await deduplicate(`ka10081|${stockCode}|${endDate}|2m`, () =>
        fetchDailyChart({
          stockCode,
          baseDateIso: endDate,
          fromDateIso: fromDate,
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

    const result = twoMonthSurroundingAvg({
      quotes,
      valuationDateIso: valuationDate,
      tradingHalt: meta.tradingHalt,
      adminIssue: meta.adminIssue,
    });

    return NextResponse.json({
      stockCode,
      stockName: meta.stockName,
      marketType: meta.marketType,
      valuationDate,
      ...result,
      cached: !cacheMiss,
    });
  } catch (e) {
    return handleKiwoomError(e);
  }
}
