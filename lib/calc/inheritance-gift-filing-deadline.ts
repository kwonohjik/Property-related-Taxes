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
 * 이미 확정된 신고기한에서 분납기한(§70② +2개월)만 다시 센다.
 * §68① 단서처럼 기한이 «파생되지 않고 주어지는» 경우의 표시용.
 */
export function buildDueDatesFrom(filingDate: string): FilingDueDates | undefined {
  const d = parseISO(filingDate);
  if (isNaN(d.getTime())) return undefined;
  return { filing: format(d, "yyyy-MM-dd"), installment: format(addMonths(d, 2), "yyyy-MM-dd") };
}

/**
 * §68① **단서** — §45의3(일감몰아주기)·§45의5(특정법인과의 거래)의 증여세 신고기한.
 *
 * 법 §68① 단서 verbatim(후단): 「… **제45조의3 및 제45조의5에 따른 증여세 과세표준
 * 신고기한은 수혜법인 또는 특정법인의 「법인세법」 제60조제1항에 따른 과세표준의 신고기한이
 * 속하는 달의 말일부터 3개월이 되는 날로 한다.**」
 *
 * 법인세법 §60① verbatim: 「각 사업연도의 종료일이 속하는 달의 말일부터 3개월(제60조의2제1항
 * 본문에 따라 내국법인이 **성실신고확인서를 제출하는 경우에는 4개월**로 한다) 이내에 …」
 *
 * ⇒ 2단 기산이다. 사업연도 종료일 말일 +3(또는 4)개월 = 법인세 신고기한,
 *   그 날이 속하는 달의 말일 +3개월 = 증여세 신고기한.
 *   예) 12월말 결산·2024 사업연도 → 법인세 2025-03-31 → 증여세 **2025-06-30**.
 *   본문(증여일 말일 +3개월)으로 계산하면 2025-03-31 — **3개월 이르다**.
 *
 * ⚠️ §60**⑦**(감사 미종결 1개월 연장)은 포함하지 않는다. 단서가 가리키는 것은 §60**①**의
 *    기한이다 — 조문이 항을 특정하고 있으므로 연장분을 얹으면 법문을 넘는다.
 */
export function getSec68ProvisoGiftFilingDueDates(
  corpFiscalYearEndDate?: string,
  honestFilingConfirm?: boolean,
): FilingDueDates | undefined {
  if (!corpFiscalYearEndDate) return undefined;
  const fye = parseISO(corpFiscalYearEndDate);
  if (isNaN(fye.getTime())) return undefined;
  // 1단 — 법인세법 §60① 신고기한
  const corpFiling = addMonths(endOfMonth(fye), honestFilingConfirm ? 4 : 3);
  // 2단 — 그 기한이 «속하는 달의 말일»부터 3개월
  return buildDueDates(corpFiling, 3);
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
