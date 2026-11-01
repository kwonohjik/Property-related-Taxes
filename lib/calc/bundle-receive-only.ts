/**
 * 함께 양도(축 B 아님) × 청산금 수령 단독 신고 — 묶음에 담을 수 없는 입력 판정. ⑧ 폼과 ⑫ 본문이 같은 함수·문구를 쓴다
 * (계획서 `bundle-receive-only-order.plan.md`).
 *
 * - 안분: 청산금은 조합에서 받는 돈이라 일괄 계약 가액이 아니다. 안분하면 함께 파는 자산의 양도가액이 줄어든다(실측 44,113,668 과소).
 * - 과세연도: 기본공제는 「해당 과세기간」 단위다(「소득세법」 §103①). 묶음은 신고 하나로 합산하고, 다건 화면은 §166 자산을 받지 않는다.
 * - 계약서 가액: 단독 신고의 양도가액은 수령액이다(단건은 ④가 교체한다). 달라도 세액은 같고 표시만 틀린다.
 */
export const BUNDLE_RECEIVE_ONLY_APPORTIONED_MESSAGE =
  "청산금 수령분 단독 신고 자산은 양도가액을 안분할 수 없습니다. 「계약서 가액 구분 기재」로 입력하세요.";
export const BUNDLE_RECEIVE_ONLY_YEAR_MESSAGE =
  "청산금 수령분 단독 신고의 양도일(소유권이전 고시일 다음날)과 과세연도가 다른 자산은 함께 계산할 수 없습니다. 자산별로 따로 계산하세요.";
export const BUNDLE_RECEIVE_ONLY_PRICE_MESSAGE =
  "청산금 수령분 단독 신고 자산의 양도가액은 청산금 수령액과 같아야 합니다.";

export function bundleReceiveOnlyIssue(args: {
  transferDate: string;
  apportioned: boolean;
  assets: readonly { receiveOnly: boolean; saleDate?: string | null; salePrice?: number; settlementAmount?: number }[];
}): string | null {
  const { transferDate, apportioned, assets } = args;
  const receiving = assets.filter((a) => a.receiveOnly);
  if (receiving.length === 0) return null;
  if (apportioned) return BUNDLE_RECEIVE_ONLY_APPORTIONED_MESSAGE;
  const years = new Set(assets.map((a) => (a.receiveOnly && a.saleDate ? a.saleDate : transferDate).slice(0, 4)));
  if (years.size > 1) return BUNDLE_RECEIVE_ONLY_YEAR_MESSAGE;
  return receiving.some((a) => a.salePrice !== a.settlementAmount) ? BUNDLE_RECEIVE_ONLY_PRICE_MESSAGE : null;
}
