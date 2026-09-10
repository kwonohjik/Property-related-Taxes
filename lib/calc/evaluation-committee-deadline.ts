/**
 * PR-K-4 — §54⑥ 평가심의위원회 신청 기한 계산 헬퍼
 *
 * 법령: 상증법 §67(상속세 신고기한) + §68(증여세 신고기한) + 상증령 §49의2⑤·⑥
 *
 * 신고 기한 기준 (KoreanLaw MCP 2026-05-24):
 *   - 상속세 (§67): 상속개시일이 속하는 달의 말일부터 6개월 이내
 *     (피상속인이 비거주자 / 상속재산 전부가 국외 → 9개월)
 *   - 증여세 (§68): 증여받은 날이 속하는 달의 말일부터 3개월 이내
 *
 * 평가심의위 신청 기한 (상증령 §49의2⑤ — 본 모듈은 기본 가이드):
 *   상속·증여 신고기한 이전 (일반적으로 신고기한과 동일).
 *   ⚠️ 인용 정정 (2026-09-11) — ④는 «위원의 해임·해촉» 사유다. 신청기한은 ⑤, 통지기한은 ⑥.
 *      본문상 신청기한은 «신고기한 만료 4개월 전(증여 70일 전)»이라 이 헬퍼가 반환하는
 *      「신고기한」과 다르다 — 산식 자체의 정정은 대장 IG-058(별건)에서 다룬다.
 *
 * 본 모듈은 UI 카운트다운(D-N일) 표시용 헬퍼만 제공.
 * 본 결과(보충적 평가가액)에 영향 없음.
 */

import { addMonths, differenceInCalendarDays, lastDayOfMonth } from "date-fns";

/**
 * 상속세 신고기한 = 상속개시월 말일 + 6개월 (비거주자/국외 자산 시 9개월 옵션은 별도 모듈)
 */
export function inheritanceApplicationDeadline(deathDate: Date): Date {
  const endOfMonth = lastDayOfMonth(deathDate);
  return addMonths(endOfMonth, 6);
}

/**
 * 증여세 신고기한 = 증여월 말일 + 3개월
 */
export function giftApplicationDeadline(giftDate: Date): Date {
  const endOfMonth = lastDayOfMonth(giftDate);
  return addMonths(endOfMonth, 3);
}

/**
 * 기한까지 남은 일수 (양수 = 미래, 음수 = 초과).
 */
export function daysUntilDeadline(deadline: Date, today: Date = new Date()): number {
  return differenceInCalendarDays(deadline, today);
}
