/**
 * listed-stock-besshi — 키움 자동조회 응답 → EstateItem.listedStockDailyGroupsInput 어댑터.
 *
 * - resolveStartOverrideDate: §52의2② 분기 (capitalIncrease/merger D−2월 이내일 때 전달)
 * - applyKiwoomValuationResponse: 응답을 4그룹 분할 → EstateItem 갱신 input 생성
 *
 * [[mirror-pattern]] 예외: 사용자 입력 mirror가 아닌 외부 시세 응답의 1회 channel-fill.
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md §3-3
 * Design: docs/02-design/features/listed-stock-besshi-form-replica.engine.design.md §5-3
 */

import { subMonths } from "date-fns";
import { splitTwoMonthSurroundingByMonthGroup } from "@/lib/kiwoom/two-month-grouping";
import type { ListedStockMonthGroups } from "@/lib/tax-engine/types/listed-stock-valuation.types";

function toIsoYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDate(v: Date | string): Date {
  if (v instanceof Date) return v;
  const [y, m, d] = v.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * §52의2② startOverrideDate 결정.
 * capitalIncreaseDate 또는 mergerDate 가 [valuationDate − 2월, valuationDate] 이내면 ISO 반환.
 * 둘 다 미입력 또는 범위 밖이면 undefined.
 */
export function resolveStartOverrideDate(
  item: {
    capitalIncreaseDate?: Date | string;
    mergerDate?: Date | string;
  },
  valuationDate: Date | string,
): string | undefined {
  const candidate = item.capitalIncreaseDate ?? item.mergerDate;
  if (!candidate) return undefined;
  const d = toDate(candidate);
  const v = toDate(valuationDate);
  const lowerBound = subMonths(v, 2);
  if (d.getTime() >= lowerBound.getTime() && d.getTime() <= v.getTime()) {
    return toIsoYmd(d);
  }
  return undefined;
}

/**
 * 키움 valuation-2month 응답 → EstateItem.listedStockDailyGroupsInput.
 *
 * 응답 shape (lib/kiwoom/averages.ts twoMonthSurroundingAvg + route.ts wrap):
 *   { slotDates, closingPrices, weekendLabels, tradingDays, sum, average, ... }
 */
export interface KiwoomValuation2MonthResponse {
  stockCode: string;
  stockName?: string;
  marketType?: string;
  valuationDate: string;
  slotDates: string[];
  closingPrices: (number | null)[];
  weekendLabels: string[];
  tradingDays: number;
  sum: number;
  average: number;
  tradingHalt?: boolean;
  adminIssue?: boolean;
  cached?: boolean;
  // 상증령 §52의2 anchor 보정 (이미지 13 — 2026-05-28 추가)
  inputValuationDate?: string;
  resolvedAnchor?: string;
  anchorShifted?: boolean;
  anchorShiftReason?: string;
  valuationPeriodStart?: string;
  valuationPeriodEnd?: string;
}

export function applyKiwoomValuationResponse(
  response: KiwoomValuation2MonthResponse,
  options?: { startOverrideDate?: string },
): {
  listedStockAvgPrice: number;
  companyName?: string;
  listedStockDailyGroupsInput: ListedStockMonthGroups;
  resolvedValuationAnchor?: string;
  valuationAnchorShifted?: boolean;
  valuationAnchorShiftReason?: string;
  valuationPeriodStart?: string;
  valuationPeriodEnd?: string;
} {
  // anchor 기반 NO 매핑 (이미지 13) — resolvedAnchor 우선, fallback valuationDate
  const anchorForGrouping = response.resolvedAnchor ?? response.valuationDate;
  const groups = splitTwoMonthSurroundingByMonthGroup(
    response.slotDates,
    response.closingPrices,
    response.weekendLabels,
    anchorForGrouping,
    options,
  );
  return {
    // SSOT — §52의2 정답 산식 = 을지 grouping 결과의 closingAverage 단일 출처.
    // Plan: docs/00-pm/listed-stock-besshi-avg-dual-truth-fix.plan.md §1-1
    // (response.average 는 twoMonthSurroundingAvg(D 1회) 산식이라 오답 가능 — 무시).
    listedStockAvgPrice: groups.closingAverage,
    companyName: response.stockName,
    listedStockDailyGroupsInput: groups,
    resolvedValuationAnchor: response.resolvedAnchor,
    valuationAnchorShifted: response.anchorShifted,
    valuationAnchorShiftReason: response.anchorShiftReason,
    valuationPeriodStart: response.valuationPeriodStart,
    valuationPeriodEnd: response.valuationPeriodEnd,
  };
}
