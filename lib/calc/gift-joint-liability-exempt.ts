/**
 * 「상증법」§4의2⑥ 단서 — 증여자 **연대납부의무 면제** 판정 (UI·API 공용 단일 소스).
 *
 *   §4의2⑥ 「증여자는 다음 각 호의 어느 하나에 해당하는 경우에는 수증자가 납부할 증여세를
 *           연대하여 납부할 의무가 있다. **다만, 제4조제1항제2호 및 제3호, 제35조부터
 *           제39조까지, … 에 해당하는 경우는 제외한다.**」
 *
 * 단서는 각 호 **외의 부분 본문 뒤**에 놓여 1~3호 전부에 걸린다 ⇒ 열거 유형이면 각 호
 * 요건 충족 여부와 무관하게 연대의무가 **불성립**한다. 「증여자가 연대납세의무자였습니까?」에
 * 「예」는 **법적으로 선택될 수 없는 답**이 된다.
 *
 * ⚠️ **전부일 때만 잠근다.** `donorHasJointLiability`는 계산 단위 단일 boolean인데
 *    `giftItems`는 배열이고 프리필 후 일반 증여를 더할 수 있다. 혼합 계산에서는 그 일반
 *    증여분에 대해 「예」가 성립 가능하므로 잠그면 안 된다 — 경고만 띄운다.
 *
 * ⚠️ **UI와 API가 이 함수를 함께 쓴다.** ⑤가 화면에서 `false`로 보여도 폼 값이 `true`로
 *    남아 있으면 ④가 그대로 엔진에 보낸다(sessionStorage 복원·순서 조작). 표시 fallback이
 *    있는 필드는 API 변환에도 같은 fallback을 건다 — 3중 패턴.
 */
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/** 계산에 들어가는 증여재산 전부 — 증여세 마법사는 일반 항목과 주식 항목을 나눠 든다 */
function allItems(giftItems: EstateItem[], stockItems: EstateItem[]): EstateItem[] {
  return [...giftItems, ...stockItems];
}

/**
 * 계산에 포함된 증여재산이 **전부** §4의2⑥ 단서 열거 유형인가.
 * 참이면 연대의무 토글은 잠기고 값은 `false`로 고정된다.
 */
export function jointLiabilityStatutorilyExempt(
  giftItems: EstateItem[],
  stockItems: EstateItem[] = [],
): boolean {
  const items = allItems(giftItems, stockItems);
  return items.length > 0 && items.every((i) => i.isJointLiabilityExemptGift === true);
}

/**
 * 단서 열거 유형과 일반 증여가 **섞여 있는가**. 참이면 잠그지 않고 경고만 띄운다 —
 * 그 일반 증여분에 대해서는 「예」가 성립할 수 있다.
 */
export function jointLiabilityExemptMixed(
  giftItems: EstateItem[],
  stockItems: EstateItem[] = [],
): boolean {
  const items = allItems(giftItems, stockItems);
  const n = items.filter((i) => i.isJointLiabilityExemptGift === true).length;
  return n > 0 && n < items.length;
}
