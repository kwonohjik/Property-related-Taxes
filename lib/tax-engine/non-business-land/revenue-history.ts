/**
 * NBL-STATE-HISTORY-E3-② — 기타토지 업종 **영위 기간(개시·폐업) · 과세기간별 수입금액** 판정 leaf (순수 — DB·`new Date(문자열)` 없음).
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-2-business-period.engine.plan.md §3.6 · §4 · «결정 기록 (2026-11-23 사용자)»
 * 결정: Q-2 (가) — 수입금액비율은 **과세기간(역년)별**로 판정하고(영 §168의11②), 통과한 과세기간의 **실제 영위일**만 사업용 구간으로 센다 — 개시 전·폐업 후는 사업용이 아니다.
 *       영 §168의6 «기간의 계산은 일수로 한다»는 사업용 구간을 일 단위로 `meetsPeriodCriteria`에 넣어 지킨다. 과세기준일(6.1.) 접기·자동 안분은 하지 않는다.
 *       연도 판정은 현행 `computeRevenueTest`를 **연도마다 재사용**한다(연환산·윤년·간주임대료·공통수입·max(①,②) 복제 없음).
 *       양도연도 T·T−1은 기존 `revenueTest` 칸(`current*`·`prior*`)이 말하고, 그 이전(T−2~)만 연도 행이다. 행이 없거나 비면 «모름» — 그 연도는 불통과 + 확인 필요(차단 없음).
 *
 * ## 이 파일이 소유하는 것 (⑤ 미리보기 · ⑦ 결과 표 · ⑧ · ⑫ · ⑭ · 판정이 모두 같은 함수를 쓴다 — 3중 패턴)
 *   1. `deriveOperatingRange` · `operatingDaysInYear` · `operatingIntervalInYear` — 영위 기간 → 일 단위 영위 구간(초일산입 일수 ↔ 반열린 구간).
 *   2. `evaluateRevenueHistory` — 연도별 `computeRevenueTest` + 통과 과세기간 ∩ 영위일 = 사업용 구간.
 *   3. `closurePremise` — V-7: 규칙 §83의5①10호 «2년 이상 사업에 사용한 토지» 전제(영위 통산 일수).
 *   4. `revenueHistoryInputIssue` — ⑧·⑫ 공용 issue leaf(같은 판정·같은 문구).
 *
 * 날짜 규약: 영위 일수(연환산용)는 **초일산입**(양도연도는 양도일 포함 — 현행 `deriveBusinessDays`), 사업용 구간은 **반열린** `[start, end)`(양도일 제외 — `meetsPeriodCriteria`).
 * 개시일 = 처음 영업한 날 · 폐업일 = 영업을 하지 않게 된 첫날(휴업·폐업·이전). 소유 시작은 취득일(연환산 일수 — 현행 `deriveCurrentBusinessDays`와 같음)·구간은 취득일 다음 날.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { addDays } from "../utc-date";
import { addYears } from "../utc-date";
import { differenceInCalendarDays } from "../utc-date";
import { differenceInDays } from "../utc-date";
import { getDaysInYear } from "../utc-date";
import { computeRevenueTest } from "./revenue-test";
import { revenueEndDateAtOrAfterTransferMessage } from "./nbl-validation-messages";
import { revenueEndDateInvalidMessage } from "./nbl-validation-messages";
import { revenueEndDateNotAfterStartMessage } from "./nbl-validation-messages";
import { revenueRowAmountInvalidMessage } from "./nbl-validation-messages";
import { revenueRowYearDuplicateMessage } from "./nbl-validation-messages";
import { revenueRowYearInvalidMessage } from "./nbl-validation-messages";
import { revenueRowYearTooLateMessage } from "./nbl-validation-messages";
import { getOwnershipStart } from "./utils/period-math";
import { mergeOverlappingPeriods } from "./utils/period-math";
import type { DateInterval } from "./types";
import type { RevenueHistoryInput } from "./revenue-test.types";
import type { RevenueTestInput } from "./revenue-test.types";
import type { RevenueTestResult } from "./revenue-test.types";

const utc = (year: number, month: number, day: number): Date => new Date(Date.UTC(year, month, day));
const later = (a: Date, b: Date): Date => (a > b ? a : b);
const earlier = (a: Date, b: Date): Date => (a < b ? a : b);

// ── 영위 구간 ────────────────────────────────────────────────

/** 영위한 날의 범위 — 첫날·마지막 날 **모두 포함**(초일산입). */
export interface OperatingRange {
  first: Date;
  last: Date;
}

/**
 * 소유기간 중 영위 범위. 첫날 = max(개시일, 취득일) — 개시일이 없으면 소유 시작부터 영위 · 마지막 날 = 폐업일 전날 · 폐업일이 없으면 양도일(양도일 포함).
 * 영위일이 하루도 없으면 `undefined`(개시일이 양도일 이후이거나 폐업일이 개시일 이전인 입력 — ⑧·⑫가 먼저 막는다).
 */
export function deriveOperatingRange(history: Pick<RevenueHistoryInput, "businessStartDate" | "businessEndDate">, acquisitionDate: Date, transferDate: Date): OperatingRange | undefined {
  const first = history.businessStartDate ? later(history.businessStartDate, acquisitionDate) : acquisitionDate;
  const last = history.businessEndDate ? earlier(addDays(history.businessEndDate, -1), transferDate) : transferDate;
  return first <= last ? { first, last } : undefined;
}

/** 그 과세기간(역년) 안의 영위일수(초일산입). */
export function operatingDaysInYear(range: OperatingRange | undefined, year: number): number {
  if (!range) return 0;
  const lo = later(range.first, utc(year, 0, 1));
  const hi = earlier(range.last, utc(year, 11, 31));
  return lo <= hi ? differenceInCalendarDays(hi, lo) + 1 : 0;
}

/** 그 과세기간 안의 영위 구간(반열린 — 마지막 날의 다음 날이 끝). 없으면 `undefined`. */
export function operatingIntervalInYear(range: OperatingRange | undefined, year: number): DateInterval | undefined {
  if (!range) return undefined;
  const start = later(range.first, utc(year, 0, 1));
  const end = earlier(addDays(range.last, 1), utc(year + 1, 0, 1));
  return start < end ? { start, end } : undefined;
}

/** 영위 구간을 소유기간 창 `[window.start, window.end)`으로 자른 것. 겹치지 않으면 `undefined`. */
function clipToWindow(iv: DateInterval | undefined, window: DateInterval): DateInterval | undefined {
  if (!iv) return undefined;
  const start = later(iv.start, window.start);
  const end = earlier(iv.end, window.end);
  return start < end ? { start, end } : undefined;
}

/** 소유기간 중 영위 구간(반열린). 영위일이 없으면 `undefined`. */
export function operatingIntervalInOwnership(range: OperatingRange | undefined, window: DateInterval): DateInterval | undefined {
  return range ? clipToWindow({ start: range.first, end: addDays(range.last, 1) }, window) : undefined;
}

// ── 과세기간별 판정 ──────────────────────────────────────────

export interface RevenueYearJudgment {
  taxYear: number;
  /** 영위일수(초일산입). */
  operatingDays: number;
  yearDays: number;
  source: "current" | "prior" | "row";
  /** 비율을 계산할 입력이 갖춰졌는가(false = «모름»). */
  known: boolean;
  /** `known`일 때 `computeRevenueTest` 결과 그대로. */
  result?: RevenueTestResult;
  pass: boolean;
  /** 통과한 해의 사업용 구간(영위 구간 ∩ 그 해 ∩ 소유기간 · 반열린). */
  businessInterval?: DateInterval;
}

export interface RevenueHistoryEvaluation {
  range: OperatingRange | undefined;
  /** 소유기간 중 영위 구간(반열린). */
  operatingInterval: DateInterval | null;
  operatingDays: number;
  /** 영위일이 있는 과세기간별 판정(오래된 해부터). */
  years: RevenueYearJudgment[];
  /** 통과 과세기간 ∩ 영위일(병합). 도소매업 시장 요건 불충족 등 경로가 막히면 호출자가 비운다. */
  businessIntervals: DateInterval[];
  /** «모름»으로 불통과 처리한 연도. */
  unknownYears: number[];
}

/** 한 해의 판정 입력 — 수입금액·토지가액(+ 기존 칸이 말하는 해는 간주임대료·공통수입). */
interface YearCell {
  revenue?: number;
  landValue: number;
  deposit?: number;
  rentDays?: number;
  deemedRate?: { num: number; den: number };
  common?: number;
  otherLandValue?: number;
}

/**
 * 연도 y의 입력 칸. T → 기존 당해 칸 · T−1 → 기존 직전 칸 · 그 이전 → 연도 행. 토지가액이 0 이하이거나(수입이 없는 경우 포함) 비어 있으면 «모름»(`undefined`).
 * 직전 칸은 `computeRevenueTest`의 `hasPrior`와 같은 기준 — 수입금액 또는 간주임대료·공통수입 입력이 하나라도 있어야 한다.
 */
function yearCell(y: number, transferYear: number, rt: RevenueTestInput, rows: ReadonlyMap<number, { revenue?: number; landValue?: number }>): YearCell | undefined {
  if (y === transferYear) {
    return rt.currentLandValue > 0
      ? { revenue: rt.currentRevenue, landValue: rt.currentLandValue, deposit: rt.currentDeposit, rentDays: rt.currentRentDays, deemedRate: rt.currentDeemedRate, common: rt.commonRevenue, otherLandValue: rt.otherLandValue }
      : undefined;
  }
  if (y === transferYear - 1) {
    const hasRevenueSide = rt.priorRevenue !== undefined || ((rt.priorDeposit ?? 0) > 0 && (rt.priorRentDays ?? 0) > 0) || (rt.priorCommonRevenue ?? 0) > 0;
    return (rt.priorLandValue ?? 0) > 0 && hasRevenueSide
      ? { revenue: rt.priorRevenue, landValue: rt.priorLandValue!, deposit: rt.priorDeposit, rentDays: rt.priorRentDays, deemedRate: rt.priorDeemedRate, common: rt.priorCommonRevenue, otherLandValue: rt.priorOtherLandValue }
      : undefined;
  }
  const row = rows.get(y);
  return row && row.revenue !== undefined && row.landValue !== undefined && row.landValue > 0 ? { revenue: row.revenue, landValue: row.landValue } : undefined;
}

/**
 * 영위 기간 → 연도별 수입금액비율 판정 → 사업용 구간. `revenueTest`가 업종을 정하고(`businessType`) T·T−1 칸을 준다. 소유기간 창 = `[취득일 다음 날, 양도일)`.
 *
 * 연도 y의 비율②에 쓰는 직전(y−1)은 **그 해에 영위일이 있고 입력이 갖춰졌을 때만** 쓴다 — 영위하지 않은 해의 칸·행은 읽지 않는다(폐업 후 남은 값이 닿지 않게).
 * 연환산 영위일수는 `currentBusinessDays`·`priorBusinessDays`를 **날짜에서 파생한 값**으로 덮는다(직접 입력한 직전 영위일수는 ON에서 쓰지 않는다).
 */
export function evaluateRevenueHistory(history: RevenueHistoryInput, rt: RevenueTestInput, acquisitionDate: Date, transferDate: Date): RevenueHistoryEvaluation {
  const window: DateInterval = { start: getOwnershipStart(acquisitionDate), end: transferDate };
  const range = deriveOperatingRange(history, acquisitionDate, transferDate);
  const transferYear = transferDate.getUTCFullYear();
  const rows = new Map(history.rows.map((r) => [r.taxYear, r] as const)); // T·T−1 연도는 `yearCell`이 행을 보지 않고 기존 당해·직전 칸을 쓴다
  const od = (y: number) => operatingDaysInYear(range, y);

  const years: RevenueYearJudgment[] = [];
  if (range) {
    for (let y = range.first.getUTCFullYear(); y <= range.last.getUTCFullYear(); y++) {
      const c = yearCell(y, transferYear, rt, rows);
      const p = od(y - 1) > 0 ? yearCell(y - 1, transferYear, rt, rows) : undefined;
      const source = y === transferYear ? "current" : y === transferYear - 1 ? "prior" : "row";
      const base = { taxYear: y, operatingDays: od(y), yearDays: getDaysInYear(utc(y, 0, 1)), source } as const;
      if (!c) {
        years.push({ ...base, known: false, pass: false });
        continue;
      }
      const result = computeRevenueTest({
        businessType: rt.businessType,
        currentRevenue: c.revenue ?? 0,
        currentLandValue: c.landValue,
        currentBusinessDays: od(y),
        currentTaxYear: y,
        currentDeposit: c.deposit,
        currentRentDays: c.rentDays,
        currentDeemedRate: c.deemedRate,
        commonRevenue: c.common,
        otherLandValue: c.otherLandValue,
        ...(p
          ? {
              priorRevenue: p.revenue,
              priorLandValue: p.landValue,
              priorBusinessDays: od(y - 1),
              priorTaxYear: y - 1,
              priorDeposit: p.deposit,
              priorRentDays: p.rentDays,
              priorDeemedRate: p.deemedRate,
              priorCommonRevenue: p.common,
              priorOtherLandValue: p.otherLandValue,
            }
          : {}),
      });
      const businessInterval = result.pass ? clipToWindow(operatingIntervalInYear(range, y), window) : undefined;
      years.push({ ...base, known: true, result, pass: result.pass, ...(businessInterval ? { businessInterval } : {}) });
    }
  }

  const operatingInterval = operatingIntervalInOwnership(range, window) ?? null;
  return {
    range,
    operatingInterval,
    operatingDays: operatingInterval ? differenceInDays(operatingInterval.end, operatingInterval.start) : 0,
    years,
    businessIntervals: mergeOverlappingPeriods(years.flatMap((j) => (j.businessInterval ? [j.businessInterval] : []))),
    unknownYears: years.filter((j) => !j.known).map((j) => j.taxYear),
  };
}

// ── V-7: 규칙 §83의5①10호 «2년 이상 사업에 사용한 토지» ─────────

/**
 * 10호 유예 기산일(`anchor`) 이전 소유기간 중 영위 통산 일수가 «2년»(= 기산일 − 2년, 윤일 포함 730 또는 731일) 이상인가.
 * 비율 통과 여부와 **무관**하다 — «사업에 사용한» 사실이지 다목 인정 여부가 아니다(법에 없는 불리 요건을 더하지 않는다). «통산 vs 계속»은 직접 해석이 없어(V-2) 문언대로 통산이다.
 */
export function closurePremise(range: OperatingRange | undefined, ownershipStart: Date, anchor: Date): { operatingDaysBefore: number; requiredDays: number; met: boolean } {
  const iv = operatingIntervalInOwnership(range, { start: ownershipStart, end: anchor });
  const operatingDaysBefore = iv ? differenceInDays(iv.end, iv.start) : 0;
  const requiredDays = differenceInDays(anchor, addYears(anchor, -2));
  return { operatingDaysBefore, requiredDays, met: operatingDaysBefore >= requiredDays };
}

// ── ⑧·⑫ 공용 issue leaf ─────────────────────────────────────

export interface RevenueHistoryIssue {
  /** 결함 칸 — `nblRevenueBusinessEndDate` 또는 `nblRevenueYearRows`(행이면 `index`·`part`). */
  field: "nblRevenueBusinessEndDate" | "nblRevenueYearRows";
  index?: number;
  part?: "year" | "revenue" | "landValue";
  message: string;
}

export interface RevenueHistoryRawRow {
  year?: string;
  revenue?: string;
  landValue?: string;
}

export interface RevenueHistoryRawInput {
  startDate?: string;
  endDate?: string;
  transferDate?: string;
  rows?: ReadonlyArray<RevenueHistoryRawRow>;
}

/** 금액 칸 — 비어 있으면 «모름»(문제 없음), 콤마·공백 제거 후 0 이상의 정수가 아니면 읽을 수 없음. */
function amountReadable(value: string | undefined): boolean {
  const v = (value ?? "").replace(/,/g, "").trim();
  return v === "" || /^\d+$/.test(v);
}

/**
 * 영위 기간 입력(폐업일·연도 행)의 첫 결함. 이상 없으면 null. **⑧(UI 검증)과 ⑫(Zod refine)가 같은 함수·같은 문구를 쓴다** — 어긋나면 «⑧ 통과 ↔ ⑫ 400» 모순이다.
 * 개시일 자체의 규칙(양도일 이후 금지)은 기존 `revenueStartDateAfterTransfer`가 맡는다. 연도 행 «누락»·빈 금액은 막지 않는다(모름 = 그 연도 불통과 + 확인 필요).
 * 하한(개시일·폐업일이 소유 시작 전)은 두지 않는다 — 축 B 늦은 지분이 400이 되는 것을 막는 선례(E3-① Q-11). 엔진은 소유기간으로 자른다.
 */
export function revenueHistoryInputIssue(raw: RevenueHistoryRawInput): RevenueHistoryIssue | null {
  const end = raw.endDate ? toOptionalDate(raw.endDate) : undefined;
  if (raw.endDate && !end) return { field: "nblRevenueBusinessEndDate", message: revenueEndDateInvalidMessage(raw.endDate) };
  const start = raw.startDate ? toOptionalDate(raw.startDate) : undefined;
  const transfer = raw.transferDate ? toOptionalDate(raw.transferDate) : undefined;
  if (end && start && end.getTime() <= start.getTime()) return { field: "nblRevenueBusinessEndDate", message: revenueEndDateNotAfterStartMessage(raw.endDate!, raw.startDate!) };
  if (end && transfer && end.getTime() >= transfer.getTime()) return { field: "nblRevenueBusinessEndDate", message: revenueEndDateAtOrAfterTransferMessage(raw.endDate!, raw.transferDate!) };

  const transferYear = transfer?.getUTCFullYear();
  const seen = new Set<number>();
  const rows = raw.rows ?? [];
  for (let i = 0; i < rows.length; i++) {
    const { year = "", revenue, landValue } = rows[i];
    const trimmed = year.trim();
    if (!/^\d{4}$/.test(trimmed)) return { field: "nblRevenueYearRows", index: i, part: "year", message: revenueRowYearInvalidMessage(i, year) };
    const y = Number(trimmed);
    if (seen.has(y)) return { field: "nblRevenueYearRows", index: i, part: "year", message: revenueRowYearDuplicateMessage(i, trimmed) };
    seen.add(y);
    if (transferYear !== undefined && y >= transferYear - 1) return { field: "nblRevenueYearRows", index: i, part: "year", message: revenueRowYearTooLateMessage(i, trimmed, transferYear) };
    if (!amountReadable(revenue)) return { field: "nblRevenueYearRows", index: i, part: "revenue", message: revenueRowAmountInvalidMessage(i, "수입금액", revenue!) };
    if (!amountReadable(landValue)) return { field: "nblRevenueYearRows", index: i, part: "landValue", message: revenueRowAmountInvalidMessage(i, "토지가액", landValue!) };
  }
  return null;
}
