/**
 * PR-K-4 — §54⑥ 평가심의위원회 신청 기한 계산 헬퍼
 *
 * 법령: 상증법 §67(상속세 신고기한) + §68(증여세 신고기한) + 상증령 §49의2④
 *
 * 신고 기한 기준 (KoreanLaw MCP 2026-05-24):
 *   - 상속세 (§67): 상속개시일이 속하는 달의 말일부터 6개월 이내
 *     (피상속인이 비거주자 / 상속재산 전부가 국외 → 9개월)
 *   - 증여세 (§68): 증여받은 날이 속하는 달의 말일부터 3개월 이내
 *
 * 평가심의위 신청 기한 (§49의2④ 본 모듈은 기본 가이드):
 *   상속·증여 신고기한 이전 (일반적으로 신고기한과 동일).
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
