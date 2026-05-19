/**
 * 키움 일봉 평균 산식 — §99①3 → 시행령 §165③ 준용 → 상증법 §63①1가목 → 상증령 §52의2.
 *
 * 본 모듈은 순수 함수 — fetch 책임 없음. Route Handler가 ka10081 응답을
 * `[transferDate − 1 month, transferDate − 1 day]` 범위로 필터한 후 `quotes` 인자로 전달.
 *
 * 분모 정의 (상증령 §52의2④):
 *   - 거래일만 분모 산입 (공휴일·대체공휴일·토요일 제외)
 *   - 일요일은 §52의2④에 미명시하나 거래소 미개장 → 사실상 거래일 부재
 *
 * 거래정지 제외 (상증령 §52의2③):
 *   - 거래정지·관리종목은 본 평가 미적용 → API/UI에서 차단. averages.ts는 평균만 산정.
 *
 * 자동 fallback 금지 (`feedback_no_silent_apportion_fallback`):
 *   - 분모 부족(IPO 미만·거래정지 등)이어도 자동 보간 금지. warning 메타 동봉.
 */

import {
  buildOneMonthBeforeSlots,
  buildOneMonthAfterListingSlots,
  buildTwoMonthSurroundingSlots,
  nonTradingLabel,
  isKrxTradingDay,
} from "./calendar";
import type { KiwoomDailyQuote, OneMonthBeforeTransferResult } from "./types";

export interface OneMonthBeforeTransferArgs {
  /** ka10081 응답 거래일 종가 배열 (오래된→최신, 1개월 범위 필터된 상태) */
  quotes: ReadonlyArray<KiwoomDailyQuote>;
  /** "YYYY-MM-DD" */
  transferDateIso: string;
  /** 거래정지·관리종목 플래그 (안내용 — 평균 산정 자체는 quotes 기준) */
  tradingHalt?: boolean;
  adminIssue?: boolean;
}

/**
 * §99①3·§165③ 양도일 직전 1개월 1주당 종가 평균.
 *
 * 산정 절차:
 * 1. 1개월 슬롯 생성 (`buildOneMonthBeforeSlots`)
 * 2. 슬롯별 거래일 판정 → 종가 매핑
 * 3. 거래일만 분모로 평균
 */
export function oneMonthBeforeTransferAvg(
  args: OneMonthBeforeTransferArgs,
): OneMonthBeforeTransferResult {
  const slotDates = buildOneMonthBeforeSlots(args.transferDateIso);
  const quoteByDate = new Map<string, number>();
  for (const q of args.quotes) {
    if (q.close > 0) quoteByDate.set(q.date, q.close);
  }

  const closingPrices: (number | null)[] = [];
  const weekendLabels: string[] = [];
  let sum = 0;
  let tradingDays = 0;

  for (const iso of slotDates) {
    const tradingDay = isKrxTradingDay(iso);
    const label = nonTradingLabel(iso);
    if (!tradingDay) {
      closingPrices.push(null);
      weekendLabels.push(label);
      continue;
    }
    const close = quoteByDate.get(iso);
    if (typeof close === "number" && close > 0) {
      closingPrices.push(close);
      weekendLabels.push("");
      sum += close;
      tradingDays += 1;
    } else {
      // 거래일이지만 응답에 종가 없음 (IPO 미만·거래정지 등)
      closingPrices.push(null);
      weekendLabels.push("종가 없음");
    }
  }

  const average = tradingDays > 0 ? Math.floor(sum / tradingDays) : 0;

  return {
    slotDates,
    closingPrices,
    weekendLabels,
    tradingDays,
    sum,
    average,
    tradingHalt: !!args.tradingHalt,
    adminIssue: !!args.adminIssue,
  };
}

// ============================================================
// F-02 §165⑤ 상장일 이후 1개월 종가 평균 (사례 48 취득 후 상장)
// ============================================================

export interface OneMonthAfterListingArgs {
  /** ka10081 응답 거래일 종가 배열 (1개월 범위 필터 후) */
  quotes: ReadonlyArray<KiwoomDailyQuote>;
  /** "YYYY-MM-DD" — 상장일 */
  listingDateIso: string;
  /** 거래정지·관리종목 플래그 */
  tradingHalt?: boolean;
  adminIssue?: boolean;
}

/**
 * §165⑤ 상장일 이후 1개월 1주당 종가 평균 (사례 48 취득 후 상장 환산 분자).
 *
 * 산정 절차:
 * 1. 1개월 슬롯 생성 (`buildOneMonthAfterListingSlots`) — 상장일 포함
 * 2. 슬롯별 거래일 판정 → 종가 매핑
 * 3. 거래일만 분모로 평균
 */
export function oneMonthAfterListingAvg(
  args: OneMonthAfterListingArgs,
): OneMonthBeforeTransferResult {
  const slotDates = buildOneMonthAfterListingSlots(args.listingDateIso);
  const quoteByDate = new Map<string, number>();
  for (const q of args.quotes) {
    if (q.close > 0) quoteByDate.set(q.date, q.close);
  }

  const closingPrices: (number | null)[] = [];
  const weekendLabels: string[] = [];
  let sum = 0;
  let tradingDays = 0;

  for (const iso of slotDates) {
    const tradingDay = isKrxTradingDay(iso);
    const label = nonTradingLabel(iso);
    if (!tradingDay) {
      closingPrices.push(null);
      weekendLabels.push(label);
      continue;
    }
    const close = quoteByDate.get(iso);
    if (typeof close === "number" && close > 0) {
      closingPrices.push(close);
      weekendLabels.push("");
      sum += close;
      tradingDays += 1;
    } else {
      closingPrices.push(null);
      weekendLabels.push("종가 없음");
    }
  }

  const average = tradingDays > 0 ? Math.floor(sum / tradingDays) : 0;

  return {
    slotDates,
    closingPrices,
    weekendLabels,
    tradingDays,
    sum,
    average,
    tradingHalt: !!args.tradingHalt,
    adminIssue: !!args.adminIssue,
  };
}

// ============================================================
// F-01 §63①1가목 평가기준일 전후 2개월 평균 (상속·증여 평가)
// ============================================================

export interface TwoMonthSurroundingArgs {
  /** ka10081 응답 거래일 종가 배열 */
  quotes: ReadonlyArray<KiwoomDailyQuote>;
  /** "YYYY-MM-DD" — 평가기준일 (상속개시일 또는 증여일) */
  valuationDateIso: string;
  tradingHalt?: boolean;
  adminIssue?: boolean;
}

/**
 * §63①1가목 평가기준일 전후 2개월 1주당 종가 평균 (상속·증여 평가).
 *
 * 거래일 분모·휴장일 자동 제외 (상증령 §52의2④).
 */
export function twoMonthSurroundingAvg(
  args: TwoMonthSurroundingArgs,
): OneMonthBeforeTransferResult {
  const slotDates = buildTwoMonthSurroundingSlots(args.valuationDateIso);
  const quoteByDate = new Map<string, number>();
  for (const q of args.quotes) {
    if (q.close > 0) quoteByDate.set(q.date, q.close);
  }

  const closingPrices: (number | null)[] = [];
  const weekendLabels: string[] = [];
  let sum = 0;
  let tradingDays = 0;

  for (const iso of slotDates) {
    const tradingDay = isKrxTradingDay(iso);
    const label = nonTradingLabel(iso);
    if (!tradingDay) {
      closingPrices.push(null);
      weekendLabels.push(label);
      continue;
    }
    const close = quoteByDate.get(iso);
    if (typeof close === "number" && close > 0) {
      closingPrices.push(close);
      weekendLabels.push("");
      sum += close;
      tradingDays += 1;
    } else {
      closingPrices.push(null);
      weekendLabels.push("종가 없음");
    }
  }

  const average = tradingDays > 0 ? Math.floor(sum / tradingDays) : 0;

  return {
    slotDates,
    closingPrices,
    weekendLabels,
    tradingDays,
    sum,
    average,
    tradingHalt: !!args.tradingHalt,
    adminIssue: !!args.adminIssue,
  };
}
