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
 * §99①3·§165③ "양도일 이전 1개월" 슬롯 기간 — 양도일 포함.
 *
 * 법률 용어 정의 (사용자 검증, 2026-05-19):
 *   - "이전·이후" = 양도일 포함
 *   - "전·후" = 양도일 미포함
 *
 * 따라서 본 평균 분모 = [transferDate − 1 month + 1 day, transferDate] (양도일 포함).
 *
 * anchor 시프트: 양도일이 토·일이면 직전 평일(금요일)로 anchor 이동 후 동일 산식.
 *   (양도일이 거래일 아니면 종가 부재 → 직전 거래일을 분모 마지막 일자로)
 *
 * - 윤년 처리: 2024-03-01 (금) → anchor=3/1 → [2024-02-02 ~ 2024-03-01] (29일).
 * - 일반: 2024-06-03 (월) → anchor=6/3 → [2024-05-04 ~ 2024-06-03] (31일).
 * - 토요일: 2025-06-21 (토) → anchor=6/20 (금) → [2025-05-21 ~ 2025-06-20] (31일).
 */
export function buildOneMonthBeforeSlots(transferDateIso: string): string[] {
  if (!transferDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(transferDateIso)) return [];

  // anchor 시프트 — 양도일이 토·일이면 직전 평일까지 이동
  const [y, m, d] = transferDateIso.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));
  while (anchor.getUTCDay() === 0 || anchor.getUTCDay() === 6) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }

  // start = anchor (month-1, day+1) — JS overflow 자동 보정
  const start = new Date(anchor);
  start.setUTCMonth(start.getUTCMonth() - 1);
  start.setUTCDate(start.getUTCDate() + 1);

  // end = anchor (포함)
  const slots: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= anchor.getTime()) {
    slots.push(formatIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return slots;
}

/**
 * §165⑤ 상장일 이후 1개월 슬롯 (사례 48 취득 후 상장 환산).
 *
 * - 시작: 상장일 (포함)
 * - 종료: 상장일 + 1개월 - 1일
 *
 * 예: 2009-08-21 → [2009-08-21 ~ 2009-09-20] 31일
 *     2009-02-01 → [2009-02-01 ~ 2009-02-28] 28일 (평년)
 *     2024-02-01 → [2024-02-01 ~ 2024-02-29] 29일 (윤년)
 *
 * 양도일 직전 1개월과 달리 anchor 시프트 없음 (상장일은 거래소 정상 거래일 가정).
 */
export function buildOneMonthAfterListingSlots(listingDateIso: string): string[] {
  if (!listingDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(listingDateIso)) return [];
  const [y, m, d] = listingDateIso.split("-").map(Number);

  // start = 상장일
  const start = new Date(Date.UTC(y, m - 1, d));

  // end = 상장일 + 1개월 - 1일 (JS overflow 자동 보정)
  const end = new Date(Date.UTC(y, m, d));
  end.setUTCDate(end.getUTCDate() - 1);

  const slots: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    slots.push(formatIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return slots;
}

/**
 * §63①1가목 평가기준일 전후 2개월 슬롯 (상속·증여 평가).
 *
 * 상증법 §63①1가목 본문: "평가기준일 이전·이후 각 2개월" → 평가기준일 포함.
 * 법률 용어 "이전·이후" = 평가기준일 포함 (사용자 검증 2026-05-19).
 *
 * 슬롯 = [평가기준일 − 2 month, 평가기준일 + 2 month]
 *
 * 예: 2024-06-15 → [2024-04-15 ~ 2024-08-15] 약 120일
 *     2024-02-29 (윤년) → [2023-12-29 ~ 2024-04-29] 약 122일
 *
 * 평가기준일이 토·일이어도 anchor 시프트 없음 (전·후 모두 거래일 존재).
 */
export function buildTwoMonthSurroundingSlots(valuationDateIso: string): string[] {
  if (!valuationDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(valuationDateIso)) return [];
  const [y, m, d] = valuationDateIso.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));

  // start = anchor − 2 month
  const start = new Date(anchor);
  start.setUTCMonth(start.getUTCMonth() - 2);

  // end = anchor + 2 month
  const end = new Date(anchor);
  end.setUTCMonth(end.getUTCMonth() + 2);

  const slots: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    slots.push(formatIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return slots;
}

/**
 * §52의2 ② partial 슬롯 — 증자·합병 신주(미상장) 평가구간 단축.
 *
 * `startIso` ~ `valuationDateIso + 2월` 의 모든 캘린더 날짜 (ISO 정순).
 * `startIso > valuationDateIso + 2월` 또는 형식 불일치 → []
 *
 * 사용처: `/api/kiwoom/valuation-2month` route, capitalIncreaseDate/mergerDate가
 *  D−2월 이내일 때 클라이언트가 startOverrideDate 로 전달.
 */
export function buildPartialSurroundingSlots(
  startIso: string,
  valuationDateIso: string,
): string[] {
  if (
    !startIso || !valuationDateIso ||
    !/^\d{4}-\d{2}-\d{2}$/.test(startIso) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valuationDateIso)
  ) {
    return [];
  }
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));

  const [vy, vm, vd] = valuationDateIso.split("-").map(Number);
  const end = new Date(Date.UTC(vy, vm - 1, vd));
  end.setUTCMonth(end.getUTCMonth() + 2);

  if (start.getTime() > end.getTime()) return [];

  const slots: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    slots.push(formatIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return slots;
}

export { KRX_HOLIDAY_FIXTURE_RANGE };
