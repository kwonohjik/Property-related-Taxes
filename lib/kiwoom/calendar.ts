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
import { isYearEndNonTrading } from "./year-end-holiday";

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
 * - 납회기간 (12-29 / 12-30 / 12-31, year-agnostic) → false
 * - fixture 범위 밖 → 주말·납회만 false (휴장일 판단 보류 — 호출 측이 키움 응답으로 보정)
 */
export function isKrxTradingDay(iso: string): boolean {
  if (isWeekend(iso)) return false;
  if (isKrxHolidayInFixture(iso)) return false;
  if (isYearEndNonTrading(iso)) return false;
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
  if (isYearEndNonTrading(iso)) return "납회기간 · 거래일 제외";
  return "";
}

/**
 * 평가기준일을 거래일 anchor로 보정 — 상증령 §52의2.
 *
 * 1) 사용자 명시 (2026-05-28): MM-DD ∈ {12-29, 12-30, 12-31} 납회기간 → 12-28로 jump
 * 2) cursor가 비거래일(토·일·KRX 휴장)이면 -1일씩 거꾸로 search
 *
 * 이미지 13 사례:
 *   ㉮ 2022-12-03(토) → 2022-12-02(금)
 *   ㉯ 2022-12-15(목, 거래일) → 그대로
 *   ㉰ 2001-12-31(납회) → 12.28(금)
 *   AS-07: 2024-12-30(납회) → jump 12.28(토) → search 12.27(금)
 *   AS-08: 2025-12-31(납회) → jump 12.28(일) → search 12.27(토) → 12.26(금)
 *
 * 무한 루프 가드: 최대 30일 이전까지 search (정상 경로 6일 이내 종료).
 */
export function resolveValuationAnchor(valuationDateIso: string): string {
  if (!valuationDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(valuationDateIso)) {
    return valuationDateIso;
  }
  const [y, m, d] = valuationDateIso.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));

  // Step 1: 납회기간이면 12-28로 jump
  if (isYearEndNonTrading(valuationDateIso)) {
    cursor.setUTCFullYear(y, 11, 28); // month=11 (Dec, 0-indexed), day=28
  }

  // Step 2: cursor가 비거래일이면 -1일씩 거꾸로 search (최대 30 iteration)
  for (let i = 0; i < 30; i++) {
    if (isKrxTradingDay(formatIsoDate(cursor))) {
      return formatIsoDate(cursor);
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  // 30일 안에 거래일 못 찾음 — 이론상 불가. fallback: 마지막 cursor.
  return formatIsoDate(cursor);
}

/**
 * anchor ± 2개월 ± 1일 슬롯 — 상증령 §52의2 평가구간.
 *
 * 시작 = anchor − 2개월 + 1일
 * 종료 = anchor + 2개월 − 1일 (캘린더 그대로, 비거래일 보정 안 함)
 *
 * 이미지 13 사례:
 *   anchor=2022-12-02 → [2022-10-03, 2023-02-01]
 *   anchor=2022-12-15 → [2022-10-16, 2023-02-14]
 *   anchor=2001-12-28 → [2001-10-29, 2002-02-27]
 */
export function buildSurroundingSlotsFromAnchor(anchorIso: string): string[] {
  if (!anchorIso || !/^\d{4}-\d{2}-\d{2}$/.test(anchorIso)) return [];
  const [y, m, d] = anchorIso.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));

  // 경계일 **포함** — 「평가기준일 이전 2월이 되는 날」과 「이후 2월이 되는 날」이 모두 구간에 든다.
  // (근거·종전 판정 정정은 아래 buildOneMonthBeforeSlots 주석에 한 곳으로 정리)
  //
  // ⚠️ `setUTCMonth(±2)` 단독은 **월말에서 달을 넘긴다** — 2023-04-30의 −2개월은
  //    (2023, 1월, 30일) = 2월 30일이라 3월 2일로 밀린다. 민법 §160②에 따라 말일로 클램프한다.
  const start = addMonthsClamped(anchor, -2);
  const end = addMonthsClamped(anchor, 2);

  const slots: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    slots.push(formatIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return slots;
}

/**
 * §99①3·§165③ "양도일 이전 1개월" 슬롯 기간 — **양쪽 경계일 모두 포함**.
 *
 * 법률 용어 정의 (사용자 검증, 2026-05-19):
 *   - "이전·이후" = 양도일 포함
 *   - "전·후" = 양도일 미포함
 *
 * ⚠️ **종전 판정 정정 (2026-09-01)**
 *
 * 종전에는 분모를 `[transferDate − 1개월 + 1일, transferDate]`로 잡았다. 위 「이전 = 양도일
 * 포함」에서 **끝점 포함**만 읽고, 시작점은 1개월 어치 일수를 맞추려고 하루 밀었던 것이다.
 * 그 둘은 별개 문제였다 — 끝을 포함한다고 시작을 빼야 할 이유가 없다.
 *
 * 정본은 상증령 §52의2②2호다:
 *   「평가기준일 **이전 2월이 되는 날부터** 동 사유가 발생한 날의 전일까지의 기간」
 * 같은 항 1호·3호는 경계를 뺄 때 「사유가 발생한 날의 **다음날**부터」라고 **명시**한다.
 * ⇒ 조문이 뺄 때는 그렇게 적는데 정상 구간의 시작은 「~되는 날**부터**」이므로 **포함**이다.
 * §165③이 「"평가기준일 전후 2개월"은 "양도일·취득일 이전 1개월"로 한다」로 치환하므로
 * 1개월 창에도 그대로 적용된다(`buildSurroundingSlotsFromAnchor`와 같은 규칙).
 *
 * 따라서 본 평균 분모 = **[transferDate − 1개월, transferDate]** (양쪽 포함).
 *
 * anchor 시프트: 양도일이 비거래일이면 직전 거래일로 anchor 이동 후 동일 산식.
 *   (양도일이 거래일 아니면 종가 부재 → 직전 거래일을 분모 마지막 일자로)
 *
 * - 제보 케이스: 2026-02-26 (목) → [2026-01-26 ~ 2026-02-26] (32일).
 * - 윤년 처리: 2024-03-01 (삼일절) → anchor=2024-02-29 → [2024-01-29 ~ 2024-02-29] (32일).
 * - 일반: 2024-06-03 (월) → anchor=6/3 → [2024-05-03 ~ 2024-06-03] (32일).
 * - 토요일: 2025-06-21 (토) → anchor=6/20 (금) → [2025-05-20 ~ 2025-06-20] (32일).
 *
 * ⚠️ 「1개월 = 31일」이 아니다. 말일 클램프 때문에 달마다 29~32일로 달라진다.
 */
/**
 * 기준일의 **소급 1개월** 시점 (민법 §160② 역산 — 해당일이 없는 달이면 그 달의 말일).
 *
 *   2023-03-31 → 2023-02-28   (2월에 31일이 없다)
 *   2023-05-31 → 2023-04-30   (4월에 31일이 없다)
 *   2024-03-29 → 2024-02-29   (윤년 — 해당일이 실재하므로 그대로)
 *   2023-01-31 → 2022-12-31   (12월은 31일 — 그대로)
 */
function monthBeforeClamped(anchor: Date): Date {
  return addMonthsClamped(anchor, -1);
}

/**
 * `monthBeforeClamped`의 일반형 — 임의 개월 수 가감 + 민법 §160② 말일 클램프.
 *
 * 2개월 창(상증법 §63①1가목)과 1개월 창(소득세법 §99①3)이 **같은 클램프 규칙**을 써야
 * 하는데 종전에는 2개월 쪽만 맨 `setUTCMonth`를 써서 월말에 달을 넘겼다.
 *
 *   addMonthsClamped(2023-04-30, -2) → 2023-02-28  (2월에 30일이 없다)
 *   addMonthsClamped(2023-03-31, -1) → 2023-02-28
 *   addMonthsClamped(2024-01-29, +1) → 2024-02-29  (윤년 — 해당일이 실재하므로 그대로)
 */
function addMonthsClamped(anchor: Date, deltaMonths: number): Date {
  const y = anchor.getUTCFullYear();
  const mIdx = anchor.getUTCMonth(); // 0-based
  const d = anchor.getUTCDate();
  const moved = new Date(Date.UTC(y, mIdx + deltaMonths, d));
  // 오버플로 감지 — 기대한 달이 아니면 짧은 달을 넘어간 것이다.
  const expected = ((mIdx + deltaMonths) % 12 + 12) % 12;
  if (moved.getUTCMonth() !== expected) {
    moved.setUTCDate(0); // 넘어간 달의 **직전** 달 말일로 되돌린다
  }
  return moved;
}

/**
 * `monthBeforeClamped`의 **정방향 짝** — anchor + 1개월, 말일 클램프.
 *
 * 민법 §160③ 「최종의 월에 해당일이 없는 때에는 그 월의 말일로 기간이 만료한다」.
 * 2023-01-31 + 1개월 = 2023-02-28 (JS 기본은 03-03으로 민다).
 *
 * ⚠️ 클램프는 **−1일보다 먼저** 건다. 「1개월 후의 전날」이 아니라 「1개월이 만료하는 날」이
 *    종료일이므로, 클램프한 말일에서 다시 하루를 빼면 02-27이 되어 하루 짧아진다.
 */
function monthAfterClamped(anchor: Date): Date {
  const y = anchor.getUTCFullYear();
  const mIdx = anchor.getUTCMonth(); // 0-based
  const d = anchor.getUTCDate();
  const next = new Date(Date.UTC(y, mIdx + 1, d));
  const expected = (mIdx + 1) % 12;
  if (next.getUTCMonth() !== expected) {
    next.setUTCDate(0); // 넘어간 달의 **직전** 달 말일로 되돌린다
    return next;
  }
  // 해당일이 있으면 그 전날이 「1개월 - 1일」이다 (예: 08-21 → 09-21 → 09-20)
  next.setUTCDate(next.getUTCDate() - 1);
  return next;
}

export function buildOneMonthBeforeSlots(transferDateIso: string): string[] {
  if (!transferDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(transferDateIso)) return [];

  // anchor 시프트 — 양도일이 **매매가 없는 날**이면 직전 거래일로 옮긴다.
  //
  // 근거: 상증법 §63①1가목 괄호 「평가기준일이 **공휴일 등 대통령령으로 정하는 매매가 없는 날**인
  //       경우에는 **그 전일을 기준으로 한다**」 + 상증령 §52의2④(공휴일·대체공휴일·토요일).
  //       소득세법 §99①3이 이 가목을 준용하므로 양도세에도 그대로 적용된다.
  //
  // 종전에는 **토·일만** 보아 삼일절·현충일 같은 평일 공휴일과 납회기간(12/29~31)에는
  // 시프트가 일어나지 않았다. 같은 조문에서 나온 상증세 평가용 `resolveValuationAnchor`는
  // 이미 공휴일·납회를 처리하고 있어 **두 세목이 갈려 있었다** — 그 헬퍼를 재사용해 합친다.
  const anchorIso = resolveValuationAnchor(transferDateIso);
  const [y, m, d] = anchorIso.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));

  // start = (anchor 소급 1개월)의 다음날.
  //
  // ⚠️ `setUTCMonth(-1)` 만으로는 **월말에서 기간이 잘린다** — 짧은 달로 넘어갈 때 JS가
  //    오버플로를 다음 달로 밀기 때문이다. 2023-03-31이면 (2023,2월,31일) → 2023-03-03이 되어
  //    윈도우가 [03-04 ~ 03-31] **28일**로 줄었다(정상 31일).
  //    민법 §160②은 「월로 정한 기간은 역에 의해 계산하고, 최후의 월에 해당일이 없으면
  //    그 월의 말일로 기간이 만료한다」고 한다 ⇒ 2023-03-31의 소급 1개월은 **2023-02-28**이다.
  //    그래서 오버플로가 감지되면 `setUTCDate(0)`으로 **직전 달의 말일**까지 되돌린다.
  const start = monthBeforeClamped(anchor);

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

  // end = (상장일 + 1개월)의 전날.
  //
  // ⚠️ **JS는 자동 보정하지 않는다** — 종전 주석의 「자동 보정」은 사실이 아니었다.
  //    `Date.UTC(2023, 1, 31)`은 2월에 31일이 없으니 **3월 3일로 밀린다**. 그대로 −1하면
  //    윈도우가 [01-31 ~ 03-02] 31일이 되어 **2월 말일을 넘어선 종가**가 §165⑤ 1개월 평균의
  //    분자·분모에 섞였다.
  //    민법 §160③ 「최종의 월에 **해당일이 없는 때에는 그 월의 말일로** 기간이 만료한다」
  //    ⇒ 2023-01-31의 1개월 후는 2023-02-28이고, 그 「전날」이 아니라 **그날**이 종료일이다.
  //
  //    같은 파일 역방향(`monthBeforeClamped`)은 이미 이 클램프를 갖고 있었다 —
  //    한 파일 안에서 두 방향이 갈려 있었다.
  const end = monthAfterClamped(new Date(Date.UTC(y, m - 1, d)));

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
