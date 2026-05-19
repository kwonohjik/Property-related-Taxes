/**
 * KRX 거래일 캘린더 헬퍼.
 *
 * 1차 판정: 평일(월~금) + KRX_HOLIDAYS_2020_2026 정적 fixture 미포함.
 * 2차 판정(범위 밖 또는 임시휴장 갱신): 키움 ka10081 응답 자체가 거래일만 반환 — 호출 측 책임.
 *
 * 정책: 자동 fallback 채움 금지 (`feedback_no_silent_apportion_fallback`).
 *      여기서는 단순 판정만 제공하며, "잘 모르겠음" 일자는 calendar.ts가 임의로 거래일로 처리하지 않는다.
 */

import { KRX_HOLIDAYS_2020_2026, KRX_HOLIDAY_FIXTURE_RANGE } from "./data/krx-holidays-2020-2026";

/**
 * "YYYY-MM-DD" → Date (UTC). 잘못된 포맷은 Invalid Date.
 */
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/**
 * Date → "YYYY-MM-DD" (UTC).
 */
export function formatIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=일, 6=토

export function dayOfWeek(iso: string): DayOfWeek {
  return parseIsoDate(iso).getUTCDay() as DayOfWeek;
}

export function isWeekend(iso: string): boolean {
  const dow = dayOfWeek(iso);
  return dow === 0 || dow === 6;
}

export function isKrxHolidayInFixture(iso: string): boolean {
  return KRX_HOLIDAYS_2020_2026.has(iso);
}

/**
 * iso 일자가 KRX 거래일인가?
 *
 * - 주말 → false
 * - fixture 범위 내 휴장일 → false
 * - fixture 범위 밖 → 주말만 false (휴장일 판단 보류 — 호출 측이 키움 응답으로 보정)
 */
export function isKrxTradingDay(iso: string): boolean {
  if (isWeekend(iso)) return false;
  if (isKrxHolidayInFixture(iso)) return false;
  return true;
}

/**
 * iso 일자의 비거래일 사유 라벨.
 * 거래일이면 빈 문자열.
 */
export function nonTradingLabel(iso: string): string {
  const dow = dayOfWeek(iso);
  if (dow === 6) return "토요일 · 거래일 제외";
  if (dow === 0) return "일요일 · 거래일 제외";
  if (isKrxHolidayInFixture(iso)) return "휴장일 · 거래일 제외";
  return "";
}

/**
 * §163⑨ 분모 기간 [transferDate − 1 month, transferDate − 1 day].
 *
 * - 양도일 미포함.
 * - 윤년 처리: 2024-03-01 → [2024-02-01 ~ 2024-02-29] (29일).
 * - 일반: 2024-06-01 → [2024-05-01 ~ 2024-05-31] (31일).
 */
export function buildOneMonthBeforeSlots(transferDateIso: string): string[] {
  const transfer = parseIsoDate(transferDateIso);
  // start = transferDate − 1 month
  const startY = transfer.getUTCFullYear();
  const startM = transfer.getUTCMonth() - 1;
  const startD = transfer.getUTCDate();
  const start = new Date(Date.UTC(startY, startM, startD));
  // end = transferDate − 1 day
  const end = new Date(Date.UTC(transfer.getUTCFullYear(), transfer.getUTCMonth(), transfer.getUTCDate() - 1));

  const slots: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    slots.push(formatIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return slots;
}

export { KRX_HOLIDAY_FIXTURE_RANGE };
