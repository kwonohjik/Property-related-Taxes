/**
 * 상속·증여세 신고·납부기한 계산 헬퍼 (상증법 §67·§68)
 *
 * - §68① 증여: 증여받은 날이 속하는 달의 말일부터 3개월.
 * - §67① 상속: 상속개시일이 속하는 달의 말일부터 6개월.
 *   §67④ 피상속인이나 상속인이 외국에 주소를 둔 경우 9개월.
 * - 분납기한(§70②)은 신고기한 + 2개월.
 *
 * 모든 기간은 "그 날이 속하는 달의 말일"부터 기산(endOfMonth). 증여일/상속개시일에 직접
 * 개월을 더하면 최대 30일 이르게 계산되므로 반드시 말일 기산.
 */
import { addMonths, endOfMonth, format, parseISO } from "date-fns";

export interface FilingDueDates {
  /** 신고기한 "YYYY-MM-DD" */
  filing: string;
  /** 분납기한 "YYYY-MM-DD" (신고기한 + 2개월, §70②) */
  installment: string;
}

function buildDueDates(base: Date, months: number): FilingDueDates {
  const filing = addMonths(endOfMonth(base), months);
  const installment = addMonths(filing, 2);
  return {
    filing: format(filing, "yyyy-MM-dd"),
    installment: format(installment, "yyyy-MM-dd"),
  };
}

/** 증여세 신고·분납기한 (§68① 말일 + 3개월). giftDate 미입력·오류 시 undefined. */
export function getGiftFilingDueDates(giftDate?: string): FilingDueDates | undefined {
  if (!giftDate) return undefined;
  const base = parseISO(giftDate);
  if (isNaN(base.getTime())) return undefined;
  return buildDueDates(base, 3);
}

/**
 * 상속세 신고·분납기한 (§67① 말일 + 6개월, §67④ 비거주자 9개월).
 * deathDate 미입력·오류 시 빈 문자열.
 * decedentType="non_resident"이면 9개월(§67④). (상속인 외국주소 요건은 현재 미모델링 —
 * 피상속인 거주구분만 반영.)
 */
export function getInheritanceFilingDueDates(
  deathDate?: string,
  decedentType?: "resident" | "non_resident",
): FilingDueDates {
  if (!deathDate) return { filing: "", installment: "" };
  const base = parseISO(deathDate);
  if (isNaN(base.getTime())) return { filing: "", installment: "" };
  return buildDueDates(base, decedentType === "non_resident" ? 9 : 6);
}
