/**
 * 요건 기간 계산 — 국세기본법 §4 → 민법 §157(초일불산입)·§160(역에 의한 계산).
 *
 * 같은 「기간」이라도 조문 문구에 따라 초일 산입 여부가 다르다 — **하나로 통일하지 않는다**
 * (docs/00-pm/one-house-exemption-fix.plan.md §1).
 *
 * | 유형 | 문구 | 초일 | 충족 | 함수 |
 * |---|---|---|---|---|
 * | A | 「~한 날부터 N년 이상이 지난 후」 | 불산입 | 만료일 **다음날부터** | `isAfterPeriod` · `firstDayAfterPeriod` |
 * | B | 「~한 날부터 N년 이내」 | 불산입 | 만료일 **당일까지**(민법 §161 — 토요일·공휴일이면 익일) | `isWithinDeadline` · `deadlineEndFrom` (역상 말일만: `isWithinPeriod` · `periodEndFrom`) |
 * | C | 보유기간(§95④ 「취득일부터 양도일까지」) | 산입 | — | `calculateHoldingPeriod`(tax-utils) |
 * | D | 거주기간 개월(§154⑥ 전입일~전출일) | 산입 | — | `completedMonthsInclusive` |
 *
 * - 만료일: 기산일(초일불산입이면 사건일 다음날)의 응당일 전날(§160②). 만료 연·월에 해당일이
 *   없으면 그 달 말일(§160③) — 예: 2019-02-28 사건 → 기산 03-01 → 1년 만료 2020-02-29.
 * - 날짜는 **UTC 달력일**로 비교한다(`date-coerce` 운영 경로 = UTC 자정). 반환 Date도 UTC 자정이다.
 * - 근거: 서면2017법령해석재산-785·조심2019서1704·조심2020서1405(A), 서면2018부동산-3033·
 *   조심2012중305(B), 서면4팀-82·집행기준 89-154-20(D).
 */

import {
  PUBLIC_HOLIDAY_LONGEST_RUN_DAYS,
  PUBLIC_HOLIDAYS_KR,
  PUBLIC_HOLIDAY_TABLE_FIRST_YEAR,
  PUBLIC_HOLIDAY_TABLE_LAST_YEAR,
} from "./data/public-holidays-kr";
import { DEADLINE_HOLIDAY_EXTENSION_161, PERIOD_CALCULATION_4 } from "./legal-codes/common";

const DAY_MS = 86_400_000;

/** UTC 달력일 키(자정 타임스탬프) */
function dayKey(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** 기산일 `start`(그날 포함)부터 `months`개월 기간의 만료일 — §160②(응당일 전날)·③(해당일 없으면 말일) */
function civilPeriodEnd(start: Date, months: number): Date {
  const day = start.getUTCDate();
  const index = start.getUTCMonth() + months;
  const year = start.getUTCFullYear() + Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return day > lastDay
    ? new Date(Date.UTC(year, month, lastDay))
    : new Date(Date.UTC(year, month, day - 1));
}

/** 「`event`한 날부터 `years`년」의 만료일(초일불산입) — B 유형 기한 「이 날짜까지」 */
export function periodEndFrom(event: Date, years: number): Date {
  return civilPeriodEnd(new Date(dayKey(event) + DAY_MS), years * 12);
}

/** 「`event`한 날부터 `years`년 이상이 지난 후」를 충족하는 **최초의 날**(= 만료일 다음날) */
export function firstDayAfterPeriod(event: Date, years: number): Date {
  return new Date(dayKey(periodEndFrom(event, years)) + DAY_MS);
}

/** A 유형 — `target`이 「`event`한 날부터 `years`년 이상이 지난 후」인가 */
export function isAfterPeriod(event: Date, years: number, target: Date): boolean {
  return dayKey(target) > dayKey(periodEndFrom(event, years));
}

/** B 유형 — `target`이 「`event`한 날부터 `years`년 이내」인가 */
export function isWithinPeriod(event: Date, years: number, target: Date): boolean {
  return dayKey(target) <= dayKey(periodEndFrom(event, years));
}

/** `target`이 기한 말일 `end` **당일까지**인가 — 기한이 연수가 아니라 날짜로 정해질 때(§155①2호 단서) */
export function isOnOrBeforeDay(target: Date, end: Date): boolean {
  return dayKey(target) <= dayKey(end);
}

// ── 민법 §161 — 「~이내」 기한 말일의 토요일·공휴일 연장 (L-1) ──────────────────────────────
//
// 국세기본법 §4 「이 법 또는 세법에서 규정하는 기간의 계산은 … 「민법」에 따른다」 → 민법 §161 「기간의 말일이
// 토요일 또는 공휴일에 해당한 때에는 기간은 그 익일로 만료한다」. 사전-2021-법령해석재산-1190(법령해석과-3656,
// 2021.10.21.) — §155①2호 기한 말일(임대차 종료일)이 한글날 대체공휴일이면 「다음 날까지」 요건 충족.
// ⚠️ **B 유형(「~이내」)의 말일에만** 쓴다. A 유형(「~이 지난 후」) 경계에 쓰면 충족일이 늦어진다(선례 없음 — 계획서 §9.7).

/** 민법 §161에 「토요일」을 넣은 법률 제8720호 시행일 — 그 전 말일은 토요일로 연장되지 않는다. */
export const CIVIL_161_SATURDAY_START = new Date(Date.UTC(2007, 11, 21));

/** 「~이내」 기한의 말일 — 역(曆)상 말일(§160)과 §161 연장 후 말일 */
export interface DeadlineEnd {
  /** 기한 말일(민법 §161 반영) — 이 날 **당일까지** */
  end: Date;
  /** 역상 말일(§157·§160) */
  calendarEnd: Date;
  /** 역상 말일이 토요일·공휴일이라 늘어났다 */
  extended: boolean;
  /** 연장 판단에 공휴일 표(`data/public-holidays-kr.ts`) 밖의 해가 걸려 토·일요일만 반영했다 */
  holidayTableUncovered: boolean;
}

const inHolidayTable = (d: Date) =>
  d.getUTCFullYear() >= PUBLIC_HOLIDAY_TABLE_FIRST_YEAR &&
  d.getUTCFullYear() <= PUBLIC_HOLIDAY_TABLE_LAST_YEAR;

/** 민법 §161의 「토요일 또는 공휴일」인가. 표 밖의 해는 일요일만 공휴일로 본다(호출부가 고지). */
function isSaturdayOrPublicHoliday(d: Date): boolean {
  const w = d.getUTCDay();
  if (w === 0) return true; // 관공서의 공휴일에 관한 규정 §2 1호
  if (w === 6) return dayKey(d) >= dayKey(CIVIL_161_SATURDAY_START);
  return inHolidayTable(d) && PUBLIC_HOLIDAYS_KR[d.toISOString().slice(0, 10)] !== undefined;
}

/** 역상 말일 `calendarEnd`에 민법 §161을 적용한다 — 토요일·공휴일이면 그 익일(익일도 그러면 다시 익일). */
export function deadlineEnd(calendarEnd: Date): DeadlineEnd {
  let end = new Date(dayKey(calendarEnd));
  let uncovered = !inHolidayTable(end);
  while (isSaturdayOrPublicHoliday(end)) {
    end = new Date(dayKey(end) + DAY_MS);
    if (!inHolidayTable(end)) uncovered = true;
  }
  return {
    end,
    calendarEnd: new Date(dayKey(calendarEnd)),
    extended: dayKey(end) !== dayKey(calendarEnd),
    holidayTableUncovered: uncovered,
  };
}

/** 「`event`한 날부터 `years`년 이내」의 말일(민법 §161 반영) */
export function deadlineEndFrom(event: Date, years: number): DeadlineEnd {
  return deadlineEnd(periodEndFrom(event, years));
}

/** B 유형 기한 — `target`이 「`event`한 날부터 `years`년 이내」인가(민법 §161 반영) */
export function isWithinDeadline(event: Date, years: number, target: Date): boolean {
  return dayKey(target) <= dayKey(deadlineEndFrom(event, years).end);
}

/** 날짜로 정해진 기한(말일 `calendarEnd`) **당일까지**인가(민법 §161 반영) */
export function isOnOrBeforeDeadline(target: Date, calendarEnd: Date): boolean {
  return dayKey(target) <= dayKey(deadlineEnd(calendarEnd).end);
}

/** 기한 안내 필드 — 연장된 말일과(있으면) 한 줄 설명. `basisLaw`는 `deadlineEndNote` 참조 */
export function deadlineFields(d: DeadlineEnd, basisLaw?: string): { deadline: Date; deadlineNote?: string } {
  const note = deadlineEndNote(d, basisLaw);
  return { deadline: d.end, ...(note ? { deadlineNote: note } : {}) };
}

/**
 * `target` 직전 며칠(표 안 최장 연속 휴무 `PUBLIC_HOLIDAY_LONGEST_RUN_DAYS`) 중 공휴일 표 밖의 해가 있는가.
 * 「~이내」 기한은 역상 말일이 그 안에 있을 때만 §161 연장이 `target`의 판정을 바꾼다 — 판정 보류 고지용.
 */
export function holidayTableUncoveredBefore(target: Date): boolean {
  const from = new Date(dayKey(target) - PUBLIC_HOLIDAY_LONGEST_RUN_DAYS * DAY_MS);
  return !inHolidayTable(from) || !inHolidayTable(target);
}

/**
 * 기한 안내에 붙이는 한 줄 — 연장됐거나 공휴일 표가 덮지 못할 때만.
 *
 * @param basisLaw 민법 §161을 끌어오는 준용 조문 — 세목마다 다르다(국세: 국세기본법 §4 ·
 *   지방세: 지방세기본법 §23). 기본값은 국세기본법 §4(종전 모든 호출부가 국세 세목).
 */
export function deadlineEndNote(d: DeadlineEnd, basisLaw: string = PERIOD_CALCULATION_4): string | undefined {
  const ymd = (x: Date) => x.toISOString().slice(0, 10);
  if (d.holidayTableUncovered) {
    return (
      `역상 말일 ${ymd(d.calendarEnd)} — 이 해의 관공서 공휴일은 계산표에 없어 토·일요일만 반영했습니다` +
      `(${DEADLINE_HOLIDAY_EXTENSION_161}). 말일 또는 그 뒤 날이 공휴일이면 기한이 더 늘어납니다.`
    );
  }
  if (d.extended) {
    return `역상 말일 ${ymd(d.calendarEnd)}이 토요일·공휴일이라 기한이 ${ymd(d.end)}까지 늘어났습니다(${basisLaw} → ${DEADLINE_HOLIDAY_EXTENSION_161}).`;
  }
  return undefined;
}

/**
 * D 유형 — 전입일~전출일(양 끝 포함) 구간에서 완성된 개월 수.
 * 예: 2020-03-10~2022-03-09 = 24, 2020-02-29~2021-02-28 = 12(§160③). 역전 구간은 0.
 */
export function completedMonthsInclusive(start: Date, end: Date): number {
  if (dayKey(end) < dayKey(start)) return 0;
  let m =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1;
  while (m > 0 && dayKey(civilPeriodEnd(start, m)) > dayKey(end)) m -= 1;
  return m;
}
