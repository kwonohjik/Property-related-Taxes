/**
 * UTC 달력 날짜 연산 — date-fns와 **같은 이름·같은 규칙**이되 로컬 시간대에 의존하지 않는다.
 *
 * 왜: API·화면의 날짜는 UTC 자정 Date(`lib/api/date-coerce.ts`의 `toDate`)다. date-fns의 `addYears`·`differenceInDays`·
 * `format`·`parseISO` 같은 함수는 **로컬 달력**으로 계산해서 서버/브라우저 시간대에 따라 값이 달라진다.
 *   - UTC 음수 오프셋(미주): UTC 자정이 로컬로 전날 저녁이라 달력일이 하루 어긋난다(`format(…, "yyyy-MM-dd")`가 전날을 찍음,
 *     윤년 2/29 → 5년 후가 3/1로 나옴, 말일 + 6개월 기한이 하루 밀림 등).
 *   - 서머타임 구간(서울 1948~51·55~60·87~88, 미주·유럽·호주 매년): 로컬 시각 성분이 1시간 어긋나 N년 만료일 당일이 1년·1일 모자라게 나온다.
 * 장기보유공제 연수·비사업용 토지 일수·감면 기한·신고기한이 시간대마다 달라지므로, 엔진·`lib/calc`·API는 date-fns 대신 이 모듈을 쓴다.
 *
 * 규칙: 알고리즘은 date-fns 4.1.0과 같다(UTC 시간대에서 값이 전부 같음 — `__tests__/tax-engine/utc-date.anchor.test.ts`의
 * 독립 기준 구현 대조). 입력 Date의 **UTC 달력일**을 기준으로 하고, 반환 Date는 입력의 UTC 시각 성분을 유지한다.
 * 달력 연산(`addMonths`·`addYears`)은 없는 날이면 그 달 말일(2/29 + 1년 = 2/28)로 맞춘다.
 *
 * `civil-period.ts`의 `addYearsUtc`·`addMonthsUtc`·`utcDayDiff`와 규칙이 같다(그쪽은 민법 기간 계산 전용 헬퍼를 함께 두는 모듈).
 */

const DAY_MS = 86_400_000;

function clone(d: Date): Date {
  return new Date(d.getTime());
}

function invalidDate(): Date {
  return new Date(Number.NaN);
}

// ── 가감 ─────────────────────────────────────────────────────────────────────

/** UTC 달력일 기준 일 단위 가감 */
export function addDays(date: Date, amount: number): Date {
  const result = clone(date);
  if (Number.isNaN(amount)) return invalidDate();
  if (!amount) return result;
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

/** UTC 달력일 기준 월 단위 가감 — 없는 날은 그 달 말일 */
export function addMonths(date: Date, amount: number): Date {
  const result = clone(date);
  if (Number.isNaN(amount)) return invalidDate();
  if (!amount) return result;
  const dayOfMonth = result.getUTCDate();
  const endOfDesiredMonth = clone(date);
  endOfDesiredMonth.setUTCMonth(result.getUTCMonth() + amount + 1, 0);
  const daysInMonth = endOfDesiredMonth.getUTCDate();
  if (dayOfMonth >= daysInMonth) return endOfDesiredMonth;
  result.setUTCFullYear(endOfDesiredMonth.getUTCFullYear(), endOfDesiredMonth.getUTCMonth(), dayOfMonth);
  return result;
}

/** UTC 달력일 기준 연 단위 가감 — 2/29 + 1년 = 2/28 */
export function addYears(date: Date, amount: number): Date {
  return addMonths(date, amount * 12);
}

export function subDays(date: Date, amount: number): Date {
  return addDays(date, -amount);
}

export function subMonths(date: Date, amount: number): Date {
  return addMonths(date, -amount);
}

export function subYears(date: Date, amount: number): Date {
  return addYears(date, -amount);
}

// ── 차이 ─────────────────────────────────────────────────────────────────────

function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** UTC 달력일 차이 — 시각 성분 무시 */
export function differenceInCalendarDays(laterDate: Date, earlierDate: Date): number {
  return Math.round((utcDayStart(laterDate) - utcDayStart(earlierDate)) / DAY_MS);
}

export function differenceInCalendarMonths(laterDate: Date, earlierDate: Date): number {
  const yearsDiff = laterDate.getUTCFullYear() - earlierDate.getUTCFullYear();
  const monthsDiff = laterDate.getUTCMonth() - earlierDate.getUTCMonth();
  return yearsDiff * 12 + monthsDiff;
}

export function differenceInCalendarYears(laterDate: Date, earlierDate: Date): number {
  return laterDate.getUTCFullYear() - earlierDate.getUTCFullYear();
}

function compareTime(a: Date, b: Date): number {
  const diff = a.getTime() - b.getTime();
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return diff; // 0 또는 NaN
}

function compareUtcAsc(laterDate: Date, earlierDate: Date): number {
  const diff =
    laterDate.getUTCFullYear() - earlierDate.getUTCFullYear() ||
    laterDate.getUTCMonth() - earlierDate.getUTCMonth() ||
    laterDate.getUTCDate() - earlierDate.getUTCDate() ||
    laterDate.getUTCHours() - earlierDate.getUTCHours() ||
    laterDate.getUTCMinutes() - earlierDate.getUTCMinutes() ||
    laterDate.getUTCSeconds() - earlierDate.getUTCSeconds() ||
    laterDate.getUTCMilliseconds() - earlierDate.getUTCMilliseconds();
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return diff;
}

/** 만 일수 — 마지막 날이 다 차지 않았으면 1을 뺀다(시각 성분 포함) */
export function differenceInDays(laterDate: Date, earlierDate: Date): number {
  const later = clone(laterDate);
  const earlier = clone(earlierDate);
  const sign = compareUtcAsc(later, earlier);
  const difference = Math.abs(differenceInCalendarDays(later, earlier));
  later.setUTCDate(later.getUTCDate() - sign * difference);
  const isLastDayNotFull = Number(compareUtcAsc(later, earlier) === -sign);
  const result = sign * (difference - isLastDayNotFull);
  return result === 0 ? 0 : result;
}

function isLastDayOfMonth(date: Date): boolean {
  const endOfDay = clone(date);
  endOfDay.setUTCHours(23, 59, 59, 999);
  return endOfDay.getTime() === endOfMonth(date).getTime();
}

/** 만 개월수 */
export function differenceInMonths(laterDate: Date, earlierDate: Date): number {
  const later = clone(laterDate);
  const working = clone(laterDate);
  const earlier = clone(earlierDate);
  const sign = compareTime(working, earlier);
  const difference = Math.abs(differenceInCalendarMonths(working, earlier));
  if (difference < 1) return 0;
  if (working.getUTCMonth() === 1 && working.getUTCDate() > 27) working.setUTCDate(30);
  working.setUTCMonth(working.getUTCMonth() - sign * difference);
  let isLastMonthNotFull = compareTime(working, earlier) === -sign;
  if (isLastDayOfMonth(later) && difference === 1 && compareTime(later, earlier) === 1) {
    isLastMonthNotFull = false;
  }
  const result = sign * (difference - +isLastMonthNotFull);
  return result === 0 ? 0 : result;
}

/** 만 연수 — 생일(응당일)이 아직 안 지났으면 1을 뺀다 */
export function differenceInYears(laterDate: Date, earlierDate: Date): number {
  const later = clone(laterDate);
  const earlier = clone(earlierDate);
  const sign = compareTime(later, earlier);
  const diff = Math.abs(differenceInCalendarYears(later, earlier));
  later.setUTCFullYear(1584);
  earlier.setUTCFullYear(1584);
  const partial = compareTime(later, earlier) === -sign;
  const result = sign * (diff - +partial);
  return result === 0 ? 0 : result;
}

// ── 경계·판정 ────────────────────────────────────────────────────────────────

/** UTC 달력 기준 그 달 말일 23:59:59.999 */
export function endOfMonth(date: Date): Date {
  const result = clone(date);
  const month = result.getUTCMonth();
  result.setUTCFullYear(result.getUTCFullYear(), month + 1, 0);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

/** UTC 달력 기준 그 날 00:00:00.000 */
export function startOfDay(date: Date): Date {
  const result = clone(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

/** 그 해의 일수(UTC 달력 연도 기준 365·366) */
export function getDaysInYear(date: Date): number {
  const time = date.getTime();
  if (Number.isNaN(time)) return Number.NaN;
  const y = date.getUTCFullYear();
  return y % 400 === 0 || (y % 4 === 0 && y % 100 !== 0) ? 366 : 365;
}

export function isBefore(date: Date, dateToCompare: Date): boolean {
  return date.getTime() < dateToCompare.getTime();
}

export function isAfter(date: Date, dateToCompare: Date): boolean {
  return date.getTime() > dateToCompare.getTime();
}

/** 양 끝 포함 */
export function isWithinInterval(date: Date, interval: { start: Date; end: Date }): boolean {
  const time = date.getTime();
  const [startTime, endTime] = [interval.start.getTime(), interval.end.getTime()].sort((a, b) => a - b);
  return time >= startTime && time <= endTime;
}

// ── 문자열 ↔ Date ───────────────────────────────────────────────────────────

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/;
const HAS_OFFSET = /(Z|[+-]\d{2}(:?\d{2})?)$/;

/**
 * ISO 문자열 → Date. 날짜만(`YYYY-MM-DD`)이면 **UTC 자정**이다(date-fns `parseISO`는 로컬 자정). 없는 날(2/30 등)·형식이 다르면 Invalid Date.
 * 시각이 있되 오프셋이 없으면 UTC로 본다. 오프셋·Z가 있으면 그 값 그대로.
 */
export function parseISO(argument: string): Date {
  const dateOnly = DATE_ONLY.exec(argument);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const m = Number(dateOnly[2]);
    const d = Number(dateOnly[3]);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : invalidDate();
  }
  if (!DATE_TIME.test(argument)) return invalidDate();
  const iso = argument.replace(" ", "T");
  return new Date(Date.parse(HAS_OFFSET.test(iso.slice(10)) ? iso : `${iso}Z`));
}

const pad = (n: number, len: number) => String(n).padStart(len, "0");

/** UTC 달력 날짜 문자열 — `yyyy-MM-dd` · `yyyy.MM.dd`만 지원한다(그 밖의 패턴은 던진다) */
export function format(date: Date, pattern: "yyyy-MM-dd" | "yyyy.MM.dd"): string {
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid time value");
  const sep = pattern === "yyyy-MM-dd" ? "-" : pattern === "yyyy.MM.dd" ? "." : undefined;
  if (sep === undefined) throw new RangeError(`utc-date format: 지원하지 않는 패턴 ${String(pattern)}`);
  return `${pad(date.getUTCFullYear(), 4)}${sep}${pad(date.getUTCMonth() + 1, 2)}${sep}${pad(date.getUTCDate(), 2)}`;
}
