/**
 * 명부의 §155⑳ 「장기임대주택」 행 — **양도 주택 행은 빼고** 고른다(2026-11 리뷰 D-46).
 *
 * 「소득세법 시행령」 §155⑳은 「장기임대주택 … 과 그 밖의 1주택을 … 소유하고 있는 1세대가 … 해당 1주택(거주주택)을 양도하는 경우」다.
 * 양도하는 거주주택 자신은 장기임대주택 축이 아니다. 같은 영 §167의3①2호 선언(중과 배제 축 — 중과 메뉴 「양도 주택이 장기임대주택」)이
 * 같은 store로 양도 행에 실리면, 종전 술어(`houses.some(h => h.isLongTermRental)`)가 그 행을 명부 장기임대 행으로 읽어 ⑳ 불성립 과세 사안을
 * 비과세로 만들었다. 이 leaf를 ⑳ 축의 다섯 소비처가 함께 쓴다 — 중과 판정(양도 주택 2호 배제)과 ④는 그대로 둔다.
 */
export function rosterRentalRows<T extends { id: string; isLongTermRental?: boolean }>(input: {
  houses?: readonly T[];
  sellingHouseId?: string;
}): T[] {
  return (input.houses ?? []).filter((h) => h.isLongTermRental === true && h.id !== input.sellingHouseId);
}
