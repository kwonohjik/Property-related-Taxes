/**
 * listed-stock-besshi — 키움 자동조회 응답 → EstateItem.listedStockDailyGroupsInput 어댑터.
 *
 * - resolveOverridePeriod: §52의2② 분기 (증자·합병 이전→다음날부터·이후→전일까지)
 * - applyKiwoomValuationResponse: 응답을 4그룹 분할 → EstateItem 갱신 input 생성
 *
 * [[mirror-pattern]] 예외: 사용자 입력 mirror가 아닌 외부 시세 응답의 1회 channel-fill.
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md §3-3
 * Design: docs/02-design/features/listed-stock-besshi-form-replica.engine.design.md §5-3
 */

import { subMonths, addMonths, addDays } from "date-fns";
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
 * §52의2② 평가기간 override 결정 (증자·합병 사유 반영).
 *
 * 법령(상증령 §52의2②, KoreanLaw MCP 2026-07-17):
 *   1호 평가기준일 이전 사유 → 사유발생일의 **다음날부터** 평가기준일+2월까지
 *   2호 평가기준일 이후 사유 → 평가기준일−2월부터 사유발생일의 **전일까지**
 *   3호 이전·이후 모두 → 이전 사유 다음날 ~ 이후 사유 전일
 *   (2회 이상이면 "평가기준일에 가장 가까운 날")
 *
 * capitalIncreaseDate·mergerDate 를 "증자·합병 등의 사유"로 취급.
 *   - startOverrideDate = 평가기준일 이전 사유 중 가장 가까운(최댓값) 날 + 1일 (없으면 undefined)
 *   - endOverrideDate   = 평가기준일 이후 사유 중 가장 가까운(최솟값) 날 − 1일 (없으면 undefined)
 * 소비부(splitTwoMonthSurroundingByMonthGroup)가 start는 before 행, end는 after 행에 적용.
 */
export function resolveOverridePeriod(
  item: {
    capitalIncreaseDate?: Date | string;
    mergerDate?: Date | string;
  },
  valuationDate: Date | string,
): { startOverrideDate?: string; endOverrideDate?: string } {
  const v = toDate(valuationDate);
  const lower = subMonths(v, 2);
  const upper = addMonths(v, 2);

  const events: Date[] = [];
  for (const e of [item.capitalIncreaseDate, item.mergerDate]) {
    if (!e) continue;
    const d = toDate(e);
    if (!isNaN(d.getTime())) events.push(d);
  }
  if (events.length === 0) return {};

  const result: { startOverrideDate?: string; endOverrideDate?: string } = {};

  // 이전 사유([lower, v]) 중 평가기준일에 가장 가까운 = 최댓값 → 다음날부터 (M-5: 당일 제외)
  const beforeTimes = events
    .filter((d) => d.getTime() >= lower.getTime() && d.getTime() <= v.getTime())
    .map((d) => d.getTime());
  if (beforeTimes.length > 0) {
    result.startOverrideDate = toIsoYmd(addDays(new Date(Math.max(...beforeTimes)), 1));
  }

  // 이후 사유((v, upper]) 중 평가기준일에 가장 가까운 = 최솟값 → 전일까지
  const afterTimes = events
    .filter((d) => d.getTime() > v.getTime() && d.getTime() <= upper.getTime())
    .map((d) => d.getTime());
  if (afterTimes.length > 0) {
    result.endOverrideDate = toIsoYmd(addDays(new Date(Math.min(...afterTimes)), -1));
  }

  return result;
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
  options?: { startOverrideDate?: string; endOverrideDate?: string },
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
