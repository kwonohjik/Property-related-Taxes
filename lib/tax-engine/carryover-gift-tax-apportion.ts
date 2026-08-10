/**
 * 「소득세법 시행령」 제163조의2 제2항 — **증여세 상당액 자산별 안분**. 무의존 leaf.
 *
 * > ② 법 제97조의2제1항 및 제5항에 따른 증여세 상당액은 제1호에 따른 **증여세 산출세액**에
 * > 제2호에 따른 **자산가액**이 제3호에 따른 **증여세 과세가액**에서 차지하는 비율을 곱하여
 * > 계산한 금액으로 한다. 이 경우 필요경비로 산입되는 증여세 상당액은 양도가액에서 법
 * > 제97조제1항 및 제2항의 금액을 공제한 잔액을 **한도**로 한다.
 * > 　1. … 증여받은 자산에 대한 **증여세 산출세액**
 * > 　2. 법 제97조의2제1항에 따라 **양도한 해당 자산가액**(증여세가 과세된 증여세 과세가액)
 * > 　3. 「상속세 및 증여세법」 제47조에 따른 **증여세 과세가액**
 *
 * (법제처 현행 MST 286211, 시행 2026-07-01 직독)
 *
 * ## 왜 leaf인가
 *
 * 일반건물은 토지·건물 **2개 자산**으로 갈리는데, 증여세는 **하나의 증여**에 대해 산출된다.
 * 그래서 파트마다 이 산식을 돌려야 한다. 사용자에게 안분을 시키면 두 파트 합이 산출세액을
 * 넘는 입력도 막을 수 없고, 무엇보다 검산이 불가능하다.
 *
 * ⚠️ **한도(후단)는 여기서 적용하지 않는다.** 한도는 「양도가액 − 법 §97① 및 ②의 금액」이라
 *    필요경비 계산이 끝나야 알 수 있다 — 단건 엔진(`transfer-tax-carryover.ts`)이 이미
 *    `giftTaxLimitCap`으로 적용하고 있으므로 **여기서 또 하면 이중 절사**가 된다.
 *    이 함수는 §163의2② **전단(안분)** 만 담당한다.
 */

/** 정수 안분 — `Math.round()` 금지(세법은 floor). 2^53 초과 곱셈은 BigInt로 우회한다. */
function floorMulDiv(a: number, b: number, c: number): number {
  if (c <= 0) return 0;
  const product = a * b;
  if (Number.isSafeInteger(product)) return Math.floor(product / c);
  return Number((BigInt(Math.trunc(a)) * BigInt(Math.trunc(b))) / BigInt(Math.trunc(c)));
}

export interface CarryoverGiftEvent {
  /** 영 §163의2②1호 — 증여받은 자산에 대한 증여세 **산출세액**. */
  giftTaxCalculated: number;
  /** 영 §163의2②3호 — 「상속세 및 증여세법」 §47 증여세 **과세가액**(안분 분모). */
  giftTaxBase: number;
}

/**
 * 그 파트에 귀속되는 증여세 상당액.
 *
 * @param assetValue 영 §163의2②2호 — 양도한 **해당 자산가액**(증여 당시 그 자산의 평가액)
 * @returns `floor(산출세액 × 자산가액 ÷ 과세가액)`. 분모가 0 이하면 0.
 *
 * 🔑 **분모가 0이면 0을 돌려준다** — 던지지 않는다. 입력 검증은 ⑧ validate의 일이고,
 *    여기서 던지면 API 직접 호출자가 500을 받는다.
 */
export function apportionGiftTax(event: CarryoverGiftEvent, assetValue: number): number {
  if (!(event.giftTaxCalculated > 0) || !(event.giftTaxBase > 0) || !(assetValue > 0)) return 0;
  const raw = floorMulDiv(event.giftTaxCalculated, assetValue, event.giftTaxBase);
  // 자산가액이 과세가액을 넘는 잘못된 입력에서도 산출세액을 초과하지 않게 막는다.
  return Math.min(raw, event.giftTaxCalculated);
}
