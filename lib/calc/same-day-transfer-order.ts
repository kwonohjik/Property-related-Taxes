/**
 * 같은 날 양도하는 주택의 **양도 순서**(소득세법 시행령 §154⑨) — 명부 행 사실의 술어.
 *
 * 법문(원문 확인): 「법 제89조제1항제3호의 규정을 적용함에 있어서 2개 이상의 주택을 같은 날에 양도하는 경우에는
 * 당해 거주자가 선택하는 순서에 따라 주택을 양도한 것으로 본다.」 — 거주자가 고르는 사실이므로 입력으로 받는다.
 * 중과(소득세법 시행령 §167의3⑥)는 이 규정을 준용한다 → 비과세·중과가 **같은 명부 술어**를 쓴다
 * (`household-house-count.ts`의 `housesOwnedAtTransfer`가 이 파일의 술어로 거른다).
 *
 * ## 명부 행의 두 단계
 *
 * | 필드 | 뜻 |
 * |---|---|
 * | `soldSameDay` | 이 행의 주택도 **현재 양도하는 주택과 같은 날 양도**한다(표시) |
 * | `sameDayTransferOrder` | `first` = 이 행의 주택을 현재 양도하는 주택**보다 먼저** 양도한 것으로 선택 / `later` = **나중에** 양도한 것으로 선택 |
 *
 * `first`만 주택 수에서 뺀다(그 주택은 현재 양도일에 이미 양도한 뒤다). `later`와 「아직 정하지 않음」은 주택 수에 넣는다 —
 * 선택하지 않은 사실은 유리하게 읽지 않는다. 정하지 않았다는 사실은 따로 알아야 결론을 가를 때 고지할 수 있다.
 *
 * ⚠️ 같은 날 **증여**한 주택은 이 규정의 대상이 아니다(법문이 「양도」다) — 이 사실로 받지 않는다.
 */
export type SameDayTransferOrder = "first" | "later";

export interface SameDayOrderFacts {
  soldSameDay?: boolean;
  sameDayTransferOrder?: SameDayTransferOrder;
}

/** 「이 주택을 먼저 양도한 것으로 선택」 — 현재 양도일 현재 이미 양도한 주택이라 주택 수에서 뺀다. */
export function isSameDayFirstTransferred(row: SameDayOrderFacts): boolean {
  return row.soldSameDay === true && row.sameDayTransferOrder === "first";
}

/** 같은 날 양도한다고 표시했지만 순서를 고르지 않았다 — 주택 수에는 넣고, 결론을 가를 때 고지한다. */
export function isSameDayOrderUndecided(row: SameDayOrderFacts): boolean {
  return row.soldSameDay === true && row.sameDayTransferOrder === undefined;
}

/**
 * 같은 날 양도 순서가 **결론을 가를 수 있는가** — 1세대 비과세가 가능한 세대이거나 조정대상지역 주택일 때만이다.
 * 둘 다 아니면(1세대 아님 + 비조정) 순서가 비과세 여부·중과 주택 수 어느 쪽에도 닿지 않는다(결정 #40 하위 1 가).
 * 차단·고지의 범위를 정하는 데만 쓴다 — 세액을 바꾸지 않는다.
 */
export function sameDayOrderMayDecide(f: { isOneHousehold?: boolean; isRegulatedArea?: boolean }): boolean {
  return f.isOneHousehold === true || f.isRegulatedArea === true;
}
