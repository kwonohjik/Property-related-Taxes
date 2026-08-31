/**
 * POST /api/kiwoom/transfer-1month
 *
 * 양도일 이전 1개월 종가 자동조회.
 *
 * 법령: 소득세법 §99①3 → 시행령 §165③ 준용 → 상증법 §63①1가목 → 상증령 §52의2.
 *   §99①3 문언: 「"평가기준일 이전ㆍ이후 각 2개월"은 "양도일ㆍ취득일 **이전 1개월**"로 본다」
 *   ⚠️ 「이전」은 **그 날을 포함**한다(「전」이 미포함). `calendar.ts:147-162` 참조.
 *
 * 흐름:
 *   1. Zod 검증 { stockCode, transferDate }
 *   2. ka10001 → 거래정지·관리종목 확인
 *   3. ka10081 → base_dt=transferDate, ~ 200거래일 응답
 *   4. `buildOneMonthBeforeSlots(transferDate)` 로 슬롯 생성 — **기준일 포함**
 *   5. oneMonthBeforeTransferAvg() → 슬롯·평균
 *
 * 🔑 종전 주석은 4단계를 「필터 [transferDate − 1 month, transferDate **− 1 day**]」라 적어
 *    **기준일 제외**로 읽히게 했다. 사실이 아니다(`:88`이 그 builder를 그대로 쓴다).
 *    그 오독 때문에 UI 버튼이 「API는 양도일 미포함」이라는 전제로 창을 다시 만들고 있었다.
 *
 * 거래정지 시 자동조회 차단 (상증령 §52의2③):
 *   - 평균 산정 자체는 수행하되 tradingHalt 플래그 동봉.
 *   - UI에서 사용자에게 안내 후 수동 입력 유도.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchStockInfo } from "@/lib/kiwoom/tr/ka10001";
import { fetchDailyChart } from "@/lib/kiwoom/tr/ka10081";
import { oneMonthBeforeTransferAvg } from "@/lib/kiwoom/averages";
import {
  getCachedDailyClose,
  setCachedDailyCloses,
  getCachedStockMeta,
  setCachedStockMeta,
} from "@/lib/kiwoom/cache";
import { deduplicate } from "@/lib/kiwoom/dedup";
import { buildOneMonthBeforeSlots } from "@/lib/kiwoom/calendar";
import {
  needsMarketCalendar,
  buildMarketDaySet,
  resolveAnchorFromMarketDays,
  isStockSpecificGap,
  MARKET_REFERENCE_STOCK_CODE,
} from "@/lib/kiwoom/market-calendar";
import { handleKiwoomError } from "../search/route";
import { KiwoomError, type KiwoomDailyQuote } from "@/lib/kiwoom/types";

const RequestSchema = z.object({
  stockCode: z.string().regex(/^[0-9A-Z]{6}$/, "종목코드는 6자리 숫자 또는 대문자입니다 (KONEX 영문 포함)."),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "양도일은 YYYY-MM-DD 형식이어야 합니다."),
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

  const { stockCode, transferDate } = parsed.data;

  try {
    // 1. 종목 메타 (캐시 hit 우선)
    let meta = getCachedStockMeta(stockCode);
    if (!meta) {
      const fetched = await deduplicate(`ka10001|${stockCode}`, () =>
        fetchStockInfo({ stockCode }),
      );
      setCachedStockMeta(fetched);
      meta = fetched;
    }

    // 2. 거래정지 시 자동조회 차단 (상증령 §52의2③)
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

    /**
     * 3. anchor 확정 → 1개월 슬롯 생성 (**기준일 포함**)
     *
     * 휴장일 fixture는 2020~2026뿐이라 그 밖의 평일 공휴일에서는
     * `buildOneMonthBeforeSlots`의 anchor 시프트가 죽는다. 취득일은 대개 수년 전이라
     * 상시 발화하므로, 범위 밖이면 **참조 종목의 일봉으로 시장 거래일**을 얻어 보정한다
     * (계획서 B′안 · `lib/kiwoom/market-calendar.ts`).
     *
     * 🔑 「종가 없음」을 휴장과 «그 종목의 정지»로 가르는 것이 요점이다 —
     *    정지면 옮기면 안 된다(상증령 §52의2③은 그 평가를 아예 배제한다).
     */
    let anchorDate = transferDate;
    let anchorShifted = false;
    let marketDays: Set<string> = new Set();
    let marketCalendarUnavailable = false;

    if (needsMarketCalendar(transferDate)) {
      const refFrom = buildOneMonthBeforeSlots(transferDate)[0];
      let refQuotes: KiwoomDailyQuote[] = [];
      try {
        refQuotes = await deduplicate(
          `ka10081|${MARKET_REFERENCE_STOCK_CODE}|${transferDate}`,
          () =>
            fetchDailyChart({
              stockCode: MARKET_REFERENCE_STOCK_CODE,
              baseDateIso: transferDate,
              fromDateIso: refFrom,
            }),
        );
        setCachedDailyCloses(MARKET_REFERENCE_STOCK_CODE, refQuotes);
      } catch {
        // 참조 종목 조회 실패 — 판단 근거가 없으므로 **옮기지 않는다**(추정 금지).
        refQuotes = [];
      }
      marketDays = buildMarketDaySet(refQuotes);
      const resolved = resolveAnchorFromMarketDays(transferDate, marketDays);
      anchorDate = resolved.anchor;
      anchorShifted = resolved.shifted;
      marketCalendarUnavailable = resolved.exhausted;
    }

    const slotDates = buildOneMonthBeforeSlots(anchorDate);
    const fromDate = slotDates[0];

    // 4. 캐시에서 슬롯별 종가 hit 시도. miss 발생 시 ka10081 일괄 호출.
    let cacheMiss = false;
    for (const iso of slotDates) {
      if (getCachedDailyClose(stockCode, iso) === undefined) {
        cacheMiss = true;
        break;
      }
    }

    let quotes: KiwoomDailyQuote[];
    if (cacheMiss) {
      quotes = await deduplicate(`ka10081|${stockCode}|${anchorDate}`, () =>
        fetchDailyChart({
          stockCode,
          baseDateIso: anchorDate,
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

    // 5. 평균 산정
    const result = oneMonthBeforeTransferAvg({
      quotes,
      transferDateIso: anchorDate,
      tradingHalt: meta.tradingHalt,
      adminIssue: meta.adminIssue,
    });

    return NextResponse.json({
      stockCode,
      stockName: meta.stockName,
      marketType: meta.marketType,
      transferDate,
      ...result,
      /** B′ — 실제로 쓰인 anchor. `transferDate`와 다르면 휴장 보정이 일어난 것이다. */
      anchorDate,
      anchorShifted,
      /** 참조 달력을 못 얻어 보정을 «시도만 하고 포기»했다 — 화면이 그대로 알린다. */
      marketCalendarUnavailable,
      /** anchor에 시장은 열렸는데 이 종목만 종가가 없다 — 거래정지·미상장 신호(§52의2③). */
      stockSpecificGapAtAnchor: isStockSpecificGap(
        anchorDate,
        marketDays,
        buildMarketDaySet(quotes),
      ),
      cached: !cacheMiss,
    });
  } catch (e) {
    return handleKiwoomError(e);
  }
}
