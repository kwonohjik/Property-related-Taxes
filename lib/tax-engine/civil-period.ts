/**
 * 요건 기간 계산 — 국세기본법 §4 → 민법 §157(초일불산입)·§160(역에 의한 계산).
 *
 * 같은 「기간」이라도 조문 문구에 따라 초일 산입 여부가 다르다 — **하나로 통일하지 않는다**
 * (docs/00-pm/one-house-exemption-fix.plan.md §1).
 *
 * | 유형 | 문구 | 초일 | 충족 | 함수 |
 * |---|---|---|---|---|
 * | A | 「~한 날부터 N년 이상이 지난 후」 | 불산입 | 만료일 **다음날부터** | `isAfterPeriod` · `firstDayAfterPeriod` |
 * | B | 「~한 날부터 N년 이내」 | 불산입 | 만료일 **당일까지** | `isWithinPeriod` · `periodEndFrom` |
 * | C | 보유기간(§95④ 「취득일부터 양도일까지」) | 산입 | — | `calculateHoldingPeriod`(tax-utils) |
 * | D | 거주기간 개월(§154⑥ 전입일~전출일) | 산입 | — | `completedMonthsInclusive` |
 *
 * - 만료일: 기산일(초일불산입이면 사건일 다음날)의 응당일 전날(§160②). 만료 연·월에 해당일이
 *   없으면 그 달 말일(§160③) — 예: 2019-02-28 사건 → 기산 03-01 → 1년 만료 2020-02-29.
 * - 날짜는 **UTC 달력일**로 비교한다(`date-coerce` 운영 경로 = UTC 자정). 반환 Date도 UTC 자정이다.
 * - 근거: 서면2017법령해석재산-785·조심2019서1704·조심2020서1405(A), 서면2018부동산-3033·
 *   조심2012중305(B), 서면4팀-82·집행기준 89-154-20(D).
 */

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
