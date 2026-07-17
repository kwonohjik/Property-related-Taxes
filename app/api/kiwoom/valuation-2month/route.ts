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
import { splitTwoMonthSurroundingByMonthGroup } from "@/lib/kiwoom/two-month-grouping";
import {
  getCachedDailyClose,
  setCachedDailyCloses,
  getCachedStockMeta,
  setCachedStockMeta,
} from "@/lib/kiwoom/cache";
import { deduplicate } from "@/lib/kiwoom/dedup";
import {
  buildTwoMonthSurroundingSlots,
  buildPartialSurroundingSlots,
  buildSurroundingSlotsFromAnchor,
  resolveValuationAnchor,
  nonTradingLabel,
} from "@/lib/kiwoom/calendar";
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
  /**
   * §52의2②2·3호 평가구간 말기 단축 (선택) — 평가기준일 이후 증자·합병 사유 전일까지.
   * 클라이언트가 재계산하는 을지 산식(SSOT)이 최종 평균이며, 서버는 groups.average·기간 메타 정합용.
   */
  endOverrideDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "단축구간 종료일은 YYYY-MM-DD 형식입니다.")
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

  const { stockCode, valuationDate, startOverrideDate, endOverrideDate } = parsed.data;

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

    // 상증령 §52의2 anchor 보정 (이미지 13)
    const resolvedAnchor = resolveValuationAnchor(valuationDate);
    const anchorShifted = resolvedAnchor !== valuationDate;
    const anchorShiftReason = anchorShifted
      ? nonTradingLabel(valuationDate).replace(/\s*·\s*거래일\s*제외\s*$/, "") || "비거래일"
      : undefined;

    const slotDates =
      startOverrideDate && startOverrideDate <= valuationDate
        ? buildPartialSurroundingSlots(startOverrideDate, valuationDate)
        : buildSurroundingSlotsFromAnchor(resolvedAnchor);
    // legacy fallback (anchor 적용 실패 시 — 이론상 발생 안 함)
    if (slotDates.length === 0) {
      slotDates.push(...buildTwoMonthSurroundingSlots(valuationDate));
    }
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
      valuationDateIso: resolvedAnchor, // anchor 기반 slot 생성·NO 매핑 (이미지 13)
      tradingHalt: meta.tradingHalt,
      adminIssue: meta.adminIssue,
    });

    // SSOT — 을지 산식(D 양쪽 카운트) 결과로 average·sum·tradingDays 덮어쓰기.
    // Plan: docs/00-pm/listed-stock-besshi-avg-dual-truth-fix.plan.md §1-1·D-1
    // twoMonthSurroundingAvg 의 D 1회 산식은 오답이므로 클라이언트로 전달하지 않음.
    const groups = splitTwoMonthSurroundingByMonthGroup(
      result.slotDates,
      result.closingPrices,
      result.weekendLabels,
      resolvedAnchor,
      startOverrideDate || endOverrideDate
        ? { startOverrideDate, endOverrideDate }
        : undefined,
    );

    return NextResponse.json({
      stockCode,
      stockName: meta.stockName,
      marketType: meta.marketType,
      valuationDate, // 사용자 입력 원본
      inputValuationDate: valuationDate,
      resolvedAnchor,
      anchorShifted,
      anchorShiftReason,
      valuationPeriodStart: slotDates[0],
      // §52의2②2·3호 — 이후 사유 전일까지로 말기 단축 반영(메타 표시)
      valuationPeriodEnd:
        endOverrideDate && endOverrideDate < slotDates[slotDates.length - 1]
          ? endOverrideDate
          : slotDates[slotDates.length - 1],
      ...result,
      // ⚠️ 정답 산식으로 덮어쓰기 (en-route override) — result 의 average/sum/tradingDays 무효화.
      average: groups.closingAverage,
      sum: groups.closingSum,
      tradingDays: groups.tradingDays,
      cached: !cacheMiss,
    });
  } catch (e) {
    return handleKiwoomError(e);
  }
}
