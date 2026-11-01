/**
 * 청산금 수령 단독 신고 — 신고기한의 기준 양도일. 세액은 고시일 다음날로 계산하는데(④), 기한·가산세·주택 수 파생은 폼 양도일을 읽는다.
 * 두 날짜가 다르면 기한 판정이 뒤바뀌어(실측 9,712,164 과소 · 9,127,734 과대) 날짜를 맞추게 한다.
 * 묶음은 자산별 기한을 담을 칸이 없어(가산세는 신고 단위) 가장 이른 기한을 넘긴 신고를 받지 않는다.
 * 기한 = 양도일이 속하는 달의 말일부터 2개월(「소득세법」 §105①1호 — 계획서 `receive-only-filing-deadline.plan.md`).
 */
import { getFilingDeadline } from "./filing-deadline";

export const RECEIVE_ONLY_FILING_DATE_MESSAGE =
  "청산금 수령분 단독 신고의 양도일은 소유권이전 고시일 다음날입니다. 양도일을 그 날짜로 입력하세요.";
export const RECEIVE_ONLY_FILING_DEADLINES_MESSAGE =
  "청산금 수령분 단독 신고 자산과 함께 파는 자산의 신고기한이 다르고 가장 이른 기한이 지났습니다. 가산세를 자산별로 나눌 수 없으니 따로 계산하세요.";

export function receiveOnlyFilingDateIssue(args: {
  transferDate: string;
  filingDate: string;
  isBurdenedGift: boolean;
  assets: readonly { receiveOnly: boolean; saleDate?: string | null }[];
}): string | null {
  const { transferDate, filingDate, isBurdenedGift, assets } = args;
  const first = assets[0]?.saleDate;
  if (first && assets.every((a) => a.receiveOnly) && first !== transferDate) return RECEIVE_ONLY_FILING_DATE_MESSAGE;
  const deadlines = assets
    .map((a) => getFilingDeadline(a.receiveOnly && a.saleDate ? a.saleDate : transferDate, isBurdenedGift))
    .filter(Boolean)
    .sort();
  const late = new Set(deadlines).size > 1 && filingDate > deadlines[0];
  return late ? RECEIVE_ONLY_FILING_DEADLINES_MESSAGE : null;
}
