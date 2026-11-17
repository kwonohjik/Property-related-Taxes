/**
 * 합산배제 추징 이자상당가산액 — 이자율 구간·기산일 (종합부동산세법 시행령 §10②)
 *
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §5.1
 *
 * - 기간(§10②1호): 합산배제 임대주택등으로 신고한 매 과세연도의 **납부기한 다음 날**부터 추징세액 **고지일**까지(양끝 산입).
 * - 납부기한(법 §16① — 12.15.)이 토·일·공휴일이면 그 다음날이 기한이다(국세기본법 §5①) → 기산일이 하루 이상 늦어진다(Q-2).
 *   공휴일 판정은 저장소의 `civil-period.ts` `deadlineEnd`(+ `data/public-holidays-kr.ts`)를 재사용한다.
 * - 율(§10②2호): 구간 분할 — ~2019.2.11. 10만분의 30 · 2019.2.12.~2022.2.14. 25 · 2022.2.15.~ 22
 *   (부칙<제29524호> §4 · 부칙<제32425호> §5). 고지일이 개정 전이면 앞 구간만 남아 「시행 이후 납부·부과」 분기가 따로 필요 없다.
 * - 절사: 구간마다 `applyRateFraction`(내림) 뒤 합산한다(Q-1 — 양도세 납부지연가산세 `splitByRatePeriods`와 같은 방식).
 * - 분자는 율 상수에서 **파생**한다(이중 진실 금지 — 상수를 바꾸면 금액이 움직인다).
 */

import { addDays, differenceInCalendarDays, format, startOfDay } from "./utc-date";
import { applyRateFraction, safeMultiply } from "./tax-utils";
import { deadlineEnd } from "./civil-period";
import { COMPREHENSIVE_EXCL, COMPREHENSIVE_EXCL_CONST } from "./legal-codes";
import type { RecaptureAnnualInterest, RecaptureInterestSegment } from "./types/comprehensive.types";

/** 「1일당 10만분의 N」의 분모 */
const RATE_DENOM = 100_000;

/** `YYYY-MM-DD` → UTC 자정 (상수 문자열 전용 — 신규 입력 경로가 아니다) */
function utcDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const NUMER = (rate: number) => Math.round(rate * RATE_DENOM);

/** 이자율 시행 구간 — `from` 이후 고지·부과 기간분에 적용. 첫 구간은 하한 없음 */
const RATE_PERIODS: ReadonlyArray<{ from: Date | null; numer: number }> = [
  { from: null, numer: NUMER(COMPREHENSIVE_EXCL_CONST.DAILY_PENALTY_RATE_PRE_2019) },
  { from: utcDay(COMPREHENSIVE_EXCL_CONST.RECAPTURE_RATE_2019_START), numer: NUMER(COMPREHENSIVE_EXCL_CONST.DAILY_PENALTY_RATE_2019) },
  { from: utcDay(COMPREHENSIVE_EXCL_CONST.RECAPTURE_RATE_2022_START), numer: NUMER(COMPREHENSIVE_EXCL_CONST.DAILY_PENALTY_RATE) },
];

export interface RecaptureInterestStart {
  /** 납부기한 — 12.15.가 토·일·공휴일이면 넘긴 날 */
  deadline: Date;
  /** 기산일 — 납부기한 다음 날 */
  from: Date;
  /** 12.15.에서 넘어갔는가 */
  extended: boolean;
  holidayTableUncovered: boolean;
  holidayTableProvisional: boolean;
}

/** 그 해 이자 기산일 — 납부기한(12.15., 법 §16①)에 국세기본법 §5①을 적용한 기한의 다음 날 */
export function recaptureInterestStart(taxYear: number): RecaptureInterestStart {
  const d = deadlineEnd(new Date(Date.UTC(taxYear, 11, 15)));
  return {
    deadline: d.end,
    from: addDays(d.end, 1),
    extended: d.extended,
    holidayTableUncovered: d.holidayTableUncovered,
    holidayTableProvisional: d.holidayTableProvisional,
  };
}

/** [from, to](양끝 포함)를 이자율 구간으로 나눠 구간별 이자를 낸다 */
export function splitRecaptureInterest(
  amount: number,
  from: Date,
  to: Date,
): RecaptureInterestSegment[] {
  const out: RecaptureInterestSegment[] = [];
  for (let i = 0; i < RATE_PERIODS.length; i++) {
    const p = RATE_PERIODS[i];
    const next = RATE_PERIODS[i + 1];
    const segStart = p.from && p.from > from ? p.from : from;
    const pEnd = next?.from ? addDays(next.from, -1) : to;
    const segEnd = pEnd < to ? pEnd : to;
    if (segEnd < segStart) continue;
    const days = differenceInCalendarDays(segEnd, segStart) + 1;
    out.push({
      from: format(segStart, "yyyy-MM-dd"),
      to: format(segEnd, "yyyy-MM-dd"),
      days,
      ratePer100k: p.numer,
      // 정수 분수 연산 — 0.00022 등을 그대로 곱하면 부동소수 오차로 1원이 어긋난다.
      interest: applyRateFraction(safeMultiply(amount, days), p.numer, RATE_DENOM),
    });
  }
  return out;
}

/**
 * 과세연도별 이자상당가산액 + 확인 필요 안내.
 * 고지일이 기산일보다 앞서면 그 연도는 일수 0·구간 없음(이자 0).
 */
export function calculateRecaptureAnnualInterest(
  rows: ReadonlyArray<{ taxYear: number; amount: number }>,
  noticeDateInput: Date,
): { annualInterest: RecaptureAnnualInterest[]; notices: string[] } {
  const noticeDate = startOfDay(noticeDateInput);
  const notices: string[] = [];
  const push = (n: string) => {
    if (!notices.includes(n)) notices.push(n);
  };

  const annualInterest = rows.map((row) => {
    const start = recaptureInterestStart(row.taxYear);
    if (start.extended) push(COMPREHENSIVE_EXCL.RECAPTURE_DEADLINE_CARRY_NOTICE);
    if (start.holidayTableUncovered) push(COMPREHENSIVE_EXCL.RECAPTURE_HOLIDAY_TABLE_UNCOVERED_NOTICE);
    else if (start.holidayTableProvisional) push(COMPREHENSIVE_EXCL.RECAPTURE_HOLIDAY_TABLE_PROVISIONAL_NOTICE);

    const segments = noticeDate >= start.from ? splitRecaptureInterest(row.amount, start.from, noticeDate) : [];
    if (segments.length >= 2) push(COMPREHENSIVE_EXCL.RECAPTURE_SEGMENT_FLOOR_NOTICE);
    return {
      taxYear: row.taxYear,
      amount: row.amount,
      paymentDeadline: format(start.deadline, "yyyy-MM-dd"),
      interestFrom: format(start.from, "yyyy-MM-dd"),
      days: segments.reduce((s, g) => s + g.days, 0),
      interest: segments.reduce((s, g) => s + g.interest, 0),
      segments,
    };
  });
  return { annualInterest, notices };
}
